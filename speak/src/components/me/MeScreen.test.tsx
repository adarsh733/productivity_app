import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import MeScreen from './MeScreen';
import { useMe } from '../../features/me/useMe';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { emptyDay } from '../../features/session/day';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTests } from '../../sync/supabase';
import { askLearnedLines, saveAskTurn } from '../../features/learn/askLearned';

/** A fake Supabase client for the backup row — never real keys. */
function fakeClient(user: { id: string; email: string } | null = null, accounts: Record<string, string> = {}) {
  const state = { user, accounts: { ...accounts }, signUps: 0 };
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
      signInWithPassword: async (c: { email: string; password: string }) => {
        if (state.accounts[c.email] !== c.password) {
          return {
            data: { user: null, session: null },
            error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
          };
        }
        state.user = { id: 'user-1', email: c.email };
        return { data: { user: state.user, session: {} }, error: null };
      },
      signUp: async (c: { email: string; password: string }) => {
        state.signUps++;
        if (c.email in state.accounts) {
          return {
            data: { user: null, session: null },
            error: { status: 422, code: 'user_already_exists', message: 'User already registered' },
          };
        }
        state.accounts[c.email] = c.password;
        state.user = { id: 'user-1', email: c.email };
        return { data: { user: { ...state.user, identities: [{}] }, session: {} }, error: null };
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
    db.seen.clear(),
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

  it('shows the three stats and the learned panel, and nothing from the old screen, on a fresh phone', async () => {
    render(<MeScreen />);

    expect(screen.getByRole('heading', { name: 'Me' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('stat-streak').textContent).toContain('0');
    });
    expect(screen.getByTestId('stat-streak').textContent).toBe('0day streak');
    expect(screen.getByTestId('stat-today').textContent).toBe('0cards today');
    expect(screen.getByTestId('stat-words').textContent).toBe('0words and phrases');
    expect(document.querySelectorAll('.me-stat')).toHaveLength(3);
    expect(screen.queryByTestId('stat-lessons')).toBeNull();

    // No rows, no gear, no "knows about me" panel.
    expect(document.querySelector('.me-row')).toBeNull();
    expect(document.querySelector('.me-rows')).toBeNull();
    expect(document.querySelector('.me-gear')).toBeNull();
    expect(screen.queryByRole('button', { name: /Old tools/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Settings/i })).toBeNull();
    for (const title of ['Saved', 'My weak spots', 'Story bank', 'Evening chats', 'Things I asked']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    expect(screen.queryByRole('heading', { name: 'What the app knows about me' })).toBeNull();

    expect(screen.getByRole('heading', { name: 'What the app learned from you' })).toBeInTheDocument();
    expect(screen.getByTestId('me-learned-empty')).toBeInTheDocument();
  });

  it('traces every number to a stored query', async () => {
    for (let i = 0; i < 3; i++) {
      await db.days.put({ ...emptyDay(addDays(today, -i)), cardsCompleted: 5 + i, coreThreeDone: true });
    }
    await db.seen.bulkPut([
      { id: 'words:a', module: 'words', head: 'a', cardId: 'c1', at: now },
      { id: 'words:b', module: 'words', head: 'b', cardId: 'c2', at: now },
      { id: 'phrases:c', module: 'phrases', head: 'c', cardId: 'c3', at: now },
      { id: 'smalltalk:d', module: 'smalltalk', head: 'd', cardId: 'c4', at: now },
      { id: 'stories:e', module: 'stories', head: 'e', cardId: 'c5', at: now },
    ]);

    render(<MeScreen />);

    // 3 days in a row; today has 5 cards; seen = 2 words + 1 phrase (small talk and stories don't count).
    await waitFor(() => {
      expect(screen.getByTestId('stat-streak').textContent).toBe('3day streak');
      expect(screen.getByTestId('stat-today').textContent).toBe('5cards today');
      expect(screen.getByTestId('stat-words').textContent).toBe('3words and phrases');
    });
  });

  it('useMe returns the three numbers and nothing else', async () => {
    const { result } = renderHook(() => useMe());
    await waitFor(() => expect(result.current).toEqual({ streak: 0, cardsToday: 0, wordsAndPhrases: 0 }));
    expect(Object.keys(result.current).sort()).toEqual(['cardsToday', 'streak', 'wordsAndPhrases']);
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

describe('MeScreen: lines from the Ask box (v8)', () => {
  beforeEach(async () => {
    setSupabaseForTests(null);
    await clearAll();
  });

  it('says what teaches the app when nothing is learned yet', async () => {
    render(<MeScreen />);
    expect((await screen.findByTestId('me-learned-empty')).textContent).toBe(
      'Nothing yet. Know it, thumbs, comments and the Ask box teach the app what to show next.',
    );
  });

  it('lists an Ask line with the card lines, newest first, and Remove takes it away', async () => {
    await db.feedback.put({
      id: 'fb-v7-words-01',
      cardId: 'v7-words-01',
      module: 'words',
      reply: 'Got it: Words gets harder now.',
      reasons: ['too_easy'],
      at: now - 5000,
    });
    await saveAskTurn(
      'more about money',
      { reply: 'Done.', learned: [{ kind: 'more', theme: 'Money' }, { kind: 'wish', note: 'Short sentences please.' }] },
      now,
    );

    render(<MeScreen />);

    await waitFor(() => expect(screen.getAllByTestId('me-learned-item')).toHaveLength(3));
    const items = screen.getAllByTestId('me-learned-item');
    expect(items.map((i) => i.querySelector('.me-learned-text')!.textContent)).toEqual([
      'More cards about Money.',
      'Short sentences please.',
      'Got it: Words gets harder now.',
    ]);

    const remove = screen.getByRole('button', { name: 'Remove: More cards about Money.' });
    expect(remove.className).toContain('me-learned-remove');
    fireEvent.click(remove);

    await waitFor(() => expect(screen.getAllByTestId('me-learned-item')).toHaveLength(2));
    expect(screen.queryByText('More cards about Money.')).toBeNull();
    // The Ask store marked it removed (removeAskLearned); the card row is untouched.
    expect((await askLearnedLines()).map((l) => l.text)).toEqual(['Short sentences please.']);
    expect((await db.feedback.get('fb-v7-words-01'))?.hidden).toBeFalsy();
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
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    // Sits under the stats and above "What the app learned from you".
    const stats = document.querySelector('.me-stats')!;
    const learned = screen.getByRole('heading', { name: 'What the app learned from you' });
    expect(stats.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(learned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('email + password → Sign in: wrong password says so, right one → "Backed up" + Sign out', async () => {
    const { client, state } = fakeClient(null, { 'me@example.com': 'secret1' });
    setSupabaseForTests(client);
    render(<MeScreen />);

    expect(screen.getByText('First time? This creates your backup with this password.')).toBeInTheDocument();
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(password.minLength).toBe(6);
    const signIn = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement;
    expect(signIn.className).toContain('me-backup-btn');
    expect(signIn.disabled).toBe(true);

    fireEvent.change(email, { target: { value: 'me@example.com' } });
    fireEvent.change(password, { target: { value: '12345' } });
    expect(signIn.disabled).toBe(true);

    fireEvent.change(password, { target: { value: 'nope123' } });
    expect(signIn.disabled).toBe(false);
    fireEvent.click(signIn);
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong password');
    expect(state.accounts).toEqual({ 'me@example.com': 'secret1' });

    fireEvent.change(password, { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const status = await screen.findByTestId('me-backup-status');
    expect(status.textContent).toMatch(/^Backed up · /);
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    await waitFor(async () => expect((await db.profile.get('me'))?.lastSyncAt).toBeTypeOf('number'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('first time on a fresh backup: Sign in creates the account', async () => {
    const { client, state } = fakeClient();
    setSupabaseForTests(client);
    render(<MeScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByTestId('me-backup-status')).textContent).toMatch(/^Backed up · /);
    expect(state.signUps).toBe(1);
    expect(state.accounts).toEqual({ 'me@example.com': 'secret1' });
  });
});
