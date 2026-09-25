import { useEffect } from 'react';
import { db, enqueue } from '../../db/db';
import { emptyDay } from '../session/day';
import { todayKey } from '../../lib/date';

const LAST_OPEN_KEY = 'articulate.lastOpen.v1';
const GAP_MS = 30 * 60 * 1000;

/**
 * "Opened this instead": every app open after 30 minutes away adds 1 to the
 * counter via the day's urgesRedirected field. His main success number.
 */
export function useAppOpen() {
  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const now = Date.now();
        const last = Number(localStorage.getItem(LAST_OPEN_KEY) ?? 0);
        localStorage.setItem(LAST_OPEN_KEY, String(now));
        if (last > 0 && now - last < GAP_MS) return;
        const today = todayKey();
        const existing = (await db.days.get(today)) ?? emptyDay(today);
        const next = { ...existing, urgesRedirected: existing.urgesRedirected + 1 };
        if (dead) return;
        await db.days.put(next);
        await enqueue('days', today);
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, []);
}
