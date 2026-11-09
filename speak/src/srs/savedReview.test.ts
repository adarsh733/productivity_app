import { describe, expect, it } from 'vitest';
import type { ModuleCard, SavedReview } from '../types/contract';
import { toDayKey } from '../lib/date';
import {
  RETIRE_AFTER_RIGHTS,
  SAVED_REVIEW_DAYS,
  answerSavedReview,
  newSavedReview,
  reviewDue,
} from './savedReview';

const card = { id: 'w-1', module: 'words', type: 'module' } as unknown as ModuleCard;

describe('savedReview', () => {
  it('uses 3 days, 1 week, 3 weeks and retires after 3 rights', () => {
    expect([...SAVED_REVIEW_DAYS]).toEqual([3, 7, 21]);
    expect(RETIRE_AFTER_RIGHTS).toBe(3);
  });

  it('newSavedReview is due 3 days after the save, at step 0', () => {
    const now = new Date(2026, 10, 8, 15, 0).getTime();
    const r = newSavedReview(card, now);
    expect(r).toEqual({
      cardId: 'w-1',
      module: 'words',
      savedAt: now,
      step: 0,
      due: '2026-11-11',
      rights: 0,
    });
  });

  it('knew moves to the next step and adds a right', () => {
    const r0 = newSavedReview(card, new Date(2026, 10, 8).getTime());
    const r1 = answerSavedReview(r0, 'knew', '2026-11-11');
    expect(r1.step).toBe(1);
    expect(r1.rights).toBe(1);
    expect(r1.due).toBe('2026-11-18');
    expect(r1.lastAnswer).toBe('knew');
    const r2 = answerSavedReview(r1, 'knew', '2026-11-18');
    expect(r2.step).toBe(2);
    expect(r2.rights).toBe(2);
    expect(r2.due).toBe(toDayKey(new Date(2026, 11, 9)));
    expect(r2.retiredAt).toBeUndefined();
  });

  it('the third right retires the card', () => {
    const r: SavedReview = {
      cardId: 'w-1',
      module: 'words',
      savedAt: 1,
      step: 2,
      due: '2026-12-09',
      rights: 2,
    };
    const done = answerSavedReview(r, 'knew', '2026-12-09');
    expect(done.rights).toBe(3);
    expect(typeof done.retiredAt).toBe('number');
  });

  it('not yet keeps the step and the rights, due in 3 days', () => {
    const r: SavedReview = {
      cardId: 'w-1',
      module: 'words',
      savedAt: 1,
      step: 1,
      due: '2026-11-18',
      rights: 1,
    };
    const again = answerSavedReview(r, 'not_yet', '2026-11-19');
    expect(again.step).toBe(1);
    expect(again.rights).toBe(1);
    expect(again.due).toBe('2026-11-22');
    expect(again.lastAnswer).toBe('not_yet');
    expect(again.retiredAt).toBeUndefined();
  });

  it('answering does not change the row it was given', () => {
    const r = newSavedReview(card, new Date(2026, 10, 8).getTime());
    const copy = { ...r };
    answerSavedReview(r, 'knew', '2026-11-11');
    expect(r).toEqual(copy);
  });

  it('reviewDue lists due, not-retired cards, oldest due first', () => {
    const base = { module: 'words' as const, savedAt: 1, step: 0 as const, rights: 0 };
    const rows: SavedReview[] = [
      { ...base, cardId: 'late', due: '2026-11-09' },
      { ...base, cardId: 'today', due: '2026-11-10' },
      { ...base, cardId: 'future', due: '2026-11-11' },
      { ...base, cardId: 'old', due: '2026-11-05' },
      { ...base, cardId: 'retired', due: '2026-11-01', retiredAt: 5 },
    ];
    expect(reviewDue(rows, '2026-11-10')).toEqual(['old', 'late', 'today']);
    expect(reviewDue([], '2026-11-10')).toEqual([]);
  });
});
