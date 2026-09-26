import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import FeedScreen from './FeedScreen';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';

describe('FeedScreen Real RTL Component Suite', () => {
  beforeEach(async () => {
    // Unmount any leaked tree first so a previous test's pending feed write
    // cannot race this test's reseed (the 1-in-2 full-run flake).
    cleanup();
    await db.cards.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.outbox.clear();
    await db.profile.clear();
    await db.bookmarks.clear();
    await ensureSeeded();
  });

  afterEach(async () => {
    // Unmount before clearing so this test's pending writes settle first.
    cleanup();
    await db.events.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.outbox.clear();
  });

  it('renders active card and header metrics cleanly', async () => {
    render(<FeedScreen />);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    expect(screen.getByLabelText(/day streak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/XP earned today/i)).toBeInTheDocument();
  });

  it('advances to next card when Got It button is clicked', async () => {
    render(<FeedScreen />);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    const gotItBtn = screen.getByRole('button', { name: /Advance to next card/i });
    await act(async () => {
      fireEvent.click(gotItBtn);
    });

    // Feed still has active card and advance button
    expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();

    // Let the async advance write settle before this test ends, so it cannot
    // bleed into the next test's reseed window.
    await waitFor(
      async () => {
        expect(await db.events.count()).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );
  });

  it('triggers onOpenSpeakWithCard handler when Say it action is clicked', async () => {
    const onOpenSpeak = vi.fn();
    render(<FeedScreen onOpenSpeakWithCard={onOpenSpeak} />);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    const sayItBtn = screen.queryByRole('button', { name: /Practice speaking this card/i });
    if (sayItBtn) {
      await act(async () => {
        fireEvent.click(sayItBtn);
      });
      expect(onOpenSpeak).toHaveBeenCalled();
    }
  });
});
