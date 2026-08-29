import type { UseCaptureReturn } from '../../features/capture/useCapture';
import { useModalTrap } from '../../lib/useModalTrap';
import { CloseIcon, MicrophoneIcon } from '../shell/Icons';

export interface CaptureSheetProps {
  capture: UseCaptureReturn;
}

export default function CaptureSheet({ capture }: CaptureSheetProps) {
  const { draft, setDraft, save, discard, liveItems, closeCapture } = capture;

  const { containerRef, handleBackdropClick } = useModalTrap<HTMLDivElement>({
    isOpen: true,
    onClose: closeCapture,
    modalId: 'capture-sheet',
  });

  const handleSave = async () => {
    await save();
  };

  return (
    <div
      className="deck-modal-overlay capture-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-title"
      onClick={handleBackdropClick}
    >
      <main className="deck-modal-container capture-sheet-container" ref={containerRef} tabIndex={-1}>
        <header className="deck-modal-header capture-sheet-header">
          <div>
            <span className="kicker">Global capture</span>
            <h1 id="capture-title" className="h1s capture-sheet-title">What did you want to say?</h1>
          </div>
          <button
            type="button"
            className="deck-modal-close-btn tap"
            aria-label="Close Capture"
            onClick={closeCapture}
          >
            <CloseIcon />
          </button>
        </header>
        <section className="deck-modal-card-body capture-sheet-body">
          <p className="capture-sheet-lead">
            Save the raw thought now. SPEAK will show what it becomes later.
          </p>
          <textarea
            className="capture-field"
            rows={5}
            value={draft}
            placeholder="I could not explain why today’s launch delay was necessary."
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Your captured thought"
          />
          <button
            type="button"
            className="prim tap capture-save-btn"
            disabled={!draft.trim()}
            onClick={() => void handleSave()}
          >
            Save on this device
          </button>
          <button type="button" className="capture-voice-disabled-btn tap" disabled>
            <MicrophoneIcon /> <span>Voice capture follows in the next recording slice</span>
          </button>

          {liveItems.length > 0 && (
            <section className="capture-queue-section" aria-label="Captured items queue">
              <span className="kicker">Visible processing outcome</span>
              <div className="capture-queue-list">
                {liveItems.slice(0, 6).map((item) => (
                  <article key={item.id} className="capture-queue-item">
                    <div className="capture-queue-item-info">
                      <strong>{item.text}</strong>
                      <small>
                        {item.status === 'processed'
                          ? 'Mission created'
                          : 'Saved locally · waiting for mission assembly'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="capture-discard-btn tap"
                      onClick={() => void discard(item.id)}
                      aria-label={`Discard thought: ${item.text}`}
                    >
                      Discard
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
