/**
 * The policy layer — what the numbers from `lib/audioMeter.ts` mean.
 *
 * Everything here is relative to his own measured baseline, because absolute
 * dBFS off a phone microphone is not a comparable quantity (PLAN.md §3). A
 * band, a nudge or a verdict computed from an authored constant would look
 * authoritative and be meaningless.
 *
 * No component computes any of this. `MptTracker` once decided for itself what
 * a loud-to-soft gap meant and got it exactly backwards — it congratulated a
 * wide gap, which is the defect the whole phase exists to close.
 */

import type { MptVerdict, Profile, TargetBandDb, VoiceSample } from '../../types/contract';
import { LAB_RULES } from '../../types/contract';
import { DEFAULT_TARGET_BAND } from '../../lib/audioMeter';
import { daysBetween, todayKey } from '../../lib/date';

// ─────────────────────────────────────────────────────────────────────────────
// Week-one calibration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the *session average* should land. A 2 dB window — narrow on purpose,
 * because an average over ten minutes of speech is a stable quantity.
 */
export function targetAverageBand(baselineDb: number): TargetBandDb {
  return {
    minDb: baselineDb + LAB_RULES.TARGET_OFFSET_DB.quietest,
    maxDb: baselineDb + LAB_RULES.TARGET_OFFSET_DB.loudest,
  };
}

/**
 * What the live meter shows: the same target, widened so a real voice can live
 * inside it. Centred on the midpoint of `targetAverageBand`.
 */
export function liveBandFromBaseline(baselineDb: number): TargetBandDb {
  const target = targetAverageBand(baselineDb);
  const centre = (target.minDb + target.maxDb) / 2;
  const half = LAB_RULES.LIVE_BAND_HALF_WIDTH_DB;
  return { minDb: centre - half, maxDb: centre + half };
}

export function isCalibrated(profile: Pick<Profile, 'baselineDb' | 'calibrationSamples'>): boolean {
  return (
    profile.baselineDb !== undefined &&
    (profile.calibrationSamples ?? 0) >= LAB_RULES.CALIBRATION_SESSIONS
  );
}

/** Sessions of habitual speech still needed before the band opens. */
export function calibrationRemaining(profile: Pick<Profile, 'calibrationSamples'>): number {
  return Math.max(0, LAB_RULES.CALIBRATION_SESSIONS - (profile.calibrationSamples ?? 0));
}

/**
 * The band the meter should use right now.
 *
 * Before calibration completes this is the neutral placeholder, and the UI must
 * say so — showing a provisional band as if it were his would train him toward
 * a number that came from nowhere.
 */
export function effectiveBand(
  profile: Pick<Profile, 'baselineDb' | 'calibrationSamples' | 'targetBandDb'>,
): TargetBandDb {
  if (!isCalibrated(profile)) return DEFAULT_TARGET_BAND;
  return profile.targetBandDb ?? liveBandFromBaseline(profile.baselineDb!);
}

/**
 * Fold one habitual-speech sample into the running baseline.
 *
 * A running mean rather than "latest wins": one session in a noisy room would
 * otherwise move his target for good. Returns only the fields that changed, so
 * the caller can spread it over the stored profile.
 */
export function updateCalibration(
  profile: Pick<Profile, 'baselineDb' | 'calibrationSamples'>,
  sampleDb: number,
  now: number = Date.now(),
): Pick<Profile, 'baselineDb' | 'calibrationSamples' | 'targetBandDb' | 'calibratedAt'> {
  const n = profile.calibrationSamples ?? 0;
  const prev = profile.baselineDb ?? sampleDb;
  const baselineDb = n === 0 ? sampleDb : (prev * n + sampleDb) / (n + 1);
  const samples = n + 1;

  const out: ReturnType<typeof updateCalibration> = {
    baselineDb: Math.round(baselineDb * 10) / 10,
    calibrationSamples: samples,
  };

  // The band opens once, at the threshold, and then keeps tracking — his
  // baseline is a habit and the whole point is that it moves.
  if (samples >= LAB_RULES.CALIBRATION_SESSIONS) {
    out.targetBandDb = liveBandFromBaseline(out.baselineDb!);
    out.calibratedAt = now;
  }

  return out;
}

/** How far below his own baseline a reading sits. Negative is quieter. */
export function deltaFromBaseline(db: number, baselineDb: number): number {
  return Math.round((db - baselineDb) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// MPT — the headline number and the gap
// ─────────────────────────────────────────────────────────────────────────────

export interface MptReading {
  habitualSec: number;
  softSec: number;
  /**
   * Soft minus habitual, in seconds. **A deficit: smaller is better.**
   * Baseline ~10 s (15 s loud vs 25 s soft), 12-week target < 3 s.
   */
  gapSec: number;
  /**
   * How much faster the habitual voice spends air than the soft one.
   * 25 s ÷ 15 s = 1.7× at baseline. 1.0 is the goal.
   */
  airRatio: number;
  verdict: MptVerdict;
  /** One line, written to be read on a phone. Never congratulates a wide gap. */
  message: string;
}

export function readMpt(habitualSec: number, softSec: number): MptReading {
  const gapSec = Math.round((softSec - habitualSec) * 10) / 10;
  const airRatio = habitualSec > 0 ? Math.round((softSec / habitualSec) * 100) / 100 : 0;

  let verdict: MptVerdict;
  let message: string;

  if (gapSec <= LAB_RULES.MPT_GAP_TARGET_SEC) {
    verdict = 'target';
    message = `Gap ${gapSec.toFixed(1)}s — your normal voice now costs about what your soft one does. This is the target.`;
  } else if (gapSec < LAB_RULES.MPT_GAP_BASELINE_SEC * 0.7) {
    verdict = 'improving';
    message = `Gap ${gapSec.toFixed(1)}s, down from 10s. Keep closing it — under 3s is the goal.`;
  } else {
    verdict = 'baseline';
    message = `Gap ${gapSec.toFixed(1)}s. Your normal voice burns air ${airRatio.toFixed(1)}× faster than your soft one — that gap is the habit, not your lungs.`;
  }

  return { habitualSec, softSec, gapSec, airRatio, verdict, message };
}

/**
 * MPT is a **weekly** measure (VOICE-PROFILE.md §7), not a daily one. Measuring
 * it every day invites pushing for a record, and the number is only meaningful
 * when it is taken as the habit actually is.
 */
export function isMptDue(lastSample: VoiceSample | undefined, today: string = todayKey()): boolean {
  if (!lastSample) return true;
  return daysBetween(lastSample.date, today) >= LAB_RULES.MPT_INTERVAL_DAYS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift — the nudge in M11
// ─────────────────────────────────────────────────────────────────────────────

export type Drift = 'ok' | 'over' | 'under';

/**
 * Decides when the meter is allowed to say something.
 *
 * Speech swings roughly 20 dB inside a single sentence, so classifying each
 * frame against the band would flash a warning on every stressed syllable —
 * and a warning that fires constantly is one he stops seeing within a day.
 * This averages over a short window and only speaks once the *average* has sat
 * outside the band for `DRIFT_HOLD_MS`.
 */
export class DriftDetector {
  private samples: { db: number; at: number }[] = [];
  private outsideSince: number | null = null;
  private lastDirection: Drift = 'ok';

  constructor(
    private band: TargetBandDb,
    private readonly windowMs: number = LAB_RULES.DRIFT_WINDOW_MS,
    private readonly holdMs: number = LAB_RULES.DRIFT_HOLD_MS,
  ) {}

  setBand(band: TargetBandDb): void {
    this.band = band;
  }

  push(db: number, atMs: number): Drift {
    // Silence is not drift. Pauses are actively encouraged elsewhere in the
    // routine, so counting them as "too quiet" would fight the training.
    if (db > LAB_RULES.SILENCE_FLOOR_DB) {
      this.samples.push({ db, at: atMs });
    }
    const cutoff = atMs - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.at < cutoff) this.samples.shift();

    if (this.samples.length === 0) {
      this.outsideSince = null;
      this.lastDirection = 'ok';
      return 'ok';
    }

    const mean = this.samples.reduce((s, x) => s + x.db, 0) / this.samples.length;
    const direction: Drift =
      mean > this.band.maxDb ? 'over' : mean < this.band.minDb ? 'under' : 'ok';

    if (direction === 'ok' || direction !== this.lastDirection) {
      this.outsideSince = direction === 'ok' ? null : atMs;
      this.lastDirection = direction;
      return 'ok';
    }

    if (this.outsideSince !== null && atMs - this.outsideSince >= this.holdMs) {
      return direction;
    }
    return 'ok';
  }

  reset(): void {
    this.samples = [];
    this.outsideSince = null;
    this.lastDirection = 'ok';
  }
}
