import type { Card, ExpandSeedResult, Grade, Review } from '../../types/contract';
import { db, enqueue, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  AI_NEEDS_KEY_META,
  CoachNeedsKeyError,
  aiPost,
  dedupeDrafts,
  draftsToBatchCards,
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';

/**
 * AG-008 stage 2 — a card that missed twice gets siblings.
 *
 * Second lifetime `again` means the card has visibly not stuck; two fresh
 * cards of the same type are generated from it via `expand_seed`, verified on
 * a different provider, deduped, and stored (`source: 'ai'`, `seedId` = the
 * missed card, `batchId` = `miss-<cardId>`). Every failure path is silent —
 * a miss must never block or delay the review flow.
 */

export const MISS_MAX_PER_DAY = 5;
export const MISS_SIBLINGS = 2;

/** Local-only counter (db.meta). Never synced. */
export const MISS_META = 'ai.missBatches';

/** Mirrors DraftCardType — the types AI may ever draft (AG-008 §0.3). */
const MISS_ALLOWED_TYPES = new Set<string>([
  'word',
  'swap',
  'idiom',
  'phrase',
  'feeling',
  'story_move',
  'describe',
  'explain',
  'teach_back',
  'situation',
]);

/** Second lifetime `again` — the moment a card has visibly not stuck. */
export function shouldSpawnSiblings(gradeValue: Grade | undefined, review: Review): boolean {
  return gradeValue === 'again' && review.lapses === 2;
}

/** The seed card minus storage bookkeeping (CardBase fields). */
function seedOf(card: Card): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(card as unknown as Record<string, unknown>) };
  for (const k of ['id', 'tags', 'source', 'status', 'createdAt', 'batchId', 'seedId']) {
    delete copy[k];
  }
  return copy;
}

/**
 * Fire-and-forget from the feed. Returns how many cards were stored (0 on any
 * failure). One batch per seed card ever; max MISS_MAX_PER_DAY batches a day.
 */
export async function maybeSpawnMissSiblings(
  card: Card,
  fetchFn: FetchFn = fetch,
): Promise<number> {
  try {
    if (!MISS_ALLOWED_TYPES.has(card.type)) return 0;

    const batchId = `miss-${card.id}`;
    const already = await db.cards.where('batchId').equals(batchId).count();
    if (already > 0) return 0;

    const today = todayKey();
    const counter = await getMeta<{ date: string; count: number }>(MISS_META);
    const used = counter && counter.date === today ? counter.count : 0;
    if (used >= MISS_MAX_PER_DAY) return 0;

    // Counted before the network call: a failed ask still cost a request
    // against the free tier.
    await setMeta(MISS_META, { date: today, count: used + 1 });

    const res = await aiPost<ExpandSeedResult>(
      'expand_seed',
      { type: card.type, count: MISS_SIBLINGS, seed: seedOf(card) },
      fetchFn,
    );

    const sameType = (res.data.cards ?? []).filter((d) => d.type === card.type);
    const verified = await verifyDrafts(sameType, res.provider, fetchFn);
    const fresh = dedupeDrafts(verified, await db.cards.toArray());
    if (fresh.length === 0) return 0;

    const cards = draftsToBatchCards(fresh, {
      batchId,
      source: 'ai',
      seedId: card.id,
      tags: ['ai', 'miss'],
    });

    await db.transaction('rw', db.cards, db.outbox, async () => {
      for (const c of cards) {
        await db.cards.put(c);
        await enqueue('cards', c.id);
      }
    });
    return cards.length;
  } catch (e) {
    if (e instanceof CoachNeedsKeyError) {
      await setMeta(AI_NEEDS_KEY_META, true).catch(() => {});
      return 0;
    }
    // Offline or provider trouble: skip silently, review flow is unaffected.
    return 0;
  }
}
