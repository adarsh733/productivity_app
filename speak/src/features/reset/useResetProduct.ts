import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayRecord, LabSession, Recording, VoiceSample } from '../../types/contract';
import { db, enqueue, getProfile, saveRecording } from '../../db/db';
import { todayKey } from '../../lib/date';
import { missionById } from '../../content/missions';
import { updateCalibration } from '../lab/calibration';
import { push, syncConfigured } from '../../sync/supabase';
import { emptyDay } from '../session/day';
import {
  loadResetSnapshot,
  reduceResetSnapshot,
  saveResetSnapshot,
  type ResetAction,
  type ResetSnapshot,
} from './sessionState';

export interface SaveAttemptInput {
  attempt: 1 | 2;
  durationSec: number;
  avgDb?: number;
  audio?: { blob: Blob; mimeType: string } | null;
}

export interface ResetProductApi {
  snapshot: ResetSnapshot;
  dispatch(action: ResetAction): void;
  saveAttemptAudio(input: SaveAttemptInput): Promise<void>;
  finishLoop(): Promise<void>;
  recordUrge(): Promise<void>;
}

/** Fire-and-forget outbox drain. Never allowed to break a session. */
function trySync(): void {
  if (!syncConfigured()) return;
  void push().catch(() => {
    // Offline, signed out, or the project is not reachable. The outbox keeps
    // the rows; the next drain picks them up.
  });
}

export function useResetProduct(): ResetProductApi {
  const [snapshot, setSnapshot] = useState<ResetSnapshot>(() => {
    const restored = loadResetSnapshot(window.localStorage);
    saveResetSnapshot(window.localStorage, restored);
    return restored;
  });
  const snapshotRef = useRef(snapshot);
  const finishingRef = useRef(false);

  const dispatch = useCallback((action: ResetAction) => {
    const next = reduceResetSnapshot(snapshotRef.current, action);
    snapshotRef.current = next;
    saveResetSnapshot(window.localStorage, next);
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (snapshot.session.status !== 'active') return;
    if (snapshot.session.stage !== 'block' && !snapshot.session.stage.startsWith('recording')) {
      return;
    }
    const timer = window.setInterval(() => {
      dispatch({
        type: snapshotRef.current.session.stage === 'block' ? 'tick-block' : 'tick-recording',
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [dispatch, snapshot.session.stage, snapshot.session.status]);

  useEffect(() => {
    const checkpoint = () => {
      const current = snapshotRef.current;
      if (current.session.status !== 'active') {
        saveResetSnapshot(window.localStorage, current);
        return;
      }
      dispatch({ type: 'pause-session', interrupted: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') checkpoint();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', checkpoint);
    };
  }, [dispatch]);

  // Drain whatever the last session queued. The outbox had grown to 183 rows
  // with nothing ever pushing it, which meant "backed up" was never true.
  useEffect(() => {
    trySync();
  }, []);

  /**
   * Persist one attempt's audio as soon as it is stopped, rather than at the
   * end of the loop — an attempt that only exists in memory is lost to a phone
   * call, and the redo screen needs to play it back straight away.
   */
  const saveAttemptAudio = useCallback(async (input: SaveAttemptInput) => {
    const current = snapshotRef.current;
    if (!current.session.id || !input.audio) return;
    const mission = missionById(current.session.missionId);
    const recording: Recording = {
      id: `${current.session.id}-a${input.attempt}`,
      sessionId: current.session.id,
      attempt: input.attempt,
      missionId: current.session.missionId,
      missionTitle: mission?.headline ?? 'Speaking rep',
      date: todayKey(),
      at: Date.now(),
      durationSec: input.durationSec,
      mimeType: input.audio.mimeType,
      blob: input.audio.blob,
      ...(input.avgDb === undefined ? {} : { avgDb: Math.round(input.avgDb * 10) / 10 }),
    };
    // Deliberately not enqueued: audio stays on the device until an upload path
    // exists that tells him it is leaving (PRODUCT-RESET-PLAN §8.4).
    await saveRecording(recording);
  }, []);

  const finishLoop = useCallback(async () => {
    const current = snapshotRef.current;
    if (finishingRef.current || current.session.stage === 'complete' || !current.session.id) return;
    finishingRef.current = true;
    try {
      const now = Date.now();
      const date = todayKey();
      const measured = current.session.attempts
        .map((attempt) => attempt.averageDb)
        .filter((value): value is number => value !== undefined);
      const avgDb =
        measured.length === 0
          ? undefined
          : measured.reduce((sum, value) => sum + value, 0) / measured.length;
      const session: LabSession = {
        id: current.session.id,
        date,
        startedAt: current.session.startedAt ?? now,
        endedAt: now,
        completedStepIds: [
          'reset:voice',
          'reset:volume',
          'reset:precision',
          'reset:vocabulary',
          `reset:mission:${current.session.missionId}`,
          'reset:feedback-redo',
        ],
        transferReps: 2,
        ...(avgDb === undefined ? {} : { avgDb: Math.round(avgDb * 10) / 10 }),
        aborted: false,
      };
      const existing = (await db.days.get(date)) ?? emptyDay(date);
      // What he actually did, counted a second at a time — not the length the
      // session was advertised as.
      const seconds = current.session.activeSec;
      const day: DayRecord = {
        ...existing,
        secondsActive: existing.secondsActive + seconds,
        labSessionDone: true,
        labSeconds: (existing.labSeconds ?? 0) + seconds,
      };
      const sample: VoiceSample | null =
        avgDb === undefined
          ? null
          : {
              id: `vs-${current.session.id}`,
              at: now,
              date,
              kind: 'session_db',
              value: Math.round(avgDb * 10) / 10,
              sessionId: current.session.id,
            };

      await db.transaction(
        'rw',
        db.labSessions,
        db.days,
        db.voiceSamples,
        db.outbox,
        async () => {
          await db.labSessions.put(session);
          await db.days.put(day);
          await enqueue('labSessions', session.id);
          await enqueue('days', day.date);
          if (sample) {
            await db.voiceSamples.put(sample);
            await enqueue('voiceSamples', sample.id);
          }
        },
      );

      // Fold the session into his personal baseline. Progress showed
      // "Baseline samples 0 / 7" permanently because nothing ever wrote this,
      // so the volume band could never stop being the generic placeholder.
      // Only comparable conditions count — `free` is the environment the 30 cm
      // protocol assumes (PRODUCT-RESET-PLAN §6.2).
      if (avgDb !== undefined && current.environment === 'free') {
        const profile = await getProfile();
        await db.profile.put({ ...profile, ...updateCalibration(profile, avgDb, now) });
        await enqueue('profile', 'me');
      }

      dispatch({ type: 'finish-loop' });
      trySync();
    } finally {
      finishingRef.current = false;
    }
  }, [dispatch]);

  const recordUrge = useCallback(async () => {
    const date = todayKey();
    const existing = (await db.days.get(date)) ?? emptyDay(date);
    const next: DayRecord = {
      ...existing,
      urgesRedirected: existing.urgesRedirected + 1,
    };
    await db.days.put(next);
    await enqueue('days', date);
    trySync();
  }, []);

  return { snapshot, dispatch, saveAttemptAudio, finishLoop, recordUrge };
}
