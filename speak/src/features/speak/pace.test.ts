import { describe, expect, it } from 'vitest';
import { paceBaseline, paceTarget } from './pace';

describe('pace baseline and target', () => {
  it('needs 5 valid attempts of 20 s or more', () => {
    const four = [
      { wpm: 150, durationSec: 25, at: 1 },
      { wpm: 160, durationSec: 25, at: 2 },
      { wpm: 155, durationSec: 25, at: 3 },
      { wpm: 165, durationSec: 25, at: 4 },
    ];
    expect(paceBaseline(four)).toBeUndefined();
    expect(paceTarget(undefined)).toEqual({ target: 140, starter: true });
  });

  it('takes the median of the first 5 valid attempts', () => {
    const attempts = [
      { wpm: 150, durationSec: 25, at: 1 },
      { wpm: 160, durationSec: 10, at: 2 }, // too short, ignored
      { wpm: 170, durationSec: 30, at: 3 },
      { wpm: 140, durationSec: 22, at: 4 },
      { wpm: 180, durationSec: 40, at: 5 },
      { wpm: 155, durationSec: 25, at: 6 },
    ];
    // valid in order: 150, 170, 140, 180, 155 → median 155
    expect(paceBaseline(attempts)).toBe(155);
    expect(paceTarget(155)).toEqual({ target: 140, starter: false });
  });

  it('targets baseline minus 10%', () => {
    expect(paceTarget(160)).toEqual({ target: 144, starter: false });
  });
});
