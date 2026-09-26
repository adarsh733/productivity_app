import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import YouScreen from './YouScreen';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { emptyDay } from '../../features/session/day';
import { grade, newReview } from '../../srs/scheduler';

const today = todayKey();
const now = Date.now();

async function seedYouTab() {
  await db.profile.put({
    id: 'me',
    createdAt: now,
    dailyGoal: 'regular',
    interests: ['office', 'words'],
  });
  // 4 consecutive complete days -> streak 4.
  for (let i = 0; i < 4; i++) {
    await db.days.put({ ...emptyDay(addDays(today, -i)), cardsCompleted: 5, coreThreeDone: true });
  }
  // 7 cards with reps>=1, 1 untouched -> cards learned 7.
  const reviews = Array.from({ length: 7 }, (_, i) => grade(newReview(`c${i}`, today), 'good', today, now).review);
  reviews.push(newReview('c-fresh', today));
  await db.reviews.bulkPut(reviews);
  // 180s + 120s spoken this week -> 5 minutes.
  await db.events.bulkPut([
    { id: 'e1', type: 'spoken_rep_completed', recordingId: 'r1', drillTitle: 'T', durationSec: 180, xpEarned: 10, at: now, date: today },
    { id: 'e2', type: 'describe_rep_completed', recordingId: 'r2', drillTitle: 'T', durationSec: 120, xpEarned: 10, at: now, date: today },
  ] as never);
  // Normal voice -28; sessions -30 (older week) then -34 (this week) -> 6 dB softer.
  await db.voiceSamples.bulkPut([
    { id: 'v0', at: now - 50 * 86_400_000, date: addDays(today, -50), kind: 'baseline_db', value: -28 },
    { id: 'v1', at: now - 10 * 86_400_000, date: addDays(today, -10), kind: 'session_db', value: -30 },
    { id: 'v2', at: now - 1000, date: today, kind: 'session_db', value: -34 },
    { id: 'v3', at: now - 2000, date: today, kind: 'level1_hold', value: 45 },
  ]);
  await db.recordings.put({
    id: 'rec1',
    sessionId: 's1',
    attempt: 1,
    missionId: 'm1',
    missionTitle: 'Pace drill',
    date: today,
    at: now,
    durationSec: 300,
    mimeType: 'audio/webm',
    blob: new Blob(['audio'], { type: 'audio/webm' }),
  });
}

describe('YouScreen stage-6 simpler tab', () => {
  beforeEach(async () => {
    await db.profile.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.voiceSamples.clear();
    await db.recordings.clear();
    await db.bookmarks.clear();
    await db.inbox.clear();
    await seedYouTab();
  });

  it('shows the 4 headline numbers once each, traced to stored queries', async () => {
    const { container } = render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-streak').textContent).toBe('4');
    });
    expect(screen.getByTestId('stat-cards').textContent).toBe('7');
    expect(screen.getByTestId('stat-minutes').textContent).toBe('5');
    expect(screen.getByTestId('stat-voice').textContent).toBe('6 dB softer');

    // No-dupe: exactly 4 stat nodes, each label rendered once.
    expect(container.querySelectorAll('[data-testid^="stat-"]').length).toBe(4);
    for (const label of ['Day streak', 'Cards learned', 'Minutes spoken · this week', 'Voice vs normal']) {
      expect(screen.getAllByText(label).length).toBe(1);
    }
  });

  it('charts 8-week loudness vs own normal with no 0 dB target, toggles to breath-hold seconds', async () => {
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session loudness over 8 weeks')).toBeInTheDocument();
    });
    // Compared against his own normal voice, in plain words.
    expect(screen.getByText(/about 6 dB softer than your normal voice/)).toBeInTheDocument();
    // The old meaningless target line is gone.
    expect(screen.queryByText(/target 0dB/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Breath hold'));
    });
    expect(screen.getByLabelText('Breath hold over 8 weeks')).toBeInTheDocument();
    expect(screen.getAllByText(/45s/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows — for voice vs normal when nothing is measured', async () => {
    await db.voiceSamples.clear();
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-voice').textContent).toBe('—');
    });
  });

  it('keeps Coach, Saved, Recordings and Settings rows', async () => {
    render(<YouScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('Tell the coach')).toBeInTheDocument();
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Recordings')).toBeInTheDocument();
    expect(screen.getByText('Pace drill')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText(/Daily Goal/i)).toBeInTheDocument();
    expect(screen.getByText(/Feed Focus/i)).toBeInTheDocument();
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
      expect(screen.getByText(/Bookmarked Cards/i)).toBeInTheDocument();
    });

    const bookmarksRow = screen.getByText(/Bookmarked Cards/i).closest('.saved-bookmarks-trigger-row')!;
    await act(async () => {
      fireEvent.click(bookmarksRow);
    });

    expect(screen.getAllByText(/Bookmarked Cards/i).length).toBeGreaterThanOrEqual(1);
  });
});
