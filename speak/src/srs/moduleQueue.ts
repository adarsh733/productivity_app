import type { DayKey, FeedFilter, ModuleCard, ModuleId, ModuleLevel } from '../types/contract';
import { MODULES } from '../types/contract';
import { headOf } from '../db/libraryCheck';
import { floorFor, levelOf, themeOf } from '../features/cards/cardTags';
import { MODULE_LEVEL_START } from '../features/auto/moduleBatch';
import { dayCardHash } from './queue';

/** v8: cards of one topic shown in a row (answer 2 = B, Adarsh 2026-11-10). */
export const RUN_LENGTH = 4;

/** A topic weight that is missing, zero or broken still gets a tiny chance. */
const MIN_THEME_WEIGHT = 0.01;

/** The seen-once key of a card: `${module}:${head.toLowerCase()}` (same as `SeenTerm.id`). */
export function seenHeadKey(card: ModuleCard): string {
  return `${card.module}:${headOf(card).toLowerCase()}`;
}

/**
 * v8: true when the card is easier than the Feed serves for its module
 * (`floorFor` of his module level; a module with no level yet starts at
 * `MODULE_LEVEL_START`, so level-1 cards are skipped at first, answer 8 = A).
 */
export function belowFloor(
  card: ModuleCard,
  levels: Partial<Record<ModuleId, ModuleLevel>>,
): boolean {
  return levelOf(card) < floorFor(levels[card.module] ?? MODULE_LEVEL_START);
}

/** A well-mixed number in [0, 1) for a string (FNV-1a plus a final mix). */
function unitHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Buckets = Map<ModuleId, ModuleCard[]>;

/**
 * Takes the next card from the first module after `state.last` (cyclic, in
 * MODULES order) that has cards left: a fair round-robin that never repeats a
 * module while another one has cards.
 */
function takeNext(buckets: Buckets, state: { last: number }): ModuleCard | undefined {
  for (let step = 1; step <= MODULES.length; step++) {
    const idx = (state.last + step) % MODULES.length;
    const list = buckets.get(MODULES[idx]!);
    if (list && list.length > 0) {
      state.last = idx;
      return list.shift();
    }
  }
  return undefined;
}

function hasCards(buckets: Buckets): boolean {
  for (const list of buckets.values()) if (list.length > 0) return true;
  return false;
}

/**
 * Builds the ordered queue of module cards for the v7 feed.
 *
 * Rules:
 *  - Only cards with `type === 'module'` and a valid `module` in `MODULES`.
 *  - Cards whose IDs are in `opts.seenIds` or `opts.hiddenIds` are excluded.
 *  - When `opts.filter !== 'mix'`, only cards for that module are included,
 *    shuffled deterministically for `opts.today` via `dayCardHash`.
 *  - When `opts.filter === 'mix'`, cards are round-robined over the 5 modules.
 *    Never the same module twice in a row when another module has cards left.
 *    Cards within each module are shuffled deterministically via `dayCardHash`.
 *  - `opts.reviewIds` (♡ cards due for the Sunday review) come first, in that
 *    order, exempt from `seenIds`, `seenHeads` and `levels` but not from
 *    `hiddenIds`. They respect the module filter. They never appear twice.
 *  - `opts.seenHeads` holds heads already seen: a card whose head is in it is
 *    skipped. An entry is `${module}:${head.toLowerCase()}` (a `SeenTerm.id`);
 *    a bare lower-case head also counts.
 *  - The result is capped at `opts.limit`.
 *
 * v8 (2026-11-10), all optional; with none of them the order is exactly v7's:
 *  - `levels`: skip cards below their module's floor (`belowFloor`).
 *  - `frontIds`: these cards (new AI batches, newest first) come next after
 *    the review cards, mixed in one-for-one with the usual order (answer 4 =
 *    A) until they run out. They follow every other rule.
 *  - `runLength` > 1: the usual order becomes topic runs of that many cards of
 *    one theme, spread across modules (answer 3 = A). Each run's theme is a
 *    day-seeded draw weighted by `themeWeights` (missing = 1), never the same
 *    theme twice in a row while another theme has cards.
 */
export function buildModuleQueue(
  cards: readonly ModuleCard[],
  opts: {
    today: DayKey;
    filter: FeedFilter;
    seenIds: ReadonlySet<string>;
    hiddenIds: ReadonlySet<string>;
    limit: number;
    reviewIds?: readonly string[];
    seenHeads?: ReadonlySet<string>;
    levels?: Partial<Record<ModuleId, ModuleLevel>>;
    runLength?: number;
    themeWeights?: Record<string, number>;
    frontIds?: readonly string[];
  },
): ModuleCard[] {
  if (opts.limit <= 0) return [];

  const isModuleCard = (c: ModuleCard): boolean =>
    Boolean(c) &&
    (c as unknown as { type?: string }).type === 'module' &&
    MODULES.includes(c.module) &&
    !opts.hiddenIds.has(c.id) &&
    (opts.filter === 'mix' || c.module === opts.filter);

  // ♡ cards due for review: first, in the order given, even if seen before.
  const reviewSet = new Set(opts.reviewIds ?? []);
  const reviewById = new Map<string, ModuleCard>();
  for (const c of cards) {
    if (reviewSet.has(c.id) && !reviewById.has(c.id) && isModuleCard(c)) {
      reviewById.set(c.id, c);
    }
  }
  const reviewCards = [...new Set(opts.reviewIds ?? [])]
    .map((id) => reviewById.get(id))
    .filter((c): c is ModuleCard => c !== undefined);

  const headSeen = (c: ModuleCard): boolean => {
    const heads = opts.seenHeads;
    if (!heads || heads.size === 0) return false;
    const head = headOf(c).toLowerCase();
    return head !== '' && (heads.has(`${c.module}:${head}`) || heads.has(head));
  };

  const levels = opts.levels;
  const tooEasy = (c: ModuleCard): boolean => levels !== undefined && belowFloor(c, levels);

  // Filter to eligible module cards: valid module type, unseen, unhidden, at or above the floor
  const eligible = cards.filter(
    (c): c is ModuleCard =>
      isModuleCard(c) &&
      !reviewSet.has(c.id) &&
      !opts.seenIds.has(c.id) &&
      !headSeen(c) &&
      !tooEasy(c),
  );
  const lead = reviewCards.slice(0, opts.limit);
  const room = opts.limit - lead.length;
  if (room <= 0) return lead;

  // New AI cards: next, in the order given.
  const eligibleById = new Map<string, ModuleCard>();
  for (const c of eligible) if (!eligibleById.has(c.id)) eligibleById.set(c.id, c);
  const front = [...new Set(opts.frontIds ?? [])]
    .map((id) => eligibleById.get(id))
    .filter((c): c is ModuleCard => c !== undefined)
    .slice(0, room);
  const frontSet = new Set(front.map((c) => c.id));
  const rest = frontSet.size > 0 ? eligible.filter((c) => !frontSet.has(c.id)) : eligible;

  const compareCards = (a: ModuleCard, b: ModuleCard) => {
    const hashA = dayCardHash(a.id, opts.today);
    const hashB = dayCardHash(b.id, opts.today);
    if (hashA !== hashB) return hashA - hashB;
    return a.id.localeCompare(b.id);
  };

  const bucketsOf = (pool: readonly ModuleCard[]): Buckets => {
    const buckets: Buckets = new Map();
    for (const m of MODULES) {
      const list = pool.filter((c) => c.module === m);
      list.sort(compareCards);
      buckets.set(m, list);
    }
    return buckets;
  };

  const runLength = opts.runLength ?? 1;
  const usual: ModuleCard[] = [];

  if (runLength <= 1) {
    // v7 order. Single module: one shuffled pool. Mix: strict round-robin over the 5 modules.
    const buckets = bucketsOf(rest);
    const state = { last: -1 };
    while (usual.length < room) {
      const card = takeNext(buckets, state);
      if (!card) break;
      usual.push(card);
    }
  } else {
    // Topic runs: `runLength` cards of one theme, round-robin across modules inside it.
    const byTheme = new Map<string, ModuleCard[]>();
    for (const c of rest) {
      const t = themeOf(c);
      const list = byTheme.get(t);
      if (list) list.push(c);
      else byTheme.set(t, [c]);
    }
    const themeBuckets = new Map<string, Buckets>();
    for (const [t, list] of byTheme) themeBuckets.set(t, bucketsOf(list));

    const weightOf = (t: string): number => {
      const w = opts.themeWeights?.[t] ?? 1;
      return Number.isFinite(w) && w > 0 ? w : MIN_THEME_WEIGHT;
    };

    const state = { last: -1 };
    let lastTheme: string | null = null;
    let run = 0;
    while (usual.length < room) {
      const live = [...themeBuckets.keys()].filter((t) => hasCards(themeBuckets.get(t)!)).sort();
      if (live.length === 0) break;
      const choices: string[] = live.length > 1 && lastTheme !== null ? live.filter((t) => t !== lastTheme) : live;
      const total = choices.reduce((sum: number, t: string) => sum + weightOf(t), 0);
      let r = unitHash(`${opts.today}:run:${run}`) * total;
      let theme: string = choices[choices.length - 1]!;
      for (const t of choices) {
        r -= weightOf(t);
        if (r < 0) {
          theme = t;
          break;
        }
      }
      run++;
      const buckets = themeBuckets.get(theme)!;
      for (let k = 0; k < runLength && usual.length < room; k++) {
        const card = takeNext(buckets, state);
        if (!card) break;
        usual.push(card);
      }
      lastTheme = theme;
    }
  }

  // Mix the front cards in one-for-one: front, usual, front, usual, ...
  const result: ModuleCard[] = [...lead];
  let f = 0;
  let u = 0;
  while (result.length < opts.limit && (f < front.length || u < usual.length)) {
    if (f < front.length) result.push(front[f++]!);
    if (result.length < opts.limit && u < usual.length) result.push(usual[u++]!);
  }
  return result;
}
