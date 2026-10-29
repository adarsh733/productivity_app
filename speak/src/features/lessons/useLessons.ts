import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { todayKey, toDayKey } from '../../lib/date';
import type { DayKey, LessonProgress, TeachCard, Track, TrackLevel } from '../../types/contract';
import { tracksFrom } from './rotation';

/** Levels per skill. Only Levels 1-2 have lessons in this build (question 7A). */
export const LEVELS: readonly TrackLevel[] = [1, 2, 3, 4, 5];

export interface Lesson {
  id: string;
  track: Track;
  level: TrackLevel;
  title: string;
  order: number;
  /** The lesson's cards in step order (normally 5). */
  cards: TeachCard[];
}

/**
 * done   — every lesson at this level is finished
 * open   — unlocked, lessons still to do
 * locked — has lessons, but the level before is not finished yet
 * soon   — no lessons written for it yet ("coming soon")
 */
export type LevelStatus = 'done' | 'open' | 'locked' | 'soon';

export interface LevelInfo {
  level: TrackLevel;
  status: LevelStatus;
  lessons: Lesson[];
  doneCount: number;
}

/** Group lesson cards by lesson id; lessons sorted by level then order, cards by step. */
export function groupLessons(cards: TeachCard[]): Lesson[] {
  const map = new Map<string, Lesson>();
  for (const card of cards) {
    if (!card.lesson) continue;
    let lesson = map.get(card.lesson.id);
    if (!lesson) {
      lesson = {
        id: card.lesson.id,
        track: card.track,
        level: card.level,
        title: card.lesson.title,
        order: card.lesson.order,
        cards: [],
      };
      map.set(lesson.id, lesson);
    }
    lesson.cards.push(card);
  }
  const lessons = [...map.values()];
  for (const l of lessons) l.cards.sort((a, b) => (a.lesson?.step ?? 0) - (b.lesson?.step ?? 0));
  lessons.sort((a, b) => a.level - b.level || a.order - b.order || a.id.localeCompare(b.id));
  return lessons;
}

/**
 * The 5-level ladder for one skill. Level 1 is open from the start; a later
 * level opens only when every lesson of the level before it is done. A level
 * with no lessons yet is "soon", never open.
 */
export function buildLadder(lessons: Lesson[], doneIds: ReadonlySet<string>): LevelInfo[] {
  const ladder: LevelInfo[] = [];
  let previousFinished = true; // the step before Level 1 is "finished" by definition
  for (const level of LEVELS) {
    const own = lessons.filter((l) => l.level === level);
    const doneCount = own.filter((l) => doneIds.has(l.id)).length;
    let status: LevelStatus;
    if (own.length === 0) status = 'soon';
    else if (!previousFinished) status = 'locked';
    else if (doneCount === own.length) status = 'done';
    else status = 'open';
    ladder.push({ level, status, lessons: own, doneCount });
    previousFinished = status === 'done';
  }
  return ladder;
}

/** The lesson to do next: the first unfinished lesson of the first open level. */
export function nextLessonOf(ladder: LevelInfo[], doneIds: ReadonlySet<string>): Lesson | null {
  for (const info of ladder) {
    if (info.status !== 'open') continue;
    const next = info.lessons.find((l) => !doneIds.has(l.id));
    if (next) return next;
  }
  return null;
}

/** True when a lesson of this skill was finished on `day`. */
export function trackDoneOn(
  lessons: Lesson[],
  progress: readonly LessonProgress[],
  track: Track,
  day: DayKey,
): boolean {
  const ids = new Set(lessons.filter((l) => l.track === track).map((l) => l.id));
  return progress.some((p) => ids.has(p.lessonId) && toDayKey(new Date(p.doneAt)) === day);
}

/** Record a finished lesson. The first finish time is kept. */
export async function markLessonDone(lessonId: string, at: number = Date.now()): Promise<void> {
  const existing = await db.lessonProgress.get(lessonId);
  if (existing) return;
  await db.lessonProgress.put({ lessonId, doneAt: at });
}

export interface StoryRing {
  track: Track;
  /** The lesson this ring opens, or null when there is nothing left to open. */
  lesson: Lesson | null;
  /** A lesson of this skill was finished today. */
  doneToday: boolean;
}

export interface UseLessonsReturn {
  ready: boolean;
  lessons: Lesson[];
  doneIds: Set<string>;
  isDone: (lessonId: string) => boolean;
  ladderOf: (track: Track) => LevelInfo[];
  nextLesson: (track: Track) => Lesson | null;
  /** Four rings, today's rotating skill first. */
  rings: StoryRing[];
  markDone: (lessonId: string) => Promise<void>;
}

export function useLessons(day: DayKey = todayKey()): UseLessonsReturn {
  const cards = useLiveQuery(() => db.cards.where('type').equals('teach').toArray(), []);
  const progress = useLiveQuery(() => db.lessonProgress.toArray(), []);

  const lessons = useMemo(
    () =>
      groupLessons(
        ((cards ?? []) as unknown as TeachCard[]).filter(
          (c) => c.status === 'active' && Boolean(c.lesson),
        ),
      ),
    [cards],
  );
  const doneIds = useMemo(() => new Set((progress ?? []).map((p) => p.lessonId)), [progress]);

  const ladderOf = useCallback(
    (track: Track) =>
      buildLadder(
        lessons.filter((l) => l.track === track),
        doneIds,
      ),
    [lessons, doneIds],
  );

  const nextLesson = useCallback(
    (track: Track) => nextLessonOf(ladderOf(track), doneIds),
    [ladderOf, doneIds],
  );

  const rings = useMemo<StoryRing[]>(
    () =>
      tracksFrom(day).map((track) => ({
        track,
        lesson: nextLessonOf(
          buildLadder(
            lessons.filter((l) => l.track === track),
            doneIds,
          ),
          doneIds,
        ),
        doneToday: trackDoneOn(lessons, progress ?? [], track, day),
      })),
    [day, lessons, doneIds, progress],
  );

  return {
    ready: cards !== undefined && progress !== undefined,
    lessons,
    doneIds,
    isDone: (id: string) => doneIds.has(id),
    ladderOf,
    nextLesson,
    rings,
    markDone: markLessonDone,
  };
}
