import { useState } from 'react';
import type { Card } from '../../types/contract';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useModalTrap } from '../../lib/useModalTrap';
import CardDetailSheet from '../cards/CardDetailSheet';
import { CloseIcon } from '../shell/Icons';

export interface BookmarksDrawerProps {
  onClose: () => void;
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function BookmarksDrawer({
  onClose,
  onOpenSpeakWithCard,
}: BookmarksDrawerProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const { savedCards, removeBookmark } = useBookmarks();

  const { containerRef, handleBackdropClick } = useModalTrap<HTMLDivElement>({
    isOpen: true,
    onClose,
    modalId: 'bookmarks-drawer',
  });

  const handleRemoveBookmark = async (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    try {
      await removeBookmark(cardId);
      if (selectedCard?.id === cardId) {
        setSelectedCard(null);
      }
    } catch (err) {
      console.error('Error removing bookmark:', err);
    }
  };

  return (
    <div
      className="deck-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-cards-title"
      onClick={handleBackdropClick}
    >
      <div className="deck-modal-container" ref={containerRef} tabIndex={-1}>
        <header className="deck-modal-header">
          <div className="deck-modal-title-group">
            <span className="g" aria-hidden="true">⭐</span>
            <div>
              <h2 id="saved-cards-title">Saved Cards</h2>
              <span className="deck-modal-counter">
                {savedCards.length} {savedCards.length === 1 ? 'card' : 'cards'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="deck-modal-close-btn tap"
            onClick={onClose}
            aria-label="Close saved cards"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="saved-cards-list-container">
          {savedCards.length === 0 ? (
            <div className="deck-modal-empty">
              <p>No saved cards yet.</p>
              <small className="saved-cards-hint">
                Tap ⭐ on any card in the feed or browse tab to save it here.
              </small>
            </div>
          ) : (
            <div className="saved-cards-items">
              {savedCards.map((c) => (
                <div key={c.id} className="saved-card-row-wrapper">
                  <div
                    className="row tap saved-card-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCard(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCard(c);
                      }
                    }}
                    aria-label={`View saved card: ${getCardTitle(c)}`}
                  >
                    <span className="badge b-word saved-card-badge">
                      {c.lang === 'hi' ? 'Hindi' : c.type}
                    </span>
                    <div className="t">
                      <b>{getCardTitle(c)}</b>
                      <small>{getCardSubtitle(c)}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="saved-card-remove-btn tap"
                    onClick={(e) => void handleRemoveBookmark(e, c.id)}
                    aria-label={`Remove bookmark for ${getCardTitle(c)}`}
                  >
                    ★
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedCard && (
        <CardDetailSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onOpenSpeakWithCard={onOpenSpeakWithCard}
        />
      )}
    </div>
  );
}

function getCardTitle(card: Card): string {
  switch (card.type) {
    case 'word':
    case 'pronounce':
    case 'feeling':
      return card.term;
    case 'idiom':
      return card.phrase;
    case 'swap':
      return `${card.weak} ➔ ${card.answers[0]}`;
    case 'phrase':
      return `${card.weak} ➔ ${card.strong}`;
    case 'action_verb':
      return card.verb;
    case 'story_move':
      return card.move;
    case 'say_it':
      return card.line;
    case 'breath':
      return card.title;
    case 'describe':
      return card.prompt;
    case 'explain':
      return card.topic;
    case 'teach_back':
      return card.prompt;
    default: {
      const _exhaustive: never = card;
      return (_exhaustive as { id?: string })?.id ?? '';
    }
  }
}

function getCardSubtitle(card: Card): string {
  switch (card.type) {
    case 'word':
    case 'idiom':
    case 'action_verb':
    case 'feeling':
      return card.meaning;
    case 'phrase':
    case 'story_move':
      return card.why;
    case 'swap':
      return card.answers.join(', ');
    case 'pronounce':
      return card.syllables;
    case 'say_it':
      return `Target pace: ~${card.targetWpm} wpm`;
    case 'describe':
      return card.targetVocab.join(', ');
    case 'explain':
      return card.angle;
    case 'teach_back':
      return 'Recall & explain in 45s';
    case 'breath':
      return card.instructions[0] ?? '';
    default:
      return '';
  }
}
