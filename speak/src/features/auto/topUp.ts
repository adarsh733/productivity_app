import type {
  Card,
  ExpandSeedPayload,
  InboxItem,
  LearnerContext,
  Review,
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
  needsSecondKey,
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';
import { isUsableDraft } from '../ask/askPipeline';
import { TRACKS, trackOf } from '../skills/trackOf';
import { buildLadder, groupLessons } from '../lessons/useLessons';
import { difficultyShift, getProfile, learnerContext } from '../learn/profile';
import { refundAiCalls, tryConsumeBackgroundAiCalls } from './budget';
import { refundFor } from './misses';

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
 *
 * v5 learning: the skill order is weighted by what he asked for (more of /
 * less of) and by how often he misses a skill's cards; a skill not topped up
 * for a week goes first whatever its weight, so all four keep coming. The
 * level follows his "too easy / too hard" wishes inside the levels he has
 * unlocked. Topics, avoid list and wishes come from `learnerContext()`.
 * Generate + check = 2 background slots; given back when no model was used.
 */

/** Cards asked for in one batch (rulebook 3.1: small; a few per skill). */
export const TOPUP_BATCH = 3;
/** A skill holding this many unseen practice cards is left alone today. */
export const TOPUP_MAX_UNSEEN = 60;
/** Between two top-ups. Short on purpose: the day's four are one per skill. */
export const TOPUP_GAP_MS = 30 * 60 * 1000;
/** One batch per skill, four skills. */
export const TOPUP_MAX_PER_DAY = 4;
/** Generate + its check on the other provider. */
export const TOPUP_AI_CALLS = 2;
/** A skill not topped up for this long goes first, whatever its weight. */
export const TOPUP_FAIR_MS = 7 * 24 * 60 * 60 * 1000;
/** Weight nudges. A weight scales both the order and the unseen ceiling. */
export const TOPUP_MORE_WEIGHT = 1.5;
export const TOPUP_LESS_WEIGHT = 0.5;
export const TOPUP_MISS_BOOST = 1.3;
/** Miss rate at or above this (with enough graded cards) boosts a skill. */
export const TOPUP_MISS_RATE = 0.3;
export const TOPUP_MISS_MIN_GRADED = 5;
const TOPUP_WEIGHT_MAX = 1.5;

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
  /** Last top-up per skill, kept across days (the one-week fairness rule). */
  lastByTrack?: Partial<Record<Track, number>>;
}

export interface TrackPrefs {
  /** Per-skill weight; missing = 1. Above 1 = picked sooner and stocked deeper. */
  weights?: Partial<Record<Track, number>>;
  /** Skills that go first whatever their weight (not topped up for a week). */
  overdue?: ReadonlySet<Track>;
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
 * The skill with the fewest unseen cards (divided by its weight) that is
 * below its ceiling (`TOPUP_MAX_UNSEEN` x weight); ties keep list order.
 * `exclude` = skills already topped up today. An overdue skill goes first
 * and only needs to be below the plain `TOPUP_MAX_UNSEEN`, so a "less of"
 * skill still comes once a week. With no prefs this is the old rule exactly.
 * null = nothing to do.
 */
export function pickTrack(
  cards: readonly Card[],
  seenIds: ReadonlySet<string>,
  exclude: ReadonlySet<string> = new Set(),
  prefs: TrackPrefs = {},
): Track | null {
  let best: Track | null = null;
  let bestScore = Infinity;
  let bestOverdue = false;
  for (const { track, unseen } of unseenCounts(cards, seenIds)) {
    if (exclude.has(track)) continue;
    const w = prefs.weights?.[track] ?? 1;
    const overdue = prefs.overdue?.has(track) ?? false;
    const ceiling = overdue ? Math.max(TOPUP_MAX_UNSEEN, TOPUP_MAX_UNSEEN * w) : TOPUP_MAX_UNSEEN * w;
    if (unseen >= ceiling) continue;
    const score = unseen / w;
    if (overdue && !bestOverdue) {
      best = track;
      bestScore = score;
      bestOverdue = true;
      continue;
    }
    if (bestOverdue && !overdue) continue;
    if (score < bestScore) {
      bestScore = score;
      best = track;
    }
  }
  return best;
}

/**
 * Share of graded cards per skill that he missed (lapses > 0 or last grade
 * `again`). Skills with fewer than TOPUP_MISS_MIN_GRADED graded cards get 0.
 */
export function missRates(cards: readonly Card[], reviews: readonly Review[]): Record<Track, number> {
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  const graded: Record<Track, number> = { smalltalk: 0, stories: 0, clearly: 0, words: 0 };
  const missed: Record<Track, number> = { smalltalk: 0, stories: 0, clearly: 0, words: 0 };
  for (const r of reviews) {
    if (!r.lastGrade && !(r.lapses > 0)) continue; // skimmed or never graded
    const card = byId.get(r.cardId);
    if (!card) continue;
    let track: Track;
    try {
      track = trackOf(card).track;
    } catch {
      continue;
    }
    if (!(track in graded)) continue;
    graded[track]++;
    if (r.lapses > 0 || r.lastGrade === 'again') missed[track]++;
  }
  const out: Record<Track, number> = { smalltalk: 0, stories: 0, clearly: 0, words: 0 };
  for (const t of TRACKS) {
    out[t] = graded[t] >= TOPUP_MISS_MIN_GRADED ? missed[t] / graded[t] : 0;
  }
  return out;
}

/**
 * Per-skill weight: "more of" x1.5, "less of" x0.5, a high miss rate x1.3,
 * capped at 1.5. Never 0, so every skill keeps a place.
 */
export function trackWeights(
  learner: Pick<LearnerContext, 'moreOf' | 'lessOf'>,
  rates: Partial<Record<Track, number>> = {},
): Record<Track, number> {
  const out = {} as Record<Track, number>;
  for (const t of TRACKS) {
    let w = 1;
    if (learner.moreOf.includes(t)) w *= TOPUP_MORE_WEIGHT;
    if (learner.lessOf.includes(t)) w *= TOPUP_LESS_WEIGHT;
    if ((rates[t] ?? 0) >= TOPUP_MISS_RATE) w *= TOPUP_MISS_BOOST;
    out[t] = Math.min(TOPUP_WEIGHT_MAX, w);
  }
  return out;
}

/** Skills not topped up within TOPUP_FAIR_MS (a skill never topped up counts as overdue). */
export function overdueTracks(state: TopUpState | undefined, now: number): Set<Track> {
  const last = state?.lastByTrack ?? {};
  return new Set(TRACKS.filter((t) => now - (last[t] ?? 0) >= TOPUP_FAIR_MS));
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
 * The highest level of a skill he can reach now (open or finished), else 1.
 * Top-ups never ask above it.
 */
export function highestUnlockedLevel(
  track: Track,
  cards: readonly Card[],
  doneIds: ReadonlySet<string>,
): TrackLevel {
  const teach = (cards as unknown as TeachCard[]).filter(
    (c) => c.type === 'teach' && c.status === 'active' && c.track === track && c.lesson,
  );
  const ladder = buildLadder(groupLessons(teach), doneIds);
  const reach = [...ladder].reverse().find((l) => l.status === 'open' || l.status === 'done');
  return reach ? reach.level : 1;
}

/** His level moved by his "too easy / too hard" wish, kept within 1..max. */
export function shiftedLevel(level: TrackLevel, shift: -1 | 0 | 1, max: TrackLevel): TrackLevel {
  // "Too easy" may stretch one level past what is open (rulebook 3: a stretch card is
  // allowed); without this, a "harder" wish could never change anything.
  const top = Math.max(1, Math.min(5, max + (shift === 1 ? 1 : 0)));
  return Math.max(1, Math.min(top, level + shift)) as TrackLevel;
}

/** His wishes and recent subjects first, then interests and note subjects; max 20. */
export function mergeTopics(first: readonly string[], rest: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...first, ...rest]) {
    const t = (raw ?? '').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= TOPUP_TOPIC_MAX) break;
  }
  return out;
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
    // Generate + check = 2 slots, all or nothing.
    if (!(await tryConsumeBackgroundAiCalls(TOPUP_AI_CALLS, today))) return false;

    await setMeta(TOPUP_META, {
      date: today,
      count: count + 1,
      lastAt: now,
      tracks: [...tracks, track],
      lastByTrack: { ...(state?.lastByTrack ?? {}), [track]: now },
    } satisfies TopUpState);
    return true;
  });
}

/**
 * Fire-and-forget from app open. Returns how many cards were stored (0 on
 * any skip or failure). Never throws.
 */
export async function maybeTopUp(fetchFn: FetchFn = fetch): Promise<number> {
  const today = todayKey();
  let claimed = false;
  let stage: 'before' | 'asking' | 'generated' = 'before';
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    // One key only: nothing can be checked, so nothing is generated. The
    // notice expires after 24 h, so a key added later is found again.
    if (await needsSecondKey()) return 0;

    const now = Date.now();
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

    const learner = await learnerContext(now);
    const memory = await getProfile();

    const seenIds = new Set(reviews.map((r) => r.cardId));
    const track = pickTrack(cards, seenIds, toppedToday, {
      weights: trackWeights(learner, missRates(cards, reviews)),
      overdue: overdueTracks(state, now),
    });
    if (track === null) return 0;

    if (!(await claimTopUp(track, now))) return 0;
    claimed = true;

    const doneIds = new Set(progress.map((p) => p.lessonId));
    const level = shiftedLevel(
      currentLevel(track, cards, doneIds),
      difficultyShift(memory, track, now),
      highestUnlockedLevel(track, cards, doneIds),
    );
    const inbox = [...inboxRaw].sort((a, b) => b.createdAt - a.createdAt);
    const topics = mergeTopics(learner.topics, topUpTopics(profile?.interests ?? [], inbox));
    const { avoid, notes } = learner;

    stage = 'asking';
    const res = await aiPost<{ cards?: unknown[] }>(
      'expand_seed',
      {
        type: 'teach',
        track,
        level,
        count: TOPUP_BATCH,
        ...(topics.length > 0 ? { topics } : {}),
        ...(avoid.length > 0 ? { avoid } : {}),
        ...(notes.length > 0 ? { notes } : {}),
      } satisfies ExpandSeedPayload,
      fetchFn,
    );
    stage = 'generated';

    const usable = (Array.isArray(res.data.cards) ? res.data.cards : [])
      .filter(isUsableDraft)
      .filter((d) => d.track === track)
      .slice(0, TOPUP_BATCH);
    if (usable.length === 0) {
      // Nothing to check: the check slot goes back.
      await refundAiCalls(1, today).catch(() => {});
      return 0;
    }

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
    }
    if (claimed) {
      const refund = refundFor(stage, e);
      if (refund > 0) await refundAiCalls(refund, today).catch(() => {});
    }
    // Offline, no keys or provider trouble: skip silently, retry next open.
    return 0;
  }
}
