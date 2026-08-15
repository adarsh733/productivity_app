import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { syncConfigured } from '../../sync/supabase';
import type { Recording } from '../../types/contract';

export interface ResetProgressEvidence {
  ready: boolean;
  completedLoops: number;
  totalPracticeSeconds: number;
  urgesRedirected: number;
  latestAverageDb: number | null;
  /** First comparable session average, for the Day 1 vs current line. */
  firstAverageDb: number | null;
  calibrationSamples: number;
  baselineDb: number | null;
  capturesWaiting: number;
  /** Newest first. The voice archive. */
  recordings: Recording[];
  /** Rows still waiting to reach Supabase. */
  pendingSync: number;
  syncConfigured: boolean;
  lastSyncAt: number | null;
}

export function useResetProgress(): ResetProgressEvidence {
  const data = useLiveQuery(async () => {
    const [sessions, days, samples, profile, inbox, recordings, pendingSync] = await Promise.all([
      db.labSessions.toArray(),
      db.days.toArray(),
      db.voiceSamples.where('kind').equals('session_db').toArray(),
      db.profile.get('me'),
      db.inbox.toArray(),
      db.recordings.orderBy('at').reverse().limit(24).toArray(),
      db.outbox.count(),
    ]);
    const byTime = samples.sort((a, b) => b.at - a.at);
    return {
      completedLoops: sessions.filter((session) => !session.aborted && session.endedAt).length,
      totalPracticeSeconds: days.reduce((sum, day) => sum + day.secondsActive, 0),
      urgesRedirected: days.reduce((sum, day) => sum + day.urgesRedirected, 0),
      latestAverageDb: byTime[0]?.value ?? null,
      firstAverageDb: byTime.length > 1 ? byTime[byTime.length - 1]!.value : null,
      calibrationSamples: profile?.calibrationSamples ?? 0,
      baselineDb: profile?.baselineDb ?? null,
      capturesWaiting: inbox.filter((item) => item.status === 'raw' || item.status === 'queued').length,
      recordings,
      pendingSync,
      lastSyncAt: profile?.lastSyncAt ?? null,
    };
  }, []);

  return {
    ready: data !== undefined,
    completedLoops: data?.completedLoops ?? 0,
    totalPracticeSeconds: data?.totalPracticeSeconds ?? 0,
    urgesRedirected: data?.urgesRedirected ?? 0,
    latestAverageDb: data?.latestAverageDb ?? null,
    firstAverageDb: data?.firstAverageDb ?? null,
    calibrationSamples: data?.calibrationSamples ?? 0,
    baselineDb: data?.baselineDb ?? null,
    capturesWaiting: data?.capturesWaiting ?? 0,
    recordings: data?.recordings ?? [],
    pendingSync: data?.pendingSync ?? 0,
    syncConfigured: syncConfigured(),
    lastSyncAt: data?.lastSyncAt ?? null,
  };
}

/** The attempts belonging to one session, for the redo and comparison screens. */
export function useSessionRecordings(sessionId: string | null): Recording[] {
  const rows = useLiveQuery(
    async () => (sessionId ? db.recordings.where('sessionId').equals(sessionId).toArray() : []),
    [sessionId],
  );
  return rows ?? [];
}
