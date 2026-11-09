import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MeScreen from './MeScreen';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { emptyDay } from '../../features/session/day';
import { grade, newReview } from '../../srs/scheduler';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTests } from '../../sync/supabase';

/** A fake Supabase client for the backup row — never real keys. */
function fakeClient(user: { id: string; email: string } | null = null) {
  const state = { user, otp: [] as unknown[] };
  const empty = () => {
    const q = {
      eq: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    };
    return q;
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signInWithOtp: async (c: unknown) => {
        state.otp.push(c);
        return { data: {}, error: null };
      },
      verifyOtp: async (p: { email: string; token: string }) => {
        if (p.token !== '123456') {
          return { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid' } };
        }
        state.user = { id: 'user-1', email: p.email };
        return { data: { user: state.user, session: {} }, error: null };
      },
      signOut: async () => {
        state.user = null;
        return { error: null };
      },
    },
    from: () => ({ select: empty, upsert: async () => ({ error: null }) }),
  };
  return { client: client as unknown as SupabaseClient, state };
}

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
    db.feedback.clear(),
  ]);
}

describe('MeScreen (v5)', () => {
  beforeEach(async () => {
    setSupabaseForTests(null);
    await clearAll();
  });

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

    expect(screen.getByRole('heading', { name: 'What the app learned from you' })).toBeInTheDocument();
    expect(screen.getByTestId('me-learned-empty')).toBeInTheDocument();
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

  it('shows "What the app learned from you" newest first with a 44px remove button and removes lines', async () => {
    await db.feedback.bulkPut([
      {
        id: 'fb-v7-words-01',
        cardId: 'v7-words-01',
        module: 'words',
        reply: 'Got it: Words will get harder from the next batch.',
        reasons: ['too_easy'],
        at: now - 1000,
      },
      {
        id: 'fb-v7-talk-01',
        cardId: 'v7-talk-01',
        module: 'smalltalk',
        reply: "Got it: We'll use simpler examples for Small talk from the next batch.",
        reasons: ['confusing'],
        at: now,
      },
      {
        id: 'fb-v7-better-01',
        cardId: 'v7-better-01',
        module: 'better',
        reply: 'Hidden line',
        reasons: ['loved'],
        at: now + 1000,
        hidden: true,
      },
    ]);

    render(<MeScreen />);

    expect(await screen.findByRole('heading', { name: 'What the app learned from you' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByTestId('me-learned-item')).toHaveLength(2);
    });

    const items = screen.getAllByTestId('me-learned-item');
    expect(items[0]!.textContent).toContain("Got it: We'll use simpler examples for Small talk from the next batch.");
    expect(items[1]!.textContent).toContain('Got it: Words will get harder from the next batch.');
    expect(screen.queryByText('Hidden line')).toBeNull();

    const removeBtn = screen.getByRole('button', {
      name: "Remove: Got it: We'll use simpler examples for Small talk from the next batch.",
    });
    expect(removeBtn.className).toContain('tap');
    expect(removeBtn.className).toContain('me-learned-remove');

    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getAllByTestId('me-learned-item')).toHaveLength(1);
    });
    expect(screen.getByText('Got it: Words will get harder from the next batch.')).toBeInTheDocument();
    expect(screen.queryByText("Got it: We'll use simpler examples for Small talk from the next batch.")).toBeNull();

    const stored = await db.feedback.get('fb-v7-talk-01');
    expect(stored?.hidden).toBe(true);
  });
});

describe('MeScreen backup row (v7 step 6)', () => {
  beforeEach(async () => {
    await Promise.all([clearAll(), db.profile.clear(), db.outbox.clear()]);
  });
  afterEach(() => setSupabaseForTests(null));

  it('says one plain line when backup is not switched on, under the stats', () => {
    setSupabaseForTests(null);
    render(<MeScreen />);
    const row = screen.getByTestId('me-backup');
    expect(row.textContent).toBe('Backup is not switched on yet');
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
    // Sits between the stats and the rows.
    const stats = document.querySelector('.me-stats')!;
    const rows = document.querySelector('.me-rows')!;
    expect(stats.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('email → Send code → 6-digit code → Sign in → "Backed up" + Sign out', async () => {
    const { client, state } = fakeClient();
    setSupabaseForTests(client);
    render(<MeScreen />);

    const send = screen.getByRole('button', { name: 'Send code' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.click(send);

    const codeBox = await screen.findByLabelText('6-digit code');
    expect(state.otp).toEqual([{ email: 'me@example.com', options: { shouldCreateUser: true } }]);
    expect(screen.getByText(/emailed to me@example\.com/)).toBeInTheDocument();

    fireEvent.change(codeBox, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toBe('Token has expired or is invalid');

    fireEvent.change(codeBox, { target: { value: '12a3456' } });
    expect((codeBox as HTMLInputElement).value).toBe('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const status = await screen.findByTestId('me-backup-status');
    expect(status.textContent).toMatch(/^Backed up · /);
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    await waitFor(async () => expect((await db.profile.get('me'))?.lastSyncAt).toBeTypeOf('number'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });
});
