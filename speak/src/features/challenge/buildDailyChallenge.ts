import type { DailyChallenge, DayKey, DayRecord, VoiceGoal } from '../../types/contract';

/**
 * AG-007 stage 4 — deterministic daily challenge.
 *
 * Pure: same date + same inputs = same challenge. The seed comes from the
 * date string only, so the challenge is stable across reloads and devices.
 * Voice goal branches (spec §4):
 * - calibrated + last-7-day average louder than normal → `softer`
 * - else pace baseline exists + recent WPM above target → `slower`
 * - else `pause_first`
 *
 * Titles are plain words, ≤ 70 chars. Mic never gates: building a challenge
 * needs no microphone.
 */

export interface ChallengeVoiceInputs {
  /** True once week-one calibration completed (7 habitual samples). */
  calibrated?: boolean;
  /** His own normal loudness (dBFS, negative). */
  baselineDb?: number;
  /** Mean dBFS of the last 7 days of voiced speech. */
  recentAvgDb?: number;
  /** Median WPM of his first 5 valid attempts. */
  paceBaseline?: number;
  /** Target WPM (baseline × 0.9). Computed when omitted. */
  paceTarget?: number;
  /** Recent measured WPM. */
  recentWpm?: number;
  /** AG-008 §5 — the weekly plan's branch, when set. Overrides the computed goal. */
  coachFocus?: VoiceGoal;
}

export interface ChallengeContentInputs {
  /** Coach words he saved ("word" kind subjects). */
  coachWords?: readonly string[];
  /** Coach mistakes, wrong side is what to avoid. */
  coachMistakes?: readonly { wrong: string; right: string }[];
  /** Word-card terms he recently engaged with (fallback for useWord). */
  engagedWords?: readonly string[];
  /** Situation card ids to talk about. */
  situationCardIds?: readonly string[];
}

export type ChallengeInputs = ChallengeVoiceInputs & ChallengeContentInputs;

const TARGET_SECS = [30, 45, 60] as const;

/** FNV-1a 32-bit, deterministic per date string. */
export function hashDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cleanWords(list: readonly string[] | undefined): string[] {
  if (!list) return [];
  return list.map((w) => (w ?? '').trim()).filter(Boolean);
}

export function pickVoiceGoal(voice: ChallengeVoiceInputs): VoiceGoal {
  const { calibrated, baselineDb, recentAvgDb, paceBaseline, paceTarget, recentWpm } = voice;
  // Louder = greater dBFS number (closer to 0). Above normal → too loud → softer.
  if (
    calibrated === true &&
    typeof baselineDb === 'number' &&
    typeof recentAvgDb === 'number' &&
    recentAvgDb > baselineDb
  ) {
    return 'softer';
  }
  const baseline = typeof paceBaseline === 'number' && paceBaseline > 0 ? paceBaseline : undefined;
  const target =
    typeof paceTarget === 'number' && paceTarget > 0
      ? paceTarget
      : baseline !== undefined
        ? Math.round(baseline * 0.9)
        : undefined;
  if (baseline !== undefined && target !== undefined && typeof recentWpm === 'number' && recentWpm > target) {
    return 'slower';
  }
  return 'pause_first';
}

function pickAt<T>(list: readonly T[], hash: number, salt: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[(hash + salt) % list.length];
}

/** Plain-words title, always ≤ 70 chars. Truncates a long word to fit. */
export function makeTitle(voiceGoal: VoiceGoal, targetSec: 30 | 45 | 60, useWord?: string): string {
  const word = (useWord ?? '').trim();
  if (!word) {
    if (voiceGoal === 'softer') return `Give a ${targetSec}-second update — keep it soft`;
    if (voiceGoal === 'slower') return `Give a ${targetSec}-second update — slow and clear`;
    return `Give a ${targetSec}-second talk — pause between ideas`;
  }
  let base: string;
  if (voiceGoal === 'softer') base = `Say "W" in a ${targetSec}-second update — keep it soft`;
  else if (voiceGoal === 'slower') base = `Say "W" in a ${targetSec}-second update — slow and clear`;
  else base = `Say "W" in a ${targetSec}-second talk — pause between ideas`;
  const maxWord = 70 - base.length + 1; // +1 for the W placeholder
  const fit = word.length <= maxWord ? word : `${word.slice(0, Math.max(0, maxWord - 1))}…`;
  return base.replace('W', fit);
}

export function buildDailyChallenge(date: DayKey, inputs: ChallengeInputs = {}): DailyChallenge {
  const hash = hashDate(date);
  const voiceGoal = inputs.coachFocus ?? pickVoiceGoal(inputs);
  const targetSec = TARGET_SECS[hash % TARGET_SECS.length] ?? 45;

  const coachWords = cleanWords(inputs.coachWords);
  const engagedWords = cleanWords(inputs.engagedWords);
  const wordPool = coachWords.length > 0 ? coachWords : engagedWords;
  const useWord = pickAt(wordPool, hash, 1);

  const mistakes = (inputs.coachMistakes ?? []).filter((m) => m?.wrong?.trim());
  const avoidEntry = pickAt(mistakes, hash, 2);
  const avoidPhrase = avoidEntry?.wrong?.trim() || undefined;

  const situations = cleanWords(inputs.situationCardIds);
  const situationCardId = pickAt(situations, hash >>> 3, 3);

  const title = makeTitle(voiceGoal, targetSec, useWord);

  return {
    date,
    title,
    ...(situationCardId ? { situationCardId } : {}),
    ...(useWord ? { useWord } : {}),
    ...(avoidPhrase ? { avoidPhrase } : {}),
    voiceGoal,
    targetSec,
  };
}

/**
 * Once per day on first open: if the day already holds today's challenge,
 * return it untouched; else store the built one. Pure — the caller persists.
 */
export function ensureChallengeOnDay(day: DayRecord, built: DailyChallenge): DayRecord {
  if (day.challenge && day.challenge.date === day.date) return day;
  return { ...day, challenge: built };
}
