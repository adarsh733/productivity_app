import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Millis } from '../types/contract';
import {
  currentEmail,
  push,
  restore,
  sendCode as sendCodeRemote,
  signOut as signOutRemote,
  syncConfigured,
  verifyCode as verifyCodeRemote,
} from './supabase';

export type AccountStatus = 'not_set_up' | 'signed_out' | 'code_sent' | 'signed_in';

export interface UseAccount {
  /** False until VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set. */
  configured: boolean;
  status: AccountStatus;
  email: string | null;
  /** `Profile.lastSyncAt`: the last push that reached the backup. */
  lastBackupAt: Millis | null;
  sendCode(email: string): Promise<{ ok: boolean; error?: string }>;
  verifyCode(code: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
}

/**
 * Backup sign-in under Me (6-digit email code, answer Q10). The app never
 * needs it: signed out, everything works and nothing is sent. After a good
 * code, `restore()` brings his rows to this phone first (local wins), then
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

  const sendCode = useCallback(
    async (to: string) => {
      if (!configured) return { ok: false, error: 'Backup is not switched on yet' };
      const res = await sendCodeRemote(to).catch((e: unknown) => ({
        ok: false,
        error: e instanceof Error ? e.message : 'Could not send the code',
      }));
      if (res.ok && alive.current) {
        setEmail(to.trim());
        setStatus('code_sent');
      }
      return res;
    },
    [configured],
  );

  const verifyCode = useCallback(
    async (code: string) => {
      if (!configured) return { ok: false, error: 'Backup is not switched on yet' };
      if (!email) return { ok: false, error: 'Send a code first' };
      const res = await verifyCodeRemote(email, code).catch((e: unknown) => ({
        ok: false,
        error: e instanceof Error ? e.message : 'That code did not work',
      }));
      if (!res.ok) return res;
      // Restore first so his old rows land before this phone's queue goes up.
      // Failures are silent: the next background push tries again.
      await restore().catch(() => {});
      await push().catch(() => 0);
      if (alive.current) setStatus('signed_in');
      return { ok: true };
    },
    [configured, email],
  );

  const signOut = useCallback(async () => {
    await signOutRemote().catch(() => {});
    if (!alive.current) return;
    setEmail(null);
    setStatus(configured ? 'signed_out' : 'not_set_up');
  }, [configured]);

  return { configured, status, email, lastBackupAt, sendCode, verifyCode, signOut };
}
