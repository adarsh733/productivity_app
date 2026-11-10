import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';
import { speak } from '../../lib/speech';
import type { ModuleCard } from '../../types/contract';
import FavoritesScreen from './FavoritesScreen';

vi.mock('../../lib/speech', () => ({
  speak: vi.fn(),
  supported: vi.fn(() => true),
  voices: vi.fn(() => []),
}));

const EMPTY_ALL = 'Nothing here yet. Tap ♡ on a card in the Feed to keep it here.';
const EMPTY_MODULE = 'No favorites in this module yet.';

async function clearAll() {
  await db.cards.clear();
  await db.bookmarks.clear();
  await db.savedReviews.clear();
  await db.outbox.clear();
  await db.events.clear();
  await db.days.clear();
  await db.profile.clear();
}

async function saveTwo(): Promise<{ word: ModuleCard; story: ModuleCard }> {
  const all = (await db.cards.where('type').equals('module').toArray()) as unknown as ModuleCard[];
  const word = all.find((c) => c.module === 'words')!;
  const story = all.find((c) => c.module === 'stories')!;
  await db.bookmarks.bulkPut([
    { cardId: word.id, createdAt: 1_000 },
    { cardId: story.id, createdAt: 2_000 },
  ]);
  return { word, story };
}

function shownIds(): (string | null)[] {
  const list = document.querySelector('[aria-label="Favorite cards"]')!;
  return Array.from(list.querySelectorAll('.v7-card')).map((c) => c.getAttribute('data-card-id'));
}

describe('FavoritesScreen', () => {
  beforeEach(async () => {
    cleanup();
    vi.mocked(speak).mockClear();
    await clearAll();
    await ensureSeeded();
  });

  afterEach(async () => {
    cleanup();
    await clearAll();
  });

  it('shows the empty line when nothing is saved', async () => {
    render(<FavoritesScreen />);
    const root = screen.getByTestId('favorites-screen');
    expect(root.classList.contains('v7-feed') && root.classList.contains('v7-favorites')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Favorites' })).toBeInTheDocument();
    const empty = await screen.findByTestId('favorites-empty');
    expect(empty.textContent).toBe(EMPTY_ALL);
    expect(screen.queryAllByTestId('fav-card')).toHaveLength(0);
    // The Feed's chips, starting at Mix.
    expect(screen.getByRole('tablist', { name: 'Module filters' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mix' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists two saved cards full-size, newest first, with a ♡ + speaker rail', async () => {
    const { word, story } = await saveTwo();
    render(<FavoritesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-card')).toHaveLength(2));
    expect(document.querySelector('[aria-label="Favorite cards"]')!.classList.contains('v7-vfeed')).toBe(
      true,
    );
    expect(shownIds()).toEqual([story.id, word.id]);

    const rails = screen.getAllByRole('toolbar', { name: 'Card actions' });
    expect(rails).toHaveLength(2);
    rails.forEach((r) => {
      const labels = Array.from(r.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
      expect(labels).toEqual(['Remove from Favorites', 'Hear pronunciation']);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hear pronunciation' })[0]!);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('favorites-empty')).toBeNull();
  });

  it('a module chip filters the cards and shows the module empty line', async () => {
    const { word } = await saveTwo();
    render(<FavoritesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-card')).toHaveLength(2));

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Words' }));
    });
    await waitFor(() => expect(screen.getAllByTestId('fav-card')).toHaveLength(1));
    expect(shownIds()).toEqual([word.id]);

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Small talk' }));
    });
    expect((await screen.findByTestId('favorites-empty')).textContent).toBe(EMPTY_MODULE);
  });

  it('un-save hollows the ♡, keeps the card until the next open, and ends its review', async () => {
    const { word, story } = await saveTwo();
    const first = render(<FavoritesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-card')).toHaveLength(2));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Favorites' })[0]!);
    });
    await waitFor(() => expect(db.bookmarks.get(story.id)).resolves.toBeUndefined());
    // Still listed, ♡ now hollow and offers to save again.
    expect(shownIds()).toEqual([story.id, word.id]);
    expect(screen.getByRole('button', { name: 'Save to Favorites' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await db.savedReviews.get(story.id)).toBeUndefined();

    first.unmount();
    render(<FavoritesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-card')).toHaveLength(1));
    expect(shownIds()).toEqual([word.id]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from Favorites' }));
    });
    await waitFor(() => expect(db.bookmarks.get(word.id)).resolves.toBeUndefined());
    cleanup();
    render(<FavoritesScreen />);
    expect((await screen.findByTestId('favorites-empty')).textContent).toBe(EMPTY_ALL);
  });
});
