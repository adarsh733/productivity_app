import { useRef, useState } from 'react';
import '../../styles/lessons.css';
import PosterCard from '../cards/PosterCard';
import { CloseIcon } from '../shell/Icons';
import { markLessonDone, type Lesson } from '../../features/lessons/useLessons';
import { isBackTap, usePosterDeck } from '../../features/cards/usePosterDeck';

/** A finger that travelled this far sideways was a swipe. */
const SWIPE_PX = 40;

export interface LessonPlayerProps {
  lesson: Lesson;
  /** ✕ pressed, or the lesson was finished. */
  onClose: () => void;
  /** Called once, after the lesson is saved as done. */
  onDone?: (lesson: Lesson) => void;
}

/**
 * Full-screen lesson, like a story: one progress bar per card (normally 5),
 * one idea on screen. Tap or swipe forward, the left of the screen goes back,
 * ✕ leaves. Finishing the last slide saves the lesson to `lessonProgress`.
 * Leaving early saves nothing.
 */
export default function LessonPlayer({ lesson, onClose, onDone }: LessonPlayerProps) {
  const total = lesson.cards.length;
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const card = lesson.cards[step];
  const deck = usePosterDeck(card);
  const isLast = step >= total - 1;
  const pressX = useRef<number | null>(null);
  const swiped = useRef(false);

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    await markLessonDone(lesson.id);
    onDone?.(lesson);
    onClose();
  };

  const forward = () => {
    if (deck.locked) return;
    if (!deck.atEnd) deck.next();
    else if (isLast) void finish();
    else setStep((s) => s + 1);
  };

  const back = () => {
    if (!deck.atStart) deck.back();
    else setStep((s) => Math.max(0, s - 1));
  };

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    if (isBackTap(e.clientX, e.currentTarget.getBoundingClientRect())) back();
    else forward();
  };

  const onStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pressX.current === null) return;
    const moved = e.clientX - pressX.current;
    pressX.current = null;
    if (Math.abs(moved) < SWIPE_PX) return;
    swiped.current = true;
    if (moved < 0) forward();
    else back();
  };

  if (!card) return null;

  const fillOf = (i: number) => {
    if (i < step) return 100;
    if (i > step) return 0;
    return Math.round(((deck.index + 1) / Math.max(1, deck.slides.length)) * 100);
  };

  return (
    <div
      className="lp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Lesson: ${lesson.title}`}
      data-track={lesson.track}
    >
      <header className="lp-top">
        <div
          className="lp-bars"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-label={`Step ${step + 1} of ${total}`}
        >
          {lesson.cards.map((c, i) => (
            <span key={c.id} className={`lp-bar${i <= step ? ' is-on' : ''}`} data-testid="lp-bar">
              <span className="lp-bar-fill" style={{ width: `${fillOf(i)}%` }} />
            </span>
          ))}
        </div>
        <button type="button" className="lp-close tap" onClick={onClose} aria-label="Close lesson">
          <CloseIcon aria-hidden="true" />
        </button>
      </header>

      <div
        className="lp-stage"
        onClick={onStageClick}
        onPointerDown={(e) => {
          pressX.current = e.clientX;
        }}
        onPointerUp={onStagePointerUp}
        data-testid="lp-stage"
      >
        <PosterCard
          key={card.id}
          card={card}
          slides={deck.slides}
          index={deck.index}
          onSolved={deck.markSolved}
          foot={
            isLast && deck.atEnd ? (
              <button
                type="button"
                className="poster-btn is-main tap lp-next"
                onClick={() => void finish()}
                disabled={finishing}
              >
                Finish ✓
              </button>
            ) : deck.locked ? undefined : (
              <span className="poster-hint">Tap to continue</span>
            )
          }
        />
      </div>
    </div>
  );
}
