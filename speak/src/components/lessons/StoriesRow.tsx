import '../../styles/lessons.css';
import { useLessons, type Lesson } from '../../features/lessons/useLessons';
import { TRACK_LABELS } from '../../features/skills/trackOf';
import { RING_ART } from '../../features/cards/art';
import type { Track } from '../../types/contract';

const SHORT_NAMES: Record<Track, string> = {
  smalltalk: 'Talk',
  stories: 'Stories',
  clearly: 'Clear',
  words: 'Words',
};

export interface StoriesRowProps {
  /** A ring was tapped: play this lesson. */
  onOpenLesson: (lesson: Lesson) => void;
}

/**
 * Four story rings at the top of the Feed, one per skill, each in its own
 * colour. Today's rotating skill comes first. A ring turns grey once a lesson
 * of that skill is done today. Hidden until some lessons exist on the phone.
 */
export default function StoriesRow({ onOpenLesson }: StoriesRowProps) {
  const { ready, lessons, rings } = useLessons();
  if (!ready || lessons.length === 0) return null;

  return (
    <nav className="stories-row" aria-label="Today's lessons">
      {rings.map((ring, i) => {
        const name = TRACK_LABELS[ring.track].split(' ').slice(1).join(' ');
        return (
          <button
            key={ring.track}
            type="button"
            className={`story-ring tap${ring.doneToday ? ' is-done' : ''}${i === 0 ? ' is-today' : ''}`}
            data-track={ring.track}
            disabled={!ring.lesson}
            onClick={() => ring.lesson && onOpenLesson(ring.lesson)}
            aria-label={
              ring.doneToday
                ? `${name}: done today`
                : ring.lesson
                  ? `${name}: ${ring.lesson.title}`
                  : `${name}: all lessons done`
            }
          >
            <span className="story-ring-circle" aria-hidden="true">
              <img className="story-ring-inner" src={RING_ART[ring.track]} alt="" draggable={false} />
            </span>
            <span className="story-ring-name">{SHORT_NAMES[ring.track]}</span>
          </button>
        );
      })}
    </nav>
  );
}
