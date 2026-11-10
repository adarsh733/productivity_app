import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../db/db';
import { currentStreak } from '../session/day';
import { todayKey } from '../../lib/date';

export interface UseMeReturn {
  /** Consecutive days with a counted day — traces to `db.days`. */
  streak: number;
  /** Cards finished today — `db.days.get(today).cardsCompleted`, 0 when none. */
  cardsToday: number;
  /** Seen Words + Office phrases — rows in `db.seen` with module words or phrases. */
  wordsAndPhrases: number;
}

/** Everything the Me screen shows. Each number traces to one stored query. */
export function useMe(): UseMeReturn {
  const today = todayKey();
  const days = useLiveQuery(() => db.days.toArray(), []);
  const wordsAndPhrases =
    useLiveQuery(() => db.seen.where('module').anyOf('words', 'phrases').count(), []) ?? 0;

  const streak = useMemo(() => {
    const dayMap = new Map((days ?? []).map((d) => [d.date, d]));
    return currentStreak(dayMap, today);
  }, [days, today]);

  const cardsToday = useMemo(
    () => (days ?? []).find((d) => d.date === today)?.cardsCompleted ?? 0,
    [days, today],
  );

  return { streak, cardsToday, wordsAndPhrases };
}
