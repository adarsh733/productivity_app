import { useState } from 'react';
import '../../styles/lessons.css';
import LessonPlayer from './LessonPlayer';
import { ArrowLeftIcon } from '../shell/Icons';
import { useLessons, type Lesson, type LevelInfo } from '../../features/lessons/useLessons';
import { useBookmarks } from '../../features/bookmarks/useBookmarks';
import { TRACK_LABELS, trackOf } from '../../features/skills/trackOf';
import type { AnyCard, Track } from '../../types/contract';

export interface SkillPageProps {
  track: Track;
  onBack: () => void;
}

/** A short, human label for any saved card, old or v5. */
export function cardLabel(card: AnyCard): string {
  switch (card.type) {
    case 'teach':
      return card.title;
    case 'word':
    case 'pronounce':
      return card.term;
    case 'idiom':
      return card.phrase;
    case 'action_verb':
      return card.verb;
    case 'swap':
    case 'phrase':
      return card.weak;
    default: {
      const loose = card as unknown as Record<string, unknown>;
      for (const key of ['title', 'prompt', 'text', 'name']) {
        const v = loose[key];
        if (typeof v === 'string' && v) return v;
      }
      return card.id;
    }
  }
}

function LevelBlock({
  info,
  doneIds,
  onPlay,
}: {
  info: LevelInfo;
  doneIds: ReadonlySet<string>;
  onPlay: (lesson: Lesson) => void;
}) {
  const { level, status, lessons, doneCount } = info;
  const icon = status === 'done' ? '✓' : status === 'open' ? '▶' : status === 'soon' ? '★' : '🔒';
  const note =
    status === 'soon'
      ? 'Coming soon'
      : status === 'locked'
        ? `Finish Level ${level - 1} to open`
        : `${doneCount} of ${lessons.length} lessons done`;

  return (
    <li className={`sk-level is-${status}`} data-level={level} data-status={status}>
      <div className="sk-level-head">
        <span className="sk-level-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="sk-level-name">Level {level}</span>
        <span className="sk-level-note">{note}</span>
      </div>
      {(status === 'open' || status === 'done') && (
        <ul className="sk-lessons">
          {lessons.map((l) => {
            const done = doneIds.has(l.id);
            return (
              <li key={l.id}>
                <button type="button" className="sk-lesson tap" onClick={() => onPlay(l)}>
                  <span className="sk-lesson-title">{l.title}</span>
                  <span className="sk-lesson-state" aria-label={done ? 'Done' : 'Not done yet'}>
                    {done ? '✓' : '○'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * One skill: its 5-level ladder (a level opens when the one before it is
 * done; Levels 3-5 are a locked star, "Coming soon") and the cards he saved
 * for it.
 */
export default function SkillPage({ track, onBack }: SkillPageProps) {
  const { ready, ladderOf, doneIds } = useLessons();
  const { savedCards } = useBookmarks();
  const [playing, setPlaying] = useState<Lesson | null>(null);

  const ladder = ladderOf(track);
  const saved = (savedCards as AnyCard[]).filter((c) => trackOf(c).track === track);

  return (
    <section className="skill-page" aria-label={TRACK_LABELS[track]} data-track={track}>
      <header className="sk-top">
        <button type="button" className="sk-back tap" onClick={onBack} aria-label="Back to Ask">
          <ArrowLeftIcon aria-hidden="true" />
        </button>
        <h1 className="sk-title">{TRACK_LABELS[track]}</h1>
      </header>

      <h2 className="sk-h2">Your 5 levels</h2>
      {ready ? (
        <ol className="sk-ladder">
          {ladder.map((info) => (
            <LevelBlock key={info.level} info={info} doneIds={doneIds} onPlay={setPlaying} />
          ))}
        </ol>
      ) : (
        <p className="sk-empty">Loading…</p>
      )}

      <h2 className="sk-h2">Saved for this skill</h2>
      {saved.length > 0 ? (
        <ul className="sk-saved">
          {saved.map((c) => (
            <li key={c.id} className="sk-saved-item">
              <span aria-hidden="true">⭐</span> {cardLabel(c)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sk-empty">Nothing saved here yet. Tap Save on a card to keep it.</p>
      )}

      {playing && <LessonPlayer lesson={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
}
