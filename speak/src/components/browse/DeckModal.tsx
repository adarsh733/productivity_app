import { useEffect, useState } from 'react';
import type { Card } from '../../types/contract';
import type { CategoryDeck } from '../../features/browse/categories';
import CardFace from '../cards/CardFace';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useModalTrap } from '../../lib/useModalTrap';
import { CloseIcon, MicrophoneIcon } from '../shell/Icons';

export interface DeckModalProps {
  deck: CategoryDeck;
  cards: Card[];
  onClose: () => void;
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function DeckModal({
  deck,
  cards,
  onClose,
  onOpenSpeakWithCard,
}: DeckModalProps) {
  const [index, setIndex] = useState(0);
  const [isDetail, setIsDetail] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { isBookmarked, toggleBookmark } = useBookmarks();

  const { containerRef, handleBackdropClick } = useModalTrap<HTMLDivElement>({
    isOpen: true,
    onClose,
    modalId: `deck-modal-${deck.id}`,
  });

  const currentCard = cards[index];

  useEffect(() => {
    setIsDetail(false);
  }, [currentCard]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2000);
  };

  const handleNext = () => {
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
    } else {
      showToast('Deck completed! Returning to Browse.');
      setTimeout(onClose, 1000);
    }
  };

  const handlePrev = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
    }
  };

  const handleToggleBookmark = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentCard) return;
    try {
      const res = await toggleBookmark(currentCard.id, currentCard.type);
      if (res.isBookmarked) {
        showToast(res.xpEarned > 0 ? `? Saved to You (+${res.xpEarned} XP)` : '? Saved to You');
      } else {
        showToast('Bookmark removed');
      }
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  };

  const bookmarked = currentCard ? isBookmarked(currentCard.id) : false;

  if (cards.length === 0 || !currentCard) {
    return (
      <div
        className="deck-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-modal-empty-title"
        onClick={handleBackdropClick}
      >
        <div className="deck-modal-container deck-modal-empty-container" ref={containerRef} tabIndex={-1}>
          <header className="deck-modal-header">
            <div className="deck-modal-title-group">
              <span className="g" aria-hidden="true">{deck.icon}</span>
              <h2 id="deck-modal-empty-title">{deck.name}</h2>
            </div>
            <button
              type="button"
              className="deck-modal-close-btn tap"
              onClick={onClose}
              aria-label="Close deck"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="deck-modal-empty">
            <p>No cards in this deck yet.</p>
            <button type="button" className="prim tap modal-back-btn" onClick={onClose}>
              Back to Browse
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="deck-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="deck-modal-container" ref={containerRef} tabIndex={-1}>
        <header className="deck-modal-header">
          <div className="deck-modal-title-group">
            <span className="g" aria-hidden="true">{deck.icon}</span>
            <div>
              <h2 id="deck-modal-title">{deck.name}</h2>
              <span className="deck-modal-counter">
                Card {index + 1} of {cards.length}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="deck-modal-close-btn tap"
            onClick={onClose}
            aria-label="Close deck"
          >
            <CloseIcon />
          </button>
        </header>

        {toastMessage && (
          <div className="toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}

        <div className="deck-modal-card-body">
          <CardFace
            card={currentCard}
            isDetail={isDetail}
            onToggleDetail={() => setIsDetail((d) => !d)}
          />
        </div>

        <nav className="actions deck-modal-actions" aria-label="Deck card actions">
          <button
            type="button"
            className={`abtn ico star ${bookmarked ? 'on' : ''} tap`}
            onClick={(e) => void handleToggleBookmark(e)}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark card'}
          >
            {bookmarked ? '?' : '?'}
          </button>

          <button
            type="button"
            className="abtn ico tap"
            onClick={handlePrev}
            disabled={index === 0}
            aria-label="Previous card in deck"
          >
            ?
          </button>

          {onOpenSpeakWithCard && (
            <button
              type="button"
              className="abtn mic tap"
              onClick={() => onOpenSpeakWithCard(currentCard)}
              aria-label="Practice speaking this card"
            >
              <MicrophoneIcon /> <span>Say it</span>
            </button>
          )}

          <button
            type="button"
            className="abtn got-it tap"
            onClick={handleNext}
            aria-label={index === cards.length - 1 ? 'Finish deck' : 'Next card in deck'}
          >
            {index === cards.length - 1 ? 'Done ?' : 'Next ?'}
          </button>
        </nav>
      </div>
    </div>
  );
}
