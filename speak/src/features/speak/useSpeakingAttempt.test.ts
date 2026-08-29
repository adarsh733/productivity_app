import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SpeakingAttemptSession } from './useSpeakingAttempt';

const { mockStream, getMeasureCb, setMeasureCb } = vi.hoisted(() => {
  let cb: ((m: any) => void) | null = null;
  return {
    mockStream: {
      getTracks: () => [{ stop: () => {} }],
    },
    getMeasureCb: () => cb,
    setMeasureCb: (newCb: any) => {
      cb = newCb;
    },
  };
});

class MockMediaRecorder {
  static isTypeSupported = (_type: string) => true;
  stream: any;
  options: any;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream?: any, options?: any) {
    this.stream = stream;
    this.options = options;
  }

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

vi.mock('../../lib/audioMeter', async () => {
  const actual = await vi.importActual<any>('../../lib/audioMeter');
  return {
    ...actual,
    AudioMeterController: vi.fn().mockImplementation(() => ({
      start: vi.fn(async (cb: (m: any) => void) => {
        setMeasureCb(cb);
        return true;
      }),
      stop: vi.fn(),
      get mediaStream() {
        return mockStream;
      },
    })),
  };
});

describe('useSpeakingAttempt / SpeakingAttemptSession Suite', () => {
  let originalMediaRecorder: any;

  beforeEach(() => {
    vi.useFakeTimers();
    setMeasureCb(null);

    originalMediaRecorder = (globalThis as any).MediaRecorder;
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    if (typeof window !== 'undefined') {
      (window as any).MediaRecorder = MockMediaRecorder;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).MediaRecorder = originalMediaRecorder;
    if (typeof window !== 'undefined') {
      (window as any).MediaRecorder = originalMediaRecorder;
    }
  });

  it('Initializes in idle state with clean baseline values', () => {
    const session = new SpeakingAttemptSession({
      durationSec: 30,
      targetVocab: ['focus', 'precision'],
    });

    expect(session.state).toBe('idle');
    expect(session.elapsedSec).toBe(0);
    expect(session.volumePercent).toBe(0);
    expect(session.result).toBeNull();
    expect(session.error).toBeNull();
  });

  it('Survives at least 20 simulated analyser re-renders without reset or teardown', async () => {
    let notifyCount = 0;
    const session = new SpeakingAttemptSession(
      {
        durationSec: 30,
        targetVocab: ['clarity', 'brevity'],
      },
      () => {
        notifyCount++;
      },
    );

    // 1. Start speaking
    const started = await session.start();
    expect(started).toBe(true);
    expect(session.state).toBe('recording');

    // 2. Simulate 25 rapid analyser volume events (as happens at 60fps)
    const measureCb = getMeasureCb();
    for (let i = 1; i <= 25; i++) {
      if (measureCb) {
        measureCb({
          rms: 0.1 * (i % 5),
          db: -30 + i,
          percent: 20 + i,
          bandStatus: 'target',
        });
      }

      // Assert that state remains stable recording throughout all updates
      expect(session.state).toBe('recording');
      expect(session.volumePercent).toBe(20 + i);
    }

    expect(notifyCount).toBeGreaterThanOrEqual(25);
  });

  it('Stop returns a non-empty blob and calculates measured duration', async () => {
    const session = new SpeakingAttemptSession({
      durationSec: 30,
    });

    const started = await session.start();
    expect(started).toBe(true);

    // Advance 6 seconds
    vi.advanceTimersByTime(6000);

    const stopResult = await session.stop();

    expect(session.state).toBe('ready_for_review');
    expect(stopResult).toBeDefined();
    expect(stopResult?.audio).toBeDefined();
    expect(stopResult?.audio?.blob.size).toBeGreaterThan(0);
    expect(stopResult?.durationSec).toBe(6);
  });

  it('Two stop calls remain idempotent', async () => {
    const session = new SpeakingAttemptSession({
      durationSec: 30,
    });

    await session.start();

    const firstStop = await session.stop();
    const secondStop = await session.stop();

    expect(firstStop).toBeDefined();
    expect(secondStop).toBeDefined();
    expect(firstStop?.id).toBe(secondStop?.id);
  });

  it('Cancel writes nothing and releases all resources cleanly', async () => {
    const session = new SpeakingAttemptSession({
      durationSec: 30,
    });

    await session.start();
    expect(session.state).toBe('recording');

    session.cancel();

    expect(session.state).toBe('cancelled');
    expect(session.result).toBeNull();
  });

  it('Early stop preserves the true measured duration instead of max configured duration', async () => {
    const session = new SpeakingAttemptSession({
      durationSec: 60, // Configured for 60s
    });

    await session.start();

    // User stops early after 7 seconds
    vi.advanceTimersByTime(7000);

    const attemptResult = await session.stop();

    // Measured duration is 7s, NOT 60s
    expect(attemptResult?.durationSec).toBe(7);
    expect(session.elapsedSec).toBe(7);
  });
});
