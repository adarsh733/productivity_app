import type {
  Card,
  DraftCardType,
  ExpandSeedResult,
  InboxItem,
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
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';
import { tryConsumeAiCall } from './budget';

/**
 * AG-008 stage 3 — keep every allowed type stocked without asking.
 *
 * Runs on app open (useAutoTopUp), at most once per 6 h, only when online.
 * For each allowed type it counts unseen active cards; when any type dips
 * below `TOPUP_MIN_UNSEEN`, the lowest one gets one batch of 10 verified
 * cards via `expand_seed`. Topics: profile interests + subjects of the last
 * 20 coach notes. Max `TOPUP_MAX_PER_DAY` batches a day, and every generation
 * draws from the shared daily AI budget (budget.ts).
 *
 * Deliberate deviation from the brief: it says at most one top-up per TYPE
 * per day — enforced here as same-day type exclusion, because a second
 * same-day batch of the same type would reuse `topup-<date>-<type>-<i>` ids
 * and overwrite the first batch's cards. One claim per type per day also
 * keeps the ids unique.
 *
 * Every failure path is silent: top-up must never block or delay the app.
 */

export const TOPUP_MIN_UNSEEN = 30;
export const TOPUP_BATCH = 10;
export const TOPUP_GAP_MS = 6 * 60 * 60 * 1000;
export const TOPUP_MAX_PER_DAY = 3;

/** Local-only counter (db.meta). Never synced. */
export const TOPUP_META = 'ai.topupBatches';

const TOPUP_TOPIC_MAX = 20;
const TOPUP_NOTE_SCAN = 20;

interface TopUpState {
  date: string;
  count: number;
  lastAt: number;
  /** Types already topped up today, so batch ids never collide within a day. */
  types: string[];
}

export interface TypeUnseen {
  type: DraftCardType;
  unseen: number;
}

/** Active cards of every draftable type with no review row (never served). */
export function unseenCounts(cards: readonly Card[], seenIds: ReadonlySet<string>): TypeUnseen[] {
  return AI_DRAFT_TYPES.map((type) => ({
    type,
    unseen: cards.filter((c) => c.status === 'active' && c.type === type && !seenIds.has(c.id))
      .length,
  }));
}

/**
 * Lowest unseen count below `TOPUP_MIN_UNSEEN`, ties keep list order.
 * `exclude` = types already topped up today. null = every type is stocked.
 */
export function pickDeficientType(
  cards: readonly Card[],
  seenIds: ReadonlySet<string>,
  exclude: ReadonlySet<string> = new Set(),
): DraftCardType | null {
  let best: DraftCardType | null = null;
  let bestCount = TOPUP_MIN_UNSEEN;
  for (const { type, unseen } of unseenCounts(cards, seenIds)) {
    if (exclude.has(type)) continue;
    if (unseen < bestCount) {
      bestCount = unseen;
      best = type;
    }
  }
  return best;
}

/**
 * Interests first, then subjects of the newest `TOPUP_NOTE_SCAN` notes
 * (discarded and subject-less ones skipped), deduped case-insensitively,
 * capped at 20. Caller passes notes newest-first.
 */
export function topUpTopics(
  interests: readonly string[],
  notes: readonly InboxItem[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | undefined) => {
    const text = (raw ?? '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const i of interests) push(i);
  for (const n of notes.slice(0, TOPUP_NOTE_SCAN)) {
    if (n.status === 'discarded') continue;
    push(n.subject);
  }
  return out.slice(0, TOPUP_TOPIC_MAX);
}

/**
 * One atomic claim: 6 h gate + daily cap + same-day type exclusion + shared
 * AI budget, all inside one Dexie transaction so two simultaneous app opens
 * can never both pass. Claimed BEFORE the network call — a failed ask still
 * cost a request against the free tier.
 */
async function claimTopUp(type: DraftCardType, now: number): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const today = todayKey();
    const state = await getMeta<TopUpState>(TOPUP_META);
    if (state && now - state.lastAt < TOPUP_GAP_MS) return false;

    const sameDay = state && state.date === today;
    const count = sameDay ? state.count : 0;
    if (count >= TOPUP_MAX_PER_DAY) return false;

    const types = sameDay ? (state.types ?? []) : [];
    if (types.includes(type)) return false;

    // Nested transaction on the same scope — Dexie joins it into this one.
    if (!(await tryConsumeAiCall(today))) return false;

    await setMeta(TOPUP_META, {
      date: today,
      count: count + 1,
      lastAt: now,
      types: [...types, type],
    } satisfies TopUpState);
    return true;
  });
}

/**
 * Fire-and-forget from app open. Returns how many cards were stored (0 on
 * any skip or failure). Never throws.
 */
export async function maybeTopUp(fetchFn: FetchFn = fetch): Promise<number> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

    const now = Date.now();
    const today = todayKey();
    const [state, cards, reviews, profile, inboxRaw] = await Promise.all([
      getMeta<TopUpState>(TOPUP_META),
      db.cards.toArray(),
      db.reviews.toArray(),
      db.profile.get('me'),
      db.inbox.toArray(),
    ]);

    const toppedToday =
      state && state.date === today ? new Set(state.types ?? []) : new Set<string>();

    const seenIds = new Set(reviews.map((r) => r.cardId));
    const type = pickDeficientType(cards, seenIds, toppedToday);
    if (type === null) return 0;

    if (!(await claimTopUp(type, now))) return 0;

    const inbox = [...inboxRaw].sort((a, b) => b.createdAt - a.createdAt);
    const topics = topUpTopics(profile?.interests ?? [], inbox);

    const res = await aiPost<ExpandSeedResult>(
      'expand_seed',
      { type, count: TOPUP_BATCH, ...(topics.length > 0 ? { topics } : {}) },
      fetchFn,
    );

    const sameType = (res.data.cards ?? []).filter((d) => d.type === type);
    const verified = await verifyDrafts(sameType, res.provider, fetchFn);
    const fresh = dedupeDrafts(verified, await db.cards.toArray());
    if (fresh.length === 0) return 0;

    const batchId = `topup-${today}-${type}`;
    const batchCards = draftsToBatchCards(fresh, {
      batchId,
      source: 'ai',
      tags: ['ai', 'topup'],
    });

    await db.transaction('rw', db.cards, db.outbox, async () => {
      for (const c of batchCards) {
        await db.cards.put(c);
        await enqueue('cards', c.id);
      }
    });
    return batchCards.length;
  } catch (e) {
    if (e instanceof CoachNeedsKeyError) {
      await setMeta(AI_NEEDS_KEY_META, true).catch(() => {});
      return 0;
    }
    // Offline or provider trouble: skip silently and retry next app open.
    return 0;
  }
}
