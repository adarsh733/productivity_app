import type { DayKey } from '../types/contract';

/**
 * Day keys are LOCAL dates, never UTC. Using UTC here would roll the streak
 * over at 05:30 IST — i.e. a late-night session would count as tomorrow.
 */
export function toDayKey(d: Date): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now);
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  // Local midnight, not UTC midnight.
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: DayKey, days: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + days);
  return toDayKey(d);
}

/** Negative if `a` is before `b`. */
export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isDue(due: DayKey, today: DayKey): boolean {
  return compareDayKeys(due, today) <= 0;
}

export function daysBetween(from: DayKey, to: DayKey): number {
  const ms = parseDayKey(to).getTime() - parseDayKey(from).getTime();
  return Math.round(ms / 86_400_000);
}
