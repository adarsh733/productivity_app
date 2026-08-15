import {
  RESET_STORAGE_KEY,
  createDefaultSnapshot,
  loadResetSnapshot,
  reduceResetSnapshot,
  saveResetSnapshot,
  type StorageLike,
} from './sessionState';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('reset session persistence', () => {
  it('restores the exact block and remaining time as paused', () => {
    const storage = new MemoryStorage();
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    saveResetSnapshot(storage, state);

    const restored = loadResetSnapshot(storage, 2);
    expect(restored.session.stage).toBe('block');
    expect(restored.session.blockPlanPosition).toBe(0);
    expect(restored.session.remainingSec).toBe(178);
    expect(restored.session.status).toBe('paused');
    expect(restored.session.interrupted).toBe(true);
  });

  it('returns an interrupted first recording to the mission without losing prior blocks', () => {
    const storage = new MemoryStorage();
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'set-duration', duration: 3 });
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = reduceResetSnapshot(state, { type: 'complete-block' });
    state = reduceResetSnapshot(state, { type: 'begin-recording', attempt: 1 });
    state = reduceResetSnapshot(state, { type: 'tick-recording' });
    saveResetSnapshot(storage, state);

    const restored = loadResetSnapshot(storage, 2);
    expect(restored.session.stage).toBe('mission');
    expect(restored.session.blockPlanPosition).toBe(1);
    expect(restored.session.recordingElapsedSec).toBe(0);
    expect(restored.session.interrupted).toBe(true);
  });

  it('keeps a completed first attempt when the redo is interrupted', () => {
    const storage = new MemoryStorage();
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = { ...state, session: { ...state.session, stage: 'mission' } };
    state = reduceResetSnapshot(state, { type: 'begin-recording', attempt: 1 });
    state = reduceResetSnapshot(state, {
      type: 'stop-recording',
      attempt: { number: 1, durationSec: 54, completedAt: 10 },
    });
    state = reduceResetSnapshot(state, { type: 'begin-recording', attempt: 2 });
    saveResetSnapshot(storage, state);

    const restored = loadResetSnapshot(storage, 2);
    expect(restored.session.stage).toBe('feedback');
    expect(restored.session.attempts).toHaveLength(1);
    expect(restored.session.attempts[0]?.durationSec).toBe(54);
  });

  it('falls back safely when storage is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(RESET_STORAGE_KEY, '{not-json');
    expect(loadResetSnapshot(storage, 99).tab).toBe('today');
  });

  it('drops a v1 snapshot rather than resuming a session with no mission', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      RESET_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: 1, session: { stage: 'block' } }),
    );
    const restored = loadResetSnapshot(storage, 5);
    expect(restored.version).toBe(2);
    expect(restored.session.stage).toBe('idle');
  });
});

describe('honest practice time', () => {
  // `secondsActive` was credited the *nominal* duration on completion, so
  // tapping through a 20-minute session in ninety seconds still reported
  // twenty minutes. Only elapsed ticks may count.
  it('counts only the seconds actually spent working', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    expect(state.session.activeSec).toBe(0);

    state = reduceResetSnapshot(state, { type: 'tick-block' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    expect(state.session.activeSec).toBe(3);
  });

  it('counts recording time as practice time', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'set-duration', duration: 1 });
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = reduceResetSnapshot(state, { type: 'begin-recording', attempt: 1 });
    state = reduceResetSnapshot(state, { type: 'tick-recording' });
    state = reduceResetSnapshot(state, { type: 'tick-recording' });
    expect(state.session.activeSec).toBe(2);
  });

  it('does not advance the clock while paused', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    state = reduceResetSnapshot(state, { type: 'pause-session' });
    state = reduceResetSnapshot(state, { type: 'tick-block' });
    expect(state.session.activeSec).toBe(1);
  });
});

describe('lanes and missions', () => {
  it('carries the chosen mission into the session', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, {
      type: 'set-mission',
      lane: 'vocab_hi',
      missionId: 'vocab-hi-everyday',
    });
    state = reduceResetSnapshot(state, { type: 'start-session' });
    expect(state.session.lane).toBe('vocab_hi');
    expect(state.session.missionId).toBe('vocab-hi-everyday');
  });

  it('does not change the prompt underneath a session already running', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, {
      type: 'set-mission',
      lane: 'incident',
      missionId: 'incident-confusing-work',
    });
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'begin-session' });
    state = reduceResetSnapshot(state, {
      type: 'set-mission',
      lane: 'office',
      missionId: 'office-disagree',
    });
    expect(state.session.missionId).toBe('incident-confusing-work');
  });

  it('remembers the correction chosen for the redo', () => {
    let state = createDefaultSnapshot(1);
    state = reduceResetSnapshot(state, { type: 'start-session' });
    state = reduceResetSnapshot(state, { type: 'choose-focus', focusId: 'pace' });
    expect(state.session.focusId).toBe('pace');
  });
});
