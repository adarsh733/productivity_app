import { useEffect, useRef, useState } from 'react';
import type { TeachCard } from '../../types/contract';
import { KIND_LABELS, TRACK_LABELS } from '../../features/skills/trackOf';

export interface TryCardFaceProps {
  card: TeachCard;
  /** Next ✓ - move on. */
  onNext?: () => void;
  /** 🎤 Say mine - optional; the button only shows when this is given. */
  onSayMine?: () => void;
}

/**
 * A Try card (v5): practice without pressure.
 *
 *   The moment      - a real situation (the card's try prompt)
 *   Use the shape   - the idea to answer with (title + rule)
 *   Think, then tap - the great answer stays hidden until he taps
 *   🎤 Say mine     - optional; the mic is never a gate
 *   Next ✓
 *
 * Recalling the answer himself is what makes it stick, so the answer is not in
 * the page until the tap. A Try card with no stored answer shows the card's
 * work example instead, so the button always has something to reveal.
 */
export default function TryCardFace({ card, onNext, onSayMine }: TryCardFaceProps) {
  const [revealed, setRevealed] = useState(false);
  const greatRef = useRef<HTMLDivElement>(null);

  // Once the answer shows, scroll the card's own body by the smallest amount that
  // puts the answer fully in view. (scrollIntoView can also move the clipped card
  // frame and push the heading under the chips, so only the body is scrolled.)
  useEffect(() => {
    const el = greatRef.current;
    const body = el?.closest<HTMLElement>('.teach-body');
    if (!el || !body) return;
    const pad = 24; // matches the body's bottom padding
    const over = el.getBoundingClientRect().bottom - (body.getBoundingClientRect().bottom - pad);
    if (over > 0) body.scrollTop += over;
  }, [revealed]);
  const great = card.answer?.trim() || card.examples.work;
  const hasActions = Boolean(onNext || onSayMine);

  return (
    <article className="fcard teach-face try-face" data-track={card.track} aria-label={`Card: ${card.id}`}>
      <div className="card-top-row teach-chips">
        <span className="teach-chip teach-chip-kind">{KIND_LABELS.try}</span>
        <span className="teach-chip teach-chip-track" data-track={card.track}>
          {TRACK_LABELS[card.track]} · L{card.level}
        </span>
      </div>

      <div className="card-inner-body teach-body try-body" role="region" aria-label="Card content">
        <div className="block try-moment">
          <div className="lbl">The moment</div>
          <p className="try-prompt">{card.tryPrompt}</p>
        </div>

        <div className="block try-shape">
          <div className="lbl">Use the shape</div>
          <div className="try-shape-box">
            <b>{card.title}</b>
            <span className="try-shape-rule">{card.rule}</span>
          </div>
        </div>

        <div className="block try-think">
          <div className="lbl">Think of your answer, then tap…</div>
          {revealed ? (
            <div className="try-great" data-testid="try-great" ref={greatRef}>
              {great}
            </div>
          ) : (
            <button
              type="button"
              className="abtn tap try-reveal"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
            >
              👀 Show a great answer
            </button>
          )}
        </div>
        <div className="spacer" />
      </div>

      {hasActions && (
        <div className="teach-actions try-actions">
          {onSayMine && (
            <button type="button" className="abtn tap try-say" onClick={onSayMine} aria-label="Say my answer out loud">
              🎤 Say mine
            </button>
          )}
          {onNext && (
            <button type="button" className="abtn tap got-it teach-got try-next" onClick={onNext} aria-label="Advance to next card">
              Next ✓
            </button>
          )}
        </div>
      )}
    </article>
  );
}
