import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import YouScreen from './YouScreen';
import { db } from '../../db/db';

describe('YouScreen Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.profile.clear();
    await db.days.clear();
    await db.recordings.clear();
    await db.profile.put({
      id: 'me',
      createdAt: Date.now(),
      dailyGoal: 'regular',
      interests: ['office', 'words'],
    });
  });

  it('renders stats overview, daily goal selector, and interests section', async () => {
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Daily Goal/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Feed Focus/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved & Bookmarks/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Streak/i).length).toBeGreaterThan(0);
  });

  it('allows changing daily goal tier', async () => {
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Serious/i)).toBeInTheDocument();
    });

    const seriousBtn = screen.getByText(/Serious/i).closest('[role="button"]')!;
    await act(async () => {
      fireEvent.click(seriousBtn);
    });

    const profile = await db.profile.get('me');
    expect(profile?.dailyGoal).toBe('serious');
  });

  it('opens Bookmarked Cards drawer when trigger row is clicked', async () => {
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Saved & Bookmarks/i)).toBeInTheDocument();
    });

    const bookmarksRow = screen.getByText(/Saved & Bookmarks/i).closest('.saved-bookmarks-trigger-row') || screen.getByText(/Bookmarked Cards/i).closest('.saved-bookmarks-trigger-row')!;
    await act(async () => {
      fireEvent.click(bookmarksRow);
    });

    expect(screen.getAllByText(/Bookmarked Cards/i).length).toBeGreaterThanOrEqual(1);
  });
});
