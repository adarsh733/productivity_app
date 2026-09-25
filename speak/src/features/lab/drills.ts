/**
 * Quick voice drills — pure logic. Components render; this file decides.
 *
 * All loudness meaning lives in calibration.ts against his own baseline.
 * Nothing here authors a dB target.
 */

export interface PauseRepMeasurement {
  /** ms of silence immediately before the key word. Pass at ≥ 300 ms. */
  gapBeforeKeywordMs: number;
  /** dB of the key word minus sentence average. Pass at ≤ +3 dB. */
  keywordDbOverAverage: number;
}

export function gradePauseRep(m: PauseRepMeasurement): { pass: boolean; gapMs: number; overDb: number } {
  const pass = m.gapBeforeKeywordMs >= 300 && m.keywordDbOverAverage <= 3;
  return { pass, gapMs: m.gapBeforeKeywordMs, overDb: m.keywordDbOverAverage };
}

/** Level-1 hold: longest continuous voiced stretch, capped at 60 s. */
export function longestVoicedStretch(
  samples: Array<{ db: number; atMs: number }>,
  voicedThresholdDb: number,
  capSec = 60,
): number {
  if (samples.length === 0) return 0;
  let bestMs = 0;
  let runStart: number | null = null;
  let prevAt = samples[0]!.atMs;
  for (const s of samples) {
    if (s.db > voicedThresholdDb) {
      if (runStart === null) runStart = s.atMs;
    } else if (runStart !== null) {
      bestMs = Math.max(bestMs, s.atMs - runStart);
      runStart = null;
    }
    prevAt = s.atMs;
  }
  if (runStart !== null) bestMs = Math.max(bestMs, prevAt - runStart);
  const sec = bestMs / 1000;
  return Math.round(Math.min(sec, capSec) * 10) / 10;
}

/** Which of the 5 volume levels an attempt landed on, relative to calibrated normal. */
export function classifyLadderLevel(deltaDbFromBaseline: number): 1 | 2 | 3 | 4 | 5 {
  if (deltaDbFromBaseline <= -12) return 1;
  if (deltaDbFromBaseline <= -6) return 2;
  if (deltaDbFromBaseline <= -2) return 3;
  if (deltaDbFromBaseline <= 2) return 4;
  return 5;
}

/** Pace target: baseline × 0.9 once 5 valid attempts exist, else 140 starter. */
export const STARTER_WPM = 140;

export function paceTargetFor(baselineWpm: number | undefined): { target: number; starter: boolean } {
  if (typeof baselineWpm === 'number' && baselineWpm > 0) {
    return { target: Math.round(baselineWpm * 0.9), starter: false };
  }
  return { target: STARTER_WPM, starter: true };
}

const PALETTE: Array<[string, string]> = [
  ['Neutral / informational', 'Warm / friendly'],
  ['Reassuring', 'Firm but polite'],
  ['Apologetic / softening', 'Enthusiastic'],
  ['Warm / friendly', 'Reassuring'],
  ['Firm but polite', 'Enthusiastic'],
  ['Neutral / informational', 'Apologetic / softening'],
];

/** Two of the six emotional modes, rotating daily. No score, just listening. */
export function paletteForDay(dayIndex: number): [string, string] {
  return PALETTE[((dayIndex % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}
