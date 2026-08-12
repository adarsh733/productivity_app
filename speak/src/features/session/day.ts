import type { CardType, DayKey, DayRecord, Grade } from '../../types/contract';
import { QUEUE_RULES } from '../../types/contract';
import { addDays } from '../../lib/date';

/**
 * Streak rules, isolated here so they are testable and so there is exactly one
 * definition of "a day counts".
 *
 * A day counts if and only if the Core 3 were completed. Not minutes, not card
 * count. A three-minute day at 11:50 PM is a full day.
 */

export function emptyDay(date: DayKey): DayRecord {
  return {
    date,
    coreThreeDone: false,
    cardsCompleted: 0,
    secondsActive: 0,
    urgesRedirected: 0,
  };
}

/**
 * The Core 3 are done when every type in CORE_SEQUENCE has been passed today.
 * `again` does not count as passed — that is the whole point of `again`.
 */
export function coreThreeComplete(passedTypesToday: readonly CardType[]): boolean {
  return QUEUE_RULES.CORE_SEQUENCE.every((t) => passedTypesToday.includes(t));
}

export function isPass(grade: Grade): boolean {
  return grade !== 'again';
}

/**
 * Current streak length, counting back from `today`.
 *
 * Two grace days per calendar month are absorbed silently — a missed day inside
 * the allowance does not reset the count and is never mentioned in the UI. The
 * streak exists to keep him going, not to punish a fever.
 */
export const GRACE_DAYS_PER_MONTH = 2;

export function currentStreak(days: ReadonlyMap<DayKey, DayRecord>, today: DayKey): number {
  let streak = 0;
  let cursor = today;
  const graceUsed = new Map<string, number>();

  // Today not being done yet must not zero a real streak — start from today,
  // and only start spending grace once we're looking at days that are past.
  if (!days.get(cursor)?.coreThreeDone) cursor = addDays(cursor, -1);

  for (let guard = 0; guard < 3650; guard++) {
    const rec = days.get(cursor);
    if (rec?.coreThreeDone) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }

    const month = cursor.slice(0, 7);
    const used = graceUsed.get(month) ?? 0;
    if (used < GRACE_DAYS_PER_MONTH && streak > 0) {
      graceUsed.set(month, used + 1);
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  return streak;
}
