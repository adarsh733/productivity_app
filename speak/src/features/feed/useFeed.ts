import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Card,
  CardType,
  DayRecord,
  FeedMode,
  Grade,
  ProductionEvent,
  Profile,
  QueueItem,
  Review,
} from '../../types/contract';
import { GAMIFICATION } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { buildQueue, skimReview } from '../../srs/queue';
import { grade, newReview } from '../../srs/scheduler';
import { applyCardView, currentStreak, emptyDay } from '../session/day';
import { todayKey } from '../../lib/date';

/**
 * The feed's state machine.
 *
 * Core Principles:
 *  - Browsing exposure is NEVER an SM-2 grade.
 *  - Advancing cards creates `card_viewed` production events.
 *  - Downweighting creates `card_downweighted` events and stores 7-day expiring weights.
 *  - 1 XP per unique card viewed per day; repeated views on the same day earn view XP once.
 *  - Swipe down / goPrevious returns the previous card without emitting duplicate events.
 *  - Feed header and You screen read the exact same persisted day.xp value.
 */

const ENDLESS_CHUNK = 24;
const REFILL_WHEN_LEFT = 6;

export interface FeedApi {
  ready: boolean;
  mode: FeedMode;
  item: QueueItem | null;
  /** 1-based position within the current run, for the progress counter. */
  position: number;
  /** Length of the current run. In endless mode this grows. */
  total: number;
  coreThreeDone: boolean;
  streak: number;
  cardsToday: number;
  urgesToday: number;
  todayXp: number;
  canGoBack: boolean;
  setMode(mode: FeedMode): void;
  /**
   * Mark a card engaged for this session (AG-007 stage 2): ≥ 2 s on screen,
   * opened/flipped/detail, saved, spoken ("say it" rep), or graded.
   * FeedScreen calls this; `advanceCard` reads it to decide engaged vs skim
   * first-sight scheduling. Stable identity across renders.
   */
  markEngaged(cardId: string): void;
  advanceCard(opts?: { msSpent?: number }): Promise<void>;
  submit(grade?: Grade, opts?: { msSpent?: number; measure?: number }): Promise<void>;
  downvoteCard(card: Card): Promise<void>;
  downvoteType(type: CardType): Promise<void>;
  goPrevious(): void;
  logUrge(): Promise<void>;
  reload(): Promise<void>;
}

export function useFeed(_initialMode: FeedMode = 'endless'): FeedApi {
  const [mode] = useState<FeedMode>('endless');
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [position, setPosition] = useState(0);
  const [day, setDay] = useState<DayRecord>(() => emptyDay(todayKey()));
  const [streak, setStreak] = useState(0);

  const cardsRef = useRef<Card[]>([]);
  const reviewsRef = useRef<Map<string, Review>>(new Map());
  const profileRef = useRef<Profile | null>(null);
  const seenTodayRef = useRef<Set<string>>(new Set());
  const engagedIdsRef = useRef<Set<string>>(new Set());
  const breathTodayRef = useRef(0);
  const newTodayRef = useRef(0);
  const today = todayKey();

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [cards, reviews, profile, dayRow, allDays, todayEvents] = await Promise.all([
      db.cards.toArray(),
      db.reviews.toArray(),
      db.profile.get('me'),
      db.days.get(today),
      db.days.toArray(),
      db.events.toArray(),
    ]);

    cardsRef.current = cards;
    reviewsRef.current = new Map(reviews.map((r) => [r.cardId, r]));
    profileRef.current = profile ?? null;

    const seenToday = new Set<string>();
    let breath = 0;
    let fresh = 0;

    for (const e of todayEvents) {
      if (e.date !== today && todayKey(new Date(e.at)) !== today) continue;
      if (e.cardId) {
        seenToday.add(e.cardId);
      }
      if (e.cardType === 'breath') breath++;
    }

    seenTodayRef.current = seenToday;
    breathTodayRef.current = breath;
    newTodayRef.current = fresh;

    const record = dayRow ?? emptyDay(today);
    setDay(record);
    setStreak(currentStreak(new Map(allDays.map((d) => [d.date, d])), today));
    setReady(true);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── queue building ────────────────────────────────────────────────────────
  const build = useCallback(
    (limit: number): QueueItem[] =>
      buildQueue(cardsRef.current, reviewsRef.current, {
        today,
        seenCardIds: seenTodayRef.current,
        breathServedToday: breathTodayRef.current,
        newServedToday: newTodayRef.current,
        limit,
        mode: 'endless',
        interests: profileRef.current?.interests,
        typeWeights: profileRef.current?.typeWeights,
        downweights: profileRef.current?.downweights,
      }),
    [today],
  );

  useEffect(() => {
    if (!ready) return;
    setQueue(build(ENDLESS_CHUNK));
    setPosition(0);
  }, [ready, build]);

  const setMode = useCallback((_m: FeedMode) => {}, []);

  // ── engagement (AG-007 stage 2) ───────────────────────────────────────────
  // Session-long set of card ids FeedScreen reported as engaged. `advanceCard`
  // consumes the flag for the card leaving the screen, so a re-served card
  // needs a fresh signal. Stable identity: FeedScreen holds it in a ref.
  const markEngaged = useCallback((cardId: string) => {
    engagedIdsRef.current.add(cardId);
  }, []);

  // ── downweighting ─────────────────────────────────────────────────────────
  const downvoteCard = useCallback(
    async (card: Card) => {
      const prof = (await db.profile.get('me')) ?? { id: 'me' as const, createdAt: Date.now() };
      const currentDownweights = prof.downweights ?? {};
      const now = Date.now();

      // Downweight primarily by primary tag/category if present, or type
      const targetKey = (card.tags && card.tags[0] ? card.tags[0] : card.type).toLowerCase();
      const existing = currentDownweights[targetKey];
      const prevMult = existing && existing.expiresAt > now ? existing.multiplier : 1.0;
      const nextMult = Math.max(0.15, prevMult * 0.7);
      const expiresAt = now + GAMIFICATION.DOWNWEIGHT_DAYS * 86_400_000;

      const updatedDownweights = {
        ...currentDownweights,
        [targetKey]: {
          target: targetKey,
          type: card.type,
          multiplier: nextMult,
          expiresAt,
          createdAt: now,
        },
      };

      const updatedProf: Profile = {
        ...prof,
        downweights: updatedDownweights,
      };

      profileRef.current = updatedProf;
      await db.profile.put(updatedProf);
      await enqueue('profile', 'me');

      // Record production event
      const downEvent: ProductionEvent = {
        id: `evt-dwn-${card.id}-${now}`,
        type: 'card_downweighted',
        cardId: card.id,
        cardType: card.type,
        target: targetKey,
        multiplier: nextMult,
        expiresAt,
        at: now,
        date: today,
      };
      await db.events.put(downEvent as any);
      await enqueue('events', downEvent.id);
    },
    [today],
  );

  const downvoteType = useCallback(
    async (type: CardType) => {
      const dummyCard: Card = { id: `type-${type}`, type, lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0 } as any;
      await downvoteCard(dummyCard);
    },
    [downvoteCard],
  );

  // ── card view advancement ─────────────────────────────────────────────────
  // Engaged first sight: current behaviour — newReview + grade `good` (due
  // tomorrow). Never ask him to grade a first meeting.
  // Skimmed first sight (served but never markEngaged before advance): review
  // stays `new`, reps 0, lastSeenAt + skippedAt = now, so queue.ts withholds
  // it as new for 14 days. A re-served skim that later engages graduates to
  // the good-graded path; a re-skim refreshes the 14-day reserve.
  // XP and cards-today count engaged cards only (via applyCardView).
  const advanceCard = useCallback(
    async (opts?: { msSpent?: number }) => {
      const current = queue[position];
      if (!current) return;

      const card = current.card;
      const now = Date.now();
      const engaged = engagedIdsRef.current.has(card.id);
      engagedIdsRef.current.delete(card.id);

      // 1. Calculate XP and unique card tracking using domain function
      const { day: nextDay, isUnique } = applyCardView(
        day,
        card.id,
        seenTodayRef.current,
        { msSpent: opts?.msSpent, engaged },
      );

      seenTodayRef.current.add(card.id);
      if (current.reason === 'new' && isUnique) {
        newTodayRef.current++;
      }

      setDay(nextDay);

      // 2. Record production event + first-seen scheduling (due tomorrow)
      const event: ProductionEvent = {
        id: `evt-view-${card.id}-${now}`,
        type: 'card_viewed',
        cardId: card.id,
        cardType: card.type,
        at: now,
        date: today,
        msSpent: opts?.msSpent ?? 0,
        mode: 'endless',
      };

      const existingReview = reviewsRef.current.get(card.id);
      // Unlearned = never graded into the schedule (fresh, or a skim that
      // came back after its reserve and still has reps 0).
      const isUnlearned =
        !existingReview ||
        (existingReview.state === 'new' && existingReview.reps === 0);

      await db.transaction('rw', db.events, db.days, db.reviews, db.outbox, async () => {
        await db.events.put(event as any);
        await db.days.put(nextDay);
        await enqueue('events', event.id);
        await enqueue('days', nextDay.date);
        if (isUnlearned && engaged) {
          const { review } = grade(newReview(card.id, today), 'good', today, now);
          await db.reviews.put(review);
          await enqueue('reviews', card.id);
          reviewsRef.current.set(card.id, review);
        } else if (isUnlearned && !engaged) {
          const skimmed = skimReview(card.id, today, now);
          await db.reviews.put(skimmed);
          await enqueue('reviews', card.id);
          reviewsRef.current.set(card.id, skimmed);
        } else if (existingReview && !existingReview.lastSeenAt) {
          const touched: Review = { ...existingReview, lastSeenAt: now };
          await db.reviews.put(touched);
          reviewsRef.current.set(card.id, touched);
        }
      });

      const allDays = await db.days.toArray();
      setStreak(currentStreak(new Map(allDays.map((d) => [d.date, d])), today));

      setPosition((p) => p + 1);
    },
    [queue, position, today, day],
  );

  const submit = useCallback(
    async (gradeValue?: Grade, opts?: { msSpent?: number; measure?: number }) => {
      const current = queue[position];
      if (!current || !gradeValue || gradeValue === 'hard') {
        await advanceCard(opts);
        return;
      }
      const card = current.card;
      const now = Date.now();
      const existing = reviewsRef.current.get(card.id) ?? newReview(card.id, today);
      const { review, requeueNow } = grade(existing, gradeValue, today, now);
      await db.transaction('rw', db.reviews, db.events, db.outbox, async () => {
        await db.reviews.put(review);
        await db.events.put({
          id: `evt-grade-${card.id}-${now}`,
          type: 'recall_graded',
          cardId: card.id,
          cardType: card.type,
          grade: gradeValue,
          at: now,
          date: today,
        } as never);
        await enqueue('events', `evt-grade-${card.id}-${now}`);
        await enqueue('reviews', card.id);
      });
      reviewsRef.current.set(card.id, review);

      if (gradeValue === 'again' && requeueNow) {
        // Reappear within ~10 cards: splice back in ahead, and do NOT mark seen today.
        setQueue((q) => {
          const at = Math.min(q.length, position + 1 + 5 + Math.floor(Math.random() * 4));
          const copy = [...q];
          copy.splice(at, 0, { card, reason: 'due' });
          return copy;
        });
      } else {
        seenTodayRef.current.add(card.id);
      }
      await advanceCard(opts);
    },
    [advanceCard, queue, position, today],
  );

  // ── previous card navigation (swipe down) ─────────────────────────────────
  const goPrevious = useCallback(() => {
    if (position > 0) {
      setPosition((p) => p - 1);
    }
  }, [position]);

  // ── keep endless endless ──────────────────────────────────────────────────
  // Guard 1: never run before the first build lands (queue empty on the first
  // render would rebuild the same 24 cards and append them again).
  // Guard 2: never append a card already in the queue. When nothing fresh is
  // left, stop refilling so the feed drains to the "caught up" state.
  useEffect(() => {
    if (!ready) return;
    if (queue.length === 0) return;
    if (queue.length - position > REFILL_WHEN_LEFT) return;

    const more = build(ENDLESS_CHUNK);
    if (more.length === 0) return;

    const present = new Set(queue.map((i) => i.card.id));
    const fresh = more.filter((i) => !present.has(i.card.id));
    if (fresh.length === 0) return;

    const additions = [...fresh];

    setQueue((q) => {
      const inQueue = new Set(q.map((i) => i.card.id));
      const deduped = additions.filter((i) => !inQueue.has(i.card.id));
      if (deduped.length === 0) return q;

      const tailType = q[q.length - 1]?.card.type;
      if (deduped.length > 1 && deduped[0]!.card.type === tailType) {
        const at = deduped.findIndex((i) => i.card.type !== tailType);
        if (at > 0) deduped.unshift(...deduped.splice(at, 1));
      }

      return [...q, ...deduped];
    });
  }, [ready, queue.length, position, build]);

  const logUrge = useCallback(async () => {
    const next = { ...day, urgesRedirected: day.urgesRedirected + 1 };
    setDay(next);
    await db.days.put(next);
    await enqueue('days', next.date);
  }, [day]);

  const reload = useCallback(async () => {
    await load();
    setQueue(build(ENDLESS_CHUNK));
    setPosition(0);
  }, [load, build]);

  const item = useMemo(() => queue[position] ?? null, [queue, position]);

  return {
    ready,
    mode,
    item,
    position: Math.min(position + 1, Math.max(queue.length, 1)),
    total: queue.length,
    coreThreeDone: day.coreThreeDone,
    streak,
    cardsToday: day.cardsCompleted,
    urgesToday: day.urgesRedirected,
    todayXp: day.xp ?? 0,
    canGoBack: position > 0,
    setMode,
    markEngaged,
    advanceCard,
    submit,
    downvoteCard,
    downvoteType,
    goPrevious,
    logUrge,
    reload,
  };
}


