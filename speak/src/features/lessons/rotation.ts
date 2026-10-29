import type { DayKey, Track } from '../../types/contract';

/**
 * One lesson a day, one skill a day, in a fixed loop:
 * Small talk → Stories → Speak clearly → Words → Small talk …
 *
 * Pure. The day number counts local calendar days since 1970-01-01, so the
 * track depends only on the date key and never on the time zone or the clock.
 */
export const ROTATION: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` key (no time-zone drift). */
function dayNumber(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export function todaysTrack(day: DayKey): Track {
  const n = dayNumber(day);
  return ROTATION[((n % ROTATION.length) + ROTATION.length) % ROTATION.length] as Track;
}

/** The four tracks with `today`'s track first, then the rest in rotation order. */
export function tracksFrom(day: DayKey): Track[] {
  const first = ROTATION.indexOf(todaysTrack(day));
  return [...ROTATION.slice(first), ...ROTATION.slice(0, first)];
}
