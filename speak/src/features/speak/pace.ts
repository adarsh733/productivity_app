/**
 * Pace baseline and target — VOICE-PROFILE §7, brief Stage 4.3.
 *
 * Baseline: median WPM of his first 5 valid attempts (20 s or more).
 * Target: baseline × 0.9, recomputed weekly.
 * Until the baseline exists: 140 WPM, labelled "starter target".
 */
export const STARTER_WPM = 140;
export const PACE_MIN_SEC = 20;
export const PACE_NEEDED = 5;

export interface PaceAttempt {
  wpm: number;
  durationSec: number;
  at: number;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
}

/** Baseline from the first 5 valid attempts (≥20 s, wpm > 0), in arrival order. */
export function paceBaseline(attempts: readonly PaceAttempt[]): number | undefined {
  const valid = attempts.filter((a) => a.durationSec >= PACE_MIN_SEC && a.wpm > 0).slice(0, PACE_NEEDED);
  if (valid.length < PACE_NEEDED) return undefined;
  return median(valid.map((a) => a.wpm));
}

export function paceTarget(baseline: number | undefined): { target: number; starter: boolean } {
  if (typeof baseline === 'number' && baseline > 0) {
    return { target: Math.round(baseline * 0.9), starter: false };
  }
  return { target: STARTER_WPM, starter: true };
}

const PACE_STORE_KEY = 'articulate.paceSamples.v1';

/** Local sample log (device-only heuristic). Recomputed weekly by the caller. */
export function loadPaceSamples(): PaceAttempt[] {
  try {
    const raw = localStorage.getItem(PACE_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PaceAttempt[];
    return Array.isArray(arr) ? arr.filter((a) => a.wpm > 0 && a.durationSec >= PACE_MIN_SEC) : [];
  } catch {
    return [];
  }
}

export function appendPaceSample(sample: PaceAttempt): PaceAttempt[] {
  const all = [...loadPaceSamples(), sample]
    .filter((a) => a.wpm > 0 && a.durationSec >= PACE_MIN_SEC)
    .slice(-50);
  try {
    localStorage.setItem(PACE_STORE_KEY, JSON.stringify(all));
  } catch {}
  return all;
}
