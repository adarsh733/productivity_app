import type { ChallengeResult, DailyChallenge } from '../../types/contract';

/**
 * AG-007 stage 4 — challenge checks.
 *
 * Reuses `useSpeakingAttempt` numbers (durationSec, transcript, wpm, avgDb,
 * pauseCount, voicedSec). Anything that cannot be measured returns null and
 * the UI shows "—" with a plain reason — never a guess.
 *
 * - long enough = counted rep AND ≥ 80% of targetSec
 * - word/phrase via transcript (null when no transcript or no word set)
 * - softer = average ≥ 3 dB below his normal
 * - slower = WPM ≤ baseline − 5%
 * - pause_first = ≥ 2 pauses of about a third of a second or more
 *   (reuses the recorder's pauseCount, which counts ≥ ~400 ms gaps)
 */

export interface ChallengeAttemptNumbers {
  /** Measured seconds spoken. */
  durationSec: number;
  /** On-device speech transcript, if recognition ran. */
  transcript?: string;
  /** Measured words per minute, if recognition produced words. */
  wpm?: number;
  /** Mean dBFS over voiced frames, if the mic ran. */
  avgDb?: number;
  /** Natural pauses counted by the recorder, if the mic ran. */
  pauseCount?: number;
  /** Seconds of voiced audio, when measured. */
  voicedSec?: number;
  /**
   * Override from the credit path (`credit()` result). When omitted, counted
   * is derived: ≥ 2 s and (unmeasured voicedSec or ≥ 1.5 s).
   */
  counted?: boolean;
}

export interface ChallengeVoiceContext {
  /** His own normal loudness (dBFS). Needed for `softer`. */
  baselineDb?: number;
  /** Median WPM baseline. Needed for `slower`. */
  paceBaseline?: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary, case-insensitive phrase check. */
export function transcriptContains(transcript: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (!needle) return false;
  try {
    return new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(transcript);
  } catch {
    return transcript.toLowerCase().includes(needle.toLowerCase());
  }
}

export function isCountedRep(durationSec: number, voicedSec?: number): boolean {
  if (typeof durationSec !== 'number' || durationSec < 2) return false;
  if (typeof voicedSec === 'number' && voicedSec < 1.5) return false;
  return true;
}

function hasTranscript(transcript?: string): boolean {
  return Boolean(transcript && transcript.trim().length > 0);
}

export function checkChallenge(
  challenge: DailyChallenge,
  attempt: ChallengeAttemptNumbers,
  voice: ChallengeVoiceContext = {},
): ChallengeResult {
  const counted = attempt.counted ?? isCountedRep(attempt.durationSec, attempt.voicedSec);
  const longEnough = counted && attempt.durationSec >= challenge.targetSec * 0.8;

  const transcript = attempt.transcript ?? '';
  const transcriptOk = hasTranscript(transcript);

  const usedWord =
    !challenge.useWord?.trim()
      ? null
      : !transcriptOk
        ? null
        : transcriptContains(transcript, challenge.useWord);

  const avoidedPhrase =
    !challenge.avoidPhrase?.trim()
      ? null
      : !transcriptOk
        ? null
        : !transcriptContains(transcript, challenge.avoidPhrase);

  let voiceGoalMet: boolean | null;
  if (challenge.voiceGoal === 'softer') {
    voiceGoalMet =
      typeof attempt.avgDb === 'number' && typeof voice.baselineDb === 'number'
        ? attempt.avgDb <= voice.baselineDb - 3
        : null;
  } else if (challenge.voiceGoal === 'slower') {
    voiceGoalMet =
      typeof attempt.wpm === 'number' &&
      typeof voice.paceBaseline === 'number' &&
      voice.paceBaseline > 0
        ? attempt.wpm <= voice.paceBaseline * 0.95
        : null;
  } else {
    voiceGoalMet = typeof attempt.pauseCount === 'number' ? attempt.pauseCount >= 2 : null;
  }

  const done =
    longEnough && voiceGoalMet !== false && usedWord !== false && avoidedPhrase !== false;

  return {
    recordingId: '',
    longEnough,
    usedWord,
    avoidedPhrase,
    voiceGoalMet,
    done,
  };
}

/** Same as checkChallenge but stamps the saved recording id. */
export function checkChallengeWithRecording(
  challenge: DailyChallenge,
  attempt: ChallengeAttemptNumbers,
  voice: ChallengeVoiceContext,
  recordingId: string,
): ChallengeResult {
  return { ...checkChallenge(challenge, attempt, voice), recordingId };
}
