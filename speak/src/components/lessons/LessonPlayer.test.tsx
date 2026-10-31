import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LessonPlayer from './LessonPlayer';
import StoriesRow from './StoriesRow';
import { db } from '../../db/db';
import { groupLessons, type Lesson } from '../../features/lessons/useLessons';
import type { TeachCard } from '../../types/contract';

function makeLesson(): Lesson {
  const cards = ([1, 2, 3, 4, 5] as const).map((step) => ({
    id: `ls-words-1-1-${step}`,
    type: 'teach',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
    track: 'words',
    level: 1,
    kind: 'learn',
    category: 'test',
    title: `Step ${step} title`,
    rule: 'A rule.',
    examples: { work: 'At work.', everyday: 'At home.' },
    analogy: 'Like a bus.',
    tryPrompt: 'Try it.',
    register: 'both',
    lesson: { id: 'ls-words-1-1', title: 'Say it simply', step, order: 1 },
  })) as TeachCard[];
  return groupLessons(cards)[0] as Lesson;
}

const litBars = () => document.querySelectorAll('.lp-bar.is-on').length;

/** Each test card has 4 slides: idea, examples, picture, try. */
const SLIDES_PER_CARD = 4;
const tapStage = (times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByTestId('lp-stage'));
};

describe('LessonPlayer', () => {
  beforeEach(async () => {
    await Promise.all([db.lessonProgress.clear(), db.cards.clear()]);
  });

  it('shows 5 progress bars, one lit at the start', () => {
    render(<LessonPlayer lesson={makeLesson()} onClose={() => {}} />);
    expect(screen.getAllByTestId('lp-bar')).toHaveLength(5);
    expect(litBars()).toBe(1);
    expect(screen.getByText('Step 1 title')).toBeInTheDocument();
  });

  it('tapping walks through the slides, then lights the next bar', () => {
    render(<LessonPlayer lesson={makeLesson()} onClose={() => {}} />);
    tapStage();
    expect(screen.getByText('At work.')).toBeInTheDocument();
    expect(screen.queryByText('Step 1 title')).toBeNull();
    expect(litBars()).toBe(1);
    tapStage(SLIDES_PER_CARD - 1);
    expect(screen.getByText('Step 2 title')).toBeInTheDocument();
    expect(litBars()).toBe(2);
  });

  it('tapping the left of the screen goes back a slide, then a card', () => {
    render(<LessonPlayer lesson={makeLesson()} onClose={() => {}} />);
    const stage = screen.getByTestId('lp-stage');
    tapStage(SLIDES_PER_CARD + 1);
    expect(litBars()).toBe(2);
    stage.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
    fireEvent.click(stage, { clientX: 10 });
    expect(screen.getByText('Step 2 title')).toBeInTheDocument();
    fireEvent.click(stage, { clientX: 10 });
    expect(screen.getByText('Step 1 title')).toBeInTheDocument();
    expect(litBars()).toBe(1);
  });

  it('a game holds the tap until it is played', () => {
    const lesson = makeLesson();
    const first = lesson.cards[0] as TeachCard;
    first.insteadOf = 'We had a very good meeting.';
    first.examples = { work: 'We had a productive meeting.', everyday: 'At home.' };
    render(<LessonPlayer lesson={lesson} onClose={() => {}} />);
    tapStage();
    expect(screen.getByText('Tap the weak words')).toBeInTheDocument();
    tapStage();
    expect(screen.getByText('Tap the weak words')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'We' }));
    expect(screen.getByText('Tap the weak words')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'very good' }));
    expect(screen.getByRole('button', { name: 'productive' })).toBeInTheDocument();
    tapStage();
    expect(screen.getByText('We had a productive meeting.')).toBeInTheDocument();
  });

  it('✕ closes without saving any progress', async () => {
    const onClose = vi.fn();
    render(<LessonPlayer lesson={makeLesson()} onClose={onClose} />);
    tapStage();
    fireEvent.click(screen.getByRole('button', { name: 'Close lesson' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await db.lessonProgress.count()).toBe(0);
  });

  it('finishing the last slide of the fifth card saves the lesson and closes', async () => {
    const onClose = vi.fn();
    const onDone = vi.fn();
    render(<LessonPlayer lesson={makeLesson()} onClose={onClose} onDone={onDone} />);
    tapStage(SLIDES_PER_CARD * 4);
    expect(screen.getByText('Step 5 title')).toBeInTheDocument();
    expect(litBars()).toBe(5);
    tapStage(SLIDES_PER_CARD - 1);
    expect(await db.lessonProgress.count()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    const row = await db.lessonProgress.get('ls-words-1-1');
    expect(row?.lessonId).toBe('ls-words-1-1');
    expect(row?.doneAt).toBeGreaterThan(0);
  });

  it('tapping a button inside the card does not advance', () => {
    const lesson = makeLesson();
    (lesson.cards[0] as TeachCard).answer = 'A great answer.';
    render(<LessonPlayer lesson={lesson} onClose={() => {}} />);
    tapStage(SLIDES_PER_CARD - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Show a great answer' }));
    expect(screen.getByText('A great answer.')).toBeInTheDocument();
    expect(screen.getByText('Try it.')).toBeInTheDocument();
  });
});

describe('StoriesRow', () => {
  beforeEach(async () => {
    await Promise.all([db.lessonProgress.clear(), db.cards.clear()]);
  });

  it('renders nothing until lessons exist', async () => {
    const { container } = render(<StoriesRow onOpenLesson={() => {}} />);
    await waitFor(() => expect(db.cards.count()).resolves.toBe(0));
    expect(container.querySelector('.stories-row')).toBeNull();
  });

  it('shows 4 rings and opens the tapped ring with its next lesson', async () => {
    const lesson = makeLesson();
    await db.cards.bulkPut(lesson.cards as never);
    const onOpen = vi.fn();
    render(<StoriesRow onOpenLesson={onOpen} />);
    await waitFor(() => expect(document.querySelectorAll('.story-ring')).toHaveLength(4));
    const words = document.querySelector('.story-ring[data-track="words"]') as HTMLButtonElement;
    expect(words.disabled).toBe(false);
    fireEvent.click(words);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'ls-words-1-1' }));
    // Skills without lessons are present but cannot be opened.
    expect((document.querySelector('.story-ring[data-track="stories"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('greys a ring once its lesson was done today', async () => {
    const lesson = makeLesson();
    await db.cards.bulkPut(lesson.cards as never);
    await db.lessonProgress.put({ lessonId: lesson.id, doneAt: Date.now() });
    render(<StoriesRow onOpenLesson={() => {}} />);
    await waitFor(() => {
      const words = document.querySelector('.story-ring[data-track="words"]');
      expect(words?.classList.contains('is-done')).toBe(true);
    });
  });
});
