import { useEffect } from 'react';
import { push, syncConfigured } from './supabase';

/**
 * Backup wiring (Stage 8). Pushes the outbox:
 * - on app start,
 * - on visibilitychange to hidden,
 * - every 5 minutes.
 *
 * Empties the outbox on success (push does), never blocks the UI, never reads
 * from Supabase during a session. Without VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,
 * does nothing silently.
 */
export function useSync() {
  useEffect(() => {
    if (!syncConfigured()) return;

    let dead = false;
    const fire = () => {
      // Never block the UI — push runs in the background, failures are silent.
      void push().catch(() => {});
    };

    fire();
    const interval = window.setInterval(() => {
      if (!dead) fire();
    }, 5 * 60 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      dead = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
