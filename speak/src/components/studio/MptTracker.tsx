import { useEffect, useRef, useState } from 'react';

export interface MptRecord {
  softSec: number;
  loudSec: number;
}

interface MptTrackerProps {
  onLogMpt?: (record: MptRecord) => void;
}

export default function MptTracker({ onLogMpt }: MptTrackerProps) {
  const [mode, setMode] = useState<'soft' | 'loud'>('soft');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [softBest, setSoftBest] = useState<number>(0);
  const [loudBest, setLoudBest] = useState<number>(0);

  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 100) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      const score = elapsed;
      if (mode === 'soft') {
        const nextSoft = Math.max(softBest, score);
        setSoftBest(nextSoft);
        onLogMpt?.({ softSec: nextSoft, loudSec: loudBest });
      } else {
        const nextLoud = Math.max(loudBest, score);
        setLoudBest(nextLoud);
        onLogMpt?.({ softSec: softBest, loudSec: nextLoud });
      }
    } else {
      setElapsed(0);
      setRunning(true);
    }
  };

  const gap = softBest > 0 && loudBest > 0 ? softBest - loudBest : null;

  return (
    <div className="mpt-tracker-card">
      <header className="mpt-header">
        <h2 className="mpt-title">MPT Phonation Gap Tracker</h2>
      </header>

      <p className="mpt-desc">
        Sustain an &ldquo;Ahhh&rdquo; sound. Measure soft vs loud duration to track efficiency and eliminate over-drive.
      </p>

      <div className="mpt-mode-selector">
        <button
          type="button"
          className={`btn tap ${mode === 'soft' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            if (!running) setMode('soft');
          }}
        >
          Soft Hold (Target)
        </button>

        <button
          type="button"
          className={`btn tap ${mode === 'loud' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            if (!running) setMode('loud');
          }}
        >
          Loud Hold
        </button>
      </div>

      <div className="mpt-display">
        <span className="mpt-timer">
          {elapsed.toFixed(1)}
          <span className="unit">s</span>
        </span>
        <span className="mpt-label">Current {mode} phonation hold</span>
      </div>

      <button
        type="button"
        className={`btn big tap ${running ? 'is-running' : 'btn-primary'}`}
        onClick={toggleTimer}
      >
        {running ? 'Stop Phonation' : `Start ${mode.toUpperCase()} Hold`}
      </button>

      <div className="mpt-scores-grid">
        <div className="mpt-score-tile">
          <span className="score-value">{softBest > 0 ? `${softBest.toFixed(1)}s` : '—'}</span>
          <span className="score-label">Soft Best (Target)</span>
        </div>

        <div className="mpt-score-tile">
          <span className="score-value">{loudBest > 0 ? `${loudBest.toFixed(1)}s` : '—'}</span>
          <span className="score-label">Loud Best</span>
        </div>
      </div>

      {gap !== null && (
        <div className="mpt-insight">
          {gap >= 5 ? (
            <p className="insight-good">
              ✨ Great control! Soft phonation lasts {gap.toFixed(1)}s longer than loud.
            </p>
          ) : (
            <p className="insight-warn">
              ⚠️ Narrow gap ({gap.toFixed(1)}s). Focus on relaxing throat tension during loud holds.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
