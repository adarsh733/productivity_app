import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../features/feed/useFeed';
import CardView from '../cards/CardView';
import type { Grade } from '../../types/contract';

/**
 * The feed.
 *
 * Swipe up = `good`. That is the whole point: his thumb is already trained for
 * a vertical feed, so the fast path costs one gesture and still records an
 * honest grade. The buttons exist for the other three answers.
 *
 * There is deliberately no "you're done!" screen. A dead end is the moment he
 * opens Instagram instead, so Core 3 hands straight to an infinite queue.
 */

const SWIPE_THRESHOLD = 70;
const GRADES: { g: Grade; label: string }[] = [
  { g: 'hard', label: 'Hard' },
  { g: 'good', label: 'Good' },
  { g: 'easy', label: 'Easy' },
];

export default function FeedScreen() {
  const feed = useFeed('core');
  const [measure, setMeasure] = useState<number | undefined>();
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [urgeFlash, setUrgeFlash] = useState(false);

  const shownAt = useRef(Date.now());
  const startY = useRef<number | null>(null);
  const busy = useRef(false);

  const cardId = feed.item?.card.id;

  useEffect(() => {
    shownAt.current = Date.now();
    setMeasure(undefined);
    setDrag(0);
    setLeaving(false);
    busy.current = false;
  }, [cardId]);

  const submit = useCallback(
    (g: Grade) => {
      if (busy.current) return;
      busy.current = true;
      setLeaving(true);
      void feed.submit(g, { msSpent: Date.now() - shownAt.current, measure });
    },
    [feed, measure],
  );

  // ── swipe ──────────────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if (busy.current) return;
    startY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    // Upward only, with resistance so it never feels like a scroll.
    setDrag(dy < 0 ? Math.max(dy, -160) * 0.6 : 0);
  };

  const onTouchEnd = () => {
    if (startY.current === null) return;
    const travelled = drag;
    startY.current = null;
    if (travelled <= -SWIPE_THRESHOLD) submit('good');
    else setDrag(0);
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

  // Core 3 finished. This is a handoff, not a finish line — the action is the
  // dominant thing on screen and there is no "well done, see you tomorrow".
  if (!feed.item && feed.mode === 'core' && feed.coreThreeDone) {
    return (
      <div className="screen feed">
        <div className="feed-empty">
          <p className="kicker-done">CORE 3 DONE</p>
          <p className="hint">
            {feed.streak > 0 ? `${feed.streak}-day streak held.` : 'Today counts.'}
          </p>
          <button className="btn primary big" onClick={() => feed.setMode('endless')}>
            Keep going
          </button>
          <p className="hint">No end to this one. Stop whenever.</p>
        </div>
      </div>
    );
  }

  if (!feed.item) {
    return (
      <div className="screen feed">
        <div className="feed-empty">
          <p className="meaning">Nothing queued.</p>
          <p className="hint">Add something to the Inbox and it becomes a card.</p>
        </div>
      </div>
    );
  }

  const progress = feed.mode === 'core' ? feed.position / 3 : 0;

  return (
    <div className="screen feed">
      <header className="feed-top">
        <div className="feed-top-left">
          <span className={`pill${feed.mode === 'core' ? ' pill-core' : ''}`}>
            {feed.mode === 'core' ? `CORE ${Math.min(feed.position, 3)}/3` : 'ENDLESS'}
          </span>
          {feed.streak > 0 && <span className="streak">{feed.streak}-day</span>}
        </div>
        <button
          className={`urge tap${urgeFlash ? ' is-flash' : ''}`}
          onClick={() => {
            void feed.logUrge();
            setUrgeFlash(true);
            setTimeout(() => setUrgeFlash(false), 900);
          }}
        >
          {urgeFlash ? 'Counted' : 'Felt the pull'}
        </button>
      </header>

      {feed.mode === 'core' && (
        <div className="core-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(progress, 1)})` }} />
        </div>
      )}

      <div
        className={`card-stage${leaving ? ' is-leaving' : ''}`}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <CardView card={feed.item.card} onMeasure={setMeasure} />
      </div>

      <footer className="grades">
        <button className="btn grade-again tap" onClick={() => submit('again')}>
          Again
        </button>
        <div className="grades-pass">
          {GRADES.map(({ g, label }) => (
            <button key={g} className={`btn grade-${g} tap`} onClick={() => submit(g)}>
              {label}
            </button>
          ))}
        </div>
      </footer>

      <p className="swipe-hint" aria-hidden="true">
        swipe up to pass
      </p>
    </div>
  );
}
