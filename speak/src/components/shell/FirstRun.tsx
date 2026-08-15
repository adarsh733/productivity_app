import { useState } from 'react';
import type { PracticeEnvironment } from '../../features/reset/sessionState';
import { runAndStoreMicSetup } from '../../features/reset/useMissionMeter';

const FIRST_RUN_KEY = 'speak.firstRun.reset.v1';
const FIRST_RUN_PANEL_KEY = 'speak.firstRun.reset.panel';
const FIRST_RUN_ENVIRONMENT_KEY = 'speak.firstRun.reset.environment';

export function isFirstRunCompleted(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === 'true';
  } catch {
    return false;
  }
}

function initialPanel(): number {
  try {
    const value = Number(localStorage.getItem(FIRST_RUN_PANEL_KEY));
    return Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
  } catch {
    return 0;
  }
}

function initialEnvironment(): PracticeEnvironment {
  try {
    const value = localStorage.getItem(FIRST_RUN_ENVIRONMENT_KEY);
    return value === 'quiet' || value === 'silent' ? value : 'free';
  } catch {
    return 'free';
  }
}

export function setFirstRunCompleted(): void {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    localStorage.removeItem(FIRST_RUN_PANEL_KEY);
    localStorage.removeItem(FIRST_RUN_ENVIRONMENT_KEY);
  } catch {
    // Restricted storage does not block entry.
  }
}

interface FirstRunProps {
  onComplete: () => void;
  onEnvironment: (environment: PracticeEnvironment) => void;
}

export default function FirstRun({ onComplete, onEnvironment }: FirstRunProps) {
  const [panel, setPanel] = useState(initialPanel);
  const [environment, setEnvironment] = useState<PracticeEnvironment>(initialEnvironment);
  const [micStatus, setMicStatus] = useState<'idle' | 'checking' | 'ready' | 'denied' | 'limited'>(
    'idle',
  );

  const goTo = (next: number) => {
    setPanel(next);
    try {
      localStorage.setItem(FIRST_RUN_PANEL_KEY, String(next));
    } catch {
      // The current mount still keeps the panel in memory.
    }
  };

  const finish = () => {
    onEnvironment(environment);
    setFirstRunCompleted();
    onComplete();
  };

  const checkMicrophone = async () => {
    setMicStatus('checking');
    const result = await runAndStoreMicSetup();
    if (!result.ok) setMicStatus('denied');
    else if (!result.agcDisabled) setMicStatus('limited');
    else setMicStatus('ready');
  };

  return (
    <main className="reset-first-run">
      <header className="reset-first-run-head">
        <span className="reset-brand">SPEAK</span>
        <span className="reset-step-label">Setup {panel + 1} of 4</span>
      </header>

      <section className="reset-first-run-body">
        {panel === 0 && (
          <>
            <p className="reset-kicker">A personal communication coach</p>
            <h1>Say something meaningful. Repeat it better.</h1>
            <p className="reset-lead">
              Short spoken reps build calmer delivery, clearer structure and words you can retrieve in real conversations.
            </p>
            <div className="reset-note">
              SPEAK is a training tool, not a medical or diagnostic voice service.
            </div>
          </>
        )}

        {panel === 1 && (
          <>
            <p className="reset-kicker">What is possible now?</p>
            <h1>Choose your speaking environment</h1>
            <div className="reset-choice-list">
              {([
                ['free', 'Can speak freely', 'Full recording, volume and feedback'],
                ['quiet', 'Can speak quietly', 'Quiet register and short recordings'],
                ['silent', 'Cannot speak now', 'Prepare now; spoken loop remains incomplete'],
              ] as const).map(([value, title, detail]) => (
                <button
                  key={value}
                  type="button"
                  className={`reset-choice tap${environment === value ? ' is-selected' : ''}`}
                  onClick={() => {
                    setEnvironment(value);
                    try {
                      localStorage.setItem(FIRST_RUN_ENVIRONMENT_KEY, value);
                    } catch {
                      // The choice still survives this mount in React state.
                    }
                  }}
                >
                  <span><strong>{title}</strong><small>{detail}</small></span>
                  <span className="reset-radio" aria-hidden="true" />
                </button>
              ))}
            </div>
          </>
        )}

        {panel === 2 && (
          <>
            <p className="reset-kicker">Microphone self-test</p>
            <h1>Check what this phone can measure</h1>
            <p className="reset-lead">
              The test records the room noise floor and whether the browser kept automatic gain disabled. It does not claim absolute room decibels.
            </p>
            {micStatus === 'idle' && <div className="reset-note">No audio leaves the device during this test.</div>}
            {micStatus === 'checking' && <div className="reset-note">Listening to the room for one second…</div>}
            {micStatus === 'ready' && <div className="reset-note is-success">Microphone ready for comparable practice.</div>}
            {micStatus === 'limited' && <div className="reset-note is-warning">Automatic gain stayed on. Practice still works; long-term comparisons will be labelled limited.</div>}
            {micStatus === 'denied' && <div className="reset-note is-warning">Microphone access was denied. You can continue and restore permission later.</div>}
            <button className="reset-primary tap" type="button" onClick={() => void checkMicrophone()} disabled={micStatus === 'checking'}>
              {micStatus === 'idle' || micStatus === 'denied' ? 'Run microphone check' : 'Run check again'}
            </button>
          </>
        )}

        {panel === 3 && (
          <>
            <p className="reset-kicker">Comparable setup</p>
            <h1>Place the phone about 30 cm away</h1>
            <ul className="reset-plain-list">
              <li>Use the same phone and built-in microphone.</li>
              <li>Keep the screen facing you in a reasonably quiet room.</li>
              <li>Speak naturally, not toward the microphone.</li>
              <li>Anywhere-mode practice still counts when this setup is not possible.</li>
            </ul>
          </>
        )}
      </section>

      <footer className="reset-first-run-footer">
        {panel > 0 && <button type="button" className="reset-text-action tap" onClick={() => goTo(panel - 1)}>Back</button>}
        <button type="button" className="reset-primary tap" onClick={() => panel === 3 ? finish() : goTo(panel + 1)}>
          {panel === 3 ? 'Go to Today' : 'Continue'}
        </button>
      </footer>
    </main>
  );
}
