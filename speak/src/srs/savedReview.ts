import type { DayKey, Millis, ModuleCard, SavedReview } from '../types/contract';
import { addDays, compareDayKeys, todayKey } from '../lib/date';

/** Days after ♡ (step 0), then after the first right (step 1), then after the second (step 2). */
export const SAVED_REVIEW_DAYS = [3, 7, 21] as const;

/** Three "Knew it" answers retire a card from the review. */
export const RETIRE_AFTER_RIGHTS = 3;

/** "Not yet" brings the card back after this many days. */
const NOT_YET_DAYS = 3;

/** A fresh review for a card he just ♡'d: first look in 3 days. */
export function newSavedReview(card: ModuleCard, now: Millis): SavedReview {
  return {
    cardId: card.id,
    module: card.module,
    savedAt: now,
    step: 0,
    due: addDays(todayKey(new Date(now)), SAVED_REVIEW_DAYS[0]),
    rights: 0,
  };
}

/**
 * Knew it: one more right, next step (3 days, then 1 week, then 3 weeks);
 * the third right retires the card. Not yet: same step, back in 3 days.
 */
export function answerSavedReview(
  r: SavedReview,
  answer: 'knew' | 'not_yet',
  today: DayKey,
): SavedReview {
  if (answer === 'not_yet') {
    return { ...r, due: addDays(today, NOT_YET_DAYS), lastAnswer: 'not_yet' };
  }
  const rights = r.rights + 1;
  if (rights >= RETIRE_AFTER_RIGHTS) {
    return { ...r, rights, lastAnswer: 'knew', retiredAt: Date.now() };
  }
  const step = Math.min(r.step + 1, SAVED_REVIEW_DAYS.length - 1) as 0 | 1 | 2;
  return {
    ...r,
    rights,
    step,
    due: addDays(today, SAVED_REVIEW_DAYS[step]),
    lastAnswer: 'knew',
  };
}

/** Card ids due on or before `today`, not retired, oldest due first. */
export function reviewDue(rows: readonly SavedReview[], today: DayKey): string[] {
  return rows
    .filter((r) => r.retiredAt === undefined && compareDayKeys(r.due, today) <= 0)
    .sort((a, b) => compareDayKeys(a.due, b.due) || a.savedAt - b.savedAt)
    .map((r) => r.cardId);
}
