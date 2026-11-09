import type {
  Card,
  CardFeedback,
  FeedbackReason,
  ModuleBatch,
  ModuleBatchRequest,
  ModuleCard,
  ModuleId,
  ModuleLevel,
} from '../../types/contract';
import { MODULES } from '../../types/contract';
import { db, enqueue, getMeta, setMeta } from '../../db/db';
import { headOf, checkLibraryFile, type LibraryKey } from '../../db/libraryCheck';
import { todayKey } from '../../lib/date';
import {
  AI_NEEDS_KEY_META,
  CoachNeedsKeyError,
  aiPost,
  checkItems,
  needsSecondKey,
  neverReachedModel,
  type FetchFn,
} from '../coach/pipeline';
import { refundAiCalls, tryConsumeBackgroundAiCalls } from './budget';

/**
 * v7 steps 4-6: AI batches for the five feed modules (docs/REDESIGN-V7.html).
 *
 * When a module has fewer than `MODULE_BATCH_TRIGGER` unseen cards, the phone
 * asks the writer for `MODULE_BATCH_SIZE` more: 3 calls of 10 through
 * `expand_seed`, told his thumbs, comments, level and every head he has
 * already seen. Each card passes the library rules here on the phone, then a
 * check on the OTHER provider, and only then is it stored. Nothing half-checked
 * is ever stored. Every failure path is silent: batches never block the app.
 *
 * Budget: 3 writer calls + 3 checks = `MODULE_BATCH_CALLS` background slots,
 * taken together (the Ask reserve stays); slots that never reached a model go
 * back.
 */

export const MODULE_BATCH_SIZE = 30;
/** A module with fewer unseen cards than this gets a batch. */
export const MODULE_BATCH_TRIGGER = 60;
/** Cards asked for in one writer call (the server takes 1-10). */
export const MODULE_BATCH_PER_CALL = 10;
/** Slots one batch takes: 3 writer calls + 3 checks. */
export const MODULE_BATCH_CALLS = 6;
export const MODULE_BATCHES_PER_DAY = 2;
/** Between two batches (also stops two simultaneous app opens). */
export const MODULE_BATCH_GAP_MS = 5 * 60 * 1000;
/** Every module starts here. */
export const MODULE_LEVEL_START: ModuleLevel = 2;

/** Local-only counter (db.meta). Never synced. */
export const MODULE_BATCH_META = 'ai.moduleBatches';
/** Which provider wrote a batch, kept so a later recheck can use the other one. */
export const batchProviderMeta = (batchId: string) => `ai.batchProvider.${batchId}`;

export interface BatchState {
  date: string;
  count: number;
  lastAt: number;
  /** Modules already batched today. */
  modules: ModuleId[];
}

/** The library rules each module's AI cards are read under (one card at a time). */
const KEY_FOR: Record<ModuleId, LibraryKey> = {
  words: 'words-senses',
  smalltalk: 'talk-office',
  better: 'better-thinking',
  phrases: 'phrases-meetings',
  stories: 'stories-more',
};

/** A feedback row with the head of the card it is about. */
export type FeedbackWithHead = CardFeedback & { head: string };

/** The seen-once key: `${module}:${head.toLowerCase()}` (same as `SeenTerm.id`). */
export function seenKey(module: ModuleId, head: string): string {
  return `${module}:${head.trim().toLowerCase()}`;
}

const isModuleCard = (c: unknown): c is ModuleCard =>
  !!c && typeof c === 'object' && (c as { type?: string }).type === 'module';

/**
 * Cards still to come, per module: active, not seen (by id or by head), not
 * hidden by his thumbs-down / Wrong English. `seenHeads` holds `seenKey`s.
 */
export function unseenByModule(
  cards: readonly unknown[],
  seenIds: ReadonlySet<string>,
  seenHeads: ReadonlySet<string>,
  hiddenIds: ReadonlySet<string>,
): Record<ModuleId, number> {
  const out = { words: 0, smalltalk: 0, better: 0, phrases: 0, stories: 0 } as Record<ModuleId, number>;
  for (const c of cards) {
    if (!isModuleCard(c) || !MODULES.includes(c.module)) continue;
    if (c.status !== undefined && c.status !== 'active') continue;
    if (seenIds.has(c.id) || hiddenIds.has(c.id)) continue;
    const head = headOf(c);
    if (head && seenHeads.has(seenKey(c.module, head))) continue;
    out[c.module]++;
  }
  return out;
}

/**
 * The module with the fewest unseen cards that is under the trigger, skipping
 * any module already batched today. null = nothing to do now (also when
 * today's two batches are used). Ties keep the module list order.
 */
export function pickBatchModule(
  unseen: Record<ModuleId, number>,
  state: BatchState | undefined,
  today: string = todayKey(),
): ModuleId | null {
  const sameDay = !!state && state.date === today;
  if (sameDay && state.count >= MODULE_BATCHES_PER_DAY) return null;
  const done = new Set(sameDay ? state.modules : []);
  let best: ModuleId | null = null;
  let bestCount = Infinity;
  for (const m of MODULES) {
    if (done.has(m)) continue;
    const n = unseen[m] ?? 0;
    if (n >= MODULE_BATCH_TRIGGER) continue;
    if (n < bestCount) {
      best = m;
      bestCount = n;
    }
  }
  return best;
}

/** Level after his Too easy / Too hard: +1 / -1, clamped to 1-5; both or neither = unchanged. */
export function nextLevel(level: ModuleLevel, reasons: readonly FeedbackReason[]): ModuleLevel {
  const up = reasons.includes('too_easy');
  const down = reasons.includes('too_hard');
  const delta = up === down ? 0 : up ? 1 : -1;
  return Math.max(1, Math.min(5, level + delta)) as ModuleLevel;
}

const COMMENTS_MAX = 20;

/**
 * What the writer is told. Only this module's feedback counts; rows he
 * "forgot" on Me (hidden) steer nothing. Liked = thumb up or Loved this;
 * disliked = thumb down, Confusing or Wrong English, with the reasons.
 * Comments are his own words, newest first, max 20. `seenHeads` = the heads
 * (not keys) already seen in this module.
 */
export function batchRequest(
  module: ModuleId,
  level: ModuleLevel,
  feedback: readonly FeedbackWithHead[],
  seenHeads: readonly string[],
  startId: string,
  count: number = MODULE_BATCH_PER_CALL,
): ModuleBatchRequest {
  const rows = feedback
    .filter((f) => f.module === module && !f.hidden)
    .slice()
    .sort((a, b) => b.at - a.at);
  const liked: string[] = [];
  const disliked: ModuleBatchRequest['disliked'] = [];
  const comments: string[] = [];
  for (const f of rows) {
    const reasons = f.reasons ?? [];
    if (f.head) {
      if (f.thumb === 'down' || reasons.includes('confusing') || reasons.includes('wrong_english')) {
        disliked.push({ head: f.head, reasons: [...reasons] });
      } else if (f.thumb === 'up' || reasons.includes('loved')) {
        liked.push(f.head);
      }
    }
    const c = f.comment?.trim();
    if (c && comments.length < COMMENTS_MAX) comments.push(c);
  }
  return {
    type: 'module',
    module,
    count: Math.max(1, Math.min(MODULE_BATCH_PER_CALL, count)),
    level,
    liked,
    disliked,
    comments,
    seen: [...seenHeads],
    startId,
  };
}

/**
 * The library rules for ONE drafted card (no outline): shape, 40-word slides,
 * no Hindi, the ✗ wrong-use line. Returns the problems; empty = fine.
 */
export function draftProblems(draft: unknown, module: ModuleId): string[] {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return ['not a card'];
  const o = draft as Record<string, unknown>;
  const key = KEY_FOR[module];
  const probe = { ...o, lang: o.lang ?? 'en', id: `v7-${key}-001` };
  return checkLibraryFile([probe], key).filter((p) => !p.startsWith('expected exactly'));
}

const pad4 = (n: number) => String(n).padStart(4, '0');

/** Next free number for `v7-ai-<module>-NNNN`. */
export function nextAiNumber(module: ModuleId, ids: Iterable<string>): number {
  const re = new RegExp(`^v7-ai-${module}-(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export interface BatchDeps {
  aiPost: typeof aiPost;
  checkItems: typeof checkItems;
  fetchFn: FetchFn;
  now: () => number;
}

function depsOf(d: Partial<BatchDeps>): BatchDeps {
  return {
    aiPost,
    checkItems,
    fetchFn: (...a: Parameters<typeof fetch>) => fetch(...a),
    now: Date.now,
    ...d,
  };
}

/** Feedback rows with the head of their card (rows whose card is gone are dropped). */
async function feedbackWithHeads(
  rows: CardFeedback[],
  cards: readonly unknown[],
): Promise<FeedbackWithHead[]> {
  const heads = new Map<string, string>();
  for (const c of cards) if (isModuleCard(c)) heads.set(c.id, headOf(c));
  const out: FeedbackWithHead[] = [];
  for (const f of rows) {
    const head = heads.get(f.cardId);
    if (head) out.push({ ...f, head });
    else if (f.comment) out.push({ ...f, head: '' });
  }
  return out;
}

/** Card ids he has seen (seen list + card_viewed events) and the heads in `seenKey` form. */
export async function loadSeen(): Promise<{ ids: Set<string>; keys: Set<string>; terms: { module: ModuleId; head: string }[] }> {
  const [terms, events] = await Promise.all([db.seen.toArray(), db.events.toArray()]);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const t of terms) {
    ids.add(t.cardId);
    keys.add(seenKey(t.module, t.head));
  }
  for (const e of events) {
    if (e.cardId && (e.type === 'card_viewed' || !e.type)) ids.add(e.cardId);
  }
  return { ids, keys, terms };
}

export function hiddenFrom(rows: readonly CardFeedback[]): Set<string> {
  const hidden = new Set<string>();
  for (const f of rows) {
    if (f.thumb === 'down' || f.reasons?.includes('wrong_english') || f.hidden === true) hidden.add(f.cardId);
  }
  return hidden;
}

/** The batch itself, once its budget is already taken. Never throws. */
async function executeBatch(module: ModuleId, d: BatchDeps, at: number, today: string): Promise<ModuleBatch> {
  const calls = MODULE_BATCH_SIZE / MODULE_BATCH_PER_CALL;
  const batch: ModuleBatch = {
    id: `batch-${module}-${at}`,
    module,
    at,
    level: MODULE_LEVEL_START,
    asked: 0,
    kept: [],
    dropped: 0,
    status: 'running',
  };
  let slotsUsed = 0;
  try {
    const [cards, fbRows, seen, profile] = await Promise.all([
      db.cards.toArray(),
      db.feedback.toArray(),
      loadSeen(),
      db.profile.get('me'),
    ]);
    batch.level = profile?.moduleLevels?.[module] ?? MODULE_LEVEL_START;
    await db.batches.put({ ...batch });

    const feedback = await feedbackWithHeads(fbRows, cards);
    // Every head the new cards must not repeat: seen, already in his library, and this batch's own.
    const known = new Set<string>(seen.keys);
    const seenHeads: string[] = seen.terms.filter((t) => t.module === module).map((t) => t.head);
    for (const c of cards as unknown[]) {
      if (isModuleCard(c) && c.module === module) known.add(seenKey(module, headOf(c)));
    }
    let counter = nextAiNumber(module, cards.map((c) => c.id));
    let provider: string | undefined;

    for (let i = 0; i < calls; i++) {
      const request = batchRequest(
        module,
        batch.level,
        feedback,
        seenHeads,
        `v7-ai-${module}-${pad4(counter)}`,
      );
      batch.asked += request.count;

      let drafts: unknown[];
      let writer: string | undefined;
      try {
        const res = await d.aiPost<{ cards?: unknown[] }>('expand_seed', request, d.fetchFn);
        slotsUsed++;
        drafts = Array.isArray(res.data?.cards) ? res.data.cards.slice(0, request.count) : [];
        writer = res.provider;
      } catch (e) {
        if (!neverReachedModel(e)) slotsUsed++;
        break;
      }

      // Local check first: shape, 40 words, no Hindi, the ✗ line, no repeated head.
      const usable: Record<string, unknown>[] = [];
      for (const raw of drafts) {
        if (draftProblems(raw, module).length > 0) continue;
        const o = raw as Record<string, unknown>;
        const head = headOf(o);
        const k = seenKey(module, head);
        if (!head || known.has(k)) continue;
        known.add(k);
        usable.push(o);
      }
      if (usable.length === 0) continue;

      // Then the check on the OTHER provider. Nothing unchecked is stored.
      let passed: Set<string>;
      try {
        slotsUsed++;
        passed = await d.checkItems(
          usable.map((card, n) => ({ key: `d${n}`, card })),
          writer,
          d.fetchFn,
        );
      } catch (e) {
        if (neverReachedModel(e)) slotsUsed--;
        if (e instanceof CoachNeedsKeyError) await setMeta(AI_NEEDS_KEY_META, true).catch(() => {});
        break;
      }
      provider = writer ?? provider;

      const keep = usable.filter((_, n) => passed.has(`d${n}`));
      batch.dropped += drafts.length - keep.length;
      const stored: Card[] = keep.map((c, n) => {
        const id = `v7-ai-${module}-${pad4(counter + n)}`;
        return {
          ...c,
          id,
          type: 'module',
          module,
          lang: 'en',
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : ['ai', module],
          source: 'ai',
          status: 'active',
          createdAt: at,
          batchId: batch.id,
        } as unknown as Card;
      });
      counter += stored.length;
      await db.transaction('rw', db.cards, db.outbox, async () => {
        for (const c of stored) {
          await db.cards.put(c);
          await enqueue('cards', c.id);
        }
      });
      for (const c of stored) {
        batch.kept.push(c.id);
        seenHeads.push(headOf(c));
      }
    }

    if (provider) await setMeta(batchProviderMeta(batch.id), provider).catch(() => {});
    batch.status = batch.kept.length > 0 ? 'done' : 'failed';
  } catch {
    batch.status = batch.kept.length > 0 ? 'done' : 'failed';
  }
  const unused = MODULE_BATCH_CALLS - slotsUsed;
  if (unused > 0) await refundAiCalls(unused, today).catch(() => {});
  await db.batches.put({ ...batch }).catch(() => {});
  return batch;
}

/**
 * One batch for `module`: 3 writer calls of 10 (`expand_seed`), each card
 * through the library rules here and the check on the other provider, kept
 * cards stored (`source: 'ai'`, `batchId`, ids `v7-ai-<module>-NNNN`, queued
 * for backup). Takes `MODULE_BATCH_CALLS` background slots; refused (a
 * `failed` batch, nothing stored) when the day's budget cannot spare them.
 * Never throws.
 */
export async function runModuleBatch(module: ModuleId, deps: Partial<BatchDeps> = {}): Promise<ModuleBatch> {
  const d = depsOf(deps);
  const at = d.now();
  const today = todayKey(new Date(at));
  if (!(await tryConsumeBackgroundAiCalls(MODULE_BATCH_CALLS, today).catch(() => false))) {
    return { id: `batch-${module}-${at}`, module, at, level: MODULE_LEVEL_START, asked: 0, kept: [], dropped: 0, status: 'failed' };
  }
  return executeBatch(module, d, at, today);
}

/** One atomic claim: gap + daily cap + module-once-a-day + the shared budget. */
async function claimBatch(module: ModuleId, at: number, today: string): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const state = await getMeta<BatchState>(MODULE_BATCH_META);
    if (state && at - state.lastAt < MODULE_BATCH_GAP_MS && state.date === today) return false;
    const sameDay = !!state && state.date === today;
    const count = sameDay ? state.count : 0;
    if (count >= MODULE_BATCHES_PER_DAY) return false;
    const modules = sameDay ? state.modules : [];
    if (modules.includes(module)) return false;
    if (!(await tryConsumeBackgroundAiCalls(MODULE_BATCH_CALLS, today))) return false;
    await setMeta(MODULE_BATCH_META, {
      date: today,
      count: count + 1,
      lastAt: at,
      modules: [...modules, module],
    } satisfies BatchState);
    return true;
  });
}

let inFlight: Promise<ModuleBatch | null> | null = null;

/**
 * Fire-and-forget from app open: pick the module that needs cards most and run
 * one batch for it. null = nothing to do (online, key, day cap, nothing under
 * the trigger). Never throws.
 */
export function maybeModuleBatch(deps: Partial<BatchDeps> = {}): Promise<ModuleBatch | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
      if (await needsSecondKey()) return null;
      const d = depsOf(deps);
      const at = d.now();
      const today = todayKey(new Date(at));
      const [cards, fbRows, seen, state] = await Promise.all([
        db.cards.toArray(),
        db.feedback.toArray(),
        loadSeen(),
        getMeta<BatchState>(MODULE_BATCH_META),
      ]);
      const module = pickBatchModule(unseenByModule(cards, seen.ids, seen.keys, hiddenFrom(fbRows)), state, today);
      if (!module) return null;
      if (!(await claimBatch(module, at, today))) return null;
      return await executeBatch(module, d, at, today);
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Wrong English on a batch card: check the rest of that batch again on the
 * other provider and bury what fails (status `buried`, plus a hidden Wrong
 * English feedback row so the feed skips it). Returns how many were buried.
 * Needs the writer's name saved with the batch; without it (or without a free
 * slot) nothing happens. Never throws.
 */
export async function recheckBatch(
  card: { id: string; batchId?: string },
  deps: Partial<BatchDeps> = {},
): Promise<number> {
  try {
    if (!card.batchId) return 0;
    const batchId = card.batchId;
    const d = depsOf(deps);
    const generator = await getMeta<string>(batchProviderMeta(batchId));
    if (!generator) return 0;
    const rest = (await db.cards.where('id').anyOf(
      (await db.batches.get(batchId))?.kept ?? [],
    ).toArray()).filter((c) => c.id !== card.id && (c as { status?: string }).status === 'active');
    if (rest.length === 0) return 0;

    const today = todayKey(new Date(d.now()));
    if (!(await tryConsumeBackgroundAiCalls(1, today).catch(() => false))) return 0;

    let passed: Set<string>;
    try {
      passed = await d.checkItems(rest.map((c) => ({ key: c.id, card: c })), generator, d.fetchFn);
    } catch (e) {
      if (neverReachedModel(e)) await refundAiCalls(1, today).catch(() => {});
      return 0;
    }

    const failed = rest.filter((c) => !passed.has(c.id));
    const now = d.now();
    await db.transaction('rw', db.cards, db.feedback, db.batches, db.outbox, async () => {
      for (const c of failed) {
        await db.cards.update(c.id, { status: 'buried' });
        await enqueue('cards', c.id);
        const id = `fb-${c.id}`;
        const existing = await db.feedback.get(id);
        const reasons = [...new Set([...(existing?.reasons ?? []), 'wrong_english' as const])];
        await db.feedback.put({
          id,
          cardId: c.id,
          module: (c as unknown as ModuleCard).module,
          thumb: existing?.thumb,
          reasons,
          comment: existing?.comment,
          reply: existing?.reply ?? '',
          at: now,
          hidden: existing ? existing.hidden : true,
        });
        await enqueue('feedback', id);
      }
      await db.batches.update(batchId, { recheckedAt: now });
    });
    return failed.length;
  } catch {
    return 0;
  }
}

/** Move one module's level by his Too easy / Too hard (a no-op for other reasons). */
export async function shiftModuleLevel(module: ModuleId, reasons: readonly FeedbackReason[]): Promise<ModuleLevel> {
  const profile = (await db.profile.get('me')) ?? { id: 'me', createdAt: Date.now(), userId: null };
  const current = profile.moduleLevels?.[module] ?? MODULE_LEVEL_START;
  const next = nextLevel(current, reasons);
  if (next === current) return current;
  await db.transaction('rw', db.profile, db.outbox, async () => {
    await db.profile.put({ ...profile, moduleLevels: { ...(profile.moduleLevels ?? {}), [module]: next } });
    await enqueue('profile', 'me');
  });
  return next;
}
