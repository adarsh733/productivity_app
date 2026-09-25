import { useState } from 'react';
import type { Card } from '../../types/contract';
import CardFace from './CardFace';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useModalTrap } from '../../lib/useModalTrap';
import { CloseIcon, MicrophoneIcon, StarIcon } from '../shell/Icons';

export interface CardDetailSheetProps {
  card: Card;
  onClose: () => void;
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function CardDetailSheet({
  card,
  onClose,
  onOpenSpeakWithCard,
}: CardDetailSheetProps) {
  const [isDetail, setIsDetail] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const { containerRef, handleBackdropClick } = useModalTrap<HTMLDivElement>({
    isOpen: true,
    onClose,
    modalId: `card-detail-${card.id}`,
  });

  const bookmarked = isBookmarked(card.id);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2000);
  };

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await toggleBookmark(card.id, card.type);
      if (res.isBookmarked) {
        showToast(res.xpEarned > 0 ? `Saved to You (+${res.xpEarned} XP)` : 'Saved to You');
      } else {
        showToast('Bookmark removed');
      }
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  };

  const handleSayIt = () => {
    onClose();
    onOpenSpeakWithCard?.(card);
  };

  return (
    <div
      className="deck-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-detail-title"
      onClick={handleBackdropClick}
    >
      <div className="deck-modal-container card-detail-container" ref={containerRef} tabIndex={-1}>
        <header className="deck-modal-header">
          <div className="deck-modal-title-group">
            <span className="g" aria-hidden="true">📇</span>
            <div>
              <h2 id="card-detail-title">Card Detail</h2>
              <span className="deck-modal-counter">{card.id}</span>
            </div>
          </div>
          <button
            type="button"
            className="deck-modal-close-btn tap"
            onClick={onClose}
            aria-label="Close card detail"
          >
            <CloseIcon />
          </button>
        </header>

        {toastMessage && (
          <div className="toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}

        <div className="deck-modal-card-body card-detail-body">
          <CardFace
            card={card}
            isDetail={isDetail}
            onToggleDetail={() => setIsDetail((d) => !d)}
          />
        </div>

        <nav className="actions deck-modal-actions card-detail-actions" aria-label="Card detail actions">
          <button
            type="button"
            className={`abtn ico star ${bookmarked ? 'on' : ''} tap`}
            onClick={(e) => void handleToggleBookmark(e)}
            aria-label={bookmarked ? 'Saved (tap to remove bookmark)' : 'Bookmark card'}
          >
            <StarIcon filled={bookmarked} aria-hidden="true" />
          </button>

          {onOpenSpeakWithCard && (
            <button
              type="button"
              className="abtn mic tap card-detail-say-btn"
              onClick={handleSayIt}
              aria-label={`Practice speaking ${card.id}`}
            >
              <MicrophoneIcon /> <span>Say it</span>
            </button>
          )}

          <button
            type="button"
            className="abtn got-it tap"
            onClick={onClose}
            aria-label="Done viewing card"
          >
            Done
          </button>
        </nav>
      </div>
    </div>
  );
}
