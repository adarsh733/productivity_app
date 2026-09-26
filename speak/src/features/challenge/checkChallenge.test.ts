import { describe, expect, it } from 'vitest';
import { checkChallenge, isCountedRep, transcriptContains } from './checkChallenge';
import type { DailyChallenge } from '../../types/contract';

function baseChallenge(over: Partial<DailyChallenge> = {}): DailyChallenge {
  return {
    date: '2026-09-26',
    title: 'Give a 45-second update — keep it soft',
    voiceGoal: 'softer',
    targetSec: 45,
    useWord: 'nuance',
    avoidPhrase: 'revert back',
    ...over,
  };
}

describe('checkChallenge', () => {
  it('long enough needs a counted rep and 80% of targetSec', () => {
    const c = baseChallenge({ useWord: undefined, avoidPhrase: undefined, voiceGoal: 'pause_first' });
    // 45 * 0.8 = 36
    expect(
      checkChallenge(c, { durationSec: 40, pauseCount: 3 }).longEnough,
    ).toBe(true);
    expect(
      checkChallenge(c, { durationSec: 20, pauseCount: 3 }).longEnough,
    ).toBe(false);
    // Too short to count at all (< 2 s)
    expect(checkChallenge(c, { durationSec: 1, pauseCount: 3 }).longEnough).toBe(false);
    // Voiced too little
    expect(
      checkChallenge(c, { durationSec: 40, voicedSec: 0.5, pauseCount: 3 }).longEnough,
    ).toBe(false);
  });

  it('word and phrase use the transcript with word boundaries', () => {
    expect(transcriptContains('I used nuance well', 'nuance')).toBe(true);
    expect(transcriptContains('I used nuances well', 'nuance')).toBe(false);
    const c = baseChallenge();
    const ok = checkChallenge(
      c,
      { durationSec: 40, transcript: 'I added nuance to the update', avgDb: -25 },
      { baselineDb: -20 },
    );
    expect(ok.usedWord).toBe(true);
    expect(ok.avoidedPhrase).toBe(true);
    const bad = checkChallenge(
      c,
      { durationSec: 40, transcript: 'I will revert back tomorrow with nuance', avgDb: -25 },
      { baselineDb: -20 },
    );
    expect(bad.usedWord).toBe(true);
    expect(bad.avoidedPhrase).toBe(false);
    expect(bad.done).toBe(false);
  });

  it('softer needs 3 dB below normal; missing numbers give null', () => {
    const c = baseChallenge({ voiceGoal: 'softer', useWord: undefined, avoidPhrase: undefined });
    expect(
      checkChallenge(c, { durationSec: 40, avgDb: -24 }, { baselineDb: -20 }).voiceGoalMet,
    ).toBe(true);
    expect(
      checkChallenge(c, { durationSec: 40, avgDb: -21 }, { baselineDb: -20 }).voiceGoalMet,
    ).toBe(false);
    expect(checkChallenge(c, { durationSec: 40 }, { baselineDb: -20 }).voiceGoalMet).toBe(null);
    expect(checkChallenge(c, { durationSec: 40, avgDb: -24 }, {}).voiceGoalMet).toBe(null);
  });

  it('slower needs WPM at or below baseline minus 5%; missing gives null', () => {
    const c = baseChallenge({ voiceGoal: 'slower', useWord: undefined, avoidPhrase: undefined });
    expect(
      checkChallenge(c, { durationSec: 40, wpm: 150 }, { paceBaseline: 160 }).voiceGoalMet,
    ).toBe(true);
    expect(
      checkChallenge(c, { durationSec: 40, wpm: 155 }, { paceBaseline: 160 }).voiceGoalMet,
    ).toBe(false);
    expect(checkChallenge(c, { durationSec: 40 }, { paceBaseline: 160 }).voiceGoalMet).toBe(null);
    expect(checkChallenge(c, { durationSec: 40, wpm: 120 }, {}).voiceGoalMet).toBe(null);
  });

  it('pause_first needs at least 2 pauses; missing gives null', () => {
    const c = baseChallenge({ voiceGoal: 'pause_first', useWord: undefined, avoidPhrase: undefined });
    expect(checkChallenge(c, { durationSec: 40, pauseCount: 2 }).voiceGoalMet).toBe(true);
    expect(checkChallenge(c, { durationSec: 40, pauseCount: 1 }).voiceGoalMet).toBe(false);
    expect(checkChallenge(c, { durationSec: 40 }).voiceGoalMet).toBe(null);
  });

  it('null transcript means null word/phrase checks, never a guess', () => {
    const c = baseChallenge();
    const r = checkChallenge(c, { durationSec: 40, avgDb: -25 }, { baselineDb: -20 });
    expect(r.usedWord).toBe(null);
    expect(r.avoidedPhrase).toBe(null);
  });

  it('no word or phrase set means null (nothing to check)', () => {
    const c = baseChallenge({ useWord: undefined, avoidPhrase: undefined });
    const r = checkChallenge(
      c,
      { durationSec: 40, transcript: 'anything here', pauseCount: 3 },
    );
    expect(r.usedWord).toBe(null);
    expect(r.avoidedPhrase).toBe(null);
    expect(r.done).toBe(true);
  });

  it('isCountedRep matches the speaking path: 2 s and voiced floor', () => {
    expect(isCountedRep(2)).toBe(true);
    expect(isCountedRep(1.9)).toBe(false);
    expect(isCountedRep(10, 1.5)).toBe(true);
    expect(isCountedRep(10, 1.4)).toBe(false);
  });
});
