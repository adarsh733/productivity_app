import { describe, expect, it } from 'vitest';
import { addDays } from '../../lib/date';
import { ROTATION, todaysTrack, tracksFrom } from './rotation';

describe('todaysTrack', () => {
  it('walks smalltalk → stories → clearly → words, one a day', () => {
    // 1970-01-01 is day 0 → the loop starts on Small talk.
    expect(todaysTrack('1970-01-01')).toBe('smalltalk');
    expect(todaysTrack('1970-01-02')).toBe('stories');
    expect(todaysTrack('1970-01-03')).toBe('clearly');
    expect(todaysTrack('1970-01-04')).toBe('words');
    expect(todaysTrack('1970-01-05')).toBe('smalltalk');
  });

  it('gives the same answer for the same day and covers all four tracks in any 4 days', () => {
    const start = '2026-10-29';
    expect(todaysTrack(start)).toBe(todaysTrack(start));
    const four = [0, 1, 2, 3].map((i) => todaysTrack(addDays(start, i)));
    expect(new Set(four).size).toBe(4);
  });

  it('keeps the order across a month end and a leap day', () => {
    for (const start of ['2026-10-30', '2028-02-28', '2026-12-30']) {
      const a = todaysTrack(start);
      const b = todaysTrack(addDays(start, 1));
      expect(ROTATION.indexOf(b)).toBe((ROTATION.indexOf(a) + 1) % 4);
    }
  });

  it('works for days before 1970', () => {
    expect(todaysTrack('1969-12-31')).toBe('words');
  });
});

describe('tracksFrom', () => {
  it("puts today's track first and the rest in loop order", () => {
    expect(tracksFrom('1970-01-03')).toEqual(['clearly', 'words', 'smalltalk', 'stories']);
    expect(tracksFrom('1970-01-01')).toEqual(['smalltalk', 'stories', 'clearly', 'words']);
  });
});
