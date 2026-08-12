import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../features/feed/useFeed';
import CardView from '../cards/CardView';
import CoreDots from './CoreDots';
import CardActions from './CardActions';
import { useCardGestures } from './useCardGestures';
import type { Grade } from '../../types/contract';

export default function FeedScreen() {
  const feed = useFeed('core');
  const [measure, setMeasure] = useState<number | undefined>();
  const [showHandoff, setShowHandoff] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef<boolean>(false);
  /** null until the first observation, so a reopen mid-day is not "just finished". */
  const prevCoreDone = useRef<boolean | null>(null);

  const cardId = feed.item?.card.id;

  useEffect(() => {
    shownAt.current = Date.now();
    setMeasure(undefined);
    busy.current = false;
  }, [cardId]);

  // Core 3 is a floor, not a finish line. The moment it lands the queue has to
  // become endless by itself — the core queue is only 3 items long, so without
  // this the feed runs dry and shows a spinner forever. A dead end here is the
  // one failure this app cannot have.
  const { ready, coreThreeDone, mode, setMode } = feed;
  useEffect(() => {
    if (ready && coreThreeDone && mode === 'core') setMode('endless');
  }, [ready, coreThreeDone, mode, setMode]);

  // The handoff banner marks the transition, so it may only fire on a genuine
  // false → true edge. Firing on mount would congratulate him every time he
  // reopens the app later the same day.
  useEffect(() => {
    if (!ready) return;
    const was = prevCoreDone.current;
    prevCoreDone.current = coreThreeDone;
    if (was === false && coreThreeDone) {
      setShowHandoff(true);
      const timer = setTimeout(() => setShowHandoff(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [ready, coreThreeDone]);

  const submit = useCallback(
    async (g: Grade) => {
      if (busy.current) return;
      busy.current = true;
      const msSpent = Date.now() - shownAt.current;
      await feed.submit(g, { msSpent, measure });
    },
    [feed, measure],
  );

  const { dragOffset, leavingDirection, showHint, bindGestures } = useCardGestures(
    cardId,
    (grade) => {
      void submit(grade);
    },
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

  // Fallback if queue somehow yields no item (feed tops up, so should not happen)
  if (!feed.item) {
    return (
      <div className="screen feed">
        <div className="feed-empty">
          <p className="meaning">Loading feed...</p>
          <span className="spinner" aria-label="loading" />
        </div>
      </div>
    );
  }

  const transformStyle =
    leavingDirection === 'up'
      ? 'translateY(-100vh)'
      : leavingDirection === 'left'
        ? 'translateX(-100vw)'
        : dragOffset.x || dragOffset.y
          ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
          : undefined;

  return (
    <div className="screen feed">
      <header className="feed-head">
        <div className="feed-head-row">
          <span className="feed-mode-label">{feed.mode === 'core' ? 'CORE' : 'ENDLESS'}</span>

          {feed.streak > 0 && (
            <div className="streak">
              <span className="streak-flame" aria-hidden="true">
                🔥
              </span>
              <span>{feed.streak}</span>
            </div>
          )}
        </div>

        <div className="feed-subhead-row">
          {feed.mode === 'core' ? (
            <CoreDots position={feed.position} coreThreeDone={feed.coreThreeDone} />
          ) : (
            <span className="feed-cards-done">{feed.cardsToday} done today</span>
          )}
        </div>
      </header>

      {showHandoff && (
        <div className="handoff-banner">Core 3 done. Streak {feed.streak}.</div>
      )}

      <div
        className={`card-frame${leavingDirection ? ' is-leaving' : ''}`}
        style={{ transform: transformStyle }}
        {...bindGestures}
      >
        <CardView card={feed.item.card} onMeasure={setMeasure} />

        {showHint && (
          <div className="swipe-hint" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        )}
      </div>

      <CardActions onSubmit={(g) => void submit(g)} onLogUrge={feed.logUrge} />
    </div>
  );
}
