import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { DayRecord, InboxItem, Profile, Recording, VoiceSample } from '../../types/contract';
import { currentStreak } from '../session/day';
import { addDays, todayKey } from '../../lib/date';

export interface UseYouReturn {
  profile: Profile | undefined;
  daysList: DayRecord[];
  streak: number;
  totalCards: number;
  totalReps: number;
  todayXp: number;
  bookmarkCount: number;
  today: string;
  voiceSamples: VoiceSample[];
  recordings: Recording[];
  inbox: InboxItem[];
  week: {
    newCards: number;
    reviewed: number;
    wordsOutLoud: number;
    spokenReps: number;
    routineDays: number;
    urges: number;
  };
}

function weekKeys(today: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(today, -i));
  return out;
}

export function useYou(): UseYouReturn {
  const profile = useLiveQuery(() => db.profile.get('me'), []);
  const allDays = useLiveQuery(() => db.days.toArray(), []);
  const bookmarkCount = useLiveQuery(() => db.bookmarks.count(), []) ?? 0;
  const voiceSamples = useLiveQuery(() => db.voiceSamples.orderBy('at').toArray(), []) ?? [];
  const recordings = useLiveQuery(() => db.recordings.orderBy('at').reverse().limit(30).toArray(), []) ?? [];
  const inbox = useLiveQuery(() => db.inbox.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const weekEvents = useLiveQuery(() => db.events.toArray(), []) ?? [];

  const daysList = useMemo(() => allDays ?? [], [allDays]);
  const today = todayKey();
  const dayMap = useMemo(() => new Map(daysList.map((d) => [d.date, d])), [daysList]);

  const streak = currentStreak(dayMap, today);
  const totalCards = daysList.reduce((sum, d) => sum + (d.cardsCompleted || 0), 0);
  const totalReps = daysList.reduce((sum, d) => sum + (d.spokenReps || 0), 0);
  const todayRecord = dayMap.get(today);
  const todayXp = todayRecord?.xp ?? 0;

  const week = useMemo(() => {
    const keys = new Set(weekKeys(today));
    const inWeek = weekEvents.filter((e) => (e.date && keys.has(e.date)) || keys.has(todayKey(new Date(e.at))));
    const viewed = new Set<string>();
    let reviewed = 0;
    let words = 0;
    let reps = 0;
    for (const e of inWeek) {
      if (e.type === 'card_viewed' && e.cardId) viewed.add(e.cardId);
      if (e.type === 'recall_graded') reviewed += 1;
      if ((e.type === 'spoken_rep_completed' || e.type === 'describe_rep_completed')) {
        reps += 1;
        const t = (e as { transcript?: string }).transcript;
        if (t) words += t.trim().split(/\s+/).filter(Boolean).length;
      }
    }
    const routineDays = daysList.filter((d) => keys.has(d.date) && d.labSessionDone).length;
    const urges = daysList.filter((d) => keys.has(d.date)).reduce((s, d) => s + (d.urgesRedirected || 0), 0);
    return { newCards: viewed.size, reviewed, wordsOutLoud: words, spokenReps: reps, routineDays, urges };
  }, [weekEvents, daysList, today]);

  return {
    profile,
    daysList,
    streak,
    totalCards,
    totalReps,
    todayXp,
    bookmarkCount,
    today,
    voiceSamples,
    recordings,
    inbox,
    week,
  };
}
