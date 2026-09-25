import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../types/contract';
import type { CategoryDeck } from '../../features/browse/categories';
import CardFace from '../cards/CardFace';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useDeckSeen } from '../../features/browse/useDeckSeen';
import { useCardGestures } from '../feed/useCardGestures';
import { useModalTrap } from '../../lib/useModalTrap';
import { ArrowLeftIcon, CloseIcon, MicrophoneIcon, StarIcon } from '../shell/Icons';

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
  const { seeCard } = useDeckSeen();
  const seenRef = useRef<Set<string>>(new Set());

  const { containerRef, handleBackdropClick } = useModalTrap<HTMLDivElement>({
    isOpen: true,
    onClose,
    modalId: `deck-modal-${deck.id}`,
  });

  const currentCard = cards[index];

  useEffect(() => {
    setIsDetail(false);
  }, [currentCard]);

  // Deck views count as seen + XP, same as the Feed.
  useEffect(() => {
    if (!currentCard || seenRef.current.has(currentCard.id)) return;
    seenRef.current.add(currentCard.id);
    void seeCard(currentCard, seenRef.current);
  }, [currentCard, seeCard]);

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

  const handleSwipeDown = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
      return true;
    }
    return false;
  };

  const { dragOffset, leavingDirection, bindGestures } = useCardGestures(
    currentCard?.id,
    (_grade, direction) => {
      if (direction === 'right' && currentCard) {
        if (!isBookmarked(currentCard.id)) void handleToggleBookmark();
        else showToast('Already saved');
      }
      if (direction === 'up' || direction === 'left' || direction === 'right') {
        handleNext();
      }
    },
    handleSwipeDown,
  );

  const handleToggleBookmark = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentCard) return;
    try {
      const res = await toggleBookmark(currentCard.id, currentCard.type);
      if (res.isBookmarked) {
        showToast(res.xpEarned > 0 ? `Saved to You (+${res.xpEarned} XP)` : 'Saved to You');
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

        <div
          className={`deck-modal-card-body${leavingDirection ? ' is-leaving' : ''}`}
          style={{
            transform:
              leavingDirection === 'up'
                ? 'translateY(-100vh)'
                : leavingDirection === 'down'
                  ? 'translateY(100vh)'
                  : leavingDirection === 'left'
                    ? 'translateX(-100vw)'
                    : leavingDirection === 'right'
                      ? 'translateX(100vw)'
                      : dragOffset.x || dragOffset.y
                        ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
                        : undefined,
          }}
          {...bindGestures}
        >
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
            aria-label={bookmarked ? 'Saved (tap to remove bookmark)' : 'Bookmark card'}
          >
            <StarIcon filled={bookmarked} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="abtn ico tap"
            onClick={handlePrev}
            disabled={index === 0}
            aria-label="Previous card in deck"
          >
            <ArrowLeftIcon aria-hidden="true" />
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
            {index === cards.length - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </nav>
      </div>
    </div>
  );
}
