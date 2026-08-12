/**
 * Web Audio API Volume & dB Analysis Engine for SPEAK Phase 1.
 *
 * Provides real-time RMS amplitude calculation, dB conversion, target band
 * classification, and microphone stream management without relying on external
 * speech APIs or network calls.
 */

export interface VolumeMeasurement {
  rms: number;
  db: number;
  percent: number;
  bandStatus: 'low' | 'target' | 'high';
}

export interface TargetBand {
  minDb: number; // e.g. -32 dB (approx 45% level)
  maxDb: number; // e.g. -14 dB (approx 75% level)
}

export const DEFAULT_TARGET_BAND: TargetBand = {
  minDb: -32,
  maxDb: -14,
};

/**
 * Converts Root Mean Square (RMS) amplitude (0..1) to decibels relative to full scale (dBFS).
 * Clamped between minDb (default -60 dB) and 0 dB.
 */
export function rmsToDb(rms: number, minDb: number = -60): number {
  if (rms <= 0.0001) return minDb;
  const db = 20 * Math.log10(rms);
  return Math.max(minDb, Math.min(0, db));
}

/**
 * Maps a dB value (-60..0 dB) to a 0..100 linear percentage scale for visual meter bars.
 */
export function dbToPercent(db: number, minDb: number = -60, maxDb: number = 0): number {
  if (db <= minDb) return 0;
  if (db >= maxDb) return 100;
  return Math.round(((db - minDb) / (maxDb - minDb)) * 100);
}

/**
 * Classifies a dB measurement relative to a target phonation band.
 */
export function classifyVolumeBand(
  db: number,
  targetBand: TargetBand = DEFAULT_TARGET_BAND,
): 'low' | 'target' | 'high' {
  if (db < targetBand.minDb) return 'low';
  if (db > targetBand.maxDb) return 'high';
  return 'target';
}

/**
 * Calculates RMS amplitude from a Float32Array of raw PCM audio samples.
 */
export function calculateRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export class AudioMeterController {
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animId: number | null = null;
  private onMeasureCallback: ((m: VolumeMeasurement) => void) | null = null;

  public async start(onMeasure: (m: VolumeMeasurement) => void): Promise<boolean> {
    this.onMeasureCallback = onMeasure;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        return false;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioCtx = new AudioContextClass();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.8;

      source.connect(this.analyser);
      this.loop();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  private loop = () => {
    if (!this.analyser || !this.onMeasureCallback) return;

    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);

    const rms = calculateRms(dataArray);
    const db = rmsToDb(rms);
    const percent = dbToPercent(db);
    const bandStatus = classifyVolumeBand(db);

    this.onMeasureCallback({ rms, db, percent, bandStatus });

    this.animId = requestAnimationFrame(this.loop);
  };

  public stop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
    this.onMeasureCallback = null;
  }
}
