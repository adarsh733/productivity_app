import type { ModuleId } from '../types/contract';
import { validateSeedCard } from './seedLoader';

/**
 * v7 seed-file check (docs/REDESIGN-V7.html steps 1-3). One file per module,
 * `src/content/seed/50-54-*.json`, each checked by its own test beside it.
 *
 * Pure: takes the parsed file, returns every problem in plain words. An empty
 * list means the file is fine.
 */

/** The id part for each module: `v7-<part>-01` … `v7-<part>-20`. */
export const MODULE_ID_PART: Record<ModuleId, string> = {
  words: 'words',
  smalltalk: 'talk',
  better: 'better',
  phrases: 'phrases',
  stories: 'stories',
};

export const MODULE_FILE_SIZE = 20;
export const MAX_WORDS_PER_SLIDE = 40;
/** Words cards with these numbers carry a quick check. */
export const WORDS_CHECK_AT: readonly number[] = [3, 6, 9, 12, 15, 18];
export const MIN_THINKING_CARDS = 5;
/** Slides that teach a rule, an analogy or the research are out (decision 2026-11-08). */
const BANNED_FIELDS = ['analogy', 'credit', 'research'];

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function lineText(v: unknown): string {
  return typeof v === 'object' && v !== null ? str((v as Raw).text) : '';
}

function lines(v: unknown): string[] {
  return Array.isArray(v) ? v.map(lineText) : [];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str) : [];
}

/** Words a reader has to read: `**` marks and lone symbols (· → —) do not count. */
export function countWords(text: string): number {
  return text
    .replace(/\*\*/g, '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * The text on each slide of a card, the same split `features/cards/moduleSlides.ts`
 * shows. Labels and the short pill lines (formula, rule, changes, tone, trick)
 * are left out: they are chips, not reading.
 */
export function slideTexts(card: Raw): string[][] {
  switch (card.module) {
    case 'words': {
      const slides = [
        [str(card.word), str(card.say), str(card.meaning), ...lines(card.examples)],
        [lineText(card.right), ...lines(card.wrong)],
      ];
      const check = card.check as Raw | undefined;
      if (check && typeof check === 'object') {
        const opts = Array.isArray(check.options) ? check.options.map((o) => str((o as Raw)?.text)) : [];
        slides.push([str(check.question), ...opts]);
      }
      return slides;
    }
    case 'smalltalk':
      return [
        [str(card.moment), str(card.they), str(card.deadEnd), str(card.reply)],
        lines(card.more),
        strings(card.donts),
      ];
    case 'better': {
      const next = (card.next ?? {}) as Raw;
      return [
        [str(card.situation), str(card.mightSay), str(card.better)],
        [str(next.title), ...lines(next.lines), str(next.note)],
      ];
    }
    case 'phrases':
      return [
        [str(card.phrase), str(card.meaning), str(card.useWhen), str(card.example)],
        [str(card.careful), lineText(card.wrong), ...strings(card.similar)],
      ];
    case 'stories': {
      const slides = [[str(card.report), str(card.story)]];
      const turn = card.yourTurn as Raw | undefined;
      if (turn && typeof turn === 'object') slides.push([str(turn.prompt), str(turn.hint)]);
      return slides;
    }
    default:
      return [];
  }
}

function bannedKeys(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => bannedKeys(x, `${path}[${i}]`));
  if (typeof v !== 'object' || v === null) return [];
  const found: string[] = [];
  for (const [k, val] of Object.entries(v as Raw)) {
    const here = path ? `${path}.${k}` : k;
    if (BANNED_FIELDS.includes(k)) found.push(here);
    found.push(...bannedKeys(val, here));
  }
  return found;
}

/** The field that must not repeat inside one module file, when there is one. */
const UNIQUE_FIELD: Partial<Record<ModuleId, string>> = {
  words: 'word',
  phrases: 'phrase',
  better: 'situation',
};

export function checkModuleSeedFile(cards: unknown[], module: ModuleId): string[] {
  const problems: string[] = [];
  if (!Array.isArray(cards)) return ['the file must be a plain array of cards'];
  if (cards.length !== MODULE_FILE_SIZE) {
    problems.push(`expected exactly ${MODULE_FILE_SIZE} cards, found ${cards.length}`);
  }

  const part = MODULE_ID_PART[module];
  const idPattern = new RegExp(`^v7-${part}-(\\d{2})$`);
  const numbers = new Set<number>();
  const uniqueField = UNIQUE_FIELD[module];
  const seenValues = new Map<string, string>();
  let thinking = 0;

  cards.forEach((raw, i) => {
    const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Raw;
    const id = typeof o.id === 'string' ? o.id : `card #${i + 1}`;

    const res = validateSeedCard(raw);
    if (!res.ok) problems.push(`${id}: ${res.reason}`);
    if (o.type !== 'module') problems.push(`${id}: type must be "module"`);
    if (o.module !== module) problems.push(`${id}: module must be "${module}", found ${String(o.module)}`);

    const m = idPattern.exec(id);
    const n = m ? Number(m[1]) : NaN;
    if (!m || n < 1 || n > MODULE_FILE_SIZE) {
      problems.push(`${id}: id must be v7-${part}-01 to v7-${part}-${MODULE_FILE_SIZE}`);
    } else if (numbers.has(n)) {
      problems.push(`${id}: id used twice`);
    } else {
      numbers.add(n);
    }

    if (uniqueField) {
      const value = str(o[uniqueField]).trim().toLowerCase();
      if (value) {
        const first = seenValues.get(value);
        if (first) problems.push(`${id}: ${uniqueField} "${str(o[uniqueField])}" repeats ${first}`);
        else seenValues.set(value, id);
      }
    }

    slideTexts(o).forEach((texts, s) => {
      const words = texts.reduce((sum, t) => sum + countWords(t), 0);
      if (words > MAX_WORDS_PER_SLIDE) {
        problems.push(`${id}: slide ${s + 1} has ${words} words (max ${MAX_WORDS_PER_SLIDE})`);
      }
    });

    for (const k of bannedKeys(o)) problems.push(`${id}: field "${k}" is not allowed (no analogy, credit or research)`);

    if (module === 'words') {
      const word = str(o.word).trim().toLowerCase();
      const examples = lines(o.examples);
      examples.forEach((t, e) => {
        if (!word || !t.toLowerCase().includes(`**${word}**`)) {
          problems.push(`${id}: example ${e + 1} must mark the word as **${str(o.word)}**`);
        }
      });
      if (!Array.isArray(o.wrong) || o.wrong.length === 0) problems.push(`${id}: needs at least one wrong line`);
      if (m && WORDS_CHECK_AT.includes(n) && o.check === undefined) {
        problems.push(`${id}: card ${n} needs a quick check`);
      }
    }

    if (module === 'phrases' && !lineText(o.wrong)) problems.push(`${id}: needs a wrong line`);
    if (module === 'better' && o.thinking === true) thinking++;
  });

  if (module === 'better' && thinking < MIN_THINKING_CARDS) {
    problems.push(`only ${thinking} cards have thinking: true (at least ${MIN_THINKING_CARDS})`);
  }
  return problems;
}
