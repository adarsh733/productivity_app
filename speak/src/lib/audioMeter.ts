/**
 * The signal layer — everything that turns a microphone into numbers.
 *
 * Two rules this file exists to hold:
 *
 * 1. **It never decides what a number means.** No target band is authored here,
 *    no verdict is reached here. Absolute dBFS off a phone microphone is not
 *    comparable between devices, rooms or days (PLAN.md §3), so meaning lives
 *    in `features/lab/calibration.ts`, against his own measured baseline.
 * 2. **The maths is pure and the plumbing is thin.** Everything that could be
 *    silently wrong — onset detection, averaging, the noise floor — is a pure
 *    function or a class driven by pushed samples, so it is testable without a
 *    browser. `AudioMeterController` is the only part that needs a device.
 */

import type { MicProfile, TargetBandDb } from '../types/contract';
import { LAB_RULES } from '../types/contract';

export interface VolumeMeasurement {
  rms: number;
  db: number;
  percent: number;
  bandStatus: BandStatus;
}

export type BandStatus = 'low' | 'target' | 'high';

/** Kept as an alias so Phase 0.5 imports still resolve. */
export type TargetBand = TargetBandDb;

/**
 * The band used **only before calibration completes**, so the meter shows
 * something sane on day one. It is a placeholder, not a target — once
 * `Profile.targetBandDb` exists, that wins everywhere. See
 * `features/lab/calibration.ts`.
 */
export const DEFAULT_TARGET_BAND: TargetBandDb = {
  minDb: -32,
  maxDb: -14,
};

/** The practical floor of the meter. Below this we call it silence. */
export const METER_FLOOR_DB = -60;

// ─────────────────────────────────────────────────────────────────────────────
// Pure maths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RMS amplitude (0..1) → decibels relative to full scale.
 * Clamped to [`minDb`, 0]; sub-threshold input reads as the floor rather than
 * as -Infinity, so a silent frame cannot poison an average.
 */
export function rmsToDb(rms: number, minDb: number = METER_FLOOR_DB): number {
  if (rms <= 0.0001) return minDb;
  const db = 20 * Math.log10(rms);
  return Math.max(minDb, Math.min(0, db));
}

/** Maps dBFS onto 0..100 for a meter bar. Linear in dB, which is what reads. */
export function dbToPercent(db: number, minDb: number = METER_FLOOR_DB, maxDb = 0): number {
  if (db <= minDb) return 0;
  if (db >= maxDb) return 100;
  return Math.round(((db - minDb) / (maxDb - minDb)) * 100);
}

/** Where a reading sits relative to a band. The band is always personal. */
export function classifyVolumeBand(
  db: number,
  targetBand: TargetBandDb = DEFAULT_TARGET_BAND,
): BandStatus {
  if (db < targetBand.minDb) return 'low';
  if (db > targetBand.maxDb) return 'high';
  return 'target';
}

/** RMS of a block of raw PCM samples. */
export function calculateRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * The room's noise floor: the quietest tenth of the samples, averaged.
 *
 * A plain mean is wrong here — a cough or a chair scrape drags it up by 20 dB
 * and the meter then treats ordinary silence as speech. Taking the low decile
 * ignores transients, which is exactly what a floor should do.
 */
export function noiseFloorFromDbs(dbs: readonly number[]): number {
  if (dbs.length === 0) return METER_FLOOR_DB;
  const sorted = [...dbs].sort((a, b) => a - b);
  const take = Math.max(1, Math.floor(sorted.length / 10));
  let sum = 0;
  for (let i = 0; i < take; i++) sum += sorted[i]!;
  return sum / take;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session averaging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Running mean of the dB readings taken *while he is actually speaking*.
 *
 * Frames below the silence floor are dropped rather than averaged in. Counting
 * silence would make a session look quieter the more he paused, which would
 * reward the wrong thing outright — the number is meant to track how hard he
 * drives the voice, not how much of the time he used it.
 */
export class DbAccumulator {
  private sum = 0;
  private n = 0;

  constructor(private readonly floorDb: number = LAB_RULES.SILENCE_FLOOR_DB) {}

  push(db: number): void {
    if (db <= this.floorDb) return;
    this.sum += db;
    this.n += 1;
  }

  /** Undefined until at least one voiced frame has been seen. */
  get mean(): number | undefined {
    return this.n === 0 ? undefined : this.sum / this.n;
  }

  get voicedFrames(): number {
    return this.n;
  }

  reset(): void {
    this.sum = 0;
    this.n = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phonation detection — what makes MPT auto-stop honest
// ─────────────────────────────────────────────────────────────────────────────

export type PhonationState = 'idle' | 'phonating' | 'stopped';

export interface PhonationOptions {
  /** Rise above this to be counted as having started. */
  onsetDb: number;
  /**
   * Fall below this to be counted as having stopped. Must be *lower* than
   * `onsetDb` — the gap is the hysteresis, and without it a hold that wavers
   * around one threshold stops and starts several times, scoring a 25-second
   * hold as four short ones.
   */
  releaseDb: number;
  /**
   * How long the signal has to stay below `releaseDb` before we call it over.
   * An MPT hold naturally dips; only a sustained drop is the end of it.
   */
  releaseHoldMs: number;
  /** Holds shorter than this are discarded as a throat-clear or a false start. */
  minDurationMs: number;
}

export const DEFAULT_PHONATION_OPTIONS: PhonationOptions = {
  onsetDb: -40,
  releaseDb: -47,
  releaseHoldMs: 400,
  minDurationMs: 1200,
};

/**
 * Turns a stream of (db, timestamp) readings into one phonation duration.
 *
 * Deliberately a pushed state machine with no timers and no audio types inside
 * it: the whole thing can be driven from an array in a test, which is the only
 * way this stays correct. `MptTracker` previously asked him to stop the clock
 * himself, which measures reaction time as much as breath.
 */
export class PhonationDetector {
  private state: PhonationState = 'idle';
  /** -1 means "not started". Zero is a perfectly valid timestamp. */
  private startedAt = -1;
  private lastAboveRelease = 0;
  private endedAt = 0;
  private readonly opts: PhonationOptions;

  constructor(opts: Partial<PhonationOptions> = {}) {
    this.opts = { ...DEFAULT_PHONATION_OPTIONS, ...opts };
  }

  /** Feed one reading. Returns the state *after* this reading. */
  push(db: number, atMs: number): PhonationState {
    if (this.state === 'stopped') return this.state;

    if (this.state === 'idle') {
      if (db >= this.opts.onsetDb) {
        this.state = 'phonating';
        this.startedAt = atMs;
        this.lastAboveRelease = atMs;
      }
      return this.state;
    }

    // phonating
    if (db >= this.opts.releaseDb) {
      this.lastAboveRelease = atMs;
      return this.state;
    }

    if (atMs - this.lastAboveRelease >= this.opts.releaseHoldMs) {
      const duration = this.lastAboveRelease - this.startedAt;
      if (duration < this.opts.minDurationMs) {
        // A false start. Rearm rather than score it.
        this.state = 'idle';
        this.startedAt = -1;
        return this.state;
      }
      this.state = 'stopped';
      this.endedAt = this.lastAboveRelease;
    }
    return this.state;
  }

  /**
   * Seconds held, to one decimal.
   *
   * While phonating this is the live figure; once stopped it is measured to the
   * last voiced frame, **not** to the moment we noticed — otherwise every hold
   * would be credited with `releaseHoldMs` of silence it did not earn.
   */
  durationSec(nowMs?: number): number {
    if (this.state === 'idle' || this.startedAt < 0) return 0;
    const end = this.state === 'stopped' ? this.endedAt : (nowMs ?? this.lastAboveRelease);
    return Math.max(0, Math.round((end - this.startedAt) / 100) / 10);
  }

  get current(): PhonationState {
    return this.state;
  }

  reset(): void {
    this.state = 'idle';
    this.startedAt = -1;
    this.lastAboveRelease = 0;
    this.endedAt = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The device
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constraints requested for every capture in the app.
 *
 * `autoGainControl: false` is the one that matters: with AGC on, the hardware
 * normalises loudness and a dB meter measures nothing. Whether the browser
 * actually honours it is recorded in `MicProfile.agcDisabled`.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export interface MeterOptions {
  /** The personal band. Falls back to `DEFAULT_TARGET_BAND` before calibration. */
  band?: TargetBandDb;
}

export class AudioMeterController {
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animId: number | null = null;
  // Explicitly ArrayBuffer-backed: `getFloatTimeDomainData` rejects a view that
  // might sit on a SharedArrayBuffer, which is what bare `Float32Array` allows.
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private onMeasureCallback: ((m: VolumeMeasurement) => void) | null = null;
  private band: TargetBandDb = DEFAULT_TARGET_BAND;

  get running(): boolean {
    return this.analyser !== null;
  }

  /**
   * The live capture stream, so a recorder can write the same audio the meter
   * is measuring. Opening a second `getUserMedia` for the recorder would give
   * two independent streams of the same voice — and on iOS the second request
   * can take the first one's track away mid-session.
   */
  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  /** Change the band mid-session without tearing the stream down. */
  setBand(band: TargetBandDb): void {
    this.band = band;
  }

  async start(
    onMeasure: (m: VolumeMeasurement) => void,
    opts: MeterOptions = {},
  ): Promise<boolean> {
    this.onMeasureCallback = onMeasure;
    this.band = opts.band ?? DEFAULT_TARGET_BAND;

    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioCtx = new AudioContextClass();
      // iOS hands back a suspended context when capture starts outside a
      // gesture. Without this the meter reads a flat -60 dB and looks broken.
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      // Low, on purpose. Heavy smoothing hides the fast attack that a driven
      // voice is made of, and it is the attack the nudge needs to catch.
      this.analyser.smoothingTimeConstant = 0.3;
      this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));

      source.connect(this.analyser);
      this.loop();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  private loop = () => {
    if (!this.analyser || !this.onMeasureCallback || !this.buffer) return;

    this.analyser.getFloatTimeDomainData(this.buffer);

    const rms = calculateRms(this.buffer);
    const db = rmsToDb(rms);

    this.onMeasureCallback({
      rms,
      db,
      percent: dbToPercent(db),
      bandStatus: classifyVolumeBand(db, this.band),
    });

    this.animId = requestAnimationFrame(this.loop);
  };

  stop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
    this.buffer = null;
    this.onMeasureCallback = null;
  }
}

/**
 * The real-device microphone test, run by the app on his phone.
 *
 * `PLAN.md` §7 makes a device test a precondition of Phase 1, because iOS
 * Safari in a home-screen PWA is the one environment where capture quietly
 * behaves differently. Doing it in-app rather than off a checklist means the
 * result is a stored fact (`Profile.micProfile`) that a bad reading months
 * later can be checked against.
 *
 * Listens for ~1 second *before he speaks*, so what it captures is the room.
 */
export async function runMicSelfTest(sampleMs = 1000): Promise<MicProfile> {
  const failed: MicProfile = {
    at: Date.now(),
    sampleRate: 0,
    agcDisabled: false,
    noiseFloorDb: METER_FLOOR_DB,
    ok: false,
  };

  if (!navigator.mediaDevices?.getUserMedia) return failed;

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings() ?? {};
    // Safari omits `autoGainControl` from getSettings entirely. Absent is not
    // the same as false, and reporting "AGC off" on a guess would make a
    // compressed, useless dB reading look trustworthy — so absent reads as on.
    const agcDisabled = settings.autoGainControl === false;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioContextClass();
    if (ctx.state === 'suspended') await ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);

    // Backed by an explicit ArrayBuffer: `getFloatTimeDomainData` will not
    // accept a view that might sit on a SharedArrayBuffer.
    const buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    const dbs: number[] = [];
    const until = Date.now() + sampleMs;

    while (Date.now() < until) {
      analyser.getFloatTimeDomainData(buffer);
      dbs.push(rmsToDb(calculateRms(buffer)));
      await new Promise((r) => setTimeout(r, 20));
    }

    return {
      at: Date.now(),
      sampleRate: ctx.sampleRate,
      agcDisabled,
      noiseFloorDb: Math.round(noiseFloorFromDbs(dbs) * 10) / 10,
      ok: true,
    };
  } catch {
    return failed;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    if (ctx) void ctx.close();
  }
}
