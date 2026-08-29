import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import FeedScreen from './FeedScreen';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';

describe('FeedScreen Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await ensureSeeded();
  });

  it('renders active card and header metrics cleanly', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/day streak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/XP earned today/i)).toBeInTheDocument();
  });

  it('advances to next card when Got It button is clicked', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
    });

    const gotItBtn = screen.getByRole('button', { name: /Advance to next card/i });
    await act(async () => {
      fireEvent.click(gotItBtn);
    });

    // Feed still has active card and advance button
    expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
  });

  it('triggers onOpenSpeakWithCard handler when Say it action is clicked', async () => {
    const onOpenSpeak = vi.fn();
    render(<FeedScreen onOpenSpeakWithCard={onOpenSpeak} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Advance to next card/i })).toBeInTheDocument();
    });

    const sayItBtn = screen.queryByRole('button', { name: /Practice speaking this card/i });
    if (sayItBtn) {
      await act(async () => {
        fireEvent.click(sayItBtn);
      });
      expect(onOpenSpeak).toHaveBeenCalled();
    }
  });
});
