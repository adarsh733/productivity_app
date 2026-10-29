import type {
  Card,
  ExpandSeedPayload,
  InboxItem,
  TeachCard,
  TeachDraft,
  Track,
  TrackLevel,
} from '../../types/contract';
import { db, enqueue, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  AI_NEEDS_KEY_META,
  CoachNeedsKeyError,
  aiPost,
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';
import { isUsableDraft } from '../ask/askPipeline';
import { TRACKS } from '../skills/trackOf';
import { buildLadder, groupLessons } from '../lessons/useLessons';
import { tryConsumeBackgroundAiCall } from './budget';
import { rejectedTerms } from './reject';

/**
 * v5 top-up: a few fresh teaching cards a day, one skill at a time.
 *
 * Rulebook 3.1: 4 new items a day, one per skill. So each run asks for one
 * small batch of teach cards for ONE skill (`expand_seed`, type `teach`), at
 * most 4 batches a day, never the same skill twice in a day (which also keeps
 * the batch ids unique). The skill with the fewest unseen practice cards goes
 * first; a skill already holding `TOPUP_MAX_UNSEEN` unseen cards is skipped.
 *
 * Every card still goes through `verify_batch` on a DIFFERENT provider; a card
 * that fails is thrown away, and one key only means nothing is stored (the
 * "needs a second key" note is set instead). Background work draws from the
 * shared daily AI budget and stops once fewer than 10 calls are left, so Ask
 * always goes first (budget.ts).
 *
 * Every failure path is silent: top-up must never block or delay the app, and
 * a half-checked card is never stored.
 */

/** Cards asked for in one batch (rulebook 3.1: small; a few per skill). */
export const TOPUP_BATCH = 3;
/** A skill holding this many unseen practice cards is left alone today. */
export const TOPUP_MAX_UNSEEN = 60;
/** Between two top-ups. Short on purpose: the day's four are one per skill. */
export const TOPUP_GAP_MS = 30 * 60 * 1000;
/** One batch per skill, four skills. */
export const TOPUP_MAX_PER_DAY = 4;

/** Local-only counter (db.meta). Never synced. */
export const TOPUP_META = 'ai.topupBatches';

const TOPUP_TOPIC_MAX = 20;
const TOPUP_NOTE_SCAN = 20;

interface TopUpState {
  date: string;
  count: number;
  lastAt: number;
  /** Skills already topped up today, so batch ids never collide within a day. */
  tracks: string[];
}

export interface TrackUnseen {
  track: Track;
  unseen: number;
}

/**
 * Active teach cards of each skill with no review row (never served). Lesson
 * cards are the Stories row, not the practice pool, so they do not count.
 */
export function unseenCounts(cards: readonly Card[], seenIds: ReadonlySet<string>): TrackUnseen[] {
  const teach = (cards as unknown as Array<{ type: string }>).filter(
    (c) => c.type === 'teach',
  ) as unknown as TeachCard[];
  return TRACKS.map((track) => ({
    track,
    unseen: teach.filter(
      (c) => c.status === 'active' && c.track === track && !c.lesson && !seenIds.has(c.id),
    ).length,
  }));
}

/**
 * The skill with the fewest unseen cards that is below `TOPUP_MAX_UNSEEN`;
 * ties keep list order. `exclude` = skills already topped up today.
 * null = nothing to do.
 */
export function pickTrack(
  cards: readonly Card[],
  seenIds: ReadonlySet<string>,
  exclude: ReadonlySet<string> = new Set(),
): Track | null {
  let best: Track | null = null;
  let bestCount = TOPUP_MAX_UNSEEN;
  for (const { track, unseen } of unseenCounts(cards, seenIds)) {
    if (exclude.has(track)) continue;
    if (unseen < bestCount) {
      bestCount = unseen;
      best = track;
    }
  }
  return best;
}

/**
 * Where he is in one skill: the first open level of its ladder, else the
 * highest finished one, else Level 1.
 */
export function currentLevel(
  track: Track,
  cards: readonly Card[],
  doneIds: ReadonlySet<string>,
): TrackLevel {
  const teach = (cards as unknown as TeachCard[]).filter(
    (c) => c.type === 'teach' && c.status === 'active' && c.track === track && c.lesson,
  );
  const ladder = buildLadder(groupLessons(teach), doneIds);
  const open = ladder.find((l) => l.status === 'open');
  if (open) return open.level;
  const done = [...ladder].reverse().find((l) => l.status === 'done');
  return done ? done.level : 1;
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

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function teachKey(c: { track: Track; title: string }): string {
  return `teach|${c.track}|${norm(c.title)}`;
}

/**
 * One atomic claim: gap + daily cap + same-day skill exclusion + shared AI
 * budget (background rule), all inside one Dexie transaction so two
 * simultaneous app opens can never both pass. Claimed BEFORE the network
 * call: a failed ask still cost a request against the free tier.
 */
async function claimTopUp(track: Track, now: number): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const today = todayKey();
    const state = await getMeta<TopUpState>(TOPUP_META);
    if (state && now - state.lastAt < TOPUP_GAP_MS) return false;

    const sameDay = state && state.date === today;
    const count = sameDay ? state.count : 0;
    if (count >= TOPUP_MAX_PER_DAY) return false;

    const tracks = sameDay ? (state.tracks ?? []) : [];
    if (tracks.includes(track)) return false;

    // Nested transaction on the same scope: Dexie joins it into this one.
    if (!(await tryConsumeBackgroundAiCall(today))) return false;

    await setMeta(TOPUP_META, {
      date: today,
      count: count + 1,
      lastAt: now,
      tracks: [...tracks, track],
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
    const [state, cards, reviews, profile, inboxRaw, progress] = await Promise.all([
      getMeta<TopUpState>(TOPUP_META),
      db.cards.toArray(),
      db.reviews.toArray(),
      db.profile.get('me'),
      db.inbox.toArray(),
      db.lessonProgress.toArray(),
    ]);

    const toppedToday =
      state && state.date === today ? new Set(state.tracks ?? []) : new Set<string>();

    const seenIds = new Set(reviews.map((r) => r.cardId));
    const track = pickTrack(cards, seenIds, toppedToday);
    if (track === null) return 0;

    if (!(await claimTopUp(track, now))) return 0;

    const level = currentLevel(track, cards, new Set(progress.map((p) => p.lessonId)));
    const inbox = [...inboxRaw].sort((a, b) => b.createdAt - a.createdAt);
    const topics = topUpTopics(profile?.interests ?? [], inbox);
    const avoid = await rejectedTerms();

    const res = await aiPost<{ cards?: unknown[] }>(
      'expand_seed',
      {
        type: 'teach',
        track,
        level,
        count: TOPUP_BATCH,
        ...(topics.length > 0 ? { topics } : {}),
        ...(avoid.length > 0 ? { avoid } : {}),
      } satisfies ExpandSeedPayload,
      fetchFn,
    );

    const usable = (Array.isArray(res.data.cards) ? res.data.cards : [])
      .filter(isUsableDraft)
      .filter((d) => d.track === track)
      .slice(0, TOPUP_BATCH);

    // Every card through verify_batch on a DIFFERENT provider; failures are
    // dropped. Same provider (one key only) throws CoachNeedsKeyError.
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

    const batchId = `topup-${today}-${track}`;
    const batchCards = fresh.map(
      (d, i) =>
        ({
          ...d,
          id: `${batchId}-${i}`,
          lang: 'en',
          tags: ['ai', 'topup'],
          source: 'ai',
          status: 'active',
          createdAt: now,
          batchId,
        }) as unknown as Card,
    );

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
    // Offline, no keys or provider trouble: skip silently, retry next open.
    return 0;
  }
}
