import type { DayKey, Grade, Review } from '../types/contract';
import { addDays } from '../lib/date';

/**
 * SM-2, with the standard modifications:
 *  - `again` sends the card back into the same session rather than tomorrow,
 *    because a card you just failed is worth re-seeing while it stings.
 *  - Ease is floored at 1.3, as in the original algorithm.
 *
 * This is the one piece of Phase 0 where a subtle error is completely silent:
 * a wrong ease curve just means he reviews the wrong things for months and
 * never finds out. Hence the test file next door.
 */

export const EASE_FLOOR = 1.3;
export const EASE_START = 2.5;

/** SM-2 quality values for the four buttons the UI shows. */
const QUALITY: Record<Grade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export function newReview(cardId: string, today: DayKey): Review {
  return {
    cardId,
    state: 'new',
    due: today,
    intervalDays: 0,
    ease: EASE_START,
    reps: 0,
    lapses: 0,
  };
}

function nextEase(ease: number, q: number): number {
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return Math.max(EASE_FLOOR, round2(ease + delta));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GradeResult {
  review: Review;
  /** True when the card should reappear later in the same session. */
  requeueNow: boolean;
}

export function grade(
  prev: Review,
  g: Grade,
  today: DayKey,
  now: number = Date.now(),
): GradeResult {
  const q = QUALITY[g];
  const ease = nextEase(prev.ease, q);

  if (g === 'again') {
    return {
      review: {
        ...prev,
        state: 'learning',
        reps: 0,
        lapses: prev.lapses + 1,
        ease,
        intervalDays: 0,
        due: today,
        lastGrade: g,
        lastSeenAt: now,
      },
      requeueNow: true,
    };
  }

  const reps = prev.reps + 1;
  let intervalDays: number;
  if (reps === 1) intervalDays = 1;
  else if (reps === 2) intervalDays = 6;
  else intervalDays = Math.max(1, Math.round(prev.intervalDays * ease));

  // `hard` should not let the interval run away even once the card is mature.
  if (g === 'hard' && reps > 2) {
    intervalDays = Math.max(1, Math.round(prev.intervalDays * 1.2));
  }

  return {
    review: {
      ...prev,
      state: reps >= 2 ? 'review' : 'learning',
      reps,
      ease,
      intervalDays,
      due: addDays(today, intervalDays),
      lastGrade: g,
      lastSeenAt: now,
    },
    requeueNow: false,
  };
}
