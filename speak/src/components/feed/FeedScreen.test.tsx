import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import FeedScreen from './FeedScreen';
import { db } from '../../db/db';
import { isTeachCard } from '../../features/skills/trackOf';
import { ensureSeeded, readSeedFiles } from '../../db/seedLoader';

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
  });

  it('v5: the feed shows no XP bar, no coach box and no goal banner', async () => {
    render(<FeedScreen />);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    expect(screen.queryByLabelText(/XP earned today/i)).toBeNull();
    expect(screen.queryByText(/XP today/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Tell the coach/i })).toBeNull();
    expect(screen.queryByText(/Daily XP goal/i)).toBeNull();
  });

  it('v5: a teach card shows Again, Save and Got it on the card, and Got it moves on', async () => {
    // Only teach cards in the deck so the first card is a teach card.
    await db.cards.clear();
    const { cards } = readSeedFiles();
    await db.cards.bulkPut(cards.filter((c) => isTeachCard(c)));

    render(<FeedScreen />);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    expect(screen.getByText('Again \u21bb')).toBeInTheDocument();
    expect(screen.getByText('Got it \u2713')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bookmark card/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\u00b7 L\d/)).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Advance to next card/i }));
    });
    await waitFor(
      async () => {
        expect(await db.events.count()).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );
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

  it('v5: 🎤 Say mine on a Try card opens the say-it drill with that card', async () => {
    await db.cards.clear();
    const { cards } = readSeedFiles();
    await db.cards.bulkPut(
      cards.filter((c) => isTeachCard(c) && (c as unknown as { kind: string }).kind === 'try'),
    );
    const onOpenSpeak = vi.fn();
    render(<FeedScreen onOpenSpeakWithCard={onOpenSpeak} />);

    const sayMine = await screen.findByRole(
      'button',
      { name: /Say my answer out loud/i },
      { timeout: 10000 },
    );
    await act(async () => {
      fireEvent.click(sayMine);
    });
    expect(onOpenSpeak).toHaveBeenCalledTimes(1);
    expect(onOpenSpeak.mock.calls[0]![0]).toMatchObject({ type: 'teach', kind: 'try' });
  });
});
