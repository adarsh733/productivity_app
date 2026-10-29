import type {
  Card,
  CardKind,
  CardType,
  DayKey,
  DownweightRecord,
  Millis,
  QueueItem,
  QueueOptions,
  QueueReason,
  Review,
} from '../types/contract';
import { QUEUE_RULES } from '../types/contract';
import { isDue } from '../lib/date';
import { newReview } from './scheduler';
import { isTeachCard, trackOf } from '../features/skills/trackOf';

/**
 * V3 Endless Feed Queue Engine
 *
 * Rules:
 *  - Endless mode only. The feed never dead-ends.
 *  - Breath drills and gym drills (describe, explain, teach_back) leave the feed.
 *  - v5 (question 5A): pronounce and say-it voice drills leave the feed too; they stay in
 *    the database and open from the old tools. Action verbs stay (Words cards).
 *  - v5: Hindi cards stay in the database but are not served in the feed.
 *  - v5: `teach` cards ride the feed; where it can, the queue serves a different skill
 *    (small talk / stories / speak clearly / words) than the card before it.
 *  - Card one on a fresh profile is guaranteed to be an English 'word' or 'idiom'.
 *  - No adjacent same-type cards when at least 2 types are available.
 *  - Hindi cards appear naturally at roughly 1 in 8 cards (~12.5%, strictly 8%–18%).
 *  - Deterministic daily shuffling so fresh days and users do not see a static seed order.
 *  - Due-before-new priority preserved.
 *  - Enforce MAX_NEW_PER_DAY across every refill path.
 *  - Interests and expiring downweights bias frequency without permanently crushing any type.
 */

export const FEED_TYPES: readonly CardType[] = [
  'word',
  'swap',
  'idiom',
  'action_verb',
  'phrase',
  'feeling',
  'story_move',
  'situation',
  'teach',
] as const;

/** v5: how much more often a teach card is picked than an old type, among new cards. */
export const TEACH_SEAT_BOOST = 2.5;

/** v5: the feed shows English only; Hindi cards stay stored but are not served. */
export const FEED_SHOWS_HINDI = false;

const TIER_DUE = 0;
const TIER_NEW = 1;

/**
 * Deterministic pseudo-random number generator based on card ID and DayKey.
 * Guarantees a fresh daily permutation that is 100% reproducible and deterministic.
 */
export function dayCardHash(cardId: string, day: string): number {
  let h = 0;
  const str = `${day}:${cardId}`;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

interface PoolCandidate {
  card: Card;
  reason: QueueReason;
  tier: number;
  rank: number;
  dailyScore: number;
}

function isNew(review: Review | undefined): boolean {
  return review === undefined || (review.state === 'new' && review.reps === 0);
}

// ── AG-007 stage 2: engaged-only repetition ─────────────────────────────────
// A first sighting with no engagement (skimmed past) leaves the review `new`
// with `reps: 0` plus `lastSeenAt`/`skippedAt`. The queue then withholds the
// card from the `new` pool for 14 days instead of counting it as learned.
//
// NOTE: `skippedAt` is intentionally NOT added to the contract `Review` type
// (contract changes are out of scope for this pass), so it travels as an
// optional extra field on the stored review row. IndexedDB/Dexie keeps
// unknown fields on put; nothing else reads review rows positionally.

/** A skimmed card is not served as new again for this long. */
export const SKIP_RESERVE_DAYS = 14;

export const SKIP_RESERVE_MS = SKIP_RESERVE_DAYS * 86_400_000;

/** `Review` plus the AG-007 stage 2 skim marker (see note above). */
export type ReviewWithSkip = Review & { skippedAt?: Millis };

export function getSkippedAt(review: Review | undefined): Millis | undefined {
  return (review as ReviewWithSkip | undefined)?.skippedAt;
}

/** True when the review is a fresh skim still inside its 14-day reserve. */
export function isSkimFresh(review: Review | undefined, now: number = Date.now()): boolean {
  const skippedAt = getSkippedAt(review);
  if (skippedAt === undefined) return false;
  return now - skippedAt < SKIP_RESERVE_MS;
}

/**
 * Pure constructor for a skimmed first sighting: stays `new`, `reps: 0`,
 * `lastSeenAt` + `skippedAt` = now. Not "learned".
 */
export function skimReview(cardId: string, today: DayKey, now: number = Date.now()): Review {
  return { ...newReview(cardId, today), lastSeenAt: now, skippedAt: now } as Review;
}

export function getCardMultiplier(
  card: Card,
  interests?: string[],
  typeWeights?: Record<string, number>,
  downweights?: Record<string, DownweightRecord>,
  now: number = Date.now(),
): number {
  let mult = 1.0;

  // 1. Tag & Category-based downweights with 7-day expiration
  if (downweights) {
    for (const [targetKey, entry] of Object.entries(downweights)) {
      if (entry.expiresAt && now >= entry.expiresAt) continue; // Expired downweights are ignored

      const target = targetKey.toLowerCase();
      const matchesTag = card.tags.some((t) => t.toLowerCase() === target);
      const matchesType = card.type.toLowerCase() === target;

      if (matchesTag || matchesType) {
        // Floor multiplier at 0.15 to prevent permanent suppression
        mult *= Math.max(0.15, entry.multiplier ?? 0.5);
      }
    }
  }

  // Legacy type weights
  if (typeWeights && card.type in typeWeights) {
    mult *= Math.max(0.15, typeWeights[card.type] ?? 1.0);
  }

  // v5: lesson cards are weighted per skill (`teach_<track>`, from plan_week).
  // No weight for that skill ⇒ 1, same as an old type with no weight.
  if (typeWeights && (card as { type: string }).type === 'teach') {
    const track = (card as unknown as { track?: string }).track;
    const w = track ? typeWeights[`teach_${track}`] : undefined;
    if (typeof w === 'number' && Number.isFinite(w)) mult *= Math.max(0.15, w);
  }

  // 2. Interest-based boosts using shared interest IDs
  if (interests && interests.length > 0) {
    const interestSet = new Set(interests.map((i) => i.toLowerCase().trim()));
    if (
      (interestSet.has('office') || interestSet.has('office english') || interestSet.has('💼 office english')) &&
      (card.type === 'idiom' || card.type === 'phrase' || card.type === 'swap')
    ) {
      mult *= 1.6;
    }
    if (
      (interestSet.has('words') || interestSet.has('everyday words') || interestSet.has('📖 everyday words')) &&
      (card.type === 'word' || card.type === 'pronounce')
    ) {
      mult *= 1.6;
    }
    if (
      (interestSet.has('speaking') || interestSet.has('presence') || interestSet.has('🎙️ speaking') || interestSet.has('🎙️ speaking with presence')) &&
      (card.type === 'say_it' || card.type === 'pronounce')
    ) {
      mult *= 1.6;
    }
    if (
      (interestSet.has('storytelling') || interestSet.has('story') || interestSet.has('📚 storytelling')) &&
      (card.type === 'story_move' || card.type === 'action_verb')
    ) {
      mult *= 1.6;
    }
    if (
      (interestSet.has('ideas') || interestSet.has('ideas & opinions') || interestSet.has('🧠 ideas & opinions')) &&
      (card.type === 'feeling' || card.type === 'phrase')
    ) {
      mult *= 1.6;
    }
    if (interestSet.has('hindi') && card.lang === 'hi') {
      mult *= 1.6;
    }
  }

  // Situations ride low in the feed (~1 in 15) unless storytelling/speaking focus is on.
  if (card.type === 'situation') {
    mult *= 0.65;
    if (interests && interests.length > 0) {
      const s = new Set(interests.map((i) => i.toLowerCase().trim()));
      if (
        s.has('storytelling') || s.has('story') || s.has('📚 storytelling') ||
        s.has('speaking') || s.has('presence') || s.has('🎙️ speaking') || s.has('🎙️ speaking with presence')
      ) {
        mult *= 1.8;
      }
    }
  }

  return mult;
}

export function getTypeMultiplier(
  type: CardType,
  interests?: string[],
  typeWeights?: Record<string, number>,
): number {
  const dummyCard: Card = {
    id: `dummy-${type}`,
    type,
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 0,
  } as any;
  return getCardMultiplier(dummyCard, interests, typeWeights);
}

export function buildQueue(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  now: number = Date.now(),
): QueueItem[] {
  if (opts.limit <= 0) return [];

  // Filter cards to active feed types only (no breath, no gym drills)
  const eligible = cards.filter(
    (c) =>
      c.status === 'active' &&
      FEED_TYPES.includes(c.type) &&
      (FEED_SHOWS_HINDI || c.lang !== 'hi'),
  );
  if (eligible.length === 0) return [];

  return buildEndless(eligible, reviews, opts, now);
}

function buildEndless(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  now: number,
): QueueItem[] {
  let newBudget = Math.max(0, QUEUE_RULES.MAX_NEW_PER_DAY - opts.newServedToday);

  const pool: PoolCandidate[] = [];
  for (const card of cards) {
    if (opts.seenCardIds.has(card.id)) continue;
    const r = reviews.get(card.id);
    const dailyScore = dayCardHash(card.id, opts.today);
    if (r && !isNew(r) && isDue(r.due, opts.today)) {
      pool.push({ card, reason: 'due', tier: TIER_DUE, rank: -r.lapses, dailyScore });
    } else if (isNew(r) && !isSkimFresh(r, now)) {
      pool.push({ card, reason: 'new', tier: TIER_NEW, rank: 0, dailyScore });
    }
  }

  const out: QueueItem[] = [];
  const used = new Set<string>();
  const typeLastIndex = new Map<CardType, number>();
  let lastType: CardType | null = null;
  let lastTrack: string | null = null;
  let cardsSinceLastHindi = 4; // start in the middle so first Hindi appears around card 7-8

  // Rule 3: Fresh profile Day 1 Card 1 is guaranteed to be an English 'word' or 'idiom'
  const isFreshDay1 =
    opts.seenCardIds.size === 0 &&
    opts.newServedToday === 0 &&
    pool.every((p) => p.tier === TIER_NEW);

  if (isFreshDay1 && out.length === 0) {
    const starters = pool
      .filter(
        (p) =>
          (p.card.type === 'word' || p.card.type === 'idiom') &&
          p.card.lang === 'en',
      )
      .sort((a, b) => a.dailyScore - b.dailyScore);

    const starter = starters[0];
    if (starter) {
      used.add(starter.card.id);
      typeLastIndex.set(starter.card.type, 0);
      out.push({ card: starter.card, reason: starter.reason });
      if (starter.reason === 'new') newBudget--;
      lastType = starter.card.type;
      lastTrack = trackOf(starter.card).track;
      cardsSinceLastHindi++;
    }
  }

  while (out.length < opts.limit) {
    const wantHindi = cardsSinceLastHindi >= 7;
    const chosen = pickCandidate(
      pool,
      used,
      lastType,
      typeLastIndex,
      newBudget,
      wantHindi,
      opts,
      out.length,
      lastTrack,
    );
    if (!chosen) break;

    used.add(chosen.card.id);
    typeLastIndex.set(chosen.card.type, out.length);
    out.push({ card: chosen.card, reason: chosen.reason });

    if (chosen.reason === 'new') newBudget--;
    if (chosen.card.lang === 'hi') {
      cardsSinceLastHindi = 0;
    } else {
      cardsSinceLastHindi++;
    }
    lastType = chosen.card.type;
    lastTrack = trackOf(chosen.card).track;
  }

  if (out.length < opts.limit) {
    fillRefill(out, cards, reviews, opts, lastType, cardsSinceLastHindi, newBudget, now);
  }

  const withCoach = jumpCoachCards(out, cards, reviews, opts, now);
  return jumpAskCards(withCoach, cards, reviews, opts, now).slice(0, opts.limit);
}

// ── AG-007 stage 3: coach cards jump the queue ──────────────────────────────
// New English coach cards (`tags` include 'coach', never served, no fresh skim
// reserve) land within the first 10 of the next feed session. Hindi coach
// cards never float — they ride the normal Hindi spacing slots in place.
// Coach cards that missed the chunk replace tail items; then all coach ids
// float front (stable, cap 10). Decks without coach cards are untouched.
function jumpCoachCards(
  out: QueueItem[],
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  now: number,
): QueueItem[] {
  const isCoach = (i: QueueItem): boolean =>
    i.card.tags.includes('coach') && i.card.lang !== 'hi';
  const present = new Set(out.map((i) => i.card.id));
  const missing: QueueItem[] = [];
  const already = out.filter(isCoach).length;
  for (const card of cards) {
    if (already + missing.length >= 10) break;
    if (present.has(card.id) || opts.seenCardIds.has(card.id)) continue;
    if (!card.tags.includes('coach')) continue;
    if (card.lang === 'hi') continue;
    const r = reviews.get(card.id);
    if (!isNew(r) || isSkimFresh(r, now)) continue;
    missing.push({ card, reason: 'new' });
  }
  // Float whenever a fresh coach card is anywhere in the deck — including
  // when they all already sit inside the chunk (missing empty): their natural
  // day-hash positions drift past the first 10 on some days, and the comment
  // above promises all coach ids float front.
  if (missing.length === 0 && already === 0) return out;
  const merged = [...out, ...missing];
  const coach = merged.filter(isCoach).slice(0, 10);
  const rest = merged.filter((i) => !isCoach(i));
  return [...coach, ...rest];
}

// ── v5 (rulebook 8.1): everything he asks comes back ────────────────────────
// Cards stored by "Add N cards to my feed" carry the tag `ask` and share a
// batchId. Their return is planned by review dates (Use now, Fix a few days
// on, Try a week on), so a card is only a candidate when it is new or due.
// Asked items sit at the front of the mix until he has said "Got it" twice in
// a row on a Try card of that batch. Decks without asked cards are untouched.

/** Most asked cards floated to the front of one feed run. */
export const ASK_FLOAT_CAP = 4;

/** "Got it" this many times in a row on a Try card ends the priority. */
export const GOT_IT_TARGET = 2;

const ASK_KIND_ORDER: Record<CardKind, number> = { learn: 0, use: 1, ask_them: 2, fix: 3, try: 4 };

function askKindOf(card: Card): CardKind {
  const any = card as unknown as { type: string; kind?: CardKind; skill?: { kind: CardKind } };
  if (any.type === 'teach' && any.kind) return any.kind;
  return any.skill?.kind ?? 'learn';
}

function isAskCard(card: Card): boolean {
  return card.tags.includes('ask') && card.lang !== 'hi';
}

function gotItInARow(review: Review | undefined): boolean {
  return (
    review !== undefined &&
    review.reps >= GOT_IT_TARGET &&
    (review.lastGrade === 'good' || review.lastGrade === 'easy')
  );
}

/**
 * Batch ids whose asked items no longer get priority: a Try card of the batch
 * has had "Got it" twice in a row. A batch with no Try card is done when every
 * card in it has.
 */
export function graduatedAskBatches(
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
): Set<string> {
  const byBatch = new Map<string, Card[]>();
  for (const c of cards) {
    if (!isAskCard(c) || !c.batchId) continue;
    const list = byBatch.get(c.batchId) ?? [];
    list.push(c);
    byBatch.set(c.batchId, list);
  }
  const done = new Set<string>();
  for (const [batchId, list] of byBatch) {
    const tries = list.filter((c) => askKindOf(c) === 'try');
    const finished =
      tries.length > 0
        ? tries.some((c) => gotItInARow(reviews.get(c.id)))
        : list.every((c) => gotItInARow(reviews.get(c.id)));
    if (finished) done.add(batchId);
  }
  return done;
}

function jumpAskCards(
  out: QueueItem[],
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  now: number,
): QueueItem[] {
  if (!cards.some(isAskCard)) return out;
  const done = graduatedAskBatches(cards, reviews);
  const placed = new Map(out.map((i) => [i.card.id, i]));

  const candidates: Array<{ item: QueueItem; created: number; order: number }> = [];
  for (const card of cards) {
    if (!isAskCard(card) || (card.batchId && done.has(card.batchId))) continue;
    if (opts.seenCardIds.has(card.id)) continue;
    const r = reviews.get(card.id);
    let reason: QueueReason;
    if (r && !isNew(r)) {
      if (!isDue(r.due, opts.today)) continue;
      reason = 'due';
    } else if (isNew(r) && !isSkimFresh(r, now)) {
      reason = 'new';
    } else {
      continue;
    }
    candidates.push({
      item: placed.get(card.id) ?? { card, reason },
      created: card.createdAt,
      order: ASK_KIND_ORDER[askKindOf(card)],
    });
  }
  if (candidates.length === 0) return out;

  // Newest question first; inside one question: Use, then Fix, then Try.
  candidates.sort((a, b) => b.created - a.created || a.order - b.order);
  const front = candidates.slice(0, ASK_FLOAT_CAP).map((c) => c.item);
  const frontIds = new Set(front.map((i) => i.card.id));
  return [...front, ...out.filter((i) => !frontIds.has(i.card.id))];
}

function pickCandidate(
  pool: readonly PoolCandidate[],
  used: ReadonlySet<string>,
  lastType: CardType | null,
  typeLastIndex: ReadonlyMap<CardType, number>,
  newBudget: number,
  wantHindi: boolean,
  opts: QueueOptions,
  currentPosition: number,
  lastTrack: string | null = null,
): PoolCandidate | null {
  const eligible = (p: PoolCandidate) =>
    !used.has(p.card.id) && !(p.reason === 'new' && newBudget <= 0);

  const available = pool.filter(eligible);
  if (available.length === 0) return null;

  // Due reviews come first, capped at ~1 in 3: on every third slot prefer due,
  // otherwise prefer new (when available). Keeps reviews flowing without burying novelty.
  const hasDue = available.some((p) => p.tier === TIER_DUE);
  const hasNew = available.some((p) => p.tier === TIER_NEW);
  let tiers = [...new Set(available.map((p) => p.tier))].sort((a, b) => a - b);
  if (hasDue && hasNew) {
    tiers = currentPosition % 3 === 0 ? [TIER_DUE, TIER_NEW] : [TIER_NEW, TIER_DUE];
  }

  for (const tier of tiers) {
    let inTier = available.filter((p) => p.tier === tier);
    if (inTier.length === 0) continue;

    // Filter by Hindi preference when available and types permit
    const hindiCandidates = inTier.filter(
      (p) => p.card.lang === 'hi' && (p.card.type !== lastType || inTier.length === 1),
    );
    const englishCandidates = inTier.filter(
      (p) => p.card.lang === 'en' && (p.card.type !== lastType || inTier.length === 1),
    );

    if (wantHindi && hindiCandidates.length > 0) {
      inTier = hindiCandidates;
    } else if (!wantHindi && englishCandidates.length > 0) {
      inTier = englishCandidates;
    }

    // Group candidates by CardType
    const byType = new Map<CardType, PoolCandidate[]>();
    for (const p of inTier) {
      const list = byType.get(p.card.type) ?? [];
      list.push(p);
      byType.set(p.card.type, list);
    }

    // Rank card types: strictly prefer types that differ from lastType if multiple types exist
    const typeEntries = [...byType.entries()];
    const differentTypes = typeEntries.filter(([type]) => type !== lastType);
    const candidateTypes = differentTypes.length > 0 ? differentTypes : typeEntries;

    candidateTypes.sort(([typeA], [typeB]) => {
      const sampleA = byType.get(typeA)![0]!.card;
      const sampleB = byType.get(typeB)![0]!.card;
      // v5: the day's new slots are limited (MAX_NEW_PER_DAY) and the old decks are
      // large, so teaching cards get a seat boost here — in the new-card pick only.
      // The refill pass keeps plain multipliers so a boosted type is never replayed.
      const multA =
        getCardMultiplier(sampleA, opts.interests, opts.typeWeights, opts.downweights) *
        (isTeachCard(sampleA) ? TEACH_SEAT_BOOST : 1);
      const multB =
        getCardMultiplier(sampleB, opts.interests, opts.typeWeights, opts.downweights) *
        (isTeachCard(sampleB) ? TEACH_SEAT_BOOST : 1);
      const lastA = typeLastIndex.get(typeA) ?? -100;
      const lastB = typeLastIndex.get(typeB) ?? -100;

      // Effective distance since last served scaled by multiplier
      const scoreA = (currentPosition - lastA) * multA;
      const scoreB = (currentPosition - lastB) * multB;

      return scoreB - scoreA;
    });

    const bestType = candidateTypes[0]![0];
    const itemsOfBestType = byType.get(bestType)!;

    // Sort by rank (lapses) then by deterministic daily score
    itemsOfBestType.sort((a, b) => a.rank - b.rank || a.dailyScore - b.dailyScore);
    const first = itemsOfBestType[0];
    if (!first) return null;
    // v5: among equally-ranked cards of this type, prefer a different skill
    // than the card just served so all four skills mix.
    if (lastTrack !== null && trackOf(first.card).track === lastTrack) {
      const other = itemsOfBestType.find(
        (p) => p.rank === first.rank && trackOf(p.card).track !== lastTrack,
      );
      if (other) return other;
    }
    return first;
  }

  return null;
}

function fillRefill(
  out: QueueItem[],
  cards: readonly Card[],
  reviews: ReadonlyMap<string, Review>,
  opts: QueueOptions,
  lastTypeIn: CardType | null,
  initialCardsSinceHindi: number,
  initialNewBudget: number,
  now: number,
): void {
  let newBudget = initialNewBudget;

  // Fresh skims stay out of the refill ring while anything else remains, so a
  // card skimmed today does not sneak back in as filler. Falls back to the
  // full set when every card is a fresh skim — the feed never dead-ends.
  const activeCards =
    cards.filter((c) => !isSkimFresh(reviews.get(c.id), now)).length > 0
      ? cards.filter((c) => !isSkimFresh(reviews.get(c.id), now))
      : cards;

  const pool = activeCards
    .map((c) => {
      const r = reviews.get(c.id);
      const isCardNew = isNew(r);
      return {
        card: c,
        isNew: isCardNew,
        lastSeen: r?.lastSeenAt ?? 0,
        lapses: r?.lapses ?? 0,
        dailyScore: dayCardHash(c.id, opts.today),
      };
    })
    .sort((a, b) => a.lastSeen - b.lastSeen || b.lapses - a.lapses || a.dailyScore - b.dailyScore);

  const placed = new Set(out.map((i) => i.card.id));
  const unplaced = pool.filter((item) => !placed.has(item.card.id));
  const unseenToday = unplaced.filter((item) => !opts.seenCardIds.has(item.card.id));

  const ring = unseenToday.length > 0 ? unseenToday : (unplaced.length > 0 ? unplaced : [...pool]);
  if (ring.length === 0) return;

  let lastType = lastTypeIn;
  let cardsSinceHindi = initialCardsSinceHindi;

  const multOf = (c: Card): number =>
    getCardMultiplier(c, opts.interests, opts.typeWeights, opts.downweights);

  // Among ring indices matching `pred`, return the one with the highest
  // interest/downweight multiplier (ties → earliest in ring order).
  const bestIndex = (pred: (r: (typeof ring)[number]) => boolean): number => {
    let best = -1;
    let bestMult = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const r = ring[i]!;
      if (!pred(r)) continue;
      const m = multOf(r.card);
      if (m > bestMult) {
        bestMult = m;
        best = i;
      }
    }
    return best;
  };

  while (out.length < opts.limit) {
    const wantHindi = cardsSinceHindi >= 7;

    // 1. Candidate matching different type and target language
    let idx = bestIndex(
      (r) =>
        r.card.type !== lastType &&
        (wantHindi ? r.card.lang === 'hi' : r.card.lang === 'en'),
    );

    // 2. Fallback: candidate with different type in any language
    if (idx === -1) {
      idx = bestIndex((r) => r.card.type !== lastType);
    }

    // 3. Fallback: any candidate matching language
    if (idx === -1) {
      idx = bestIndex(
        (r) => (wantHindi ? r.card.lang === 'hi' : r.card.lang === 'en'),
      );
    }

    // 4. Ultimate fallback if constrained
    if (idx === -1) {
      idx = bestIndex(() => true);
    }

    const [chosen] = ring.splice(idx, 1);
    if (!chosen) break;

    const isFirstTimePlacingNew =
      chosen.isNew &&
      !opts.seenCardIds.has(chosen.card.id) &&
      !placed.has(chosen.card.id) &&
      newBudget > 0;
    const reason: QueueReason = isFirstTimePlacingNew ? 'new' : 'filler';
    if (isFirstTimePlacingNew) {
      newBudget--;
      placed.add(chosen.card.id);
    }

    out.push({ card: chosen.card, reason });
    lastType = chosen.card.type;
    if (chosen.card.lang === 'hi') {
      cardsSinceHindi = 0;
    } else {
      cardsSinceHindi++;
    }

    ring.push(chosen); // cycle for endless replenishment
  }
}



