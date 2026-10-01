import { useEffect } from 'react';
import { maybeTopUp } from './topUp';

/**
 * AG-008 stage 3 — one silent top-up attempt per app open. The module itself
 * enforces the 6 h gate, the daily caps, the shared AI budget and the
 * offline no-op; every failure path is swallowed.
 */
export function useAutoTopUp() {
  useEffect(() => {
    void maybeTopUp().catch(() => {});
  }, []);
}
