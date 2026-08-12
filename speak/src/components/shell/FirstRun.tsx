import { useState } from 'react';

const FIRST_RUN_KEY = 'speak.firstRun.v1';

export function isFirstRunCompleted(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setFirstRunCompleted(): void {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
  } catch {
    // ignore restricted storage errors
  }
}

interface FirstRunProps {
  onComplete: () => void;
}

export default function FirstRun({ onComplete }: FirstRunProps) {
  const [panel, setPanel] = useState<number>(1);

  const finish = () => {
    setFirstRunCompleted();
    onComplete();
  };

  const next = () => {
    if (panel < 3) {
      setPanel((p) => p + 1);
    } else {
      finish();
    }
  };

  return (
    <div className="firstrun">
      <div className="firstrun-header">
        <button type="button" className="firstrun-skip tap" onClick={finish}>
          Skip
        </button>
      </div>

      <div className="firstrun-body">
        {panel === 1 && (
          <div className="firstrun-panel">
            <h1 className="firstrun-title">This is a speaking app.</h1>
            <p className="firstrun-desc">
              Every card ends with saying something out loud. Cards do not advance until you speak it.
            </p>
          </div>
        )}

        {panel === 2 && (
          <div className="firstrun-panel">
            <h1 className="firstrun-title">Three cards a day is a full day.</h1>
            <p className="firstrun-desc">
              Core 3 is your daily floor. Finish it in 3 minutes to hold your streak. Rest days are automatic.
            </p>
          </div>
        )}

        {panel === 3 && (
          <div className="firstrun-panel">
            <h1 className="firstrun-title">Tap when you’ve said it.</h1>
            <p className="firstrun-desc">
              Tap <strong>Got it</strong> or swipe up once you speak the prompt. Tap <strong>Again</strong> if you stumble.
            </p>
          </div>
        )}
      </div>

      <div className="firstrun-footer">
        <div className="firstrun-dots" aria-label={`Step ${panel} of 3`}>
          <span className={`firstrun-dot${panel === 1 ? ' is-active' : ''}`} />
          <span className={`firstrun-dot${panel === 2 ? ' is-active' : ''}`} />
          <span className={`firstrun-dot${panel === 3 ? ' is-active' : ''}`} />
        </div>

        <button type="button" className="btn btn-primary big firstrun-cta tap" onClick={next}>
          {panel === 3 ? 'Start Core 1' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
