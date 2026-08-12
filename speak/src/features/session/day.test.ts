import { describe, expect, it } from 'vitest';
import { coreThreeComplete, currentStreak, emptyDay, isPass } from './day';
import type { DayKey, DayRecord } from '../../types/contract';

function days(done: DayKey[]): Map<DayKey, DayRecord> {
  const m = new Map<DayKey, DayRecord>();
  for (const d of done) m.set(d, { ...emptyDay(d), coreThreeDone: true });
  return m;
}

describe('coreThreeComplete', () => {
  it('needs all three types', () => {
    expect(coreThreeComplete(['breath', 'say_it', 'word'])).toBe(true);
    expect(coreThreeComplete(['breath', 'say_it'])).toBe(false);
    expect(coreThreeComplete(['word', 'word', 'word'])).toBe(false);
  });

  it('ignores extra types', () => {
    expect(coreThreeComplete(['idiom', 'breath', 'swap', 'say_it', 'word'])).toBe(true);
  });
});

describe('isPass', () => {
  it('treats only `again` as a failure', () => {
    expect(isPass('again')).toBe(false);
    expect(isPass('hard')).toBe(true);
    expect(isPass('good')).toBe(true);
    expect(isPass('easy')).toBe(true);
  });
});

describe('currentStreak', () => {
  it('counts consecutive completed days', () => {
    const m = days(['2026-08-09', '2026-08-10', '2026-08-11']);
    expect(currentStreak(m, '2026-08-11')).toBe(3);
  });

  it('does not zero out just because today is not done yet', () => {
    const m = days(['2026-08-09', '2026-08-10']);
    expect(currentStreak(m, '2026-08-11')).toBe(2);
  });

  it('absorbs up to two missed days in a month', () => {
    // 5th missed, 8th missed — both inside the allowance.
    const m = days(['2026-08-04', '2026-08-06', '2026-08-07', '2026-08-09', '2026-08-10']);
    expect(currentStreak(m, '2026-08-10')).toBe(5);
  });

  it('breaks on the third miss in a month', () => {
    const m = days(['2026-08-01', '2026-08-03', '2026-08-05', '2026-08-07', '2026-08-09']);
    // Walking back from the 9th: 8th and 6th are absorbed by the two grace
    // days, the 4th is the third miss and ends it — so 9th, 7th, 5th count.
    expect(currentStreak(m, '2026-08-09')).toBe(3);
  });

  it('is zero when nothing has ever been done', () => {
    expect(currentStreak(new Map(), '2026-08-11')).toBe(0);
  });

  it('does not spend grace before the streak has started', () => {
    // Nothing done for days — this is not a 2-day streak on credit.
    const m = days(['2026-08-01']);
    expect(currentStreak(m, '2026-08-11')).toBe(0);
  });

  it('terminates on a long empty history', () => {
    expect(currentStreak(days(['2020-01-01']), '2026-08-11')).toBe(0);
  });
});
