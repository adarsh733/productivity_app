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

function fakeClient(opts: { user?: { id: string; email: string } | null; tables?: Record<string, Row[]> } = {}) {
  const state = {
    user: opts.user ?? null,
    tables: opts.tables ?? ({} as Record<string, Row[]>),
    upserts: [] as { table: string; payload: Row }[],
    otp: [] as unknown[],
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

  it('is "not_set_up" with no keys, and sending a code does nothing', async () => {
    setSupabaseForTests(null);
    const { result } = renderHook(() => useAccount());
    expect(result.current.configured).toBe(false);
    expect(result.current.status).toBe('not_set_up');
    let res: { ok: boolean } = { ok: true };
    await act(async () => {
      res = await result.current.sendCode('me@example.com');
    });
    expect(res.ok).toBe(false);
    expect(result.current.status).toBe('not_set_up');
  });

  it('signed out → code sent → signed in, restoring first and then pushing', async () => {
    const { client, state } = fakeClient({
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
      expect(await result.current.sendCode(' me@example.com ')).toEqual({ ok: true });
    });
    expect(result.current.status).toBe('code_sent');
    expect(result.current.email).toBe('me@example.com');

    await act(async () => {
      expect(await result.current.verifyCode('000000')).toMatchObject({ ok: false });
    });
    expect(result.current.status).toBe('code_sent');

    await act(async () => {
      expect(await result.current.verifyCode('123456')).toEqual({ ok: true });
    });
    expect(result.current.status).toBe('signed_in');
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
