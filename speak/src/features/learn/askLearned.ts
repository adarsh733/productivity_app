import type { AskLearned, AskTurn, ModuleId, TellAppResult } from '../../types/contract';
import { MODULE_LABEL, MODULES } from '../../types/contract';
import { getMeta, setMeta } from '../../db/db';
import { shiftModuleLevel } from '../auto/moduleBatch';

/**
 * v8 (2026-11-10): what the Ask box learned from him. Phone-only (answer 9 =
 * A), in `db.meta` key `learn.ask`. The thread keeps his last 10 messages
 * (answer 6 = A); what was learned is kept on its own list so it outlives the
 * thread. Read by Me (with Remove), the Feed (topic boosts) and the next AI
 * batch (added topics, wishes).
 */

export const ASK_META = 'learn.ask';
/** Messages kept for the thread (answer 6 = A). */
export const ASK_TURNS_MAX = 10;
/** Learned items kept (removed ones included, so Remove stays honest). */
export const ASK_LEARNED_MAX = 100;
export const ADDED_THEMES_MAX = 10;
export const ASK_WISHES_MAX = 6;
export const ASK_LEARNED_PER_TURN = 4;

const NOTE_MAX = 160;
const THEME_MAX = 40;

/** Stored shape. Both lists newest first. */
interface AskStore {
  turns: AskTurn[];
  learned: AskLearned[];
}

async function load(): Promise<AskStore> {
  const raw = await getMeta<Partial<AskStore>>(ASK_META);
  return {
    turns: Array.isArray(raw?.turns) ? raw.turns : [],
    learned: Array.isArray(raw?.learned) ? raw.learned : [],
  };
}

function cut(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

type LearnedIn = TellAppResult['learned'][number];

/** One server item → one stored item with its Me line; null when it is not usable. */
function toLearned(item: LearnedIn, id: string): AskLearned | null {
  if (!item || typeof item !== 'object') return null;
  switch (item.kind) {
    case 'wish': {
      const note = typeof item.note === 'string' ? cut(item.note, NOTE_MAX) : '';
      return note ? { id, kind: 'wish', text: note, note } : null;
    }
    case 'more':
    case 'fewer':
    case 'new_theme': {
      const theme = typeof item.theme === 'string' ? cut(item.theme, THEME_MAX) : '';
      if (!theme) return null;
      const text =
        item.kind === 'more'
          ? `More cards about ${theme}.`
          : item.kind === 'fewer'
            ? `Fewer cards about ${theme}.`
            : `New topic: ${theme}.`;
      return { id, kind: item.kind, text, theme };
    }
    case 'level': {
      if (!MODULES.includes(item.module) || (item.delta !== 1 && item.delta !== -1)) return null;
      const text = `${MODULE_LABEL[item.module]}: ${item.delta === 1 ? 'harder' : 'easier'} cards.`;
      return { id, kind: 'level', text, module: item.module, delta: item.delta };
    }
    default:
      return null;
  }
}

async function moveLevel(module: ModuleId, delta: 1 | -1): Promise<void> {
  await shiftModuleLevel(module, [delta === 1 ? 'too_easy' : 'too_hard']);
}

/**
 * Store one message and its reply, keep what the AI learned (max 4, bad items
 * dropped) and apply each `level` item at once through `shiftModuleLevel`.
 */
export async function saveAskTurn(said: string, result: TellAppResult, now: number = Date.now()): Promise<AskTurn> {
  const store = await load();
  const items = Array.isArray(result?.learned) ? result.learned.slice(0, ASK_LEARNED_PER_TURN) : [];
  const learned: AskLearned[] = [];
  items.forEach((item, i) => {
    const one = toLearned(item, `ask-${now}-${i}`);
    if (one) learned.push(one);
  });
  const turn: AskTurn = {
    id: `turn-${now}`,
    at: now,
    said,
    reply: typeof result?.reply === 'string' ? result.reply : '',
    learned,
  };
  await setMeta(ASK_META, {
    turns: [turn, ...store.turns].slice(0, ASK_TURNS_MAX),
    learned: [...learned, ...store.learned].slice(0, ASK_LEARNED_MAX),
  } satisfies AskStore);
  for (const item of learned) {
    if (item.kind === 'level' && item.module && item.delta) await moveLevel(item.module, item.delta);
  }
  return turn;
}

/** The thread: his last `limit` messages, oldest first (the order a thread reads). */
export async function askTurns(limit = ASK_TURNS_MAX): Promise<AskTurn[]> {
  const { turns } = await load();
  return turns.slice(0, limit).reverse();
}

/** Me's lines: not removed, newest first. Ids start `ask-`. */
export async function askLearnedLines(): Promise<{ id: string; text: string }[]> {
  const { learned } = await load();
  return learned.filter((l) => !l.removed).map((l) => ({ id: l.id, text: l.text }));
}

/** Remove from Me. A `level` item moves that module back one step. */
export async function removeAskLearned(id: string): Promise<void> {
  const store = await load();
  const item = store.learned.find((l) => l.id === id);
  if (!item || item.removed) return;
  const mark = (l: AskLearned): AskLearned => (l.id === id ? { ...l, removed: true } : l);
  await setMeta(ASK_META, {
    turns: store.turns.map((t) => ({ ...t, learned: t.learned.map(mark) })),
    learned: store.learned.map(mark),
  } satisfies AskStore);
  if (item.kind === 'level' && item.module && item.delta) await moveLevel(item.module, item.delta === 1 ? -1 : 1);
}

/**
 * Topic weights from Ask: "more" = 2, "fewer" = 0.5. When he said both about
 * one topic, the newest wins. Topics he never named are absent (weight 1).
 */
export async function themeBoosts(): Promise<Record<string, number>> {
  const { learned } = await load();
  const boosts: Record<string, number> = {};
  for (const l of learned) {
    if (l.removed || !l.theme || (l.kind !== 'more' && l.kind !== 'fewer')) continue;
    if (l.theme in boosts) continue;
    boosts[l.theme] = l.kind === 'more' ? 2 : 0.5;
  }
  return boosts;
}

/** Topics the AI added via Ask, newest first, no repeats, max 10. */
export async function addedThemes(): Promise<string[]> {
  const { learned } = await load();
  const out: string[] = [];
  for (const l of learned) {
    if (l.removed || l.kind !== 'new_theme' || !l.theme) continue;
    if (!out.some((t) => t.toLowerCase() === l.theme!.toLowerCase())) out.push(l.theme);
    if (out.length >= ADDED_THEMES_MAX) break;
  }
  return out;
}

/** His wishes, newest first, max `max`. */
export async function askWishes(max = ASK_WISHES_MAX): Promise<string[]> {
  const { learned } = await load();
  return learned
    .filter((l) => !l.removed && l.kind === 'wish' && l.note)
    .map((l) => l.note!)
    .slice(0, max);
}
