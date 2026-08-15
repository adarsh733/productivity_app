import { describe, expect, it } from 'vitest';
import {
  DbAccumulator,
  DEFAULT_TARGET_BAND,
  PhonationDetector,
  calculateRms,
  classifyVolumeBand,
  dbToPercent,
  noiseFloorFromDbs,
  rmsToDb,
} from './audioMeter';
import { LAB_RULES } from '../types/contract';

describe('audioMeter math engine', () => {
  it('calculates RMS correctly for silence and constant signals', () => {
    const silence = new Float32Array([0, 0, 0, 0]);
    expect(calculateRms(silence)).toBe(0);

    const constantSignal = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(calculateRms(constantSignal)).toBeCloseTo(0.5);
  });

  it('converts RMS to dB correctly', () => {
    expect(rmsToDb(0)).toBe(-60);
    expect(rmsToDb(1.0)).toBeCloseTo(0, 1);
    expect(rmsToDb(0.1)).toBeCloseTo(-20, 1);
  });

  it('maps dB values to percentages correctly', () => {
    expect(dbToPercent(-60)).toBe(0);
    expect(dbToPercent(0)).toBe(100);
    expect(dbToPercent(-30)).toBe(50);
  });

  it('classifies volume levels into target bands', () => {
    expect(classifyVolumeBand(-45, DEFAULT_TARGET_BAND)).toBe('low');
    expect(classifyVolumeBand(-20, DEFAULT_TARGET_BAND)).toBe('target');
    expect(classifyVolumeBand(-5, DEFAULT_TARGET_BAND)).toBe('high');
  });
});

describe('noiseFloorFromDbs', () => {
  it('takes the quiet decile, so a transient cannot raise the floor', () => {
    const quiet = Array.from({ length: 50 }, () => -52);
    const withCough = [...quiet, ...Array.from({ length: 5 }, () => -12)];
    // A plain mean would land near -48. The floor must stay where the room is.
    expect(noiseFloorFromDbs(withCough)).toBeCloseTo(-52, 1);
  });

  it('returns the meter floor when it has nothing to go on', () => {
    expect(noiseFloorFromDbs([])).toBe(-60);
  });
});

describe('DbAccumulator', () => {
  it('is undefined until a voiced frame arrives', () => {
    const acc = new DbAccumulator();
    expect(acc.mean).toBeUndefined();
    acc.push(-70);
    expect(acc.mean).toBeUndefined();
  });

  it('ignores silence, so pausing cannot lower the session average', () => {
    const speaking = new DbAccumulator();
    speaking.push(-20);
    speaking.push(-24);

    const speakingWithPauses = new DbAccumulator();
    speakingWithPauses.push(-20);
    speakingWithPauses.push(-60);
    speakingWithPauses.push(-58);
    speakingWithPauses.push(-24);

    expect(speakingWithPauses.mean).toBe(speaking.mean);
    expect(speakingWithPauses.voicedFrames).toBe(2);
  });

  it('resets cleanly between steps', () => {
    const acc = new DbAccumulator();
    acc.push(-10);
    acc.reset();
    expect(acc.mean).toBeUndefined();
    expect(acc.voicedFrames).toBe(0);
  });
});

describe('PhonationDetector', () => {
  /** Drive the detector with a level held for a span, 50 ms per frame. */
  function feed(d: PhonationDetector, db: number, ms: number, from: number): number {
    for (let t = from; t < from + ms; t += 50) d.push(db, t);
    return from + ms;
  }

  it('measures a clean hold to the last voiced frame, not to the cutoff', () => {
    const d = new PhonationDetector();
    let t = 1000;
    t = feed(d, -20, 10_000, t); // 10 s of steady tone
    feed(d, -60, 1000, t); // then silence

    expect(d.current).toBe('stopped');
    // 10 s of tone, credited without the 400 ms it took to be sure it stopped.
    expect(d.durationSec()).toBeGreaterThanOrEqual(9.9);
    expect(d.durationSec()).toBeLessThanOrEqual(10.1);
  });

  it('does not split a hold that wavers below the onset threshold', () => {
    const d = new PhonationDetector();
    let t = 0;
    t = feed(d, -20, 4000, t);
    // Dips under the onset level (-40) but stays above release (-47).
    t = feed(d, -44, 600, t);
    t = feed(d, -20, 4000, t);
    feed(d, -60, 1000, t);

    expect(d.current).toBe('stopped');
    expect(d.durationSec()).toBeCloseTo(8.6, 0);
  });

  it('does not stop on a brief dip shorter than the release hold', () => {
    const d = new PhonationDetector();
    let t = 0;
    t = feed(d, -20, 3000, t);
    t = feed(d, -58, 200, t); // 200 ms silence — under the 400 ms hold
    t = feed(d, -20, 3000, t);

    expect(d.current).toBe('phonating');
    expect(d.durationSec(t)).toBeGreaterThan(6);
  });

  it('discards a throat-clear as a false start and rearms', () => {
    const d = new PhonationDetector();
    let t = 0;
    t = feed(d, -18, 500, t); // 0.5 s — under minDurationMs
    t = feed(d, -60, 1000, t);

    expect(d.current).toBe('idle');
    expect(d.durationSec()).toBe(0);

    // The real hold that follows is measured normally.
    t = feed(d, -20, 8000, t);
    feed(d, -60, 1000, t);
    expect(d.current).toBe('stopped');
    expect(d.durationSec()).toBeCloseTo(8, 0);
  });

  it('stays idle through a silent room', () => {
    const d = new PhonationDetector();
    feed(d, -55, 5000, 0);
    expect(d.current).toBe('idle');
    expect(d.durationSec()).toBe(0);
  });

  it('ignores further input once stopped, so one step scores one hold', () => {
    const d = new PhonationDetector();
    let t = feed(d, -20, 5000, 0);
    t = feed(d, -60, 1000, t);
    const measured = d.durationSec();

    feed(d, -20, 5000, t);
    expect(d.durationSec()).toBe(measured);
  });
});

describe('LAB_RULES', () => {
  it('keeps the release threshold below the onset threshold', () => {
    // Without this gap a wavering hold ratchets between states and a 25 s hold
    // is scored as several short ones.
    const { onsetDb, releaseDb } = new PhonationDetector()['opts'] as {
      onsetDb: number;
      releaseDb: number;
    };
    expect(releaseDb).toBeLessThan(onsetDb);
  });

  it('states the MPT gap as a deficit that shrinks', () => {
    expect(LAB_RULES.MPT_GAP_TARGET_SEC).toBeLessThan(LAB_RULES.MPT_GAP_BASELINE_SEC);
  });
});
