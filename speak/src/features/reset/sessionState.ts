import type { MissionLane } from '../../content/missions';

export type ResetTab = 'today' | 'coach' | 'practice' | 'progress';
export type PracticeEnvironment = 'free' | 'quiet' | 'silent';
export type SessionDuration = 1 | 3 | 20;
export type ResetOverlay = 'none' | 'capture' | 'rescue' | 'session';
export type SessionStage =
  | 'idle'
  | 'overview'
  | 'block'
  | 'mission'
  | 'recording-1'
  | 'feedback'
  | 'recording-2'
  | 'comparison'
  | 'complete';

export interface SessionAttempt {
  number: 1 | 2;
  durationSec: number;
  averageDb?: number;
  completedAt: number;
}

export interface ResetSessionState {
  id: string | null;
  status: 'idle' | 'active' | 'paused' | 'complete';
  stage: SessionStage;
  duration: SessionDuration;
  /** Which lane and prompt this session is actually running. */
  lane: MissionLane;
  missionId: string;
  blockPlan: number[];
  blockPlanPosition: number;
  remainingSec: number;
  recordingElapsedSec: number;
  /**
   * Seconds actually spent working, counted one tick at a time.
   *
   * `secondsActive` used to be credited the *nominal* duration on completion,
   * so tapping through a 20-minute session in ninety seconds still reported
   * twenty minutes of practice. A progress number the user can inflate by
   * rushing is worse than no number.
   */
  activeSec: number;
  /** The correction he chose after listening back. Drives the redo target. */
  focusId: string | null;
  attempts: SessionAttempt[];
  startedAt: number | null;
  interrupted: boolean;
}

export interface ResetSnapshot {
  /**
   * Bumped to 2 when lanes, missions and honest active-time accounting landed.
   * A v1 snapshot is dropped rather than migrated — it describes a session with
   * no mission, and resuming into that is worse than starting fresh.
   */
  version: 2;
  updatedAt: number;
  tab: ResetTab;
  environment: PracticeEnvironment;
  duration: SessionDuration;
  overlay: ResetOverlay;
  captureDraft: string;
  rescueStep: 0 | 1 | 2 | 3;
  loopsCompleted: number;
  /** What the next session will run if he just presses start. */
  lane: MissionLane;
  missionId: string;
  session: ResetSessionState;
}

export type ResetAction =
  | { type: 'navigate'; tab: ResetTab }
  | { type: 'set-environment'; environment: PracticeEnvironment }
  | { type: 'set-duration'; duration: SessionDuration }
  | { type: 'set-mission'; lane: MissionLane; missionId: string }
  | { type: 'choose-focus'; focusId: string }
  | { type: 'open-overlay'; overlay: Exclude<ResetOverlay, 'none'> }
  | { type: 'close-overlay' }
  | { type: 'set-capture-draft'; value: string }
  | { type: 'set-rescue-step'; step: 0 | 1 | 2 | 3 }
  | { type: 'start-session' }
  | { type: 'begin-session' }
  | { type: 'tick-block' }
  | { type: 'complete-block' }
  | { type: 'pause-session'; interrupted?: boolean }
  | { type: 'resume-session' }
  | { type: 'begin-recording'; attempt: 1 | 2 }
  | { type: 'tick-recording' }
  | { type: 'stop-recording'; attempt: SessionAttempt }
  | { type: 'finish-loop' }
  | { type: 'reset-session' };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RESET_STORAGE_KEY = 'speak.product-reset.v1';

export const SESSION_BLOCKS = [
  { title: 'Voice reset', shortTitle: 'Reset', durationSec: 180 },
  { title: 'Volume and delivery', shortTitle: 'Volume', durationSec: 180 },
  { title: 'Precision', shortTitle: 'Precision', durationSec: 120 },
  { title: 'Vocabulary', shortTitle: 'Words', durationSec: 180 },
  { title: 'Main speaking mission', shortTitle: 'Mission', durationSec: 300 },
  { title: 'Feedback and redo', shortTitle: 'Redo', durationSec: 240 },
] as const;

function newSessionId(now: number): string {
  return `reset-${now.toString(36)}`;
}

function blockPlan(duration: SessionDuration): number[] {
  if (duration === 20) return [0, 1, 2, 3];
  if (duration === 3) return [0];
  return [];
}

function blockSeconds(duration: SessionDuration, blockIndex: number): number {
  if (duration === 3) return 45;
  return SESSION_BLOCKS[blockIndex]?.durationSec ?? 0;
}

const DEFAULT_LANE: MissionLane = 'office';
const DEFAULT_MISSION_ID = 'office-premature-launch';

function emptySession(
  duration: SessionDuration,
  lane: MissionLane = DEFAULT_LANE,
  missionId: string = DEFAULT_MISSION_ID,
): ResetSessionState {
  return {
    id: null,
    status: 'idle',
    stage: 'idle',
    duration,
    lane,
    missionId,
    blockPlan: blockPlan(duration),
    blockPlanPosition: 0,
    remainingSec: 0,
    recordingElapsedSec: 0,
    activeSec: 0,
    focusId: null,
    attempts: [],
    startedAt: null,
    interrupted: false,
  };
}

export function createDefaultSnapshot(now = Date.now()): ResetSnapshot {
  return {
    version: 2,
    updatedAt: now,
    tab: 'today',
    environment: 'free',
    duration: 20,
    overlay: 'none',
    captureDraft: '',
    rescueStep: 0,
    loopsCompleted: 0,
    lane: DEFAULT_LANE,
    missionId: DEFAULT_MISSION_ID,
    session: emptySession(20),
  };
}

function checkpoint(snapshot: ResetSnapshot, patch: Partial<ResetSnapshot>): ResetSnapshot {
  return { ...snapshot, ...patch, updatedAt: Date.now() };
}

export function reduceResetSnapshot(snapshot: ResetSnapshot, action: ResetAction): ResetSnapshot {
  switch (action.type) {
    case 'navigate':
      return checkpoint(snapshot, { tab: action.tab });
    case 'set-environment':
      return checkpoint(snapshot, { environment: action.environment });
    case 'set-duration':
      return checkpoint(snapshot, {
        duration: action.duration,
        session:
          snapshot.session.status === 'idle'
            ? emptySession(action.duration, snapshot.lane, snapshot.missionId)
            : snapshot.session,
      });
    case 'set-mission':
      return checkpoint(snapshot, {
        lane: action.lane,
        missionId: action.missionId,
        session:
          snapshot.session.status === 'idle'
            ? emptySession(snapshot.duration, action.lane, action.missionId)
            : snapshot.session,
      });
    case 'choose-focus':
      return checkpoint(snapshot, {
        session: { ...snapshot.session, focusId: action.focusId },
      });
    case 'open-overlay':
      return checkpoint(snapshot, { overlay: action.overlay });
    case 'close-overlay':
      return checkpoint(snapshot, { overlay: 'none' });
    case 'set-capture-draft':
      return checkpoint(snapshot, { captureDraft: action.value });
    case 'set-rescue-step':
      return checkpoint(snapshot, { rescueStep: action.step });
    case 'start-session': {
      const now = Date.now();
      return checkpoint(snapshot, {
        overlay: 'session',
        session: {
          ...emptySession(snapshot.duration, snapshot.lane, snapshot.missionId),
          id: newSessionId(now),
          status: 'paused',
          stage: 'overview',
          startedAt: now,
        },
      });
    }
    case 'begin-session': {
      const firstBlock = snapshot.session.blockPlan[0];
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          status: 'active',
          stage: firstBlock === undefined ? 'mission' : 'block',
          remainingSec:
            firstBlock === undefined
              ? 0
              : blockSeconds(snapshot.session.duration, firstBlock),
          interrupted: false,
        },
      });
    }
    case 'tick-block':
      if (snapshot.session.status !== 'active' || snapshot.session.stage !== 'block') {
        return snapshot;
      }
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          remainingSec: Math.max(0, snapshot.session.remainingSec - 1),
          activeSec: snapshot.session.activeSec + 1,
        },
      });
    case 'complete-block': {
      const nextPosition = snapshot.session.blockPlanPosition + 1;
      const nextBlock = snapshot.session.blockPlan[nextPosition];
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          blockPlanPosition: nextPosition,
          stage: nextBlock === undefined ? 'mission' : 'block',
          remainingSec:
            nextBlock === undefined
              ? 0
              : blockSeconds(snapshot.session.duration, nextBlock),
          status: 'active',
        },
      });
    }
    case 'pause-session': {
      let stage = snapshot.session.stage;
      if (stage === 'recording-1') stage = 'mission';
      if (stage === 'recording-2') stage = 'feedback';
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          status: snapshot.session.status === 'complete' ? 'complete' : 'paused',
          stage,
          recordingElapsedSec: 0,
          interrupted: action.interrupted ?? snapshot.session.interrupted,
        },
      });
    }
    case 'resume-session':
      return checkpoint(snapshot, {
        overlay: 'session',
        session: {
          ...snapshot.session,
          status: 'active',
          interrupted: false,
        },
      });
    case 'begin-recording':
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          status: 'active',
          stage: action.attempt === 1 ? 'recording-1' : 'recording-2',
          recordingElapsedSec: 0,
          interrupted: false,
        },
      });
    case 'tick-recording':
      if (!snapshot.session.stage.startsWith('recording')) return snapshot;
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          recordingElapsedSec: snapshot.session.recordingElapsedSec + 1,
          activeSec: snapshot.session.activeSec + 1,
        },
      });
    case 'stop-recording': {
      const attempts = snapshot.session.attempts.filter(
        (attempt) => attempt.number !== action.attempt.number,
      );
      attempts.push(action.attempt);
      attempts.sort((a, b) => a.number - b.number);
      return checkpoint(snapshot, {
        session: {
          ...snapshot.session,
          status: 'paused',
          stage: action.attempt.number === 1 ? 'feedback' : 'comparison',
          recordingElapsedSec: 0,
          attempts,
        },
      });
    }
    case 'finish-loop':
      return checkpoint(snapshot, {
        loopsCompleted: snapshot.loopsCompleted + 1,
        session: {
          ...snapshot.session,
          status: 'complete',
          stage: 'complete',
          interrupted: false,
        },
      });
    case 'reset-session':
      return checkpoint(snapshot, {
        overlay: 'none',
        session: emptySession(snapshot.duration, snapshot.lane, snapshot.missionId),
      });
  }
}

function isSnapshot(value: unknown): value is ResetSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResetSnapshot>;
  return candidate.version === 2 && typeof candidate.updatedAt === 'number' && !!candidate.session;
}

export function normalizeRestoredSnapshot(snapshot: ResetSnapshot): ResetSnapshot {
  if (snapshot.session.status !== 'active') return snapshot;
  return reduceResetSnapshot(snapshot, { type: 'pause-session', interrupted: true });
}

export function loadResetSnapshot(storage: StorageLike, now = Date.now()): ResetSnapshot {
  try {
    const raw = storage.getItem(RESET_STORAGE_KEY);
    if (!raw) return createDefaultSnapshot(now);
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return createDefaultSnapshot(now);
    return normalizeRestoredSnapshot(parsed);
  } catch {
    return createDefaultSnapshot(now);
  }
}

export function saveResetSnapshot(storage: StorageLike, snapshot: ResetSnapshot): void {
  try {
    storage.setItem(RESET_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Restricted storage must not make the coaching session unusable.
  }
}

