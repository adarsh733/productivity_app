import type { ResetAction, ResetSnapshot } from '../../features/reset/sessionState';
import { CloseIcon } from '../shell/Icons';

export default function RescueFlow({
  snapshot,
  dispatch,
  recordUrge,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
  recordUrge: () => Promise<void>;
}) {
  const step = snapshot.rescueStep;
  const close = () => dispatch({ type: 'close-overlay' });
  return (
    <main className="reset-overlay-screen reset-rescue">
      <header className="reset-overlay-head">
        <div><span className="reset-kicker">Impulse Rescue</span><h1>{step === 0 ? 'You came here instead' : 'Redirect the urge'}</h1></div>
        <button type="button" className="reset-icon-button tap" aria-label="Close Rescue" onClick={close}><CloseIcon /></button>
      </header>
      <section className="reset-overlay-body reset-rescue-body">
        {step === 0 && (
          <>
            <p className="reset-lead">No feed. No streak. One useful response, then a clear exit.</p>
            <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'set-rescue-step', step: 1 })}>I came here instead</button>
          </>
        )}
        {step === 1 && (
          <>
            <span className="reset-time">00:45</span>
            <h2>Give a concise product-status update</h2>
            <div className="reset-prompt"><span>Three beats</span><strong>What changed → what is blocked → what happens next</strong></div>
            <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'set-rescue-step', step: 2 })}>I said or prepared it</button>
          </>
        )}
        {step === 2 && (
          <>
            <span className="reset-kicker">Meaningful interruption</span>
            <h2>Urge redirected</h2>
            <p>You replaced an impulsive check with one intentional response.</p>
            <button type="button" className="reset-primary tap" onClick={() => {
              void recordUrge();
              dispatch({ type: 'set-rescue-step', step: 3 });
            }}>Put the phone down</button>
            <button type="button" className="reset-secondary tap" onClick={() => {
              void recordUrge();
              dispatch({ type: 'set-rescue-step', step: 0 });
              dispatch({ type: 'close-overlay' });
            }}>Continue into deliberate practice</button>
          </>
        )}
        {step === 3 && (
          <>
            <span className="reset-kicker">Done</span>
            <h2>Leave SPEAK here</h2>
            <p>Your redirect is recorded. No next item will appear.</p>
            <button type="button" className="reset-primary tap" onClick={() => {
              dispatch({ type: 'set-rescue-step', step: 0 });
              close();
            }}>Close SPEAK</button>
          </>
        )}
      </section>
    </main>
  );
}

