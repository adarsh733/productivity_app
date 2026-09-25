import { useEffect, useRef, useState } from 'react';
import {
  AudioMeterController,
  DEFAULT_TARGET_BAND,
  type VolumeMeasurement,
} from '../../lib/audioMeter';

export default function LiveDbMeter() {
  const [active, setActive] = useState(false);
  const [measurement, setMeasurement] = useState<VolumeMeasurement>({
    rms: 0,
    db: -60,
    percent: 0,
    bandStatus: 'low',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const meterRef = useRef<AudioMeterController | null>(null);

  useEffect(() => {
    meterRef.current = new AudioMeterController();
    return () => {
      meterRef.current?.stop();
    };
  }, []);

  const toggleMic = async () => {
    if (active) {
      meterRef.current?.stop();
      setActive(false);
      setMeasurement({ rms: 0, db: -60, percent: 0, bandStatus: 'low' });
    } else {
      setErrorMsg(null);
      const ok = await meterRef.current?.start((m) => {
        setMeasurement(m);
      });
      if (ok) {
        setActive(true);
      } else {
        setErrorMsg('Microphone access denied or unavailable.');
      }
    }
  };

  const { db, percent, bandStatus } = measurement;

  return (
    <div className="db-meter-card">
      <header className="db-meter-header">
        <h2 className="db-meter-title">Live Volume Meter</h2>
        <span className={`db-status-badge ${active ? 'is-active' : ''}`}>
          {active ? 'LIVE' : 'OFF'}
        </span>
      </header>

      <p className="db-meter-desc">
        Real-time volume analysis to train speaking in your resonant band without over-driving.
      </p>

      <div className="db-display">
        <span className="db-value">{active ? `${Math.round(db)} dB` : '—'}</span>
        <span className="db-label">Volume Level</span>
      </div>

      <div className="db-bar-track" aria-label={`Volume level: ${percent}%`}>
        {/* Target Band Highlight Zone */}
        <div
          className="db-target-zone"
          style={{
            left: `${DEFAULT_TARGET_BAND.minDb + 60}%`,
            width: `${DEFAULT_TARGET_BAND.maxDb - DEFAULT_TARGET_BAND.minDb}%`,
          }}
          title="Target Phonation Band"
        />

        {/* Live Level Bar */}
        <div
          className={`db-bar-fill band-${bandStatus}`}
          style={{ width: `${active ? percent : 0}%` }}
        />
      </div>

      {active && (
        <div className={`db-nudge nudge-${bandStatus}`}>
          {bandStatus === 'high' && '⚠️ Over-driving! Ease off air pressure.'}
          {bandStatus === 'target' && '✨ Sweet spot! Resonant and relaxed.'}
          {bandStatus === 'low' && 'Speak out loud into your target band.'}
        </div>
      )}

      {errorMsg && <p className="warn">{errorMsg}</p>}

      <button
        type="button"
        className={`btn big tap ${active ? 'btn-ghost' : 'btn-primary'}`}
        onClick={toggleMic}
      >
        {active ? 'Stop Meter' : 'Start Live Meter'}
      </button>
    </div>
  );
}
