import { describe, expect, it } from 'vitest';
import { EASE_FLOOR, EASE_START, grade, newReview } from './scheduler';
import type { Grade, Review } from '../types/contract';

const T = '2026-08-11';

function run(grades: Grade[], today = T): Review {
  let r = newReview('c1', today);
  for (const g of grades) r = grade(r, g, today).review;
  return r;
}

describe('newReview', () => {
  it('starts new, due today, at the standard ease', () => {
    const r = newReview('c1', T);
    expect(r.state).toBe('new');
    expect(r.due).toBe(T);
    expect(r.ease).toBe(EASE_START);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(0);
  });
});

describe('the standard interval ladder', () => {
  it('goes 1 day, then 6 days, then interval * ease', () => {
    let r = newReview('c1', T);

    r = grade(r, 'good', T).review;
    expect(r.intervalDays).toBe(1);
    expect(r.due).toBe('2026-08-12');
    expect(r.state).toBe('learning');

    r = grade(r, 'good', T).review;
    expect(r.intervalDays).toBe(6);
    expect(r.due).toBe('2026-08-17');
    expect(r.state).toBe('review');

    // ease after two `good` grades is unchanged at 2.5 → 6 * 2.5 = 15
    r = grade(r, 'good', T).review;
    expect(r.ease).toBe(2.5);
    expect(r.intervalDays).toBe(15);
  });
});

describe('ease movement', () => {
  it('leaves ease alone on `good`', () => {
    expect(run(['good', 'good']).ease).toBe(2.5);
  });

  it('drops ease on `hard`', () => {
    expect(run(['hard']).ease).toBeCloseTo(2.36, 2);
  });

  it('raises ease on `easy`', () => {
    expect(run(['easy']).ease).toBeCloseTo(2.6, 2);
  });

  it('drops ease hard on `again`', () => {
    expect(run(['again']).ease).toBeCloseTo(1.96, 2);
  });

  it('never falls below the floor, however many failures', () => {
    const r = run(Array<Grade>(20).fill('again'));
    expect(r.ease).toBe(EASE_FLOOR);
  });
});

describe('again', () => {
  it('resets reps, counts a lapse, and asks to be requeued this session', () => {
    let r = newReview('c1', T);
    r = grade(r, 'good', T).review;
    r = grade(r, 'good', T).review;
    expect(r.reps).toBe(2);

    const res = grade(r, 'again', T);
    expect(res.requeueNow).toBe(true);
    expect(res.review.reps).toBe(0);
    expect(res.review.lapses).toBe(1);
    expect(res.review.intervalDays).toBe(0);
    expect(res.review.due).toBe(T);
    expect(res.review.state).toBe('learning');
  });

  it('does not requeue on any passing grade', () => {
    const r = newReview('c1', T);
    for (const g of ['hard', 'good', 'easy'] as Grade[]) {
      expect(grade(r, g, T).requeueNow).toBe(false);
    }
  });
});

describe('hard on a mature card', () => {
  it('grows the interval slowly instead of by ease', () => {
    // Build a mature card: interval 15, ease 2.5.
    let r = run(['good', 'good', 'good']);
    expect(r.intervalDays).toBe(15);

    r = grade(r, 'hard', T).review;
    // 15 * 1.2 = 18, not 15 * (dropped ease) = ~35
    expect(r.intervalDays).toBe(18);
  });
});

describe('intervals never collapse to zero', () => {
  it('keeps a minimum of one day for any passing grade', () => {
    const stuck: Review = {
      cardId: 'c1',
      state: 'review',
      due: T,
      intervalDays: 1,
      ease: EASE_FLOOR,
      reps: 9,
      lapses: 8,
    };
    expect(grade(stuck, 'hard', T).review.intervalDays).toBeGreaterThanOrEqual(1);
    expect(grade(stuck, 'good', T).review.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('lastSeenAt', () => {
  it('records the grading time', () => {
    const r = grade(newReview('c1', T), 'good', T, 1_700_000_000_000).review;
    expect(r.lastSeenAt).toBe(1_700_000_000_000);
    expect(r.lastGrade).toBe('good');
  });
});
