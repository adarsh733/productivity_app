import { describe, expect, it } from 'vitest';
import {
  classifyLadderLevel,
  gradePauseRep,
  longestVoicedStretch,
  paceTargetFor,
  paletteForDay,
} from './drills';

describe('pause-don\'t-push drill', () => {
  it('passes on ≥300 ms gap with the word no louder than +3 dB', () => {
    expect(gradePauseRep({ gapBeforeKeywordMs: 350, keywordDbOverAverage: 2 }).pass).toBe(true);
    expect(gradePauseRep({ gapBeforeKeywordMs: 300, keywordDbOverAverage: 3 }).pass).toBe(true);
  });

  it('fails on a short gap or a loud keyword', () => {
    expect(gradePauseRep({ gapBeforeKeywordMs: 200, keywordDbOverAverage: 1 }).pass).toBe(false);
    expect(gradePauseRep({ gapBeforeKeywordMs: 500, keywordDbOverAverage: 5 }).pass).toBe(false);
  });

  it('reports both measured numbers', () => {
    const r = gradePauseRep({ gapBeforeKeywordMs: 410, keywordDbOverAverage: -1 });
    expect(r.gapMs).toBe(410);
    expect(r.overDb).toBe(-1);
  });
});

describe('level-1 hold timing', () => {
  it('measures the longest continuous voiced stretch', () => {
    const samples = [
      { db: -20, atMs: 0 },
      { db: -20, atMs: 1000 },
      { db: -60, atMs: 1500 },
      { db: -20, atMs: 2000 },
      { db: -20, atMs: 5000 },
    ];
    expect(longestVoicedStretch(samples, -55)).toBe(3);
  });

  it('caps at 60 s', () => {
    const samples = [
      { db: -20, atMs: 0 },
      { db: -20, atMs: 90000 },
    ];
    expect(longestVoicedStretch(samples, -55)).toBe(60);
  });

  it('scores dropout silence as the end of the stretch', () => {
    const samples = [
      { db: -20, atMs: 0 },
      { db: -60, atMs: 500 },
      { db: -60, atMs: 5000 },
    ];
    expect(longestVoicedStretch(samples, -55)).toBe(0.5);
  });
});

describe('ladder + pace + palette helpers', () => {
  it('classifies 5 levels relative to calibrated normal', () => {
    expect(classifyLadderLevel(-14)).toBe(1);
    expect(classifyLadderLevel(-8)).toBe(2);
    expect(classifyLadderLevel(-4)).toBe(3);
    expect(classifyLadderLevel(0)).toBe(4);
    expect(classifyLadderLevel(6)).toBe(5);
  });

  it('uses a 140 starter target until a baseline exists', () => {
    expect(paceTargetFor(undefined)).toEqual({ target: 140, starter: true });
    expect(paceTargetFor(160)).toEqual({ target: 144, starter: false });
  });

  it('rotates two palette modes daily', () => {
    const [a, b] = paletteForDay(0);
    expect(a).not.toBe(b);
    expect(paletteForDay(6)).toEqual(paletteForDay(0));
  });
});
