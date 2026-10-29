import { useState } from 'react';
import '../../styles/lessons.css';
import TeachCardFace from '../cards/TeachCardFace';
import { CloseIcon } from '../shell/Icons';
import { markLessonDone, type Lesson } from '../../features/lessons/useLessons';
import { TRACK_LABELS } from '../../features/skills/trackOf';

export interface LessonPlayerProps {
  lesson: Lesson;
  /** ✕ pressed, or the lesson was finished. */
  onClose: () => void;
  /** Called once, after the lesson is saved as done. */
  onDone?: (lesson: Lesson) => void;
}

/**
 * Full-screen lesson: one progress bar per step (normally 5), tap the card to
 * go forward (the left edge goes back), ✕ to leave. Finishing the last step
 * saves the lesson to `lessonProgress`. Leaving early saves nothing.
 */
export default function LessonPlayer({ lesson, onClose, onDone }: LessonPlayerProps) {
  const total = lesson.cards.length;
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const card = lesson.cards[step];
  const isLast = step >= total - 1;

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    await markLessonDone(lesson.id);
    onDone?.(lesson);
    onClose();
  };

  const forward = () => {
    if (isLast) void finish();
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  // Tap anywhere on the card advances, except on its own buttons. The left
  // fifth of the screen goes back, like a story.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && e.clientX - rect.left < rect.width * 0.2) back();
    else forward();
  };

  if (!card) return null;

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
            <span key={c.id} className={`lp-bar${i <= step ? ' is-on' : ''}`} data-testid="lp-bar" />
          ))}
        </div>
        <div className="lp-head">
          <div className="lp-head-text">
            <span className="lp-track">
              {TRACK_LABELS[lesson.track]} · L{lesson.level}
            </span>
            <span className="lp-title">{lesson.title}</span>
          </div>
          <button type="button" className="lp-close tap" onClick={onClose} aria-label="Close lesson">
            <CloseIcon aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="lp-stage" onClick={onStageClick} data-testid="lp-stage">
        <TeachCardFace key={card.id} card={card} />
      </div>

      <footer className="lp-foot">
        <button type="button" className="abtn tap lp-back" onClick={back} disabled={step === 0}>
          Back
        </button>
        <span className="lp-count" aria-hidden="true">
          {step + 1} / {total}
        </span>
        <button type="button" className="abtn tap got-it lp-next" onClick={forward} disabled={finishing}>
          {isLast ? 'Finish ✓' : 'Next →'}
        </button>
      </footer>
    </div>
  );
}
