import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import FeedScreen from './FeedScreen';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';
import * as speechModule from '../../lib/speech';
import { addDays, todayKey } from '../../lib/date';
import type { ModuleCard } from '../../types/contract';

vi.mock('../../lib/speech', () => ({
  speak: vi.fn(),
  supported: vi.fn(() => true),
  voices: vi.fn(() => []),
}));

describe('FeedScreen Component Suite', () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await db.cards.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.outbox.clear();
    await db.profile.clear();
    await db.bookmarks.clear();
    await db.feedback.clear();
    await db.seen.clear();
    await db.savedReviews.clear();
    await ensureSeeded();
  });

  afterEach(async () => {
    cleanup();
    await db.events.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.outbox.clear();
    await db.feedback.clear();
    await db.seen.clear();
    await db.savedReviews.clear();
  });

  it('renders header "Articulate" and ChipRow with Mix and all 5 modules', async () => {
    render(<FeedScreen />);

    expect(screen.getByRole('heading', { name: 'Articulate' })).toBeInTheDocument();

    const chiprow = screen.getByRole('tablist', { name: 'Module filters' });
    expect(chiprow).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Mix' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Words' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Small talk' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Say it better' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Office phrases' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stories' })).toBeInTheDocument();

    // Default filter is Mix
    expect(screen.getByRole('tab', { name: 'Mix' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a chip filters the feed and updates selection', async () => {
    render(<FeedScreen />);

    const wordsTab = screen.getByRole('tab', { name: 'Words' });
    await act(async () => {
      fireEvent.click(wordsTab);
    });

    expect(wordsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Mix' })).toHaveAttribute('aria-selected', 'false');

    // Feed updates cards to only words module
    await waitFor(() => {
      const cards = document.querySelectorAll('.v7-card');
      expect(cards.length).toBeGreaterThan(0);
      cards.forEach((card) => {
        expect(card).toHaveAttribute('data-module', 'words');
      });
    });
  });

  it('renders cards in a vertical scroll-snap feed with action rail buttons', async () => {
    render(<FeedScreen />);

    await waitFor(
      () => {
        expect(document.querySelector('.v7-card')).not.toBeNull();
      },
      { timeout: 10000 },
    );

    const vfeed = document.querySelector('.v7-vfeed');
    expect(vfeed).not.toBeNull();

    // First card rail has all 5 action buttons
    const thumbsUpBtns = screen.getAllByRole('button', { name: 'Thumbs up' });
    const thumbsDownBtns = screen.getAllByRole('button', { name: 'Thumbs down' });
    const commentBtns = screen.getAllByRole('button', { name: 'Comment' });
    const bookmarkBtns = screen.getAllByRole('button', { name: /bookmark/i });
    const speakBtns = screen.getAllByRole('button', { name: 'Hear pronunciation' });

    expect(thumbsUpBtns.length).toBeGreaterThan(0);
    expect(thumbsDownBtns.length).toBeGreaterThan(0);
    expect(commentBtns.length).toBeGreaterThan(0);
    expect(bookmarkBtns.length).toBeGreaterThan(0);
    expect(speakBtns.length).toBeGreaterThan(0);
  });

  it('tapping 👍 on rail likes the card without opening the sheet', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    const thumbsUpBtn = screen.getAllByRole('button', { name: 'Thumbs up' })[0]!;
    await act(async () => {
      fireEvent.click(thumbsUpBtn);
    });

    await waitFor(() => {
      expect(thumbsUpBtn).toHaveAttribute('aria-pressed', 'true');
      expect(thumbsUpBtn.className).toContain('is-on');
    });

    // Sheet is NOT opened
    expect(screen.queryByRole('heading', { name: 'What did you think?' })).toBeNull();

    // Feedback row saved in DB
    const feedbacks = await db.feedback.toArray();
    expect(feedbacks.length).toBe(1);
    expect(feedbacks[0]!.thumb).toBe('up');
  });

  it('tapping 👎 on rail opens FeedbackSheet with thumbs down selected', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    const thumbsDownBtn = screen.getAllByRole('button', { name: 'Thumbs down' })[0]!;
    await act(async () => {
      fireEvent.click(thumbsDownBtn);
    });

    // Sheet opens
    expect(await screen.findByRole('heading', { name: 'What did you think?' })).toBeInTheDocument();

    // Thumbs down is active in sheet
    const sheetThumbDown = screen.getByRole('dialog').querySelector('button[aria-label="Thumbs down"]');
    expect(sheetThumbDown).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping 💬 on rail opens FeedbackSheet and allows submitting feedback', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    const commentBtn = screen.getAllByRole('button', { name: 'Comment' })[0]!;
    await act(async () => {
      fireEvent.click(commentBtn);
    });

    // Sheet opens
    expect(await screen.findByRole('heading', { name: 'What did you think?' })).toBeInTheDocument();

    // Select a reason in the sheet
    const lovedChip = screen.getByRole('button', { name: 'Loved this' });
    await act(async () => {
      fireEvent.click(lovedChip);
    });

    await waitFor(() => {
      expect(lovedChip).toHaveAttribute('aria-pressed', 'true');
    });

    // Close the sheet
    const closeHandle = screen.getByTestId('feedback-sheet-handle');
    await act(async () => {
      fireEvent.click(closeHandle);
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'What did you think?' })).toBeNull();
    });
  });

  it('tapping ♡ on rail toggles bookmark state', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    const saveBtn = screen.getAllByRole('button', { name: /bookmark/i })[0]!;
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(async () => {
      const bookmarks = await db.bookmarks.toArray();
      expect(bookmarks.length).toBe(1);
    });

    // Toggle off
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(async () => {
      const bookmarks = await db.bookmarks.toArray();
      expect(bookmarks.length).toBe(0);
    });
  });

  it('tapping 🔊 on rail calls speak with speech content', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    const speakBtn = screen.getAllByRole('button', { name: 'Hear pronunciation' })[0]!;
    await act(async () => {
      fireEvent.click(speakBtn);
    });

    expect(speechModule.speak).toHaveBeenCalled();
  });

  it('StoriesRow, Again / Got it buttons, practice mic, and more menu leave the feed', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });

    // None of the old UI elements exist in the new feed
    expect(document.querySelector('.stories-row')).toBeNull();
    expect(screen.queryByText(/Again \u21bb/i)).toBeNull();
    expect(screen.queryByText(/Got it \u2713/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Advance to next card/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Practice speaking this card/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /More options/i })).toBeNull();
    expect(screen.queryByLabelText(/day streak/i)).toBeNull();
  });
  it('tapping ♡ starts a Sunday review due in 3 days; tapping again removes it', async () => {
    render(<FeedScreen />);

    await waitFor(() => {
      expect(document.querySelector('.v7-card')).not.toBeNull();
    });
    const saveBtn = screen.getAllByRole('button', { name: /bookmark/i })[0]!;
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(async () => {
      expect(await db.savedReviews.count()).toBe(1);
    });
    const row = (await db.savedReviews.toArray())[0]!;
    expect(row.due).toBe(addDays(todayKey(), 3));
    expect((await db.outbox.toArray()).some((r) => r.table === 'savedReviews')).toBe(true);
    // Not due yet: no review bar
    expect(screen.queryByText('Sunday review')).toBeNull();

    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(async () => {
      expect(await db.savedReviews.count()).toBe(0);
    });
  });

  it('a due ♡ card comes first with the Sunday review label; Knew it moves it on', async () => {
    const all = (await db.cards.toArray()).filter(
      (c) => (c as { type?: string }).type === 'module',
    ) as unknown as ModuleCard[];
    const target = all.find((c) => c.module === 'stories')!;
    await db.savedReviews.put({
      cardId: target.id,
      module: target.module,
      savedAt: 1,
      step: 0,
      due: addDays(todayKey(), -1),
      rights: 0,
    });

    render(<FeedScreen />);

    const knew = await screen.findByRole('button', { name: 'Knew it' }, { timeout: 10000 });
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeInTheDocument();
    expect(screen.getByText('Sunday review')).toBeInTheDocument();
    expect(knew.closest('.v7-card')).toHaveAttribute('data-card-id', target.id);
    expect(document.querySelector('.v7-card')).toHaveAttribute('data-card-id', target.id);

    await act(async () => {
      fireEvent.click(knew);
    });

    await waitFor(async () => {
      const row = await db.savedReviews.get(target.id);
      expect(row?.rights).toBe(1);
      expect(row?.step).toBe(1);
      expect(row?.due).toBe(addDays(todayKey(), 7));
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Knew it' })).toBeNull();
    });
    expect((await db.outbox.toArray()).some((r) => r.table === 'savedReviews')).toBe(true);
  });

  it('Not yet keeps the step and brings the card back in 3 days', async () => {
    const all = (await db.cards.toArray()).filter(
      (c) => (c as { type?: string }).type === 'module',
    ) as unknown as ModuleCard[];
    const target = all.find((c) => c.module === 'words')!;
    await db.savedReviews.put({
      cardId: target.id,
      module: target.module,
      savedAt: 1,
      step: 1,
      due: todayKey(),
      rights: 1,
    });

    render(<FeedScreen />);
    const notYet = await screen.findByRole('button', { name: 'Not yet' }, { timeout: 10000 });
    await act(async () => {
      fireEvent.click(notYet);
    });

    await waitFor(async () => {
      const row = await db.savedReviews.get(target.id);
      expect(row?.step).toBe(1);
      expect(row?.rights).toBe(1);
      expect(row?.due).toBe(addDays(todayKey(), 3));
      expect(row?.lastAnswer).toBe('not_yet');
    });
  });
});
