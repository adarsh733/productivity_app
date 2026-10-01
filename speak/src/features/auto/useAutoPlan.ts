import { useEffect } from 'react';
import { maybePlanWeek } from './plan';

/**
 * AG-008 stage 5 — one silent weekly-plan attempt per app open. The module
 * itself enforces the 7-day gate, the shared AI budget and the offline no-op;
 * every failure path is swallowed.
 */
export function useAutoPlan() {
  useEffect(() => {
    void maybePlanWeek().catch(() => {});
  }, []);
}
