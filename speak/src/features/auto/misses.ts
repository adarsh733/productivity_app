import type {
  AnyCard,
  Card,
  ExpandSeedPayload,
  ExpandSeedResult,
  Grade,
  Review,
  TeachCard,
  TeachDraft,
} from '../../types/contract';
import { db, enqueue, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  AI_DRAFT_TYPES,
  AI_NEEDS_KEY_META,
  CoachNeedsKeyError,
  aiPost,
  dedupeDrafts,
  draftsToBatchCards,
  needsSecondKey,
  neverReachedModel,
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';
import { isUsableDraft } from '../ask/askPipeline';
import { learnerContext } from '../learn/profile';
import { refundAiCalls, tryConsumeBackgroundAiCalls } from './budget';

/**
 * AG-008 stage 2 — a card that missed twice gets siblings.
 *
 * Second lifetime `again` means the card has visibly not stuck; two fresh
 * cards of the same type are generated from it via `expand_seed`, verified on
 * a different provider, deduped, and stored (`source: 'ai'`, `seedId` = the
 * missed card, `batchId` = `miss-<cardId>`). Every failure path is silent —
 * a miss must never block or delay the review flow.
 *
 * v5: a lesson (teach) card he misses twice gets two sibling teach cards of
 * the same skill and level, about the same idea (its title and category) and
 * grounded in what the app has learned about him (`learnerContext`).
 *
 * Budget: generate + check = 2 background slots, taken together. Both go
 * back when the generate call fails (nothing was written, so nothing was
 * checked); the check slot alone goes back when there was nothing to check.
 */

export const MISS_MAX_PER_DAY = 5;
export const MISS_SIBLINGS = 2;
/** Generate + its check on the other provider. */
export const MISS_AI_CALLS = 2;
const MISS_TOPIC_MAX = 20;

/** Local-only counter (db.meta). Never synced. */
export const MISS_META = 'ai.missBatches';

/** Second lifetime `again` — the moment a card has visibly not stuck. */
export function shouldSpawnSiblings(gradeValue: Grade | undefined, review: Review): boolean {
  return gradeValue === 'again' && review.lapses === 2;
}

/** The seed card minus storage bookkeeping (CardBase fields). */
function seedOf(card: AnyCard): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(card as unknown as Record<string, unknown>) };
  for (const k of ['id', 'tags', 'source', 'status', 'createdAt', 'batchId', 'seedId', 'rejectedAt']) {
    delete copy[k];
  }
  return copy;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function teachKey(c: { track: string; title: string }): string {
  return `teach|${c.track}|${norm(c.title)}`;
}

/** The lesson idea first, then his subjects; case-insensitive dedupe, max 20. */
export function missTopics(card: TeachCard, learnerTopics: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [card.title, card.category, ...learnerTopics]) {
    const t = (raw ?? '').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= MISS_TOPIC_MAX) break;
  }
  return out;
}

/**
 * One atomic claim: the per-day counter read + write and the 2 budget slots,
 * in one Dexie transaction, so two misses at once can never both pass the cap.
 */
async function claimMiss(today: string): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const counter = await getMeta<{ date: string; count: number }>(MISS_META);
    const used = counter && counter.date === today ? counter.count : 0;
    if (used >= MISS_MAX_PER_DAY) return false;
    // AG-008 stage 3 — one shared daily budget; background work stops when
    // fewer than 10 calls are left (Ask goes first). Joins this transaction.
    if (!(await tryConsumeBackgroundAiCalls(MISS_AI_CALLS, today))) return false;
    // Counted before the network call: the day's cap holds even when it fails.
    await setMeta(MISS_META, { date: today, count: used + 1 });
    return true;
  });
}

async function storeBatch(cards: readonly Card[]): Promise<void> {
  await db.transaction('rw', db.cards, db.outbox, async () => {
    for (const c of cards) {
      await db.cards.put(c);
      await enqueue('cards', c.id);
    }
  });
}

/** Two verified sibling teach cards for a missed lesson card. */
async function teachSiblings(
  card: TeachCard,
  batchId: string,
  today: string,
  fetchFn: FetchFn,
  step: (s: 'asking' | 'generated') => void,
): Promise<number> {
  const learner = await learnerContext();
  const payload: ExpandSeedPayload = {
    type: 'teach',
    count: MISS_SIBLINGS,
    track: card.track,
    level: card.level,
    topics: missTopics(card, learner.topics),
    ...(learner.avoid.length > 0 ? { avoid: learner.avoid } : {}),
    ...(learner.notes.length > 0 ? { notes: learner.notes } : {}),
  };
  step('asking');
  const res = await aiPost<{ cards?: unknown[] }>('expand_seed', payload, fetchFn);
  step('generated');

  const usable = (Array.isArray(res.data.cards) ? res.data.cards : [])
    .filter(isUsableDraft)
    .filter((d) => d.track === card.track)
    .slice(0, MISS_SIBLINGS);
  if (usable.length === 0) {
    await refundAiCalls(1, today).catch(() => {});
    return 0;
  }

  // Every card through verify_batch on a DIFFERENT provider.
  const verified = (await verifyDrafts(
    usable as unknown as Parameters<typeof verifyDrafts>[0],
    res.provider,
    fetchFn,
  )) as unknown as TeachDraft[];

  const known = new Set<string>();
  for (const c of await db.cards.toArray()) {
    if ((c as { type: string }).type === 'teach') known.add(teachKey(c as unknown as TeachCard));
  }
  const fresh: TeachDraft[] = [];
  for (const d of verified) {
    const k = teachKey(d);
    if (known.has(k)) continue;
    known.add(k);
    fresh.push(d);
  }
  if (fresh.length === 0) return 0;

  const now = Date.now();
  const cards = fresh.map(
    (d, i) =>
      ({
        ...d,
        id: `${batchId}-${i}`,
        lang: 'en',
        tags: ['ai', 'miss'],
        source: 'ai',
        status: 'active',
        createdAt: now,
        batchId,
        seedId: card.id,
      }) as unknown as Card,
  );
  await storeBatch(cards);
  return cards.length;
}

/**
 * Slots to give back after a failure. Before the generate call: both. The
 * generate call failed: the check never ran (1), plus the generate slot when
 * no model was used (offline, no key, refused). The check failed: its slot
 * only when no model was used.
 */
export function refundFor(stage: 'before' | 'asking' | 'generated', e: unknown): number {
  if (stage === 'before') return MISS_AI_CALLS;
  if (stage === 'asking') return neverReachedModel(e) ? MISS_AI_CALLS : 1;
  return neverReachedModel(e) ? 1 : 0;
}

/**
 * Fire-and-forget from the feed. Returns how many cards were stored (0 on any
 * failure). One batch per seed card ever; max MISS_MAX_PER_DAY batches a day.
 */
export async function maybeSpawnMissSiblings(
  card: AnyCard,
  fetchFn: FetchFn = fetch,
): Promise<number> {
  const today = todayKey();
  let claimed = false;
  let stage: 'before' | 'asking' | 'generated' = 'before';
  const step = (s: 'asking' | 'generated') => {
    stage = s;
  };
  try {
    const isTeach = card.type === 'teach';
    if (!isTeach && !(AI_DRAFT_TYPES as readonly string[]).includes(card.type)) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    // One key only: the check cannot run, so nothing is generated (notice expires in 24 h).
    if (await needsSecondKey()) return 0;

    const batchId = `miss-${card.id}`;
    const already = await db.cards.where('batchId').equals(batchId).count();
    if (already > 0) return 0;

    if (!(await claimMiss(today))) return 0;
    claimed = true;

    if (card.type === 'teach') {
      return await teachSiblings(card, batchId, today, fetchFn, step);
    }

    const learner = await learnerContext();
    step('asking');
    const res = await aiPost<ExpandSeedResult>(
      'expand_seed',
      {
        type: card.type,
        count: MISS_SIBLINGS,
        seed: seedOf(card),
        ...(learner.avoid.length > 0 ? { avoid: learner.avoid } : {}),
        ...(learner.notes.length > 0 ? { notes: learner.notes } : {}),
      },
      fetchFn,
    );
    step('generated');

    const sameType = (res.data.cards ?? []).filter((d) => d.type === card.type);
    if (sameType.length === 0) {
      await refundAiCalls(1, today).catch(() => {});
      return 0;
    }
    const verified = await verifyDrafts(sameType, res.provider, fetchFn);
    const fresh = dedupeDrafts(verified, await db.cards.toArray());
    if (fresh.length === 0) return 0;

    const cards = draftsToBatchCards(fresh, {
      batchId,
      source: 'ai',
      seedId: card.id,
      tags: ['ai', 'miss'],
    });
    await storeBatch(cards);
    return cards.length;
  } catch (e) {
    if (e instanceof CoachNeedsKeyError) {
      await setMeta(AI_NEEDS_KEY_META, true).catch(() => {});
    }
    if (claimed) {
      const refund = refundFor(stage, e);
      if (refund > 0) await refundAiCalls(refund, today).catch(() => {});
    }
    // Offline or provider trouble: skip silently, review flow is unaffected.
    return 0;
  }
}
