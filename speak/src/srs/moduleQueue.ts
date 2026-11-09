import type { DayKey, FeedFilter, ModuleCard, ModuleId } from '../types/contract';
import { MODULES } from '../types/contract';
import { headOf } from '../db/libraryCheck';
import { dayCardHash } from './queue';

/** The seen-once key of a card: `${module}:${head.toLowerCase()}` (same as `SeenTerm.id`). */
export function seenHeadKey(card: ModuleCard): string {
  return `${card.module}:${headOf(card).toLowerCase()}`;
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
 *    order, exempt from `seenIds` and `seenHeads` but not from `hiddenIds`.
 *    They respect the module filter. They never appear twice.
 *  - `opts.seenHeads` holds heads already seen: a card whose head is in it is
 *    skipped. An entry is `${module}:${head.toLowerCase()}` (a `SeenTerm.id`);
 *    a bare lower-case head also counts.
 *  - The result is capped at `opts.limit`.
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

  // Filter to eligible module cards: valid module type, unseen, unhidden
  const eligible = cards.filter(
    (c): c is ModuleCard =>
      isModuleCard(c) && !reviewSet.has(c.id) && !opts.seenIds.has(c.id) && !headSeen(c),
  );
  const lead = reviewCards.slice(0, opts.limit);
  const room = opts.limit - lead.length;

  const compareCards = (a: ModuleCard, b: ModuleCard) => {
    const hashA = dayCardHash(a.id, opts.today);
    const hashB = dayCardHash(b.id, opts.today);
    if (hashA !== hashB) return hashA - hashB;
    return a.id.localeCompare(b.id);
  };

  // Single module filter
  if (opts.filter !== 'mix') {
    const targetModule = opts.filter;
    const pool = eligible.filter((c) => c.module === targetModule);
    pool.sort(compareCards);
    return [...lead, ...pool.slice(0, room)];
  }

  // Mix mode: group by module, sort each bucket with dayCardHash
  const buckets = new Map<ModuleId, ModuleCard[]>();
  for (const m of MODULES) {
    const pool = eligible.filter((c) => c.module === m);
    pool.sort(compareCards);
    buckets.set(m, pool);
  }

  const result: ModuleCard[] = [...lead];
  let lastPickedIndex = -1;

  while (result.length < opts.limit) {
    // Search cyclic order starting immediately after the last picked module index.
    // This strictly ensures:
    //  1. Fair round-robin across all 5 modules in MODULES order.
    //  2. Never selects the same module twice in a row if any other module has cards remaining.
    let nextIndex = -1;
    for (let step = 1; step <= MODULES.length; step++) {
      const idx = (lastPickedIndex + step) % MODULES.length;
      const mod = MODULES[idx]!;
      const list = buckets.get(mod);
      if (list && list.length > 0) {
        nextIndex = idx;
        break;
      }
    }

    if (nextIndex === -1) {
      // All module buckets are exhausted
      break;
    }

    const mod = MODULES[nextIndex]!;
    const card = buckets.get(mod)!.shift()!;
    result.push(card);
    lastPickedIndex = nextIndex;
  }

  return result;
}
