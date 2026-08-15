import { describe, expect, it } from 'vitest';
import {
  DriftDetector,
  calibrationRemaining,
  deltaFromBaseline,
  effectiveBand,
  isCalibrated,
  isMptDue,
  liveBandFromBaseline,
  readMpt,
  targetAverageBand,
  updateCalibration,
} from './calibration';
import { DEFAULT_TARGET_BAND } from '../../lib/audioMeter';
import { LAB_RULES, type VoiceSample } from '../../types/contract';

describe('personal band', () => {
  it('puts the session target 6–8 dB below his own baseline', () => {
    const band = targetAverageBand(-20);
    expect(band.minDb).toBe(-28);
    expect(band.maxDb).toBe(-26);
  });

  it('widens the live band around the same centre', () => {
    const target = targetAverageBand(-20);
    const live = liveBandFromBaseline(-20);
    const centre = (target.minDb + target.maxDb) / 2;

    expect((live.minDb + live.maxDb) / 2).toBeCloseTo(centre, 5);
    // A 2 dB live window would read as permanently wrong and be ignored.
    expect(live.maxDb - live.minDb).toBeGreaterThan(target.maxDb - target.minDb);
    expect(live.maxDb - live.minDb).toBe(LAB_RULES.LIVE_BAND_HALF_WIDTH_DB * 2);
  });

  it('moves with the baseline rather than sitting on a fixed dB', () => {
    const quietPhone = liveBandFromBaseline(-30);
    const loudPhone = liveBandFromBaseline(-14);
    expect(quietPhone.minDb).not.toBe(loudPhone.minDb);
    expect(loudPhone.minDb - quietPhone.minDb).toBeCloseTo(16, 5);
  });
});

describe('calibration', () => {
  it('needs a full week before the band is his', () => {
    let profile = {} as { baselineDb?: number; calibrationSamples?: number };
    expect(isCalibrated(profile)).toBe(false);
    expect(calibrationRemaining(profile)).toBe(LAB_RULES.CALIBRATION_SESSIONS);

    for (let i = 0; i < LAB_RULES.CALIBRATION_SESSIONS - 1; i++) {
      profile = { ...profile, ...updateCalibration(profile, -20) };
      expect(isCalibrated(profile)).toBe(false);
    }

    profile = { ...profile, ...updateCalibration(profile, -20) };
    expect(isCalibrated(profile)).toBe(true);
    expect(calibrationRemaining(profile)).toBe(0);
  });

  it('averages rather than letting the latest session win', () => {
    let profile = {} as { baselineDb?: number; calibrationSamples?: number };
    profile = { ...profile, ...updateCalibration(profile, -20) };
    profile = { ...profile, ...updateCalibration(profile, -20) };
    profile = { ...profile, ...updateCalibration(profile, -20) };
    // One session in a noisy room must not relocate his target for good.
    profile = { ...profile, ...updateCalibration(profile, -8) };

    expect(profile.baselineDb).toBeCloseTo(-17, 1);
  });

  it('opens the band only once the threshold is crossed', () => {
    let profile = {} as {
      baselineDb?: number;
      calibrationSamples?: number;
      targetBandDb?: { minDb: number; maxDb: number };
    };
    for (let i = 0; i < LAB_RULES.CALIBRATION_SESSIONS - 1; i++) {
      profile = { ...profile, ...updateCalibration(profile, -20) };
    }
    expect(profile.targetBandDb).toBeUndefined();

    profile = { ...profile, ...updateCalibration(profile, -20) };
    expect(profile.targetBandDb).toEqual(liveBandFromBaseline(-20));
  });

  it('serves the neutral placeholder until then, never a made-up personal band', () => {
    expect(effectiveBand({ calibrationSamples: 3, baselineDb: -20 })).toEqual(
      DEFAULT_TARGET_BAND,
    );
    expect(
      effectiveBand({
        calibrationSamples: LAB_RULES.CALIBRATION_SESSIONS,
        baselineDb: -20,
        targetBandDb: liveBandFromBaseline(-20),
      }),
    ).toEqual(liveBandFromBaseline(-20));
  });

  it('reports distance from baseline signed so quieter reads negative', () => {
    expect(deltaFromBaseline(-27, -20)).toBe(-7);
    expect(deltaFromBaseline(-14, -20)).toBe(6);
  });
});

describe('readMpt — the gap is a deficit', () => {
  it('does not congratulate the baseline gap', () => {
    // 15 s habitual vs 25 s soft is exactly the measured starting point.
    const r = readMpt(15, 25);
    expect(r.gapSec).toBe(10);
    expect(r.verdict).toBe('baseline');
    expect(r.message).not.toMatch(/great|excellent|well done/i);
  });

  it('calls a gap under 3 s the target', () => {
    const r = readMpt(24, 25);
    expect(r.gapSec).toBe(1);
    expect(r.verdict).toBe('target');
  });

  it('recognises progress between the two', () => {
    expect(readMpt(20, 25).verdict).toBe('improving');
  });

  it('ranks a narrower gap as better, never worse', () => {
    const order = { baseline: 0, improving: 1, target: 2 } as const;
    const wide = readMpt(15, 25);
    const narrow = readMpt(23, 25);
    expect(order[narrow.verdict]).toBeGreaterThan(order[wide.verdict]);
  });

  it('reports how much faster the habitual voice spends air', () => {
    expect(readMpt(15, 25).airRatio).toBeCloseTo(1.67, 1);
    expect(readMpt(25, 25).airRatio).toBe(1);
  });

  it('treats a habitual hold that beats the soft one as on target', () => {
    const r = readMpt(26, 25);
    expect(r.gapSec).toBeLessThan(0);
    expect(r.verdict).toBe('target');
  });
});

describe('isMptDue — weekly, not daily', () => {
  const sample = (date: string): VoiceSample => ({
    id: 'x',
    at: Date.parse(`${date}T10:00:00`),
    date,
    kind: 'mpt_habitual',
    value: 15,
  });

  it('is due when it has never been taken', () => {
    expect(isMptDue(undefined, '2026-08-13')).toBe(true);
  });

  it('is not due the day after', () => {
    expect(isMptDue(sample('2026-08-12'), '2026-08-13')).toBe(false);
  });

  it('is due again after seven days', () => {
    expect(isMptDue(sample('2026-08-06'), '2026-08-13')).toBe(true);
    expect(isMptDue(sample('2026-08-07'), '2026-08-13')).toBe(false);
  });
});

describe('DriftDetector', () => {
  const band = { minDb: -30, maxDb: -20 };

  function hold(d: DriftDetector, db: number, ms: number, from: number) {
    let last: string = 'ok';
    for (let t = from; t < from + ms; t += 100) last = d.push(db, t);
    return { at: from + ms, last };
  }

  it('says nothing about one loud syllable', () => {
    const d = new DriftDetector(band);
    hold(d, -25, 3000, 0);
    // A single stressed word, 300 ms.
    const r = hold(d, -8, 300, 3000);
    expect(r.last).toBe('ok');
  });

  it('reports sustained over-drive once it has held long enough', () => {
    const d = new DriftDetector(band);
    const r = hold(d, -10, 5000, 0);
    expect(r.last).toBe('over');
  });

  it('holds its tongue before the hold time elapses', () => {
    const d = new DriftDetector(band);
    const r = hold(d, -10, 800, 0);
    expect(r.last).toBe('ok');
  });

  it('does not call a pause "too quiet"', () => {
    const d = new DriftDetector(band);
    hold(d, -25, 2000, 0);
    // Pausing is trained elsewhere in the routine; flagging it would fight that.
    const r = hold(d, -58, 5000, 2000);
    expect(r.last).toBe('ok');
  });

  it('clears once he comes back into the band', () => {
    const d = new DriftDetector(band);
    let at = hold(d, -10, 5000, 0).at;
    const back = hold(d, -25, 4000, at);
    expect(back.last).toBe('ok');
    at = back.at;
  });

  it('reports under-drive too, for a voice that has gone inaudible', () => {
    const d = new DriftDetector(band);
    const r = hold(d, -40, 5000, 0);
    expect(r.last).toBe('under');
  });
});
