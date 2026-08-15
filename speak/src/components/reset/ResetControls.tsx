import type {
  PracticeEnvironment,
  ResetAction,
  ResetSnapshot,
  SessionDuration,
} from '../../features/reset/sessionState';

export function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="reset-screen-head">
      <span className="reset-kicker">{eyebrow}</span>
      <h1>{title}</h1>
    </header>
  );
}

export function DurationSelector({
  value,
  dispatch,
}: {
  value: SessionDuration;
  dispatch: (action: ResetAction) => void;
}) {
  const options = [
    [1, '60 sec', 'One spoken rep'],
    [3, '3 min', 'Reset + mission'],
    [20, '20 min', 'All six blocks'],
  ] as const;
  return (
    <div className="reset-duration" aria-label="Practice duration">
      {options.map(([duration, label, detail]) => (
        <button
          key={duration}
          type="button"
          className={`tap${value === duration ? ' is-selected' : ''}`}
          aria-pressed={value === duration}
          onClick={() => dispatch({ type: 'set-duration', duration })}
        >
          <strong>{label}</strong>
          <small>{detail}</small>
        </button>
      ))}
    </div>
  );
}

export function EnvironmentSelector({
  snapshot,
  dispatch,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
}) {
  const options: { value: PracticeEnvironment; label: string }[] = [
    { value: 'free', label: 'Can speak freely' },
    { value: 'quiet', label: 'Can speak quietly' },
    { value: 'silent', label: 'Cannot speak now' },
  ];
  return (
    <label className="reset-field-label">
      Environment
      <select
        value={snapshot.environment}
        onChange={(event) =>
          dispatch({ type: 'set-environment', environment: event.target.value as PracticeEnvironment })
        }
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function ResumePanel({
  snapshot,
  onResume,
}: {
  snapshot: ResetSnapshot;
  onResume: () => void;
}) {
  if (snapshot.session.status === 'idle' || snapshot.session.status === 'complete') return null;
  return (
    <section className="reset-resume-panel">
      <span className="reset-kicker">Unfinished practice</span>
      <strong>Your session is saved</strong>
      <p>
        {snapshot.session.interrupted
          ? 'SPEAK paused when the app left the foreground.'
          : 'Continue from the exact saved step.'}
      </p>
      <button type="button" className="reset-secondary tap" onClick={onResume}>Resume session</button>
    </section>
  );
}

