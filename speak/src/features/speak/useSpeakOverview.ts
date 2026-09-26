import { useCallback, useEffect, useState } from 'react';
import type { ChallengeResult, DailyChallenge } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  checkChallengeWithRecording,
  type ChallengeAttemptNumbers,
} from '../challenge/checkChallenge';
import { emptyDay } from '../session/day';
import type { SpeakingAttemptResult } from './useSpeakingAttempt';

export interface SpeakOverview {
  routineDays: number;
  routineDoneToday: boolean;
  challengeResult: ChallengeResult | null;
  challengeDone: boolean;
  loading: boolean;
  refresh: () => void;
}

/**
 * Stage 5 — all database reads for the Speak tab live here.
 * Components never import db/scheduler/queue (AGENTS.md rule 3).
 * Every read fails soft: mic-off, closed DB, or empty store still
 * renders the full menu with sensible defaults.
 */
export function useSpeakOverview(): SpeakOverview {
  const [routineDays, setRoutineDays] = useState(0);
  const [routineDoneToday, setRoutineDoneToday] = useState(false);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const [days, today] = await Promise.all([
          db.days.toArray(),
          db.days.get(todayKey()),
        ]);
        if (dead) return;
        setRoutineDays(days.filter((d) => d.labSessionDone).length);
        setRoutineDoneToday(today?.labSessionDone === true);
        setChallengeResult(today?.challengeResult ?? null);
      } catch {
        if (dead) return;
        setRoutineDays(0);
        setRoutineDoneToday(false);
        setChallengeResult(null);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  return {
    routineDays,
    routineDoneToday,
    challengeResult,
    challengeDone: challengeResult?.done === true,
    loading,
    refresh,
  };
}

/**
 * Grade a finished challenge attempt and store it on today's DayRecord.
 * Voice context (his normal loudness, his normal speed) is read from the
 * profile here — the component just passes the recorder numbers through.
 * Anything unmeasurable grades as null ("—" in the UI, never a guess).
 */
export async function saveChallengeResult(
  challenge: DailyChallenge,
  attempt: SpeakingAttemptResult,
): Promise<ChallengeResult> {
  const profile = await db.profile.get('me').catch(() => undefined);
  const numbers: ChallengeAttemptNumbers = {
    durationSec: attempt.durationSec,
    transcript: attempt.transcript,
    wpm: attempt.wpm,
    avgDb: attempt.avgDb,
    pauseCount: attempt.pauseCount,
    voicedSec: attempt.voicedSec,
  };
  const result = checkChallengeWithRecording(
    challenge,
    numbers,
    { baselineDb: profile?.baselineDb, paceBaseline: profile?.baselineWpm },
    attempt.id,
  );
  const date = challenge.date;
  const current = (await db.days.get(date).catch(() => undefined)) ?? emptyDay(date);
  const next = { ...current, date, challenge, challengeResult: result };
  await db.days.put(next);
  await enqueue('days', date).catch(() => {});
  return result;
}
