import type {
  Card,
  CardType,
  QueueItem,
  QueueOptions,
  QueueReason,
  Review,
} from '../types/contract';
import { QUEUE_RULES } from '../types/contract';
import { isDue } from '../lib/date';

/**
 * The queue is the app's whole personality:
 *
 *  - `core` mode returns the Core 3 — one breath, one say-it, one word, in that
 *    order. This and only this is what the streak counts. It has to be
 *    completable in about three minutes on the worst day of the month.
 *
 *  - `endless` mode never dead-ends. If it runs out of due and new cards it
 *    cycles the least-recently-seen ones as `filler` rather than showing a
 *    "you're done" screen, because a dead end sends him straight back to
 *    Instagram.
 */

/** Lower tier is served first. Reviews always outrank new material. */
const TIER_DUE = 0;
const TIER_NEW = 1;

interface PoolItem {
  card: Card;
  reason: QueueReason;
  tier: number;
  /** Sort key within a tier. Lower first. */
  rank: number;
}

function isNew(review: Review | undefined): boolean {
  return review === undefined || (review.state === 'new' && review.reps === 0);
}

export function buildQueue(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
): QueueItem[] {
  // English only, at the one seam both modes pass through. Hindi is a separate
  // section by an explicit product decision (PLAN.md §8, row 2) and must never
  // reach the main feed. `buildCore` filtered per-type and `buildEndless` did
  // not, so every Hindi card was eligible for the endless pool.
  const active = cards.filter((c) => c.status === 'active' && c.lang === 'en');
  if (opts.limit <= 0) return [];

  if (opts.mode === 'core') return buildCore(active, reviews, opts);
  return buildEndless(active, reviews, opts);
}

// ─────────────────────────────────────────────────────────────────────────────

function buildCore(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
): QueueItem[] {
  const out: QueueItem[] = [];

  for (const type of QUEUE_RULES.CORE_SEQUENCE) {
    const candidates = cards.filter(
      (c) => c.type === type && c.lang === 'en' && !opts.seenCardIds.has(c.id),
    );
    if (candidates.length === 0) continue;

    // A card he owes beats a card he has never met.
    const due = candidates.find((c) => {
      const r = reviews.get(c.id);
      return r !== undefined && !isNew(r) && isDue(r.due, opts.today);
    });

    const pick = due ?? candidates.find((c) => isNew(reviews.get(c.id))) ?? candidates[0];
    if (pick) out.push({ card: pick, reason: 'core' });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildEndless(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
): QueueItem[] {
  let breathBudget = Math.max(0, QUEUE_RULES.MAX_BREATH_PER_DAY - opts.breathServedToday);
  let newBudget = Math.max(0, QUEUE_RULES.MAX_NEW_PER_DAY - opts.newServedToday);

  const pool: PoolItem[] = [];
  for (const card of cards) {
    if (opts.seenCardIds.has(card.id)) continue;
    const r = reviews.get(card.id);
    if (r && !isNew(r) && isDue(r.due, opts.today)) {
      // Overdue and repeatedly failed cards come first.
      pool.push({ card, reason: 'due', tier: TIER_DUE, rank: -r.lapses });
    } else if (isNew(r)) {
      pool.push({ card, reason: 'new', tier: TIER_NEW, rank: 0 });
    }
  }
  pool.sort((a, b) => a.tier - b.tier || a.rank - b.rank);

  const out: QueueItem[] = [];
  const used = new Set<string>();
  /** Position at which each type was last served. Unserved types sort first. */
  const typeLastIndex = new Map<CardType, number>();
  let lastType: CardType | null = null;

  while (out.length < opts.limit) {
    const chosen = pickNext(pool, used, lastType, typeLastIndex, breathBudget, newBudget);
    if (!chosen) break;

    used.add(chosen.card.id);
    typeLastIndex.set(chosen.card.type, out.length);
    out.push({ card: chosen.card, reason: chosen.reason });

    if (chosen.card.type === 'breath') breathBudget--;
    if (chosen.reason === 'new') newBudget--;
    lastType = chosen.card.type;
  }

  if (out.length < opts.limit) {
    fill(out, cards, reviews, opts, lastType);
  }

  return out.slice(0, opts.limit);
}

/**
 * Pick the next card from the highest-priority tier that still has candidates.
 *
 * Type selection is round-robin by *least recently served*, not by which type
 * has the most cards left. Two wrong versions of this shipped before:
 *
 *  - "first candidate of a different type" drains two types in alternation and
 *    then has nothing but the third left, producing the same-type runs the rule
 *    exists to prevent;
 *  - "the type with the most cards left" starves the small types completely.
 *    `breath` has a dozen cards against ninety words, so it never won, and
 *    sixty cards would go by without a single breath drill — silently deleting
 *    the one exercise that addresses the root cause.
 *
 * Least-recently-served rotates every type through regardless of deck size, and
 * the per-day caps stop the rare ones over-appearing.
 */
function pickNext(
  pool: readonly PoolItem[],
  used: ReadonlySet<string>,
  lastType: CardType | null,
  typeLastIndex: ReadonlyMap<CardType, number>,
  breathBudget: number,
  newBudget: number,
): PoolItem | null {
  const eligible = (p: PoolItem) =>
    !used.has(p.card.id) &&
    !(p.card.type === 'breath' && breathBudget <= 0) &&
    !(p.reason === 'new' && newBudget <= 0);

  const tiers = [...new Set(pool.map((p) => p.tier))].sort((a, b) => a - b);

  for (const tier of tiers) {
    const inTier = pool.filter((p) => p.tier === tier && eligible(p));
    if (inTier.length === 0) continue;

    const remaining = new Map<CardType, number>();
    for (const p of inTier) remaining.set(p.card.type, (remaining.get(p.card.type) ?? 0) + 1);

    const candidates = [...remaining.entries()].filter(([type]) => type !== lastType);

    // Every remaining candidate repeats the last type. A boring run beats a
    // short one, so take it anyway.
    const ranked = (candidates.length > 0 ? candidates : [...remaining.entries()]).sort(
      (a, b) =>
        (typeLastIndex.get(a[0]) ?? -1) - (typeLastIndex.get(b[0]) ?? -1) || b[1] - a[1],
    );

    const targetType = ranked[0]![0];
    return inTier.find((p) => p.card.type === targetType) ?? inTier[0]!;
  }

  return null;
}

/**
 * Endless must not end. Once everything due and new is exhausted we cycle the
 * least-recently-seen cards as `filler` — they still count as reps, they just
 * don't move the schedule. Cards may repeat within one build; with a real deck
 * that never happens, but the feed must not be able to run dry.
 */
function fill(
  out: QueueItem[],
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  lastTypeIn: CardType | null,
): void {
  // Breath drills are work, not padding — they stay rationed even here.
  const eligible = cards
    .filter((c) => c.type !== 'breath')
    .map((c) => ({ card: c, at: reviews.get(c.id)?.lastSeenAt ?? 0 }))
    .sort((a, b) => a.at - b.at);

  // Reach for genuinely fresh cards first: not placed in this build, and not
  // already passed earlier today. Skipping either check means a long session
  // re-serves cards from twenty minutes ago while hundreds sit unused.
  const placed = new Set(out.map((i) => i.card.id));
  const unplaced = eligible.filter((r) => !placed.has(r.card.id));
  const ring = unplaced.filter((r) => !opts.seenCardIds.has(r.card.id));

  // Only when there is genuinely nothing else does recycling begin.
  if (ring.length === 0) ring.push(...unplaced);
  if (ring.length === 0) ring.push(...eligible);
  if (ring.length === 0) return;

  let lastType = lastTypeIn;
  while (out.length < opts.limit) {
    let idx = ring.findIndex((r) => r.card.type !== lastType);
    if (idx === -1) idx = 0;

    const [chosen] = ring.splice(idx, 1);
    if (!chosen) break;

    out.push({ card: chosen.card, reason: 'filler' });
    lastType = chosen.card.type;
    ring.push(chosen); // back of the queue — this is what makes it cycle
  }
}
