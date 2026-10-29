import { useState } from 'react';
import type { TeachCard } from '../../types/contract';
import { KIND_LABELS, TRACK_LABELS } from '../../features/skills/trackOf';

export interface TeachCardFaceProps {
  card: TeachCard;
  /** Already saved (bookmarked)? Drives the Save ⭐ look. */
  saved?: boolean;
  /** Again ↻ — show this one again soon. */
  onAgain?: () => void;
  /** Got it ✓ — move on. */
  onGotIt?: () => void;
  /** Save ⭐ — add to / remove from saved. */
  onSave?: () => void;
}

/**
 * The v5 teaching card: two chips (kind, then track · level in the track's
 * colour), the idea in a line, what they ask / what to say, the weak version,
 * a picture, and one thing to try. Buttons only show when a handler is given,
 * so the card also renders cleanly in lists and tests.
 */
export default function TeachCardFace({ card, saved = false, onAgain, onGotIt, onSave }: TeachCardFaceProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const smallTalk = card.track === 'smalltalk';
  const hasActions = Boolean(onAgain || onGotIt || onSave);

  return (
    <article className="fcard teach-face" data-track={card.track} aria-label={`Card: ${card.id}`}>
      <div className="card-top-row teach-chips">
        <span className="teach-chip teach-chip-kind">{KIND_LABELS[card.kind]}</span>
        <span className="teach-chip teach-chip-track" data-track={card.track}>
          {TRACK_LABELS[card.track]} · L{card.level}
        </span>
      </div>

      <div className="card-inner-body teach-body" role="region" aria-label="Card content">
        <h2 className="teach-title">{card.title}</h2>
        <p className="teach-rule">{card.rule}</p>

        {card.insteadOf && (
          <div className="block teach-instead">
            <div className="lbl">Instead of</div>
            <div className="val">{card.insteadOf}</div>
          </div>
        )}

        <div className="block teach-example">
          <div className="lbl">{smallTalk ? 'They ask · work' : 'At work'}</div>
          <div className="val teach-lines">{card.examples.work}</div>
        </div>
        <div className="block teach-example">
          <div className="lbl">{smallTalk ? 'They ask · daily life' : 'In daily life'}</div>
          <div className="val teach-lines">{card.examples.everyday}</div>
        </div>

        <p className="teach-analogy">
          <span aria-hidden="true">💡 </span>
          {card.analogy}
        </p>

        <div className="block teach-try">
          <div className="lbl">Try</div>
          <div className="val">{card.tryPrompt}</div>
          {card.answer &&
            (showAnswer ? (
              <div className="teach-answer">{card.answer}</div>
            ) : (
              <button
                type="button"
                className="abtn tap teach-reveal"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAnswer(true);
                }}
              >
                Show a great answer
              </button>
            ))}
        </div>
        <div className="spacer" />
      </div>

      {hasActions && (
        <div className="teach-actions">
          {onAgain && (
            <button type="button" className="abtn tap teach-again" onClick={onAgain} aria-label="Show again soon">
              Again ↻
            </button>
          )}
          {onSave && (
            <button
              type="button"
              className={`abtn tap teach-save ${saved ? 'on' : ''}`}
              onClick={onSave}
              aria-pressed={saved}
              aria-label={saved ? 'Saved (tap to remove bookmark)' : 'Bookmark card'}
            >
              {saved ? '⭐ Saved' : '⭐ Save'}
            </button>
          )}
          {onGotIt && (
            <button type="button" className="abtn tap got-it teach-got" onClick={onGotIt} aria-label="Advance to next card">
              Got it ✓
            </button>
          )}
        </div>
      )}
    </article>
  );
}
