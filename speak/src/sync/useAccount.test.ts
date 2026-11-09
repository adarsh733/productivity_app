import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, enqueue } from '../db/db';
import { seenRow, setSupabaseForTests } from './supabase';
import { useAccount } from './useAccount';

// A fake Supabase client: never real keys. Holds remote rows per table and
// records what the app sent.
type Row = Record<string, unknown>;
type Filter = [string, unknown];

function fakeClient(
  opts: {
    user?: { id: string; email: string } | null;
    tables?: Record<string, Row[]>;
    /** Accounts that already exist: email → password. */
    accounts?: Record<string, string>;
    offline?: boolean;
  } = {},
) {
  const accounts = { ...(opts.accounts ?? {}) };
  const state = {
    user: opts.user ?? null,
    tables: opts.tables ?? ({} as Record<string, Row[]>),
    upserts: [] as { table: string; payload: Row }[],
    signUps: 0,
    signedOut: 0,
  };
  const select = (table: string) => {
    const filters: Filter[] = [];
    const run = () => ({
      data: (state.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)),
      error: null,
    });
    const q = {
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signInWithPassword: async (c: { email: string; password: string }) => {
        if (opts.offline) throw new TypeError('Failed to fetch');
        if (accounts[c.email] !== c.password) {
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
        if (c.email in accounts) {
          return {
            data: { user: null, session: null },
            error: { status: 422, code: 'user_already_exists', message: 'User already registered' },
          };
        }
        accounts[c.email] = c.password;
        state.user = { id: 'user-1', email: c.email };
        return { data: { user: { ...state.user, identities: [{}] }, session: {} }, error: null };
      },
      signOut: async () => {
        state.user = null;
        state.signedOut++;
        return { error: null };
      },
    },
    from(table: string) {
      return {
        select: () => select(table),
        upsert: async (payload: Row) => {
          state.upserts.push({ table, payload });
          return { error: null };
        },
        delete: () => {
          const d = { eq: () => d, then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) };
          return d;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

const AT = 1_793_000_000_000;

describe('useAccount', () => {
  beforeEach(async () => {
    await Promise.all([db.outbox.clear(), db.seen.clear(), db.profile.clear()]);
  });
  afterEach(() => setSupabaseForTests(null));

  it('is "not_set_up" with no keys, and signing in does nothing', async () => {
    setSupabaseForTests(null);
    const { result } = renderHook(() => useAccount());
    expect(result.current.configured).toBe(false);
    expect(result.current.status).toBe('not_set_up');
    let res: { ok: boolean } = { ok: true };
    await act(async () => {
      res = await result.current.signIn('me@example.com', 'secret1');
    });
    expect(res.ok).toBe(false);
    expect(result.current.status).toBe('not_set_up');
  });

  it('wrong password keeps him signed out and sends nothing', async () => {
    const { client, state } = fakeClient({ accounts: { 'me@example.com': 'secret1' } });
    setSupabaseForTests(client);
    await db.seen.put({ id: 'phrases:circle back', module: 'phrases', head: 'circle back', cardId: 'p1', at: AT });
    await enqueue('seen', 'phrases:circle back');

    const { result } = renderHook(() => useAccount());
    await act(async () => {
      expect(await result.current.signIn('me@example.com', 'nope123')).toEqual({ ok: false, error: 'Wrong password' });
    });
    expect(result.current.status).toBe('signed_out');
    expect(state.upserts).toEqual([]);
    expect(await db.outbox.count()).toBe(1);
  });

  it('no internet: plain message, still signed out', async () => {
    const { client } = fakeClient({ offline: true });
    setSupabaseForTests(client);
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      expect(await result.current.signIn('me@example.com', 'secret1')).toEqual({
        ok: false,
        error: "Can't reach the backup. Check your internet and try again.",
      });
    });
    expect(result.current.status).toBe('signed_out');
  });

  it('first sign-in creates the backup, then pushes this phone', async () => {
    const { client, state } = fakeClient();
    setSupabaseForTests(client);
    await db.seen.put({ id: 'phrases:circle back', module: 'phrases', head: 'circle back', cardId: 'p1', at: AT });
    await enqueue('seen', 'phrases:circle back');

    const { result } = renderHook(() => useAccount());
    await act(async () => {
      expect(await result.current.signIn(' me@example.com ', 'secret1')).toEqual({ ok: true });
    });
    expect(state.signUps).toBe(1);
    expect(result.current.status).toBe('signed_in');
    expect(result.current.email).toBe('me@example.com');
    expect(state.upserts.map((u) => u.table)).toContain('seen_terms');
    expect(await db.outbox.count()).toBe(0);
  });

  it('existing account: signs in, restoring first and then pushing', async () => {
    const { client, state } = fakeClient({
      accounts: { 'me@example.com': 'secret1' },
      tables: {
        seen_terms: [
          seenRow({ id: 'words:candid', module: 'words', head: 'candid', cardId: 'v7-words-009', at: AT }, 'user-1'),
        ],
      },
    });
    setSupabaseForTests(client);
    // Something this phone has that the backup does not.
    await db.seen.put({ id: 'phrases:circle back', module: 'phrases', head: 'circle back', cardId: 'p1', at: AT });
    await enqueue('seen', 'phrases:circle back');

    const { result } = renderHook(() => useAccount());
    expect(result.current.configured).toBe(true);
    expect(result.current.status).toBe('signed_out');

    await act(async () => {
      expect(await result.current.signIn('me@example.com', 'secret1')).toEqual({ ok: true });
    });
    expect(state.signUps).toBe(0);
    expect(result.current.status).toBe('signed_in');
    expect(result.current.email).toBe('me@example.com');
    // restore() brought the backup's seen list to this phone…
    expect(await db.seen.get('words:candid')).toMatchObject({ cardId: 'v7-words-009' });
    // …and push() sent this phone's queue up.
    expect(state.upserts.map((u) => u.table)).toContain('seen_terms');
    expect(await db.outbox.count()).toBe(0);
    await waitFor(() => expect(result.current.lastBackupAt).toBeTypeOf('number'));
  });

  it('starts signed in when the phone already has a session, and signs out', async () => {
    const { client, state } = fakeClient({ user: { id: 'user-1', email: 'me@example.com' } });
    setSupabaseForTests(client);
    await db.profile.put({ id: 'me', createdAt: AT, lastSyncAt: AT });

    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe('signed_in'));
    expect(result.current.email).toBe('me@example.com');
    await waitFor(() => expect(result.current.lastBackupAt).toBe(AT));

    await act(async () => {
      await result.current.signOut();
    });
    expect(state.signedOut).toBe(1);
    expect(result.current.status).toBe('signed_out');
    expect(result.current.email).toBeNull();
    expect(result.current.lastBackupAt).toBeNull();
  });
});
