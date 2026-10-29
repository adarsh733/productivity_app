import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../db/db';
import { currentStreak } from '../session/day';
import { todayKey } from '../../lib/date';
import type { WeakSpot } from '../../types/contract';

export interface UseMeReturn {
  /** Consecutive days with a counted day — traces to `db.days`. */
  streak: number;
  /** Distinct cards with at least one SRS rep — traces to `db.reviews`. */
  wordsAndPhrases: number;
  /** Rows in `db.lessonProgress`. */
  lessonsDone: number;
  /** Rows in `db.bookmarks`. */
  savedCount: number;
  /** Weak spots not yet fixed, newest first (all of them). */
  openWeakSpots: WeakSpot[];
  /** Rows in `db.storyBank`. */
  storyCount: number;
  /** Rows in `db.chats`. */
  chatCount: number;
  /** Rows in `db.asks`. */
  askCount: number;
  /** Total cards made from asks. */
  askCardCount: number;
}

/** Everything the Me screen shows. Each number traces to one stored query. */
export function useMe(): UseMeReturn {
  const days = useLiveQuery(() => db.days.toArray(), []);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []);
  const lessonsDone = useLiveQuery(() => db.lessonProgress.count(), []) ?? 0;
  const savedCount = useLiveQuery(() => db.bookmarks.count(), []) ?? 0;
  const weakSpots = useLiveQuery(() => db.weakSpots.orderBy('createdAt').reverse().toArray(), []);
  const storyCount = useLiveQuery(() => db.storyBank.count(), []) ?? 0;
  const chatCount = useLiveQuery(() => db.chats.count(), []) ?? 0;
  const asks = useLiveQuery(() => db.asks.toArray(), []);

  const today = todayKey();

  const streak = useMemo(() => {
    const dayMap = new Map((days ?? []).map((d) => [d.date, d]));
    return currentStreak(dayMap, today);
  }, [days, today]);

  const wordsAndPhrases = useMemo(
    () => (reviews ?? []).filter((r) => (r.reps ?? 0) >= 1).length,
    [reviews],
  );

  const openWeakSpots = useMemo(
    () => (weakSpots ?? []).filter((w) => w.fixedAt === undefined),
    [weakSpots],
  );

  const askCardCount = useMemo(
    () => (asks ?? []).reduce((n, a) => n + a.cardIds.length, 0),
    [asks],
  );

  return {
    streak,
    wordsAndPhrases,
    lessonsDone,
    savedCount,
    openWeakSpots,
    storyCount,
    chatCount,
    askCount: asks?.length ?? 0,
    askCardCount,
  };
}
