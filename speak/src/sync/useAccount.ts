import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Millis } from '../types/contract';
import {
  currentEmail,
  push,
  restore,
  signInWithPassword,
  signOut as signOutRemote,
  syncConfigured,
} from './supabase';

export type AccountStatus = 'not_set_up' | 'signed_out' | 'signed_in';

export interface UseAccount {
  /** False until VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set. */
  configured: boolean;
  status: AccountStatus;
  email: string | null;
  /** `Profile.lastSyncAt`: the last push that reached the backup. */
  lastBackupAt: Millis | null;
  /** Email + password. First time on a fresh project it creates the backup. */
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
}

/**
 * Backup sign-in under Me (email + password; no email is ever sent). The app
 * never needs it: signed out, everything works and nothing is sent. After a
 * good sign-in, `restore()` brings his rows to this phone first (local wins), then
 * `push()` sends what this phone has.
 */
export function useAccount(): UseAccount {
  const configured = syncConfigured();
  const [status, setStatus] = useState<AccountStatus>(configured ? 'signed_out' : 'not_set_up');
  const [email, setEmail] = useState<string | null>(null);
  const alive = useRef(true);

  const profile = useLiveQuery(() => db.profile.get('me'), []);
  const lastBackupAt = status === 'signed_in' ? (profile?.lastSyncAt ?? null) : null;

  useEffect(() => {
    alive.current = true;
    if (!configured) return;
    void currentEmail()
      .then((e) => {
        if (!alive.current || !e) return;
        setEmail(e);
        setStatus('signed_in');
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [configured]);

  const signIn = useCallback(
    async (to: string, password: string) => {
      if (!configured) return { ok: false, error: 'Backup is not switched on yet' };
      const res = await signInWithPassword(to, password).catch(() => ({
        ok: false,
        error: "Can't reach the backup. Check your internet and try again.",
      }));
      if (!res.ok) return { ok: false, error: res.error };
      // Restore first so his old rows land before this phone's queue goes up.
      // Failures are silent: the next background push tries again.
      await restore().catch(() => {});
      await push().catch(() => 0);
      if (alive.current) {
        setEmail(to.trim());
        setStatus('signed_in');
      }
      return { ok: true };
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    await signOutRemote().catch(() => {});
    if (!alive.current) return;
    setEmail(null);
    setStatus(configured ? 'signed_out' : 'not_set_up');
  }, [configured]);

  return { configured, status, email, lastBackupAt, signIn, signOut };
}
