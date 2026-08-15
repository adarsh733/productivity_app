import { useInbox } from '../../features/inbox/useInbox';
import type { ResetAction, ResetSnapshot } from '../../features/reset/sessionState';
import { CloseIcon, MicrophoneIcon } from '../shell/Icons';

export default function CaptureSheet({
  snapshot,
  dispatch,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
}) {
  const inbox = useInbox();
  const liveItems = inbox.items.filter((item) => item.status !== 'discarded');
  const save = async () => {
    if (!snapshot.captureDraft.trim()) return;
    await inbox.add(snapshot.captureDraft);
    dispatch({ type: 'set-capture-draft', value: '' });
  };

  return (
    <main className="reset-overlay-screen">
      <header className="reset-overlay-head">
        <div><span className="reset-kicker">Global capture</span><h1>What did you want to say?</h1></div>
        <button type="button" className="reset-icon-button tap" aria-label="Close Capture" onClick={() => dispatch({ type: 'close-overlay' })}><CloseIcon /></button>
      </header>
      <section className="reset-overlay-body">
        <p className="reset-lead">Save the raw thought now. SPEAK will show what it becomes later.</p>
        <textarea
          className="reset-capture-field"
          rows={5}
          value={snapshot.captureDraft}
          placeholder="I could not explain why today’s launch delay was necessary."
          onChange={(event) => dispatch({ type: 'set-capture-draft', value: event.target.value })}
        />
        <button type="button" className="reset-primary tap" disabled={!snapshot.captureDraft.trim()} onClick={() => void save()}>Save on this device</button>
        <button type="button" className="reset-secondary tap" disabled>
          <MicrophoneIcon /> Voice capture follows in the next recording slice
        </button>

        {liveItems.length > 0 && (
          <section className="reset-capture-queue">
            <span className="reset-kicker">Visible processing outcome</span>
            {liveItems.slice(0, 6).map((item) => (
              <article key={item.id}>
                <div><strong>{item.text}</strong><small>{item.status === 'processed' ? 'Mission created' : 'Saved locally · waiting for mission assembly'}</small></div>
                <button type="button" className="reset-text-action tap" onClick={() => void inbox.discard(item.id)}>Discard</button>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}

