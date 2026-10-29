import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MeScreen from './MeScreen';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { emptyDay } from '../../features/session/day';
import { grade, newReview } from '../../srs/scheduler';

const today = todayKey();
const now = Date.now();

async function clearAll() {
  await Promise.all([
    db.days.clear(),
    db.reviews.clear(),
    db.bookmarks.clear(),
    db.lessonProgress.clear(),
    db.weakSpots.clear(),
    db.storyBank.clear(),
    db.chats.clear(),
    db.asks.clear(),
    db.meta.clear(),
    db.cards.clear(),
  ]);
}

describe('MeScreen (v5)', () => {
  beforeEach(clearAll);

  it('shows the three stats and five rows with empty states on a fresh phone', async () => {
    render(<MeScreen />);

    expect(screen.getByRole('heading', { name: 'Me' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('stat-streak').textContent).toContain('0');
    });
    expect(screen.getByTestId('stat-streak').textContent).toContain('day streak');
    expect(screen.getByTestId('stat-words').textContent).toContain('words and phrases');
    expect(screen.getByTestId('stat-lessons').textContent).toContain('lessons done');

    for (const title of ['Saved', 'My weak spots', 'Story bank', 'Evening chats', 'Things I asked']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing asked yet')).toBeInTheDocument();
    expect(document.querySelectorAll('.me-row.is-empty')).toHaveLength(5);
  });

  it('opens the old tools sheet from the gear', () => {
    const onOpen = vi.fn();
    render(<MeScreen onOpenOldTools={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Old tools/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('traces every number to a stored query', async () => {
    for (let i = 0; i < 3; i++) {
      await db.days.put({ ...emptyDay(addDays(today, -i)), cardsCompleted: 5, coreThreeDone: true });
    }
    const reviews = Array.from({ length: 4 }, (_, i) => grade(newReview(`c${i}`, today), 'good', today, now).review);
    await db.reviews.bulkPut(reviews);
    await db.lessonProgress.bulkPut([
      { lessonId: 'ls-smalltalk-1-1-1', doneAt: now },
      { lessonId: 'ls-smalltalk-1-1-2', doneAt: now },
    ]);
    await db.weakSpots.bulkPut([
      { id: 'w1', wrong: 'tell my point', right: 'make my point', source: 'ask', createdAt: now },
      { id: 'w2', wrong: 'old one', right: 'fixed', source: 'chat', createdAt: now - 10, fixedAt: now },
    ]);
    await db.asks.put({
      id: 'a1',
      createdAt: now,
      text: 'ubiquitous',
      askKind: 'word',
      answer: 'everywhere',
      cardIds: ['x', 'y', 'z'],
      addedToFeed: true,
    });

    render(<MeScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-streak').textContent).toContain('3');
      expect(screen.getByTestId('stat-words').textContent).toContain('4');
      expect(screen.getByTestId('stat-lessons').textContent).toContain('2');
    });
    expect(screen.getByText('"tell my point"')).toBeInTheDocument();
    expect(screen.queryByText(/old one/)).toBeNull();
    expect(screen.getByText('1 question → 3 cards')).toBeInTheDocument();
  });

  it('"What the app knows about me": plain empty lines on a fresh phone', async () => {
    render(<MeScreen />);
    expect(await screen.findByRole('heading', { name: 'What the app knows about me' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing yet\. Tell Ask what you want/)).toBeInTheDocument();
    expect(screen.getByText(/None yet\. They come from what you ask/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('me-knows-weak').textContent).toBe('None open right now.'));
  });

  it('shows his wishes newest first with Forget, the subjects (max 8) and open weak-spot counts', async () => {
    await db.meta.put({
      key: 'learn.profile',
      value: {
        wishTopics: [{ text: 'cricket', at: 9 }],
        seenTopics: Array.from({ length: 10 }, (_, i) => ({ text: `subject ${i}`, at: 8 - i, source: 'chat' })),
        notes: [
          { text: 'Too easy for me', at: 5 },
          { text: 'More cricket small talk', at: 9 },
        ],
        avoid: [],
        amount: [],
        difficulty: [],
      },
      updatedAt: 1,
    });
    await db.weakSpots.bulkPut([
      { id: 'w1', wrong: 'tell my point', right: 'make my point', source: 'ask', createdAt: now },
      { id: 'w2', wrong: 'do the needful', right: 'please handle it', source: 'chat', createdAt: now },
      { id: 'w3', wrong: 'revert back', right: 'reply', source: 'chat', createdAt: now },
      { id: 'w4', wrong: 'old', right: 'new', source: 'ask', createdAt: now, fixedAt: now },
    ]);

    render(<MeScreen />);

    await waitFor(() => expect(screen.getAllByTestId('me-wish')).toHaveLength(2));
    expect(screen.getAllByTestId('me-wish').map((li) => li.textContent)).toEqual([
      'More cricket small talkForget',
      'Too easy for meForget',
    ]);
    await waitFor(() => expect(screen.getAllByTestId('me-topic')).toHaveLength(8));
    expect(screen.getAllByTestId('me-topic')[0]!.textContent).toBe('cricket');
    expect(screen.getByTestId('me-knows-weak').textContent).toBe('3 open · 1 from Ask, 2 from evening chats');

    const forget = screen.getByRole('button', { name: 'Forget: Too easy for me' });
    expect(forget.className).toContain('tap');
    fireEvent.click(forget);
    await waitFor(() => expect(screen.getAllByTestId('me-wish')).toHaveLength(1));
    const row = await db.meta.get('learn.profile');
    expect((row?.value as { notes: Array<{ text: string }> }).notes.map((n) => n.text)).toEqual([
      'More cricket small talk',
    ]);
  });
});
