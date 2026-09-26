import { useEffect, useState } from 'react';
import type { DailyChallenge, DayKey, DayRecord } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  buildDailyChallenge,
  ensureChallengeOnDay,
  type ChallengeInputs,
} from './buildDailyChallenge';
import { emptyDay } from '../session/day';

/**
 * Once per day on first open: load today's DayRecord, build the challenge
 * when missing, and store it on `DayRecord.challenge`. Mic never gates —
 * this runs without any microphone.
 */

export interface DayStore {
  get(date: string): Promise<DayRecord | undefined>;
  put(d: DayRecord): Promise<unknown>;
}

export async function ensureStoredChallenge(
  date: DayKey,
  inputs: ChallengeInputs,
  store: DayStore,
): Promise<{ day: DayRecord; challenge: DailyChallenge; created: boolean }> {
  const current = (await store.get(date)) ?? emptyDay(date);
  if (current.challenge && current.challenge.date === date) {
    return { day: current, challenge: current.challenge, created: false };
  }
  const built = buildDailyChallenge(date, inputs);
  const next = ensureChallengeOnDay(current, built);
  await store.put(next);
  return { day: next, challenge: built, created: true };
}

export function useDailyChallenge(inputs: ChallengeInputs = {}) {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const date = todayKey();
        const { challenge: c } = await ensureStoredChallenge(date, inputs, {
          get: (d) => db.days.get(d),
          put: async (d) => {
            await db.days.put(d);
            await enqueue('days', d.date).catch(() => {});
          },
        });
        if (!dead) setChallenge(c);
      } catch {
        // Offline/closed DB: fall back to a local-only challenge so the
        // card still shows. The next open persists it.
        if (!dead) setChallenge(buildDailyChallenge(todayKey(), inputs));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
    // Inputs are caller-owned arrays; stringify once per render is cheap
    // and avoids ref-churn re-running the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(inputs)]);

  return { challenge, loading };
}
