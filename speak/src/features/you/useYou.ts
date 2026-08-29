import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { DayRecord, Profile } from '../../types/contract';
import { currentStreak } from '../session/day';
import { todayKey } from '../../lib/date';

export interface UseYouReturn {
  profile: Profile | undefined;
  daysList: DayRecord[];
  streak: number;
  totalCards: number;
  totalReps: number;
  todayXp: number;
  bookmarkCount: number;
  today: string;
}

export function useYou(): UseYouReturn {
  const profile = useLiveQuery(() => db.profile.get('me'), []);
  const allDays = useLiveQuery(() => db.days.toArray(), []);
  const bookmarkCount = useLiveQuery(() => db.bookmarks.count(), []) ?? 0;

  const daysList = useMemo(() => allDays ?? [], [allDays]);
  const today = todayKey();
  const dayMap = useMemo(() => new Map(daysList.map((d) => [d.date, d])), [daysList]);

  const streak = currentStreak(dayMap, today);
  const totalCards = daysList.reduce((sum, d) => sum + (d.cardsCompleted || 0), 0);
  const totalReps = daysList.reduce((sum, d) => sum + (d.spokenReps || 0), 0);
  const todayRecord = dayMap.get(today);
  const todayXp = todayRecord?.xp ?? 0;

  return {
    profile,
    daysList,
    streak,
    totalCards,
    totalReps,
    todayXp,
    bookmarkCount,
    today,
  };
}
