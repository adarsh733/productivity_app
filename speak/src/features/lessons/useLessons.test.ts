import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { toDayKey } from '../../lib/date';
import type { TeachCard, Track, TrackLevel } from '../../types/contract';
import {
  buildLadder,
  groupLessons,
  markLessonDone,
  nextLessonOf,
  trackDoneOn,
  useLessons,
} from './useLessons';

function lessonCards(track: Track, level: TrackLevel, n: number): TeachCard[] {
  return ([1, 2, 3, 4, 5] as const).map((step) => ({
    id: `ls-${track}-${level}-${n}-${step}`,
    type: 'teach',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
    track,
    level,
    kind: 'learn',
    category: 'test',
    title: `T ${level}.${n}.${step}`,
    rule: 'A rule.',
    examples: { work: 'At work.', everyday: 'At home.' },
    analogy: 'Like a bus.',
    tryPrompt: 'Try it.',
    register: 'both',
    lesson: { id: `ls-${track}-${level}-${n}`, title: `Lesson ${level}.${n}`, step, order: n },
  })) as TeachCard[];
}

function level(track: Track, lvl: TrackLevel, count = 5) {
  return Array.from({ length: count }, (_, i) => lessonCards(track, lvl, i + 1)).flat();
}

const ids = (track: Track, lvl: TrackLevel, count = 5) =>
  Array.from({ length: count }, (_, i) => `ls-${track}-${lvl}-${i + 1}`);

describe('groupLessons', () => {
  it('groups cards by lesson, steps in order, lessons by level then order', () => {
    const shuffled = [...level('words', 2), ...level('words', 1)].reverse();
    const lessons = groupLessons(shuffled);
    expect(lessons).toHaveLength(10);
    expect(lessons[0]?.id).toBe('ls-words-1-1');
    expect(lessons[9]?.id).toBe('ls-words-2-5');
    expect(lessons[0]?.cards.map((c) => c.lesson?.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores cards that carry no lesson', () => {
    const loose = { ...lessonCards('words', 1, 1)[0], lesson: undefined } as TeachCard;
    expect(groupLessons([loose])).toEqual([]);
  });
});

describe('level unlock', () => {
  const lessons = groupLessons([...level('smalltalk', 1), ...level('smalltalk', 2)]);

  it('opens Level 1 only; Level 2 is locked, Levels 3-5 are "soon"', () => {
    const ladder = buildLadder(lessons, new Set());
    expect(ladder.map((l) => l.status)).toEqual(['open', 'locked', 'soon', 'soon', 'soon']);
  });

  it('keeps Level 2 locked until all five Level 1 lessons are done', () => {
    const four = new Set(ids('smalltalk', 1).slice(0, 4));
    expect(buildLadder(lessons, four).map((l) => l.status).slice(0, 2)).toEqual(['open', 'locked']);
    expect(buildLadder(lessons, four)[0]?.doneCount).toBe(4);
  });

  it('opens Level 2 the moment Level 1 is complete', () => {
    const done = new Set(ids('smalltalk', 1));
    expect(buildLadder(lessons, done).map((l) => l.status).slice(0, 3)).toEqual(['done', 'open', 'soon']);
  });

  it('never opens Level 3 even when Levels 1-2 are done (no lessons yet)', () => {
    const done = new Set([...ids('smalltalk', 1), ...ids('smalltalk', 2)]);
    expect(buildLadder(lessons, done).map((l) => l.status)).toEqual([
      'done',
      'done',
      'soon',
      'soon',
      'soon',
    ]);
  });

  it('opens Level 3 once it has lessons and Level 2 is done', () => {
    const more = groupLessons([
      ...level('smalltalk', 1),
      ...level('smalltalk', 2),
      ...level('smalltalk', 3, 1),
    ]);
    const done = new Set([...ids('smalltalk', 1), ...ids('smalltalk', 2)]);
    expect(buildLadder(more, done)[2]?.status).toBe('open');
  });

  it('nextLessonOf picks the first unfinished lesson of the open level', () => {
    const done = new Set(ids('smalltalk', 1).slice(0, 2));
    expect(nextLessonOf(buildLadder(lessons, done), done)?.id).toBe('ls-smalltalk-1-3');
    const all = new Set(ids('smalltalk', 1));
    expect(nextLessonOf(buildLadder(lessons, all), all)?.id).toBe('ls-smalltalk-2-1');
    const everything = new Set([...ids('smalltalk', 1), ...ids('smalltalk', 2)]);
    expect(nextLessonOf(buildLadder(lessons, everything), everything)).toBeNull();
  });
});

describe('trackDoneOn', () => {
  it('is true only for a lesson of that skill finished on that day', () => {
    const lessons = groupLessons([...level('smalltalk', 1, 2), ...level('words', 1, 2)]);
    const at = new Date(2026, 9, 29, 10, 0).getTime();
    const progress = [{ lessonId: 'ls-smalltalk-1-1', doneAt: at }];
    const day = toDayKey(new Date(at));
    expect(trackDoneOn(lessons, progress, 'smalltalk', day)).toBe(true);
    expect(trackDoneOn(lessons, progress, 'words', day)).toBe(false);
    expect(trackDoneOn(lessons, progress, 'smalltalk', '2026-10-30')).toBe(false);
  });
});

describe('useLessons', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.lessonProgress.clear()]);
  });

  it('builds rings with today first, and greys a ring once its lesson is done today', async () => {
    await db.cards.bulkPut([
      ...level('smalltalk', 1, 2),
      ...level('stories', 1, 2),
      ...level('clearly', 1, 2),
      ...level('words', 1, 2),
    ] as never);

    // 1970-01-02 is a Stories day.
    const { result } = renderHook(() => useLessons('1970-01-02'));
    await waitFor(() => expect(result.current.lessons.length).toBe(8));

    expect(result.current.rings.map((r) => r.track)).toEqual(['stories', 'clearly', 'words', 'smalltalk']);
    expect(result.current.rings.every((r) => r.lesson && !r.doneToday)).toBe(true);
    expect(result.current.rings[0]?.lesson?.id).toBe('ls-stories-1-1');

    await act(async () => {
      await markLessonDone('ls-stories-1-1', new Date(1970, 0, 2, 9, 0).getTime());
    });
    await waitFor(() => expect(result.current.rings[0]?.doneToday).toBe(true));
    expect(result.current.rings[0]?.lesson?.id).toBe('ls-stories-1-2');
    expect(result.current.rings[1]?.doneToday).toBe(false);
  });

  it('markLessonDone keeps the first finish time', async () => {
    await markLessonDone('ls-words-1-1', 100);
    await markLessonDone('ls-words-1-1', 200);
    expect((await db.lessonProgress.get('ls-words-1-1'))?.doneAt).toBe(100);
    expect(await db.lessonProgress.count()).toBe(1);
  });

  it('skips rejected / non-active lesson cards', async () => {
    const cards = level('words', 1, 1);
    cards[0] = { ...cards[0], status: 'rejected' } as unknown as TeachCard;
    await db.cards.bulkPut(cards as never);
    const { result } = renderHook(() => useLessons('1970-01-01'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.lessons[0]?.cards).toHaveLength(4);
  });
});
