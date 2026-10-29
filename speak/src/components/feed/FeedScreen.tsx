import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../features/feed/useFeed';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import CardFace from '../cards/CardFace';
import { useCardGestures } from './useCardGestures';
import type { Card } from '../../types/contract';
import { isTeachCard } from '../../features/skills/trackOf';
import { FlagIcon, MicrophoneIcon, StarIcon, ThumbsDownIcon } from '../shell/Icons';
import { rejectCard } from '../../features/auto/reject';

export interface FeedScreenProps {
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function FeedScreen({ onOpenSpeakWithCard }: FeedScreenProps) {
  const feed = useFeed();
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const [isDetail, setIsDetail] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef<boolean>(false);

  const card = feed.item?.card;
  const cardId = card?.id;
  const bookmarked = cardId ? isBookmarked(cardId) : false;

  // AG-007 stage 2: engaged-only repetition. Engagement state lives in the
  // feed hook (`markEngaged`, landing with the useFeed pass); this screen
  // reports every engagement signal it can see — 2 s on screen, flip, save,
  // say-it, grade — through an optional call so the screen stays green before
  // and after the hook lands.
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const markEngaged = (id: string) => {
    (feedRef.current as unknown as { markEngaged?: (cardId: string) => void }).markEngaged?.(id);
  };

  // Reset detail on card change
  useEffect(() => {
    shownAt.current = Date.now();
    setIsDetail(false);
    busy.current = false;
  }, [cardId]);

  // ≥ 2 s on screen counts as engaged.
  useEffect(() => {
    if (!cardId) return;
    const timer = setTimeout(() => markEngaged(cardId), 2000);
    return () => clearTimeout(timer);
  }, [cardId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2000);
  };

  const handleToggleBookmark = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!card) return;
    try {
      const res = await toggleBookmark(card.id, card.type);
      if (res.isBookmarked) {
        markEngaged(card.id);
        showToast('Saved');
      } else {
        showToast('Bookmark removed');
      }
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  };

  const handleSaveOnly = async () => {
    if (!card) return;
    if (isBookmarked(card.id)) {
      showToast('Already saved');
      return;
    }
    await handleToggleBookmark();
  };

  const handleAdvance = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const msSpent = Date.now() - shownAt.current;
    await feed.advanceCard({ msSpent });
  }, [feed]);

  const handleGrade = useCallback(async (g: 'again' | 'good') => {
    if (busy.current) return;
    busy.current = true;
    if (cardId) markEngaged(cardId);
    const msSpent = Date.now() - shownAt.current;
    await feed.submit(g, { msSpent });
  }, [feed, cardId]);

  // v5 teach card: Got it ✓ moves on (a due card is graded good); Again ↻ brings it back soon.
  const handleGotIt = useCallback(async () => {
    if (cardId) markEngaged(cardId);
    if (feed.item?.reason === 'due') {
      await handleGrade('good');
    } else {
      await handleAdvance();
    }
  }, [feed, cardId, handleAdvance, handleGrade]);

  const handleDownvote = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    if (card) {
      await feed.downvoteCard(card);
    }
    showToast('Less of this topic for 7 days');
    const msSpent = Date.now() - shownAt.current;
    await feed.advanceCard({ msSpent });
  }, [card, feed]);

  // AG-008 stage 4: flag a wrong AI card. One tap drops the card; a second
  // tap on its batch drops the batch. Whatever is rejected is never shown again.
  const handleReject = useCallback(async () => {
    if (busy.current || !card) return;
    busy.current = true;
    const result = await rejectCard(card);
    if (result) showToast(result === 'batch' ? 'Whole batch removed' : 'Card removed');
    const msSpent = Date.now() - shownAt.current;
    await feed.advanceCard({ msSpent });
  }, [card, feed]);

  const handleSwipeDown = useCallback(() => {
    if (feed.canGoBack) {
      feed.goPrevious();
      showToast('Previous card');
      return true;
    }
    return false;
  }, [feed]);

  const { dragOffset, leavingDirection, showHint, bindGestures } = useCardGestures(
    cardId,
    (_grade, direction) => {
      if (direction === 'left' && card) {
        void feed.downvoteCard(card);
        showToast('Less of this topic for 7 days');
      } else if (direction === 'right') {
        void handleSaveOnly();
      }
      const msSpent = Date.now() - shownAt.current;
      void feed.advanceCard({ msSpent });
    },
    handleSwipeDown,
  );

  if (!feed.ready) {
    return (
      <div className="screen feed">
        <div className="feed-empty">
          <span className="spinner" aria-label="loading" />
        </div>
      </div>
    );
  }

  if (!feed.item) {
    return (
      <div className="screen feed">
        <div className="feed-empty">
          <h2 className="feed-empty-title">You're all caught up!</h2>
          <p className="meaning feed-empty-desc">
            All active cards have been served today. Refilling endless queue…
          </p>
          <button
            type="button"
            className="prim tap feed-empty-refresh-btn"
            onClick={() => void feed.reload()}
          >
            Refresh Feed
          </button>
        </div>
      </div>
    );
  }

  const transformStyle =
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
              : undefined;

  const isTeach = card ? isTeachCard(card) : false;

  return (
    <div className="screen feed-screen v5-feed">
      <header className="topbar">
        <div className="brand-group">
          <span className="feed-brand-title">Articulate</span>
          {feed.streak > 0 ? (
            <span className="streak" aria-label={`${feed.streak} day streak`}>
              🔥 {feed.streak}
            </span>
          ) : (
            <span className="streak is-zero" aria-label="0 day streak">
              🔥 0
            </span>
          )}
        </div>
      </header>

      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <div
        className={`card-frame${leavingDirection ? ' is-leaving' : ''}`}
        style={{ transform: transformStyle }}
        {...bindGestures}
      >
        {feed.item?.reason === 'due' && (
          <span className="badge b-pace" aria-label="Review card">Review</span>
        )}
        <CardFace
          card={feed.item.card}
          isDetail={isDetail}
          onToggleDetail={() => {
            if (cardId) markEngaged(cardId);
            setIsDetail((d) => !d);
          }}
          showSwipeHint={showHint}
          saved={bookmarked}
          onAgain={isTeach ? () => void handleGrade('again') : undefined}
          onGotIt={isTeach ? () => void handleGotIt() : undefined}
          onSave={isTeach ? () => void handleToggleBookmark() : undefined}
        />
      </div>

      <nav className={`actions${isTeach ? ' is-teach' : ''}`} aria-label="Card actions">
        {!isTeach && (
          <button
            type="button"
            className={`abtn ico star ${bookmarked ? 'on' : ''} tap`}
            onClick={(e) => void handleToggleBookmark(e)}
            aria-label={bookmarked ? 'Saved (tap to remove bookmark)' : 'Bookmark card'}
          >
            <StarIcon filled={bookmarked} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          className="abtn ico tap"
          onClick={() => void handleDownvote()}
          aria-label="Less of this card type"
          title="Less of this type"
        >
          <ThumbsDownIcon aria-hidden="true" />
        </button>

        {card && (card.source === 'ai' || card.source === 'inbox') && (
          <button
            type="button"
            className="abtn ico tap"
            onClick={() => void handleReject()}
            aria-label="This is wrong"
            title="This is wrong"
          >
            <FlagIcon aria-hidden="true" />
          </button>
        )}

        {onOpenSpeakWithCard && card && !isTeach && (
          <button
            type="button"
            className="abtn mic tap"
            onClick={() => {
              markEngaged(card.id);
              onOpenSpeakWithCard(card);
            }}
            aria-label="Practice speaking this card"
          >
            <MicrophoneIcon /> <span>Say it</span>
          </button>
        )}

        {isTeach ? null : feed.item?.reason === 'due' ? (
          <>
            <button
              type="button"
              className="abtn tap"
              onClick={() => void handleGrade('again')}
              aria-label="Show again soon"
            >
              Show again soon
            </button>
            <button
              type="button"
              className="abtn tap"
              onClick={() => void handleGrade('good')}
              aria-label="Knew it"
            >
              Knew it
            </button>
          </>
        ) : (
          <button
            type="button"
            className="abtn got-it tap"
            onClick={() => void handleAdvance()}
            aria-label="Advance to next card"
          >
            Got it →
          </button>
        )}
      </nav>
    </div>
  );
}
