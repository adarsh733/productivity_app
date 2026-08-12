import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Card,
  CardEvent,
  DayRecord,
  FeedMode,
  Grade,
  QueueItem,
  Review,
} from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { buildQueue } from '../../srs/queue';
import { grade as gradeReview, newReview } from '../../srs/scheduler';
import { coreThreeComplete, currentStreak, emptyDay, isPass } from '../session/day';
import { todayKey } from '../../lib/date';

/**
 * The feed's state machine. Components render what this returns and call
 * `submit` — they never touch the database, the scheduler or the queue.
 *
 * Two behaviours worth knowing before you build against it:
 *  - `again` puts the card back into this session a few positions later. It is
 *    not "skip"; it is "I failed that, show me again".
 *  - the endless queue tops itself up before it runs out, so `item` is never
 *    null once `ready` is true.
 */

const ENDLESS_CHUNK = 24;
const REFILL_WHEN_LEFT = 6;
/** How many cards later a failed card comes back. */
const REQUEUE_GAP = 3;

export interface FeedApi {
  ready: boolean;
  mode: FeedMode;
  item: QueueItem | null;
  /** 1-based position within the current run, for the progress dots. */
  position: number;
  /** Length of the current run. In endless mode this grows. */
  total: number;
  coreThreeDone: boolean;
  streak: number;
  cardsToday: number;
  urgesToday: number;
  setMode(mode: FeedMode): void;
  submit(grade: Grade, opts?: { msSpent?: number; measure?: number }): Promise<void>;
  logUrge(): Promise<void>;
}

export function useFeed(initialMode: FeedMode = 'core'): FeedApi {
  const [mode, setModeState] = useState<FeedMode>(initialMode);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [position, setPosition] = useState(0);
  const [day, setDay] = useState<DayRecord>(() => emptyDay(todayKey()));
  const [streak, setStreak] = useState(0);

  const cardsRef = useRef<Card[]>([]);
  const reviewsRef = useRef<Map<string, Review>>(new Map());
  const passedTypesRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const breathTodayRef = useRef(0);
  const newTodayRef = useRef(0);
  const today = todayKey();

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [cards, reviews, dayRow, allDays, todayEvents] = await Promise.all([
      db.cards.toArray(),
      db.reviews.toArray(),
      db.days.get(today),
      db.days.toArray(),
      db.events.toArray(),
    ]);

    cardsRef.current = cards;
    reviewsRef.current = new Map(reviews.map((r) => [r.cardId, r]));

    const cardById = new Map(cards.map((c) => [c.id, c]));
    const passedTypes = new Set<string>();
    const seen = new Set<string>();
    let breath = 0;
    let fresh = 0;

    for (const e of todayEvents) {
      if (todayKey(new Date(e.at)) !== today) continue;
      if (isPass(e.grade)) {
        passedTypes.add(e.cardType);
        seen.add(e.cardId);
      }
      if (e.cardType === 'breath') breath++;
      if (cardById.has(e.cardId)) fresh++;
    }

    passedTypesRef.current = passedTypes;
    seenRef.current = seen;
    breathTodayRef.current = breath;
    newTodayRef.current = fresh;

    const record = dayRow ?? emptyDay(today);
    setDay(record);
    setStreak(currentStreak(new Map(allDays.map((d) => [d.date, d])), today));

    // Mode is derived from today, not from how the component happened to mount.
    // Without this, coming back to the feed from another tab restarts "CORE
    // 1/3" on a day that is already done — which reads as if the streak reset.
    if (record.coreThreeDone) setModeState('endless');

    setReady(true);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── queue building ────────────────────────────────────────────────────────
  const build = useCallback(
    (m: FeedMode, limit: number): QueueItem[] =>
      buildQueue(cardsRef.current, reviewsRef.current, {
        today,
        seenCardIds: seenRef.current,
        breathServedToday: breathTodayRef.current,
        newServedToday: newTodayRef.current,
        limit,
        mode: m,
      }),
    [today],
  );

  useEffect(() => {
    if (!ready) return;
    setQueue(build(mode, mode === 'core' ? 3 : ENDLESS_CHUNK));
    setPosition(0);
  }, [ready, mode, build]);

  const setMode = useCallback((m: FeedMode) => setModeState(m), []);

  // ── grading ───────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (g: Grade, opts?: { msSpent?: number; measure?: number }) => {
      const current = queue[position];
      if (!current) return;

      const card = current.card;
      const now = Date.now();
      const prev = reviewsRef.current.get(card.id) ?? newReview(card.id, today);
      const { review, requeueNow } = gradeReview(prev, g, today, now);
      reviewsRef.current.set(card.id, review);

      const event: CardEvent = {
        id: `${card.id}:${now}`,
        cardId: card.id,
        cardType: card.type,
        at: now,
        grade: g,
        msSpent: opts?.msSpent ?? 0,
        mode,
        ...(opts?.measure !== undefined ? { measure: opts.measure } : {}),
      };

      if (isPass(g)) {
        passedTypesRef.current.add(card.type);
        seenRef.current.add(card.id);
      }
      if (card.type === 'breath') breathTodayRef.current++;
      if (current.reason === 'new') newTodayRef.current++;

      const nextDay: DayRecord = {
        ...day,
        cardsCompleted: day.cardsCompleted + 1,
        secondsActive: day.secondsActive + Math.round((opts?.msSpent ?? 0) / 1000),
        coreThreeDone:
          day.coreThreeDone || coreThreeComplete([...passedTypesRef.current] as never),
        // Only stopwatch drills feed the seconds figure. A counting ladder
        // reports "I reached 34", which is not 34 seconds — merging them makes
        // the one number he'll actually watch improve a lie.
        ...(card.type === 'breath' && card.logUnit === 'seconds' && opts?.measure !== undefined
          ? { bestMptSec: Math.max(day.bestMptSec ?? 0, opts.measure) }
          : {}),
      };

      setDay(nextDay);

      await db.transaction('rw', db.reviews, db.events, db.days, db.outbox, async () => {
        await db.reviews.put(review);
        await db.events.put(event);
        await db.days.put(nextDay);
        await enqueue('reviews', review.cardId);
        await enqueue('events', event.id);
        await enqueue('days', nextDay.date);
      });

      // The moment the Core 3 land, today starts counting. Recomputing rather
      // than incrementing keeps this correct across grace days and midnight.
      if (!day.coreThreeDone && nextDay.coreThreeDone) {
        const allDays = await db.days.toArray();
        setStreak(currentStreak(new Map(allDays.map((d) => [d.date, d])), today));
      }

      // Advance, re-inserting the card a few positions on if he failed it.
      setQueue((q) => {
        const next = [...q];
        if (requeueNow) {
          const at = Math.min(position + 1 + REQUEUE_GAP, next.length);
          next.splice(at, 0, current);
        }
        return next;
      });
      setPosition((p) => p + 1);
    },
    [queue, position, mode, today, day],
  );

  // ── keep endless endless ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || mode !== 'endless') return;
    if (queue.length - position > REFILL_WHEN_LEFT) return;

    const more = build('endless', ENDLESS_CHUNK);
    if (more.length === 0) return;

    setQueue((q) => {
      // `build` has no memory of what is already queued, and this effect can
      // fire against a stale length (React 18 runs effects twice in dev, and
      // the mode switch replaces the queue underneath it). Without this the
      // same card lands in one run twice.
      const present = new Set(q.map((i) => i.card.id));
      const fresh = more.filter((i) => !present.has(i.card.id));
      if (fresh.length === 0) return q;

      // Each chunk is built without knowledge of the one before it, so the
      // join is the one place a same-type pair can slip through. Rotate the
      // new chunk by one rather than let the seam show.
      const tailType = q[q.length - 1]?.card.type;
      if (fresh.length > 1 && fresh[0]!.card.type === tailType) {
        const at = fresh.findIndex((i) => i.card.type !== tailType);
        if (at > 0) fresh.unshift(...fresh.splice(at, 1));
      }

      return [...q, ...fresh];
    });
  }, [ready, mode, queue.length, position, build]);

  const logUrge = useCallback(async () => {
    const next = { ...day, urgesRedirected: day.urgesRedirected + 1 };
    setDay(next);
    await db.days.put(next);
    await enqueue('days', next.date);
  }, [day]);

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
    setMode,
    submit,
    logUrge,
  };
}
