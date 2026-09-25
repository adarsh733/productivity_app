import { useEffect, useRef, useState } from 'react';
import {
  AudioMeterController,
  DEFAULT_TARGET_BAND,
  PhonationDetector,
  noiseFloorFromDbs,
} from '../../lib/audioMeter';
import { DriftDetector, effectiveBand, isCalibrated } from '../../features/lab/calibration';
import { db } from '../../db/db';
import {
  classifyLadderLevel,
  gradePauseRep,
  longestVoicedStretch,
  paletteForDay,
} from '../../features/lab/drills';
import { paceTarget } from '../../features/speak/pace';
import { todayKey } from '../../lib/date';

function useProfileBaseline() {
  const [baselineDb, setBaselineDb] = useState<number | undefined>(undefined);
  const [calibrated, setCalibrated] = useState(false);
  const [paceBaselineWpm, setPaceBaselineWpm] = useState<number | undefined>(undefined);
  useEffect(() => {
    void db.profile.get('me').then((p) => {
      setBaselineDb(p?.baselineDb);
      setCalibrated(isCalibrated({ baselineDb: p?.baselineDb, calibrationSamples: p?.calibrationSamples }));
      setPaceBaselineWpm(p?.baselineWpm);
    });
  }, []);
  return { baselineDb, calibrated, paceBaselineWpm };
}

function MeterBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="audio-recorder-meter" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="audio-recorder-meter-bar" style={{ width: `${Math.max(percent, 2)}%` }} />
    </div>
  );
}

function useLiveMeter(active: boolean) {
  const [db, setDb] = useState(-60);
  const [percent, setPercent] = useState(0);
  const [micOff, setMicOff] = useState(false);
  const samplesRef = useRef<Array<{ db: number; atMs: number }>>([]);
  const ctrlRef = useRef<AudioMeterController | null>(null);

  useEffect(() => {
    if (!active) return;
    samplesRef.current = [];
    const ctrl = new AudioMeterController();
    ctrlRef.current = ctrl;
    let dead = false;
    void ctrl.start((m) => {
      if (dead) return;
      setDb(m.db);
      setPercent(m.percent);
      samplesRef.current.push({ db: m.db, atMs: performance.now() });
    }).then((ok) => {
      if (!ok && !dead) setMicOff(true);
    });
    return () => {
      dead = true;
      ctrl.stop();
      ctrlRef.current = null;
    };
  }, [active]);

  return { db, percent, micOff, samplesRef };
}

export function QuietVoiceDrill() {
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { calibrated, baselineDb } = useProfileBaseline();
  const { db, percent, micOff, samplesRef } = useLiveMeter(active);
  const driftRef = useRef(new DriftDetector(DEFAULT_TARGET_BAND));
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    void db;
    if (!active || micOff) return;
    void db;
  }, [active, micOff, db]);

  useEffect(() => {
    if (!active) return;
    if (baselineDb !== undefined) {
      const band = effectiveBand({ baselineDb, calibrationSamples: 7 });
      driftRef.current.setBand(band);
    }
    const t = window.setInterval(() => {
      const samples = samplesRef.current;
      const last = samples[samples.length - 1];
      if (!last) return;
      const drift = driftRef.current.push(last.db, last.atMs);
      setNudge(drift === 'over');
    }, 250);
    return () => window.clearInterval(t);
  }, [active, baselineDb]);

  const stop = () => {
    const samples = samplesRef.current;
    setActive(false);
    if (samples.length === 0) {
      setResult('Mic off — timed cue only, nothing measured.');
      return;
    }
    const band = baselineDb !== undefined ? effectiveBand({ baselineDb, calibrationSamples: 7 }) : null;
    const inZone = band ? samples.filter((s) => s.db >= band.minDb && s.db <= band.maxDb).length : 0;
    const pct = Math.round((inZone / Math.max(1, samples.length)) * 100);
    setResult(
      calibrated && band
        ? `${pct}% of time in your zone.`
        : `Raw level only — calibrate first for a target zone. (${samples.length} frames)`,
    );
  };

  return (
    <section className="you-section">
      <b>Quiet voice · 2 min</b>
      <p className="sub">Hold level 2 for four sentences. Drifting above your zone for more than 1.5 s shows a nudge.</p>
      {!active ? (
        <button type="button" className="prim tap" onClick={() => { setResult(null); setActive(true); }}>Start</button>
      ) : (
        <>
          <MeterBar percent={percent} label="Quiet voice level" />
          {nudge && <p className="audio-recorder-error" role="alert">Softer. Pause instead.</p>}
          {micOff && <p className="sub">Mic off — timed cue only.</p>}
          <button type="button" className="prim tap" onClick={stop}>Stop</button>
        </>
      )}
      {result && <p className="sub">{result}</p>}
    </section>
  );
}

export function VolumeLadderDrill() {
  const [active, setActive] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const { baselineDb, calibrated } = useProfileBaseline();
  const { percent, micOff, samplesRef } = useLiveMeter(active);

  const markAttempt = () => {
    const samples = samplesRef.current;
    samplesRef.current = [];
    if (samples.length === 0 || baselineDb === undefined) {
      setLevels((l) => [...l, -1]);
      return;
    }
    const voiced = samples.filter((s) => s.db > -55);
    const mean = voiced.length ? voiced.reduce((a, s) => a + s.db, 0) / voiced.length : -60;
    setLevels((l) => [...l, classifyLadderLevel(mean - baselineDb)]);
  };

  const stop = () => {
    setActive(false);
    if (micOff) setLevels([-1]);
  };

  return (
    <section className="you-section">
      <b>Volume ladder · 3 min</b>
      <p className="sub">Same sentence at 5 → 4 → 3 → 2 → 1 and back. Each attempt is levelled against your calibrated normal.</p>
      {!active ? (
        <button type="button" className="prim tap" onClick={() => { setLevels([]); setActive(true); }}>Start</button>
      ) : (
        <>
          <MeterBar percent={percent} label="Ladder level" />
          {micOff && <p className="sub">Mic off — timed cue only.</p>}
          <div className="playback-review-actions">
            <button type="button" className="tap" onClick={markAttempt}>Mark attempt</button>
            <button type="button" className="prim tap" onClick={stop}>Stop</button>
          </div>
        </>
      )}
      {levels.length > 0 && (
        <p className="sub">
          Landed: {levels.map((l) => (l === -1 ? '—' : `L${l}`)).join(' · ')}
          {!calibrated && ' (raw — calibrate for levels)'}
        </p>
      )}
    </section>
  );
}

export function Level1HoldDrill() {
  const [active, setActive] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const { percent, micOff, samplesRef } = useLiveMeter(active);
  const detectorRef = useRef(new PhonationDetector());

  useEffect(() => {
    if (active) detectorRef.current.reset();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => {
      const samples = samplesRef.current;
      const last = samples[samples.length - 1];
      if (last) detectorRef.current.push(last.db, last.atMs);
    }, 100);
    return () => window.clearInterval(t);
  }, [active]);

  const stop = () => {
    const samples = samplesRef.current;
    setActive(false);
    if (samples.length === 0) {
      setBest(null);
      return;
    }
    const dbs = samples.map((s) => s.db);
    const floor = noiseFloorFromDbs(dbs);
    setBest(longestVoicedStretch(samples, Math.max(floor, -55)));
  };

  return (
    <section className="you-section">
      <b>Level-1 hold · up to 60 s</b>
      <p className="sub">Quiet but voiced — never whispered. The clock stops when your voice drops out.</p>
      {!active ? (
        <button type="button" className="prim tap" onClick={() => { setBest(null); setActive(true); }}>Start</button>
      ) : (
        <>
          <MeterBar percent={percent} label="Level-1 hold" />
          {micOff && <p className="sub">Mic off — timed cue only.</p>}
          <button type="button" className="prim tap" onClick={stop}>Stop</button>
        </>
      )}
      {best !== null && <p className="sub">Longest hold: {best} s (target 60 s, no dropout).</p>}
      {best === null && !active && micOff && <p className="sub">Mic off — nothing measured.</p>}
    </section>
  );
}

export function PauseDrill() {
  const [active, setActive] = useState(false);
  const [reps, setReps] = useState<Array<{ pass: boolean; gapMs: number; overDb: number }>>([]);
  const { percent, micOff, samplesRef } = useLiveMeter(active);

  const markRep = () => {
    const samples = samplesRef.current;
    samplesRef.current = [];
    if (samples.length < 5) {
      setReps((r) => [...r, { pass: false, gapMs: 0, overDb: 0 }]);
      return;
    }
    // Honest proxy without word alignment: longest pause in the rep, and the
    // loudest frame over the rep average. Pass = pause ≥ 300 ms, peak ≤ +3 dB.
    const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
    let longestPause = 0;
    let pauseStart: number | null = null;
    for (const s of sorted) {
      if (s.db <= -55) {
        if (pauseStart === null) pauseStart = s.atMs;
      } else if (pauseStart !== null) {
        longestPause = Math.max(longestPause, s.atMs - pauseStart);
        pauseStart = null;
      }
    }
    const mean = samples.reduce((a, s) => a + s.db, 0) / samples.length;
    const peak = Math.max(...samples.map((s) => s.db));
    const graded = gradePauseRep({ gapBeforeKeywordMs: Math.round(longestPause), keywordDbOverAverage: Math.round((peak - mean) * 10) / 10 });
    setReps((r) => [...r, graded]);
  };

  return (
    <section className="you-section">
      <b>Pause, don&apos;t push · 2 min</b>
      <p className="sub">One key word, emphasised only by pausing before it. Pass = a pause of ≥ 300 ms with no loud burst (≤ +3 dB).</p>
      {!active ? (
        <button type="button" className="prim tap" onClick={() => { setReps([]); setActive(true); }}>Start</button>
      ) : (
        <>
          <MeterBar percent={percent} label="Pause drill" />
          {micOff && <p className="sub">Mic off — timed cue only.</p>}
          <div className="playback-review-actions">
            <button type="button" className="tap" onClick={markRep}>Mark rep</button>
            <button type="button" className="prim tap" onClick={() => setActive(false)}>Stop</button>
          </div>
        </>
      )}
      {reps.map((r, i) => (
        <p className="sub" key={i}>
          Rep {i + 1}: {r.pass ? 'pass' : 'try again'} — pause {r.gapMs} ms, peak {r.overDb} dB over average.
        </p>
      ))}
    </section>
  );
}

export function PacerDrill() {
  const [active, setActive] = useState(false);
  const [lit, setLit] = useState(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const { paceBaselineWpm } = useProfileBaseline();
  const { target, starter } = paceTarget(paceBaselineWpm);
  const { micOff, samplesRef } = useLiveMeter(active);
  const startRef = useRef(0);
  const SENTENCE = 'I will look at it tomorrow morning and send a short update.';
  const words = SENTENCE.split(' ');

  useEffect(() => {
    if (!active) return;
    startRef.current = performance.now();
    samplesRef.current = [];
    const msPerWord = 60000 / target;
    const t = window.setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      setLit(Math.min(words.length, Math.floor(elapsed / msPerWord) + 1));
    }, 100);
    return () => window.clearInterval(t);
  }, [active, target, words.length, samplesRef]);

  const stop = () => {
    setActive(false);
    const secs = (performance.now() - startRef.current) / 1000;
    if (secs > 1 && !micOff) {
      const wpm = Math.round((words.length / secs) * 60);
      setMeasured(wpm);
      void db.profile.get('me').then(() => {
        // Baseline recompute happens weekly in Stage 4; drills only report.
      });
    } else {
      setMeasured(null);
    }
  };

  return (
    <section className="you-section">
      <b>Pacer · 2 min</b>
      <p className="sub">
        Read along as words light up at your {starter ? 'starter target' : 'target'} of {target} WPM.
      </p>
      <p className="sub">{words.map((w, i) => (
        <span key={i} style={{ fontWeight: i < lit ? 700 : 400 }}>{w} </span>
      ))}</p>
      {!active ? (
        <button type="button" className="prim tap" onClick={() => { setMeasured(null); setLit(0); setActive(true); }}>Start</button>
      ) : (
        <button type="button" className="prim tap" onClick={stop}>Stop</button>
      )}
      {measured !== null && <p className="sub">You read at {measured} WPM vs target {target} WPM.</p>}
      {measured === null && !active && <p className="sub">—</p>}
      {micOff && active && <p className="sub">Mic off — pacing lights only.</p>}
    </section>
  );
}

export function PaletteDrill() {
  const [recording, setRecording] = useState<0 | 1 | 2>(0);
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const [a, b] = paletteForDay(dayIdx);
  const { micOff } = useLiveMeter(recording !== 0);
  void micOff;

  return (
    <section className="you-section">
      <b>Emotional palette · 1 min</b>
      <p className="sub">One sentence in 2 modes, rotating daily. Record both, play back to back. No score — just listening.</p>
      <p className="sub">Today: <b>{a}</b> vs <b>{b}</b> — “I&apos;ll look at it tomorrow morning.”</p>
      {recording === 0 ? (
        <button type="button" className="prim tap" onClick={() => setRecording(1)}>Record mode 1</button>
      ) : recording === 1 ? (
        <button type="button" className="prim tap" onClick={() => setRecording(2)}>Next: record mode 2</button>
      ) : (
        <button type="button" className="prim tap" onClick={() => setRecording(0)}>Done — listen back to back</button>
      )}
    </section>
  );
}

export function MicCalibrationRow() {
  const { calibrated } = useProfileBaseline();
  const [msg, setMsg] = useState<string | null>(null);
  const today = todayKey();

  const runSelfTest = async () => {
    const { runMicSelfTest } = await import('../../lib/audioMeter');
    const profile = await db.profile.get('me');
    const res = await runMicSelfTest();
    await db.profile.put({ ...(profile ?? { id: 'me' as const, createdAt: Date.now() }), micProfile: res });
    setMsg(res.ok ? `Mic ok — room floor ${res.noiseFloorDb} dB.` : 'Mic blocked. Browsing still works fully.');
  };
  void today;

  return (
    <section className="you-section">
      <b>Mic &amp; calibration</b>
      <p className="sub">{calibrated ? 'Calibrated — meters show your target zone.' : 'Not calibrated yet — meters show raw level, no level claims.'}</p>
      <div className="playback-review-actions">
        <button type="button" className="tap" onClick={() => void runSelfTest()}>Run mic self-test</button>
      </div>
      {msg && <p className="sub">{msg}</p>}
    </section>
  );
}
