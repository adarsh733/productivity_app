import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../features/feed/useFeed';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { useProfile } from '../../features/profile/useProfile';
import CardFace from '../cards/CardFace';
import { useCardGestures } from './useCardGestures';
import CoachBox from '../../features/coach/CoachBox';
import type { Card } from '../../types/contract';
import { GAMIFICATION } from '../../types/contract';
import { MicrophoneIcon, StarIcon, ThumbsDownIcon } from '../shell/Icons';

export interface FeedScreenProps {
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function FeedScreen({ onOpenSpeakWithCard }: FeedScreenProps) {
  const feed = useFeed();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { dailyGoal } = useProfile();

  const [isDetail, setIsDetail] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGoalBanner, setShowGoalBanner] = useState(false);
  // AG-007 stage 3: coach box entry. Overlay only — feed logic untouched.
  const [showCoach, setShowCoach] = useState(false);

  const targetGoalXp = GAMIFICATION.GOAL_XP[dailyGoal];

  const shownAt = useRef<number>(Date.now());
  const busy = useRef<boolean>(false);
  const prevGoalAchieved = useRef<boolean | null>(null);

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

  const { ready, todayXp } = feed;

  // Daily goal celebration banner based on selected XP goal
  useEffect(() => {
    if (!ready) return;
    const isGoalDone = todayXp >= targetGoalXp;
    const was = prevGoalAchieved.current;
    prevGoalAchieved.current = isGoalDone;

    if (was === false && isGoalDone) {
      setShowGoalBanner(true);
      const timer = setTimeout(() => setShowGoalBanner(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [ready, todayXp, targetGoalXp]);

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
        showToast(res.xpEarned > 0 ? `Saved to You (+${res.xpEarned} XP)` : 'Saved to You');
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

  return (
    <div className="screen feed-screen">
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

        <div className="xp-group">
          <span className="xp" aria-label={`${feed.todayXp} XP earned today`}>
            {feed.todayXp} XP today
          </span>
          <button
            type="button"
            className="abtn tap"
            onClick={() => setShowCoach(true)}
            aria-label="Tell the coach"
          >
            💬 Coach
          </button>
        </div>
      </header>

      {showCoach && (
        <div className="coach-overlay" role="dialog" aria-modal="true" aria-label="Tell the coach">
          <CoachBox onDone={() => setShowCoach(false)} onSaved={() => setShowCoach(false)} />
        </div>
      )}

      {showGoalBanner && (
        <div className="handoff-banner" role="status" aria-live="polite">
          🎉 Daily XP goal reached! ({feed.todayXp}/{targetGoalXp} XP) · Streak: {feed.streak} day{feed.streak === 1 ? '' : 's'}.
        </div>
      )}

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
        />
      </div>

      <nav className="actions" aria-label="Card actions">
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
          onClick={() => void handleDownvote()}
          aria-label="Less of this card type"
          title="Less of this type"
        >
          <ThumbsDownIcon aria-hidden="true" />
        </button>

        {onOpenSpeakWithCard && card && (
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

        {feed.item?.reason === 'due' ? (
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
