import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayRecord, LabStep, VoiceSample } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { AudioMeterController, PhonationDetector } from '../../lib/audioMeter';
import { isMptDue, readMpt, type MptReading } from './calibration';
import { MPT_FLOW } from './routine';
import { emptyDay } from '../session/day';
import { todayKey } from '../../lib/date';
import type { MicState } from './useLab';

/**
 * M10 — the weekly maximum-phonation-time test.
 *
 * Two numbers: the hold at habitual volume (the headline metric, 15–16 s at
 * baseline, 24–25 s at week 12) and the hold at soft volume (already ~25 s).
 * What actually matters is the **gap between them** — a deficit of ~10 s today
 * that should fall below 3 s. The reading is never computed here; it comes from
 * `readMpt` in `calibration.ts`, so there is one definition of what the gap
 * means and it is under test.
 *
 * **The clock is stopped by the microphone, not by his thumb.** Asking him to
 * tap when the note dies measures reaction time on top of breath, and it
 * measures it inconsistently — worse, it is tappable early on a bad day and
 * late on a good one, which is exactly the bias that would make the headline
 * number untrustworthy over twelve weeks.
 */

export interface MptTestApi {
  ready: boolean;
  /** Weekly cadence. False until seven days after the last test. */
  due: boolean;
  step: LabStep | null;
  stepIndex: number;
  totalSteps: number;
  started: boolean;
  finished: boolean;
  micState: MicState;
  /** Live seconds held; freezes at the measured value once the note stops. */
  heldSec: number;
  /** True once the mic has called the hold over and is waiting for a tap. */
  autoStopped: boolean;
  /** Whole seconds left before the step's own ceiling cuts it off. */
  remainingSec: number;
  habitualSec: number | null;
  softSec: number | null;
  /** Available once both holds are recorded. The gap, and what it means. */
  reading: MptReading | null;
  start(): Promise<void>;
  /** Move to the next step. On an `mpt` step this banks the measured hold. */
  next(): Promise<void>;
  abort(): void;
}

const TICK_MS = 200;

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useMptTest(): MptTestApi {
  const [ready, setReady] = useState(false);
  const [due, setDue] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [micState, setMicState] = useState<MicState>('idle');
  const [heldSec, setHeldSec] = useState(0);
  const [autoStopped, setAutoStopped] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [habitualSec, setHabitualSec] = useState<number | null>(null);
  const [softSec, setSoftSec] = useState<number | null>(null);

  const meterRef = useRef<AudioMeterController | null>(null);
  const detectorRef = useRef(new PhonationDetector());
  const indexRef = useRef(0);
  const deadlineRef = useRef(0);
  const startedAtRef = useRef(0);

  const step = MPT_FLOW[stepIndex] ?? null;

  // ── due? ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const samples = await db.voiceSamples.where('kind').equals('mpt_habitual').toArray();
      if (!alive) return;
      samples.sort((a, b) => b.at - a.at);
      setDue(isMptDue(samples[0]));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      meterRef.current?.stop();
      meterRef.current = null;
    };
  }, []);

  // ── the clock and the detector ────────────────────────────────────────────
  useEffect(() => {
    if (!started || finished || !step) return;
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));

      if (step.kind !== 'mpt') {
        // A plain rest step. Roll on when its timer runs out.
        if (Date.now() >= deadlineRef.current) void advanceRef.current();
        return;
      }

      const d = detectorRef.current;
      if (d.current === 'phonating') setHeldSec(d.durationSec(Date.now()));

      if (d.current === 'stopped') {
        setHeldSec(d.durationSec());
        setAutoStopped(true);
        return;
      }

      // The ceiling. If he is still going when it lands, the hold is credited
      // in full — the cap exists so a forgotten screen does not run forever,
      // not to shorten a genuinely long hold.
      if (Date.now() >= deadlineRef.current) {
        setHeldSec(d.durationSec(Date.now()));
        setAutoStopped(true);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [started, finished, step]);

  const onMeasure = useCallback((m: { db: number }) => {
    const current = MPT_FLOW[indexRef.current];
    if (current?.kind !== 'mpt') return;
    detectorRef.current.push(m.db, Date.now());
  }, []);

  const armStep = useCallback((s: LabStep | undefined) => {
    detectorRef.current.reset();
    setHeldSec(0);
    setAutoStopped(false);
    if (!s) return;
    startedAtRef.current = Date.now();
    deadlineRef.current = Date.now() + s.durationSec * 1000;
    setRemainingMs(s.durationSec * 1000);
  }, []);

  // ── writing ───────────────────────────────────────────────────────────────
  const bank = useCallback(async (s: LabStep, seconds: number) => {
    if (!s.sampleKind || seconds <= 0) return;
    const date = todayKey();

    const sample: VoiceSample = {
      id: newId('vs'),
      at: Date.now(),
      date,
      kind: s.sampleKind,
      value: seconds,
    };

    if (s.sampleKind === 'mpt_habitual') setHabitualSec(seconds);
    if (s.sampleKind === 'mpt_soft') setSoftSec(seconds);

    const existing = (await db.days.get(date)) ?? emptyDay(date);
    // Only the habitual hold feeds `bestMptSec`. The soft hold is longer by
    // definition, so mixing them in would make the headline number rise the
    // moment he speaks quietly rather than when the habit changes.
    const nextDay: DayRecord =
      s.sampleKind === 'mpt_habitual'
        ? { ...existing, bestMptSec: Math.max(existing.bestMptSec ?? 0, seconds) }
        : existing;

    await db.transaction('rw', db.voiceSamples, db.days, db.outbox, async () => {
      await db.voiceSamples.put(sample);
      await enqueue('voiceSamples', sample.id);
      if (nextDay !== existing) {
        await db.days.put(nextDay);
        await enqueue('days', date);
      }
    });
  }, []);

  const advanceRef = useRef<() => Promise<void>>(async () => {});

  const advance = useCallback(async () => {
    const current = MPT_FLOW[indexRef.current];
    if (current?.kind === 'mpt') {
      await bank(current, detectorRef.current.durationSec(Date.now()));
    }

    const nextIndex = indexRef.current + 1;
    if (nextIndex >= MPT_FLOW.length) {
      meterRef.current?.stop();
      setMicState('idle');
      setFinished(true);
      return;
    }

    indexRef.current = nextIndex;
    setStepIndex(nextIndex);
    armStep(MPT_FLOW[nextIndex]);
  }, [bank, armStep]);
  advanceRef.current = advance;

  const start = useCallback(async () => {
    if (started) return;
    indexRef.current = 0;
    setStepIndex(0);
    setFinished(false);
    setHabitualSec(null);
    setSoftSec(null);
    setStarted(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported');
    } else {
      setMicState('requesting');
      meterRef.current ??= new AudioMeterController();
      const ok = await meterRef.current.start(onMeasure);
      setMicState(ok ? 'on' : 'denied');
    }

    armStep(MPT_FLOW[0]);
  }, [started, onMeasure, armStep]);

  const abort = useCallback(() => {
    meterRef.current?.stop();
    setMicState('idle');
    setStarted(false);
    setFinished(false);
    indexRef.current = 0;
    setStepIndex(0);
    detectorRef.current.reset();
    setHeldSec(0);
    setAutoStopped(false);
  }, []);

  const reading = useMemo(
    () => (habitualSec !== null && softSec !== null ? readMpt(habitualSec, softSec) : null),
    [habitualSec, softSec],
  );

  return {
    ready,
    due,
    step,
    stepIndex,
    totalSteps: MPT_FLOW.length,
    started,
    finished,
    micState,
    heldSec,
    autoStopped,
    remainingSec: Math.ceil(remainingMs / 1000),
    habitualSec,
    softSec,
    reading,
    start,
    next: advance,
    abort,
  };
}
