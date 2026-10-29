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
});
