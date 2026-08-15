import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DayRecord,
  LabBlock,
  LabSession,
  LabStep,
  Profile,
  TargetBandDb,
  VoiceSample,
} from '../../types/contract';
import { db, enqueue, getProfile } from '../../db/db';
import {
  AudioMeterController,
  DbAccumulator,
  runMicSelfTest,
  type BandStatus,
} from '../../lib/audioMeter';
import {
  DriftDetector,
  calibrationRemaining,
  effectiveBand,
  isCalibrated,
  updateCalibration,
  type Drift,
} from './calibration';
import { buildRoutine, flattenSteps } from './routine';
import { emptyDay } from '../session/day';
import { todayKey } from '../../lib/date';

/**
 * M8 — the Session Runner. The Speaking Lab's state machine.
 *
 * Components render what this returns and call `next` / `skip` / `finish`.
 * They never open the microphone, never touch Dexie and never decide what a
 * reading means.
 *
 * Three behaviours worth knowing before building against it:
 *
 *  - **A mandatory step does not auto-advance.** When its timer reaches zero it
 *    sits there until he taps through. That is the enforcement PLAN.md §1
 *    asks for: the transfer rep is the step most likely to be skipped and the
 *    one where the learning happens, so a timer must not be able to skip it for
 *    him while the phone is face-down.
 *  - **The microphone opens once for the whole session**, not per step, because
 *    re-requesting capture mid-session on iOS costs a permission round trip and
 *    an audible glitch. Only steps with `metered: true` display or accumulate.
 *  - **A session that is abandoned is still written.** A partial is data; a
 *    dropped session would silently flatter the record.
 */

export type MicState = 'idle' | 'requesting' | 'on' | 'denied' | 'unsupported';

export interface LabApi {
  ready: boolean;
  /** The routine for this user right now — includes calibration in week one. */
  blocks: LabBlock[];
  block: LabBlock | null;
  step: LabStep | null;
  /** 0-based across the flattened routine. */
  stepIndex: number;
  totalSteps: number;
  /** Whole seconds left on the current step. Floors at 0 and stays there. */
  remainingSec: number;
  /** 0..1 through the routine by elapsed step time. */
  progress: number;

  started: boolean;
  running: boolean;
  finished: boolean;

  micState: MicState;
  /** Live dBFS. Null on an unmetered step or with the mic off. */
  db: number | null;
  percent: number;
  bandStatus: BandStatus;
  band: TargetBandDb;
  drift: Drift;

  calibrated: boolean;
  /** Sessions of habitual speech still needed before the band is his. */
  sessionsToCalibrate: number;

  /** Set when `skip` refused. Cleared by the next call to `skip` or `next`. */
  blockedReason: string | null;

  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** "I did that." Always advances, and records the step as completed. */
  next(): Promise<void>;
  /** "Move on without doing it." Refuses on a mandatory step. */
  skip(): void;
  /** Ends the session and writes it. Called on the last step. */
  finish(): Promise<void>;
  /** Leaves early. Still written, flagged `aborted`. */
  abort(): Promise<void>;
}

const TICK_MS = 250;

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useLab(): LabApi {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocks, setBlocks] = useState<LabBlock[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [micState, setMicState] = useState<MicState>('idle');
  const [db_, setDb] = useState<number | null>(null);
  const [percent, setPercent] = useState(0);
  const [bandStatus, setBandStatus] = useState<BandStatus>('low');
  const [drift, setDrift] = useState<Drift>('ok');
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const meterRef = useRef<AudioMeterController | null>(null);
  const sessionAccum = useRef(new DbAccumulator());
  const stepAccum = useRef(new DbAccumulator());
  const driftRef = useRef<DriftDetector | null>(null);
  const sessionRef = useRef<LabSession | null>(null);
  const deadlineRef = useRef<number>(0);
  const elapsedSecRef = useRef(0);
  /** Guards against `finish` and `abort` both landing on a fast double tap. */
  const writingRef = useRef(false);

  const steps = useMemo(() => flattenSteps(blocks), [blocks]);
  const step = steps[stepIndex] ?? null;
  const block = useMemo(
    () => blocks.find((b) => b.steps.some((s) => s.id === step?.id)) ?? null,
    [blocks, step],
  );

  const band = useMemo<TargetBandDb>(
    () => effectiveBand(profile ?? {}),
    [profile],
  );

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await getProfile();
      if (!alive) return;
      setProfile(p);
      setBlocks(buildRoutine(p));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    driftRef.current = new DriftDetector(band);
  }, [band]);

  // ── the microphone ────────────────────────────────────────────────────────
  const onMeasure = useCallback((m: { db: number; percent: number; bandStatus: BandStatus }) => {
    const now = Date.now();
    // `metered` is read off the ref chain rather than closed over, so the
    // callback does not have to be rebuilt — and torn down and restarted — on
    // every step change.
    const current = stepsRef.current[indexRef.current];
    if (!current?.metered) {
      setDb(null);
      setDrift('ok');
      return;
    }
    setDb(m.db);
    setPercent(m.percent);
    setBandStatus(m.bandStatus);
    sessionAccum.current.push(m.db);
    stepAccum.current.push(m.db);
    const d = driftRef.current?.push(m.db, now) ?? 'ok';
    setDrift(d);
  }, []);

  // Refs the meter callback reads, so it never needs re-binding mid-session.
  const stepsRef = useRef<LabStep[]>([]);
  const indexRef = useRef(0);
  stepsRef.current = steps;
  indexRef.current = stepIndex;

  const openMic = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported');
      return false;
    }
    setMicState('requesting');

    // The real-device test, once. Stored so a bad reading in week 9 can be told
    // apart from a device that was never capable of a good one.
    const p = await getProfile();
    if (!p.micProfile) {
      const micProfile = await runMicSelfTest();
      const nextProfile: Profile = { ...p, micProfile };
      await db.profile.put(nextProfile);
      await enqueue('profile', 'me');
      setProfile(nextProfile);
      if (!micProfile.ok) {
        setMicState('denied');
        return false;
      }
    }

    meterRef.current ??= new AudioMeterController();
    const ok = await meterRef.current.start(onMeasure, { band });
    setMicState(ok ? 'on' : 'denied');
    return ok;
  }, [band, onMeasure]);

  useEffect(() => {
    return () => {
      meterRef.current?.stop();
      meterRef.current = null;
    };
  }, []);

  // ── the clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running || !step) return;
    const id = setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(left);
      elapsedSecRef.current += TICK_MS / 1000;

      if (left > 0) return;

      // A mandatory step stops the clock and waits. It is never advanced for
      // him — that is the entire point of marking it mandatory.
      const current = stepsRef.current[indexRef.current];
      if (current?.mandatory) return;

      void advanceRef.current(false);
    }, TICK_MS);
    return () => clearInterval(id);
    // `advance` is stable via refs; re-running this on every step is intended.
  }, [running, step]);

  const armStep = useCallback((s: LabStep | undefined) => {
    stepAccum.current.reset();
    driftRef.current?.reset();
    setDrift('ok');
    setDb(null);
    if (!s) return;
    deadlineRef.current = Date.now() + s.durationSec * 1000;
    setRemainingMs(s.durationSec * 1000);
  }, []);

  // ── calibration hand-off ──────────────────────────────────────────────────
  const commitCalibration = useCallback(async (meanDb: number) => {
    const p = await getProfile();
    const patch = updateCalibration(p, meanDb);
    const nextProfile: Profile = { ...p, ...patch };

    const sample: VoiceSample = {
      id: newId('vs'),
      at: Date.now(),
      date: todayKey(),
      kind: 'baseline_db',
      value: Math.round(meanDb * 10) / 10,
      sessionId: sessionRef.current?.id,
    };

    await db.transaction('rw', db.profile, db.voiceSamples, db.outbox, async () => {
      await db.profile.put(nextProfile);
      await db.voiceSamples.put(sample);
      await enqueue('profile', 'me');
      await enqueue('voiceSamples', sample.id);
    });

    setProfile(nextProfile);
    if (meterRef.current && isCalibrated(nextProfile)) {
      const b = effectiveBand(nextProfile);
      meterRef.current.setBand(b);
      driftRef.current?.setBand(b);
    }
  }, []);

  // ── advancing ─────────────────────────────────────────────────────────────
  const advanceRef = useRef<(completed: boolean) => Promise<void>>(async () => {});

  const advance = useCallback(
    async (completed: boolean) => {
      const current = stepsRef.current[indexRef.current];
      if (!current) return;

      if (completed && sessionRef.current) {
        sessionRef.current.completedStepIds.push(current.id);
        if (current.kind === 'transfer') sessionRef.current.transferReps += 1;
      }

      if (current.kind === 'calibrate') {
        const mean = stepAccum.current.mean;
        // Only a step with real voiced audio in it calibrates anything. A
        // silent 30 seconds would drag the baseline toward the noise floor and
        // set a target he could only hit by not speaking.
        if (mean !== undefined && stepAccum.current.voicedFrames > 20) {
          await commitCalibration(mean);
        }
      }

      const nextIndex = indexRef.current + 1;
      if (nextIndex >= stepsRef.current.length) {
        await finishRef.current();
        return;
      }

      indexRef.current = nextIndex;
      setStepIndex(nextIndex);
      setBlockedReason(null);
      armStep(stepsRef.current[nextIndex]);
    },
    [armStep, commitCalibration],
  );
  advanceRef.current = advance;

  // ── writing the session ───────────────────────────────────────────────────
  const write = useCallback(async (aborted: boolean) => {
    if (writingRef.current) return;
    const session = sessionRef.current;
    if (!session) return;
    writingRef.current = true;

    meterRef.current?.stop();
    setMicState('idle');
    setRunning(false);
    setFinished(true);

    const avgDb = sessionAccum.current.mean;
    const finishedSession: LabSession = {
      ...session,
      endedAt: Date.now(),
      aborted,
      ...(avgDb !== undefined ? { avgDb: Math.round(avgDb * 10) / 10 } : {}),
    };

    const date = finishedSession.date;
    const seconds = Math.round(elapsedSecRef.current);
    const existing = (await db.days.get(date)) ?? emptyDay(date);
    const nextDay: DayRecord = {
      ...existing,
      // The Lab does not touch `coreThreeDone`. The streak counts the Core 3
      // and only the Core 3 — locked decision 4. A twelve-minute Lab on a day
      // with no Core 3 is still a broken streak, on purpose.
      labSessionDone: existing.labSessionDone || !aborted,
      labSeconds: (existing.labSeconds ?? 0) + seconds,
      secondsActive: existing.secondsActive + seconds,
    };

    const samples: VoiceSample[] = [];
    if (avgDb !== undefined) {
      samples.push({
        id: newId('vs'),
        at: Date.now(),
        date,
        kind: 'session_db',
        value: Math.round(avgDb * 10) / 10,
        sessionId: finishedSession.id,
      });
    }

    await db.transaction(
      'rw',
      db.labSessions,
      db.days,
      db.voiceSamples,
      db.outbox,
      async () => {
        await db.labSessions.put(finishedSession);
        await db.days.put(nextDay);
        await enqueue('labSessions', finishedSession.id);
        await enqueue('days', date);
        for (const s of samples) {
          await db.voiceSamples.put(s);
          await enqueue('voiceSamples', s.id);
        }
      },
    );

    sessionRef.current = finishedSession;
    writingRef.current = false;
  }, []);

  const finishRef = useRef<() => Promise<void>>(async () => {});
  const finish = useCallback(async () => {
    await write(false);
  }, [write]);
  finishRef.current = finish;

  const abort = useCallback(async () => {
    await write(true);
  }, [write]);

  // ── public actions ────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (started) return;
    const date = todayKey();
    sessionRef.current = {
      id: newId('lab'),
      date,
      startedAt: Date.now(),
      completedStepIds: [],
      transferReps: 0,
      aborted: false,
    };
    elapsedSecRef.current = 0;
    sessionAccum.current.reset();
    indexRef.current = 0;
    setStepIndex(0);
    setFinished(false);
    setStarted(true);

    // The routine runs whether or not he grants the microphone. Blocks A and B
    // are worth doing silently, and a permission prompt must never be the thing
    // standing between him and the twelve minutes.
    await openMic();

    armStep(stepsRef.current[0]);
    setRunning(true);
  }, [started, openMic, armStep]);

  const pause = useCallback(() => {
    setRunning(false);
    setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
  }, []);

  const resume = useCallback(() => {
    deadlineRef.current = Date.now() + remainingMs;
    setRunning(true);
  }, [remainingMs]);

  const next = useCallback(async () => {
    setBlockedReason(null);
    await advanceRef.current(true);
  }, []);

  const skip = useCallback(() => {
    const current = stepsRef.current[indexRef.current];
    if (current?.mandatory) {
      setBlockedReason(
        current.kind === 'transfer'
          ? 'This is the rep that transfers. Do it, then tap Done.'
          : 'This step cannot be skipped.',
      );
      return;
    }
    void advanceRef.current(false);
  }, []);

  const totalSec = useMemo(
    () => steps.reduce((s, x) => s + x.durationSec, 0),
    [steps],
  );
  const doneSec = useMemo(
    () => steps.slice(0, stepIndex).reduce((s, x) => s + x.durationSec, 0),
    [steps, stepIndex],
  );

  return {
    ready,
    blocks,
    block,
    step,
    stepIndex,
    totalSteps: steps.length,
    remainingSec: Math.ceil(remainingMs / 1000),
    progress: totalSec === 0 ? 0 : Math.min(1, doneSec / totalSec),
    started,
    running,
    finished,
    micState,
    db: step?.metered ? db_ : null,
    percent,
    bandStatus,
    band,
    drift,
    calibrated: isCalibrated(profile ?? {}),
    sessionsToCalibrate: calibrationRemaining(profile ?? {}),
    blockedReason,
    start,
    pause,
    resume,
    next,
    skip,
    finish,
    abort,
  };
}

