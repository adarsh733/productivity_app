import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Profile, Recording } from '../../types/contract';
import { currentStreak } from '../session/day';
import { addDays, parseDayKey, todayKey } from '../../lib/date';

/** One rolling 7-day bucket. `value` is null when the week has no sample. */
export interface WeekPoint {
  label: string;
  value: number | null;
}

export interface UseYouReturn {
  profile: Profile | undefined;
  streak: number;
  /** Distinct cards with at least one SRS rep — traces to `db.reviews`. */
  cardsLearned: number;
  /** Whole minutes spoken in the last 7 days — traces to `db.events` durations. */
  minutesSpokenWeek: number;
  /** Latest session loudness vs his normal voice, or '—' when unmeasured. */
  voiceVsNormal: string;
  /** His normal speaking level (week-1 calibration), dBFS. Null when unmeasured. */
  normalDb: number | null;
  /** 8 rolling 7-day buckets: mean session loudness (dBFS). */
  loudnessWeeks: WeekPoint[];
  /** 8 rolling 7-day buckets: best breath-hold (seconds). */
  breathWeeks: WeekPoint[];
  bookmarkCount: number;
  recordings: Recording[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekBucketLabel(startKey: string): string {
  const d = parseDayKey(startKey);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** 8 rolling 7-day buckets ending today. Index 7 is the current week. */
export function weekBuckets(today: string): Array<{ label: string; keys: Set<string> }> {
  const out: Array<{ label: string; keys: Set<string> }> = [];
  for (let b = 0; b < 8; b++) {
    const end = addDays(today, -7 * (7 - b));
    const start = addDays(end, -6);
    const keys = new Set<string>();
    for (let i = 0; i < 7; i++) keys.add(addDays(start, i));
    out.push({ label: weekBucketLabel(start), keys });
  }
  return out;
}

export function voiceVsNormalText(sessionDb: number | null, normalDb: number | null): string {
  if (sessionDb === null || normalDb === null || !Number.isFinite(sessionDb) || !Number.isFinite(normalDb)) {
    return '—';
  }
  const diff = Math.round(normalDb - sessionDb);
  if (diff > 0) return `${diff} dB softer`;
  if (diff < 0) return `${-diff} dB louder`;
  return 'same as normal';
}

export function useYou(): UseYouReturn {
  const profile = useLiveQuery(() => db.profile.get('me'), []);
  const allDays = useLiveQuery(() => db.days.toArray(), []);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []);
  const weekEvents = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const voiceSamples = useLiveQuery(() => db.voiceSamples.orderBy('at').toArray(), []) ?? [];
  const recordings = useLiveQuery(() => db.recordings.orderBy('at').reverse().limit(30).toArray(), []) ?? [];
  const bookmarkCount = useLiveQuery(() => db.bookmarks.count(), []) ?? 0;

  const today = todayKey();

  const streak = useMemo(() => {
    const dayMap = new Map((allDays ?? []).map((d) => [d.date, d]));
    return currentStreak(dayMap, today);
  }, [allDays, today]);

  const cardsLearned = useMemo(
    () => (reviews ?? []).filter((r) => (r.reps ?? 0) >= 1).length,
    [reviews],
  );

  const buckets = useMemo(() => weekBuckets(today), [today]);
  const thisWeekKeys = buckets[7]?.keys;

  const minutesSpokenWeek = useMemo(() => {
    if (!thisWeekKeys) return 0;
    let secs = 0;
    for (const e of weekEvents) {
      if (e.type !== 'spoken_rep_completed' && e.type !== 'describe_rep_completed') continue;
      const key = (e.date as string | undefined) ?? todayKey(new Date(e.at));
      if (!thisWeekKeys.has(key)) continue;
      const d = (e as { durationSec?: unknown }).durationSec;
      if (typeof d === 'number' && Number.isFinite(d) && d > 0) secs += d;
    }
    return Math.round(secs / 60);
  }, [weekEvents, thisWeekKeys]);

  const { normalDb, latestSessionDb, loudnessWeeks, breathWeeks } = useMemo(() => {
    let normal: number | null = null;
    for (const s of voiceSamples) {
      if (s.kind === 'baseline_db' && Number.isFinite(s.value)) normal = s.value;
    }
    let latest: number | null = null;
    const loudSums = buckets.map(() => ({ sum: 0, n: 0 }));
    const breathBest: Array<number | null> = buckets.map(() => null);
    for (const s of voiceSamples) {
      if (s.kind === 'session_db' && Number.isFinite(s.value)) {
        latest = s.value;
        const idx = buckets.findIndex((b) => b.keys.has(s.date));
        if (idx >= 0 && loudSums[idx]) {
          loudSums[idx]!.sum += s.value;
          loudSums[idx]!.n += 1;
        }
      } else if (s.kind === 'level1_hold' && Number.isFinite(s.value)) {
        const idx = buckets.findIndex((b) => b.keys.has(s.date));
        if (idx >= 0 && (breathBest[idx] === null || (breathBest[idx] as number) < s.value)) {
          breathBest[idx] = s.value;
        }
      }
    }
    return {
      normalDb: normal,
      latestSessionDb: latest,
      loudnessWeeks: buckets.map((b, i) => ({
        label: b.label,
        value: loudSums[i] && loudSums[i]!.n > 0 ? Math.round((loudSums[i]!.sum / loudSums[i]!.n) * 10) / 10 : null,
      })),
      breathWeeks: buckets.map((b, i) => ({
        label: b.label,
        value: breathBest[i] === null ? null : Math.round((breathBest[i] as number) * 10) / 10,
      })),
    };
  }, [voiceSamples, buckets]);

  return {
    profile,
    streak,
    cardsLearned,
    minutesSpokenWeek,
    voiceVsNormal: voiceVsNormalText(latestSessionDb, normalDb),
    normalDb,
    loudnessWeeks,
    breathWeeks,
    bookmarkCount,
    recordings,
  };
}
