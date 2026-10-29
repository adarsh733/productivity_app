import type { ReactNode } from 'react';
import type { AskView } from '../../features/ask/askPipeline';
import { ASK_ANSWER_UNSURE } from '../../features/ask/askPipeline';
import { KIND_LABELS, TRACK_LABELS } from '../../features/skills/trackOf';

export interface AskAnswerProps {
  view: AskView;
  /** How many cards were added to the feed; null until he taps the button. */
  added: number | null;
  adding?: boolean;
  onAdd?: () => void;
  /** "Tap to try again" when the check could not run: re-runs only the check. */
  onRetryCheck?: () => void;
  /** True while that retry runs. */
  checking?: boolean;
}

/** Turns "Could [[you share]] it" into text with the chunk marked. */
export function renderChunks(text: string): ReactNode[] {
  return text.split(/(\[\[[^\]]+\]\])/g).map((part, i) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <mark key={i} className="ask-chunk">
        {part.slice(2, -2)}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function plain(text: string): string {
  return text.replace(/\[\[|\]\]/g, '');
}

const VERSION_LABELS = [
  { key: 'crisp', label: 'Crisp', hint: 'Shortest. Point first.' },
  { key: 'confident', label: 'Confident', hint: 'No hedges. Clear next step.' },
  { key: 'polite', label: 'Polite', hint: 'Warm. For seniors and clients.' },
] as const;

/**
 * What comes back after he sends a question: the one plain line when
 * something went wrong, the short answer, the Fix my sentence view, cards he
 * already has ("From your library") and new checked ones ("New · checked").
 */
export default function AskAnswer({
  view,
  added,
  adding = false,
  onAdd,
  onRetryCheck,
  checking = false,
}: AskAnswerProps) {
  const fixView = view.askKind === 'fix_sentence' && view.versions;
  const count = view.fresh.length;

  return (
    <div className="ask-answer" data-testid="ask-answer">
      {view.line && (
        <p className="ask-line" role="status" data-failure={view.failure ?? undefined}>
          {view.line}
        </p>
      )}

      {view.answer && <p className="ask-rule">{view.answer}</p>}

      {view.answer && view.answerCheck === 'rejected' && (
        <p className="ask-unsure" data-testid="ask-unsure">
          {ASK_ANSWER_UNSURE}
        </p>
      )}

      {view.answer && view.changes && (
        <p className="ask-changes" data-testid="ask-changes">
          <span className="ask-changes-label">What I'll change</span> {view.changes}
        </p>
      )}

      {view.answer && view.checkLine && (
        view.canRetryCheck && onRetryCheck ? (
          <button type="button" className="ask-retry tap" onClick={onRetryCheck} disabled={checking}>
            {checking ? 'Checking…' : view.checkLine}
          </button>
        ) : (
          <p className="ask-check-line" role="status">
            {view.checkLine}
          </p>
        )
      )}

      {fixView && view.versions && (
        <section className="ask-fix" aria-label="Fix my sentence">
          <h2 className="ask-h2">Fix my sentence</h2>
          {VERSION_LABELS.map((v) => (
            <article key={v.key} className="ask-version" data-version={v.key}>
              <div className="ask-version-head">
                <span className="ask-version-name">{v.label}</span>
                <span className="ask-version-hint">{v.hint}</span>
              </div>
              <p className="ask-version-text">{renderChunks(view.versions![v.key])}</p>
            </article>
          ))}
          {view.chunks && view.chunks.length > 0 && (
            <div className="ask-chunks">
              <span className="ask-chunks-label">Chunks to keep</span>
              <ul className="ask-chunk-list">
                {view.chunks.map((c) => (
                  <li key={c} className="ask-chunk-item">
                    {plain(c)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {view.weakSpot && view.weakSpotSaved && (
        <p className="ask-weak">
          <span aria-hidden="true">⚠️ </span>
          {`${view.weakSpotSaved === 'saved' ? 'Saved to My weak spots' : 'Already in My weak spots'}: "${view.weakSpot.wrong}" → "${view.weakSpot.right}"`}
        </p>
      )}

      {view.library.length > 0 && (
        <section className="ask-section" aria-label="From your library">
          <h2 className="ask-h2">From library</h2>
          <ul className="ask-hits">
            {view.library.map((h) => (
              <li key={h.card.id} className="ask-hit" data-source="library">
                <span className="ask-hit-title">{h.title}</span>
                <span className="ask-hit-line">{h.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {count > 0 && (
        <section className="ask-section" aria-label="New, checked">
          <h2 className="ask-h2">New · checked</h2>
          <ul className="ask-hits">
            {view.fresh.map((d) => (
              <li key={`${d.track}-${d.title}`} className="ask-hit ask-hit-new" data-source="new">
                <span className="ask-hit-meta">
                  {KIND_LABELS[d.kind]} · {TRACK_LABELS[d.track]}
                </span>
                <span className="ask-hit-title">{d.title}</span>
                <span className="ask-hit-line">{d.rule}</span>
              </li>
            ))}
          </ul>
          {added === null ? (
            <button type="button" className="ask-add tap" onClick={onAdd} disabled={adding}>
              {adding ? 'Adding…' : `Add ${count} ${count === 1 ? 'card' : 'cards'} to my feed`}
            </button>
          ) : (
            <p className="ask-added" role="status">
              {added > 0
                ? `Added ${added} ${added === 1 ? 'card' : 'cards'}. They come back as Use, then Fix, then Try.`
                : 'Those cards could not be added. Try again.'}
            </p>
          )}
        </section>
      )}

      {!view.line && view.library.length === 0 && count === 0 && !view.answer && (
        <p className="ask-empty">Nothing found yet.</p>
      )}
    </div>
  );
}
