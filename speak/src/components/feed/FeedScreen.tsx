import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../features/feed/useFeed';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import PosterCard from '../cards/PosterCard';
import { useCardGestures } from './useCardGestures';
import type { AnyCard, Card, TeachCard } from '../../types/contract';
import { isBackTap, usePosterDeck } from '../../features/cards/usePosterDeck';
import { speak } from '../../lib/speech';
import { FlagIcon, MicrophoneIcon, MoreIcon, StarIcon, ThumbsDownIcon, VolumeIcon } from '../shell/Icons';
import { rejectCard } from '../../features/auto/reject';
import StoriesRow from '../lessons/StoriesRow';
import LessonPlayer from '../lessons/LessonPlayer';
import type { Lesson } from '../../features/lessons/useLessons';

/** A press that moved further than this was a swipe, not a tap. */
const TAP_SLOP_PX = 10;

export interface FeedScreenProps {
  onOpenSpeakWithCard?: (card: Card) => void;
}

export default function FeedScreen({ onOpenSpeakWithCard }: FeedScreenProps) {
  const feed = useFeed();
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Lesson | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef<boolean>(false);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const card = feed.item?.card;
  const cardId = card?.id;
  const bookmarked = cardId ? isBookmarked(cardId) : false;
  const deck = usePosterDeck(card);

  // AG-007 stage 2: engaged-only repetition. Engagement state lives in the
  // feed hook (`markEngaged`, landing with the useFeed pass); this screen
  // reports every engagement signal it can see — 2 s on screen, slide, save,
  // say-it, grade — through an optional call so the screen stays green before
  // and after the hook lands.
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const markEngaged = (id: string) => {
    (feedRef.current as unknown as { markEngaged?: (cardId: string) => void }).markEngaged?.(id);
  };

  useEffect(() => {
    shownAt.current = Date.now();
    setMoreOpen(false);
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

  const handleToggleBookmark = async () => {
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

  // Got it ✓ moves on (a due card is graded good); Again ↻ brings it back soon.
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

  // Sideways moves through the slides. Past the last slide, the next card comes.
  const handleSwipeSideways = (direction: 'left' | 'right') => {
    if (cardId) markEngaged(cardId);
    if (direction === 'right') {
      deck.back();
      return true;
    }
    if (deck.locked) return true;
    if (deck.atEnd) return false;
    deck.next();
    return true;
  };

  const { dragOffset, leavingDirection, showHint, bindGestures } = useCardGestures(
    cardId,
    () => {
      const msSpent = Date.now() - shownAt.current;
      void feed.advanceCard({ msSpent });
    },
    handleSwipeDown,
    handleSwipeSideways,
  );

  // Tap the right of the card for the next slide, the left to go back.
  const handleFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    const start = pressedAt.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    setMoreOpen(false);
    if (isBackTap(e.clientX, e.currentTarget.getBoundingClientRect())) {
      deck.back();
    } else if (!deck.locked) {
      if (cardId) markEngaged(cardId);
      deck.next();
    }
  };

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
        <StoriesRow onOpenLesson={setPlaying} />
        {playing && <LessonPlayer lesson={playing} onClose={() => setPlaying(null)} />}
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

  const isTryCard = card ? (card as AnyCard).type === 'teach' && (card as unknown as TeachCard).kind === 'try' : false;
  const canFlag = card && (card.source === 'ai' || card.source === 'inbox');

  return (
    <div className="screen feed-screen v5-feed">
      <header className="topbar">
        <div className="brand-group">
          <span className="feed-brand-title">Articulate</span>
        </div>
        {feed.streak > 0 ? (
          <span className="streak" aria-label={`${feed.streak} day streak`}>
            🔥 {feed.streak}
          </span>
        ) : (
          <span className="streak is-zero" aria-label="0 day streak">
            🔥 0
          </span>
        )}
      </header>

      <StoriesRow onOpenLesson={setPlaying} />
      {playing && <LessonPlayer lesson={playing} onClose={() => setPlaying(null)} />}

      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <div
        className={`card-frame${leavingDirection ? ' is-leaving' : ''}`}
        style={{ transform: transformStyle }}
        onPointerDownCapture={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleFrameClick}
        {...bindGestures}
      >
        {card && (
          <PosterCard
            card={card}
            slides={deck.slides}
            index={deck.index}
            onSolved={() => {
              markEngaged(card.id);
              deck.markSolved();
            }}
            kicker={feed.item.reason === 'due' ? 'Review' : undefined}
            rail={
              <>
                {moreOpen && (
                  <div className="poster-more">
                    <button
                      type="button"
                      className="poster-more-item tap"
                      onClick={() => void handleDownvote()}
                      aria-label="Less of this card type"
                    >
                      <ThumbsDownIcon aria-hidden="true" /> Less like this
                    </button>
                    {canFlag && (
                      <button
                        type="button"
                        className="poster-more-item tap"
                        onClick={() => void handleReject()}
                        aria-label="This is wrong"
                      >
                        <FlagIcon aria-hidden="true" /> This is wrong
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className={`poster-rail-btn tap${bookmarked ? ' is-on' : ''}`}
                  onClick={() => void handleToggleBookmark()}
                  aria-pressed={bookmarked}
                  aria-label={bookmarked ? 'Saved (tap to remove bookmark)' : 'Bookmark card'}
                >
                  <StarIcon filled={bookmarked} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="poster-rail-btn tap"
                  onClick={() => {
                    if (deck.slide) speak(deck.slide.speech, { lang: card.lang });
                  }}
                  aria-label="Hear this"
                >
                  <VolumeIcon aria-hidden="true" />
                </button>
                {onOpenSpeakWithCard && (
                  <button
                    type="button"
                    className="poster-rail-btn tap"
                    onClick={() => {
                      markEngaged(card.id);
                      onOpenSpeakWithCard(card as Card);
                    }}
                    aria-label={isTryCard ? 'Say my answer out loud' : 'Practice speaking this card'}
                  >
                    <MicrophoneIcon aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="poster-rail-btn tap"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreOpen}
                  aria-label="More options"
                >
                  <MoreIcon aria-hidden="true" />
                </button>
              </>
            }
            foot={
              deck.atEnd ? (
                <>
                  <button
                    type="button"
                    className="poster-btn tap"
                    onClick={() => void handleGrade('again')}
                    aria-label="Show again soon"
                  >
                    Again ↻
                  </button>
                  <button
                    type="button"
                    className="poster-btn is-main tap"
                    onClick={() => void handleGotIt()}
                    aria-label="Advance to next card"
                  >
                    Got it ✓
                  </button>
                </>
              ) : showHint && !deck.locked ? (
                <span className="poster-hint">Swipe sideways for more · Up for next</span>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
