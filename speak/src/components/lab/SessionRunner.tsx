import { useLab } from '../../features/lab/useLab';

/**
 * The 12-minute voice routine runner (Blocks A–E from VOICE-PROFILE.md §6).
 *
 * - Pause/resume via useLab.
 * - Timed cues only when the mic is denied — never crashes.
 * - Measures wherever routine.ts marks a step metered.
 * - Mandatory transfer steps cannot be skipped forward past.
 */
export interface SessionRunnerProps {
  onClose: () => void;
}

export default function SessionRunner({ onClose }: SessionRunnerProps) {
  const lab = useLab();

  if (!lab.ready) {
    return (
      <div className="screen speak-screen">
        <p className="sub">Preparing your routine…</p>
      </div>
    );
  }

  if (!lab.started) {
    return (
      <div className="screen speak-screen">
        <header className="speak-header">
          <h1 className="h1s">12-minute voice routine</h1>
          <p className="sub speak-header-sub">
            Release → straw work → volume ladder → resonance → pause and tone.
            {lab.calibrated
              ? ' Metered against your own baseline.'
              : ` Calibrating: ${lab.sessionsToCalibrate} habitual session(s) to go — meters show raw level until then.`}
          </p>
        </header>
        <p className="sub">
          {lab.totalSteps} steps · about 12 minutes. You can pause any time.
          Transfer reps are mandatory — the timer will not skip them for you.
        </p>
        {lab.micState === 'denied' && (
          <p className="sub">
            Mic is off — the routine runs as timed cues. Nothing is measured.
          </p>
        )}
        <button type="button" className="prim tap" onClick={() => void lab.start()}>
          Start routine
        </button>
        <button type="button" className="tap" onClick={onClose}>
          Back
        </button>
      </div>
    );
  }

  if (lab.finished) {
    return (
      <div className="screen speak-screen">
        <header className="speak-header">
          <h1 className="h1s">Routine done</h1>
          <p className="sub speak-header-sub">
            Transfer reps completed — that is the number that says whether the session was real.
          </p>
        </header>
        <button type="button" className="prim tap" onClick={onClose}>
          Done ✓
        </button>
      </div>
    );
  }

  const step = lab.step;
  if (!step) return null;

  const mins = Math.floor(lab.remainingSec / 60);
  const secs = lab.remainingSec % 60;
  const showMeter = lab.micState === 'on' && lab.db !== null;

  return (
    <div className="screen speak-screen">
      <header className="speak-header">
        <span className="badge b-pace">
          Block {step.block} · Step {lab.stepIndex + 1}/{lab.totalSteps}
        </span>
        <h1 className="h1s">{step.title}</h1>
        <p className="sub speak-header-sub">{step.cue}</p>
        {step.feel && <p className="sub">{step.feel}</p>}
      </header>

      <div className="speak-drill-runner">
        <div className="audio-recorder-timer-display">
          <span className="audio-recorder-remaining">
            {mins}:{String(secs).padStart(2, '0')}
          </span>
          <span className="audio-recorder-elapsed">
            {lab.running ? 'running' : 'paused'}
          </span>
        </div>

        {showMeter ? (
          <div
            className="audio-recorder-meter"
            role="progressbar"
            aria-label="Live loudness"
            aria-valuenow={lab.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="audio-recorder-meter-bar" style={{ width: `${Math.max(lab.percent, 2)}%` }} />
          </div>
        ) : (
          <p className="sub">
            {lab.micState === 'denied' || lab.micState === 'unsupported'
              ? 'Mic off — timed cue only.'
              : lab.calibrated
                ? 'Listening… stay inside your target zone.'
                : 'Listening… raw level only until calibration completes.'}
          </p>
        )}

        {lab.blockedReason && (
          <p className="audio-recorder-error" role="alert">
            {lab.blockedReason}
          </p>
        )}

        <div className="playback-review-actions">
          {lab.running ? (
            <button type="button" className="tap" onClick={lab.pause}>
              Pause
            </button>
          ) : (
            <button type="button" className="tap" onClick={lab.resume}>
              Resume
            </button>
          )}
          <button type="button" className="prim tap" onClick={() => void lab.next()}>
            I did that →
          </button>
          <button type="button" className="tap" onClick={lab.skip}>
            Skip
          </button>
          <button type="button" className="tap" onClick={() => void lab.abort().then(onClose)}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
