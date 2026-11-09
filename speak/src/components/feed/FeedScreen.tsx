import { useCallback, useEffect, useRef, useState } from 'react';
import '../../styles/glass-feed.css';
import type { Card, ModuleCard } from '../../types/contract';
import { useModuleFeed } from '../../features/feed/useModuleFeed';
import { useCardFeedback } from '../../features/learn/useCardFeedback';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useSavedReview } from '../../features/feed/useSavedReview';
import { moduleSlides } from '../../features/cards/moduleSlides';
import { speak } from '../../lib/speech';
import ModuleCardView from './ModuleCardView';
import ChipRow from './ChipRow';
import FeedbackSheet from './FeedbackSheet';
import ReviewBar from './ReviewBar';
import {
  CommentIcon,
  HeartIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  VolumeIcon,
} from '../shell/Icons';

export interface FeedScreenProps {
  onOpenSpeakWithCard?: (card?: Card) => void;
}

interface FeedCardRailProps {
  card: ModuleCard;
  onOpenSheet: (thumb?: 'up' | 'down') => void;
  onEngage: () => void;
  onSaved: (card: ModuleCard, saved: boolean) => Promise<void>;
  currentSlideIndex: number;
}

function FeedCardRail({
  card,
  onOpenSheet,
  onEngage,
  onSaved,
  currentSlideIndex,
}: FeedCardRailProps) {
  const { thumb, setThumb } = useCardFeedback(card);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = isBookmarked(card.id);

  const handleThumbUp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await setThumb('up');
    onEngage();
  };

  const handleThumbDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEngage();
    onOpenSheet('down');
  };

  const handleComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEngage();
    onOpenSheet();
  };

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await toggleBookmark(card.id, card.type);
    // ♡ starts (or ends) the Sunday review for this card.
    await onSaved(card, res.isBookmarked);
    onEngage();
  };

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    const slides = moduleSlides(card);
    const speech = slides[currentSlideIndex]?.speech || slides[0]?.speech || '';
    if (speech) {
      speak(speech);
    }
    onEngage();
  };

  return (
    <div className="v7-rail" role="toolbar" aria-label="Card actions">
      <button
        type="button"
        className={`v7-rail-btn ${thumb === 'up' ? 'is-on' : ''}`}
        aria-label="Thumbs up"
        aria-pressed={thumb === 'up'}
        onClick={handleThumbUp}
      >
        <ThumbsUpIcon className="v7-icon-sm" />
      </button>

      <button
        type="button"
        className={`v7-rail-btn ${thumb === 'down' ? 'is-on' : ''}`}
        aria-label="Thumbs down"
        aria-pressed={thumb === 'down'}
        onClick={handleThumbDown}
      >
        <ThumbsDownIcon className="v7-icon-sm" />
      </button>

      <button
        type="button"
        className="v7-rail-btn"
        aria-label="Comment"
        onClick={handleComment}
      >
        <CommentIcon className="v7-icon-sm" />
      </button>

      <button
        type="button"
        className={`v7-rail-btn ${bookmarked ? 'is-on' : ''}`}
        aria-label={bookmarked ? 'Remove bookmark' : 'Save bookmark'}
        aria-pressed={bookmarked}
        onClick={handleToggleBookmark}
      >
        <HeartIcon className="v7-icon-sm" filled={bookmarked} />
      </button>

      <button
        type="button"
        className="v7-rail-btn"
        aria-label="Hear pronunciation"
        onClick={handleSpeak}
      >
        <VolumeIcon className="v7-icon-sm" />
      </button>
    </div>
  );
}

export default function FeedScreen({ onOpenSpeakWithCard: _ }: FeedScreenProps) {
  const feed = useModuleFeed();
  const { dueIds, answer: answerReview } = useSavedReview();
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);

  const [activeFeedback, setActiveFeedback] = useState<{
    card: ModuleCard;
    startThumb?: 'up' | 'down';
  } | null>(null);

  const [cardSlideIndices, setCardSlideIndices] = useState<Record<string, number>>({});

  // Reset scroll on filter change
  useEffect(() => {
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTop = 0;
    }
  }, [feed.filter]);

  // ≥ 2 s on screen counts as engaged
  useEffect(() => {
    const currentCard = feed.items[feed.index];
    if (!currentCard) return;
    const timer = setTimeout(() => {
      feed.markEngaged(currentCard.id);
    }, 2000);
    return () => clearTimeout(timer);
  }, [feed.index, feed.items, feed.markEngaged]);

  const handleSettleIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < feed.items.length) {
        void feed.onSettle(index);
      }
    },
    [feed.items.length, feed.onSettle],
  );

  // Scroll listener with debounce for settling
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = window.setTimeout(() => {
        const height = el.clientHeight || 1;
        const nextIndex = Math.round(el.scrollTop / height);
        handleSettleIndex(nextIndex);
      }, 150);
    },
    [handleSettleIndex],
  );

  // Native scrollend event listener for exact browser settling
  useEffect(() => {
    const el = feedContainerRef.current;
    if (!el) return;
    const onScrollEnd = () => {
      const height = el.clientHeight || 1;
      const nextIndex = Math.round(el.scrollTop / height);
      handleSettleIndex(nextIndex);
    };
    el.addEventListener('scrollend', onScrollEnd);
    return () => el.removeEventListener('scrollend', onScrollEnd);
  }, [handleSettleIndex]);

  const handleSlideChange = useCallback(
    (cardId: string, slideIndex: number) => {
      setCardSlideIndices((prev) => ({ ...prev, [cardId]: slideIndex }));
      feed.markEngaged(cardId);
    },
    [feed.markEngaged],
  );

  return (
    <div className="v7-feed">
      <div className="v7-top">
        <header className="v7-header">
          <h1 className="v7-header-title">Articulate</h1>
        </header>
        <ChipRow value={feed.filter} onChange={feed.setFilter} />
      </div>

      {feed.ready && feed.items.length === 0 ? (
        <div className="v7-empty" role="status">
          <p className="v7-empty-title">All caught up</p>
          <p className="v7-empty-sub">You have seen all cards in this filter.</p>
        </div>
      ) : (
        <div
          className="v7-vfeed"
          ref={feedContainerRef}
          onScroll={handleScroll}
          tabIndex={0}
          aria-label="Card feed"
        >
          {feed.items.map((card) => (
            <ModuleCardView
              key={card.id}
              card={card}
              rail={
                <div className="v7-rail v7-rail-host">
                  <FeedCardRail
                    card={card}
                    onOpenSheet={(thumb) => setActiveFeedback({ card, startThumb: thumb })}
                    onEngage={() => feed.markEngaged(card.id)}
                    onSaved={feed.setSaved}
                    currentSlideIndex={cardSlideIndices[card.id] ?? 0}
                  />
                  {dueIds.includes(card.id) && (
                    <ReviewBar
                      onAnswer={(a) => {
                        feed.markEngaged(card.id);
                        void answerReview(card.id, a);
                      }}
                    />
                  )}
                </div>
              }
              onSlideChange={(slideIdx) => handleSlideChange(card.id, slideIdx)}
            />
          ))}
        </div>
      )}

      {activeFeedback && (
        <FeedbackSheet
          card={activeFeedback.card}
          startThumb={activeFeedback.startThumb}
          onClose={() => setActiveFeedback(null)}
        />
      )}
    </div>
  );
}
