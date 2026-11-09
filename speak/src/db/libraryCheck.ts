import type { ModuleId } from '../types/contract';
import { MAX_WORDS_PER_SLIDE, countWords, slideTexts } from './moduleSeedCheck';
import { validateSeedCard } from './seedLoader';

/**
 * v7 steps 4-6 library check (docs/REDESIGN-V7.html). The ~1,400 launch cards
 * live in `src/content/seed/60-77-*.json`, one file per key below, each
 * checked by its own `lib-<key>.test.ts`. AI batches reuse the same rules
 * without an outline.
 *
 * Pure: takes the parsed file, returns every problem in plain words. An empty
 * list means the file is fine.
 */

export type LibraryKey =
  | 'words-senses'
  | 'words-feelings'
  | 'words-people'
  | 'words-thinking'
  | 'words-work'
  | 'words-money'
  | 'talk-office'
  | 'talk-home'
  | 'better-thinking'
  | 'better-pushback'
  | 'phrases-meetings'
  | 'phrases-email'
  | 'phrases-pushback'
  | 'stories-more';

export interface LibraryFile {
  file: string;
  module: ModuleId;
  cards: number;
  about: string;
}

export const LIBRARY_FILES: Record<LibraryKey, LibraryFile> = {
  'words-senses': { file: '60-words-senses.json', module: 'words', cards: 97, about: 'sounds and senses' },
  'words-feelings': { file: '61-words-feelings.json', module: 'words', cards: 97, about: 'feelings' },
  'words-people': { file: '62-words-people.json', module: 'words', cards: 97, about: 'people' },
  'words-thinking': { file: '63-words-thinking.json', module: 'words', cards: 97, about: 'thinking and deciding' },
  'words-work': { file: '64-words-work.json', module: 'words', cards: 96, about: 'work' },
  'words-money': { file: '65-words-money-time.json', module: 'words', cards: 96, about: 'money and time' },
  'talk-office': {
    file: '70-talk-office.json', module: 'smalltalk', cards: 115, about: 'office and client calls, all 5 kinds',
  },
  'talk-home': {
    file: '71-talk-home.json', module: 'smalltalk', cards: 115, about: 'family, friends, weddings, all 5 kinds',
  },
  'better-thinking': {
    file: '72-better-thinking.json', module: 'better', cards: 115,
    about: 'explain your thinking (at least 60 with thinking: true), giving an update, explaining a delay, "what do you do?"',
  },
  'better-pushback': {
    file: '73-better-pushback.json', module: 'better', cards: 115,
    about: 'disagreeing politely, saying no, asking for help, explaining work to a non-tech person, Indian-English fixes',
  },
  'phrases-meetings': { file: '74-phrases-meetings.json', module: 'phrases', cards: 105, about: 'meetings 70, praise 35' },
  'phrases-email': { file: '75-phrases-email.json', module: 'phrases', cards: 90, about: 'email 70, idioms 20' },
  'phrases-pushback': { file: '76-phrases-pushback.json', module: 'phrases', cards: 85, about: 'pushback 45, deadlines 40' },
  'stories-more': {
    file: '77-stories-more.json', module: 'stories', cards: 80,
    about: 'your day, a funny moment, a work win, explaining a business idea, a trip (16 each)',
  },
};

/** One planned card in `src/content/library/outline.json`. */
export interface OutlineItem {
  id: string;
  head: string;
  level?: 1 | 2 | 3;
  note: string;
}

/** The field that names a card inside its module (the seen-once key). */
const HEAD_FIELD: Record<ModuleId, string> = {
  words: 'word',
  phrases: 'phrase',
  smalltalk: 'moment',
  better: 'mightSay',
  stories: 'report',
};

/** Modules whose head must match the outline item's head, card by card. */
const OUTLINE_HEAD: readonly ModuleId[] = ['words', 'phrases', 'smalltalk'];

/** Hindi kept out of every visible line (decision 2026-11-08: Hindi stays hidden). */
export const HIDDEN_HINDI: readonly string[] = [
  'yaar', 'accha', 'achha', 'arre', 'haan', 'nahi', 'bhai', 'bhaiya', 'chalo', 'theek', 'jugaad', 'ji',
];
const HINDI_RE = new RegExp(`\\b(${HIDDEN_HINDI.join('|')})\\b`, 'i');
const DEVANAGARI_RE = /[ऀ-ॿ꣠-ꣿ]/;

/** Fields that are never shown as reading text. */
const NOT_VISIBLE = new Set(['id', 'type', 'module', 'lang', 'track', 'kind', 'category', 'icon', 'group', 'batchId', 'seedId', 'source', 'status']);
const BANNED_FIELDS = ['analogy', 'credit', 'research'];

type Raw = Record<string, unknown>;

function asRaw(v: unknown): Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** The card's head: words `word`, phrases `phrase`, small talk `moment`, better `mightSay`, stories `report`. */
export function headOf(card: unknown): string {
  const o = asRaw(card);
  const field = HEAD_FIELD[o.module as ModuleId];
  return field ? str(o[field]).trim() : '';
}

function headKey(card: unknown): string {
  return headOf(card).toLowerCase();
}

/** Every string in the card with the key it sits under. */
function allStrings(v: unknown, key = ''): { key: string; text: string }[] {
  if (typeof v === 'string') return [{ key, text: v }];
  if (Array.isArray(v)) return v.flatMap((x) => allStrings(x, key));
  if (typeof v === 'object' && v !== null) {
    return Object.entries(v as Raw).flatMap(([k, val]) => allStrings(val, k));
  }
  return [];
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

function labelOf(v: unknown): string {
  return str(asRaw(v).label).trim();
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Check one library file (or, with no outline, one AI batch read as `key`'s
 * module). `outline` = that key's items from `outline.json`.
 */
export function checkLibraryFile(cards: unknown[], key: LibraryKey, outline?: OutlineItem[]): string[] {
  const spec = LIBRARY_FILES[key];
  if (!spec) return [`unknown library key ${String(key)}`];
  if (!Array.isArray(cards)) return ['the file must be a plain array of cards'];

  const problems: string[] = [];
  const { module } = spec;
  if (cards.length !== spec.cards) problems.push(`expected exactly ${spec.cards} cards, found ${cards.length}`);
  if (outline && outline.length !== spec.cards) {
    problems.push(`outline has ${outline.length} items, expected ${spec.cards}`);
  }

  const heads = new Map<string, string>();

  cards.forEach((raw, i) => {
    const n = i + 1;
    const o = asRaw(raw);
    const expectedId = `v7-${key}-${pad3(n)}`;
    const id = typeof o.id === 'string' && o.id ? o.id : `card #${n}`;

    if (o.id !== expectedId) problems.push(`${id}: card ${n} must have id ${expectedId}`);

    const res = validateSeedCard(raw);
    if (!res.ok) problems.push(`${id}: ${res.reason}`);
    if (o.type !== 'module') problems.push(`${id}: type must be "module"`);
    if (o.module !== module) problems.push(`${id}: module must be "${module}", found ${String(o.module)}`);
    if (o.lang !== 'en') problems.push(`${id}: lang must be "en"`);

    slideTexts(o).forEach((texts, s) => {
      const words = texts.reduce((sum, t) => sum + countWords(t), 0);
      if (words > MAX_WORDS_PER_SLIDE) {
        problems.push(`${id}: slide ${s + 1} has ${words} words (max ${MAX_WORDS_PER_SLIDE})`);
      }
    });
    for (const k of bannedKeys(o)) problems.push(`${id}: field "${k}" is not allowed (no analogy, credit or research)`);

    for (const { key: k, text } of allStrings(o)) {
      if (DEVANAGARI_RE.test(text)) problems.push(`${id}: Devanagari in ${k || 'a field'}`);
      if (!NOT_VISIBLE.has(k)) {
        const hit = HINDI_RE.exec(text);
        if (hit) problems.push(`${id}: Hindi word "${hit[1]}" in ${k}`);
      }
    }

    const head = headOf(o);
    if (!head) {
      problems.push(`${id}: missing its head (${HEAD_FIELD[module]})`);
    } else {
      const first = heads.get(head.toLowerCase());
      if (first) problems.push(`${id}: "${head}" repeats ${first}`);
      else heads.set(head.toLowerCase(), id);
    }

    if (module === 'words') {
      const word = str(o.word).trim().toLowerCase();
      const examples = Array.isArray(o.examples) ? o.examples : [];
      examples.forEach((e, k) => {
        if (!word || !str(asRaw(e).text).toLowerCase().includes(`**${word}**`)) {
          problems.push(`${id}: example ${k + 1} must mark the word as **${str(o.word)}**`);
        }
      });
      const wrong = Array.isArray(o.wrong) ? o.wrong : [];
      if (wrong.length < 1 || wrong.length > 2) problems.push(`${id}: needs 1-2 wrong lines`);
      wrong.forEach((w, k) => {
        if (!labelOf(w).startsWith('✗')) problems.push(`${id}: wrong line ${k + 1} label must start with ✗`);
      });
      if (n % 3 === 0) {
        const check = o.check === undefined ? undefined : asRaw(o.check);
        const options = check && Array.isArray(check.options) ? check.options : [];
        if (!check) {
          problems.push(`${id}: card ${n} needs a quick check`);
        } else if (options.length !== 3 || options.filter((x) => asRaw(x).right === true).length !== 1) {
          problems.push(`${id}: the quick check needs 3 options with exactly one right`);
        }
      }
    }

    if (module === 'phrases') {
      if (!labelOf(o.wrong).startsWith('✗')) problems.push(`${id}: wrong line label must start with ✗`);
      const item = outline?.[i];
      if (item && o.group !== item.note) {
        problems.push(`${id}: group must be "${item.note}" (outline), found ${String(o.group)}`);
      }
    }

    if (module === 'words' || module === 'phrases') {
      if (o.level !== 1 && o.level !== 2 && o.level !== 3) problems.push(`${id}: level must be 1, 2 or 3`);
    }

    if (outline && OUTLINE_HEAD.includes(module)) {
      const item = outline[i];
      if (!item) problems.push(`${id}: no outline item ${n}`);
      else if (head.toLowerCase() !== item.head.trim().toLowerCase()) {
        problems.push(`${id}: head "${head}" must be "${item.head}" (outline item ${n})`);
      }
    }
  });

  return problems;
}

/**
 * Cross-file check over the samples (50-54) and every library file: no id
 * used twice, no head repeated inside a module. Keys are file names.
 */
export function checkLibrary(files: Record<string, unknown[]>): string[] {
  const problems: string[] = [];
  const ids = new Map<string, string>();
  const heads = new Map<string, string>();

  for (const [file, cards] of Object.entries(files)) {
    if (!Array.isArray(cards)) {
      problems.push(`${file}: must be a plain array of cards`);
      continue;
    }
    cards.forEach((raw, i) => {
      const o = asRaw(raw);
      const id = typeof o.id === 'string' && o.id ? o.id : `card #${i + 1}`;
      const where = `${file} ${id}`;

      if (typeof o.id === 'string' && o.id) {
        const first = ids.get(o.id);
        if (first) problems.push(`${where}: id also used in ${first}`);
        else ids.set(o.id, where);
      }

      const head = headKey(o);
      if (head) {
        const k = `${String(o.module)}:${head}`;
        const first = heads.get(k);
        if (first) problems.push(`${where}: "${headOf(o)}" repeats ${first} (${String(o.module)})`);
        else heads.set(k, where);
      }
    });
  }
  return problems;
}
