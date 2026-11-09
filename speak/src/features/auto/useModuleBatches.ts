import { useEffect } from 'react';
import { maybeModuleBatch } from './moduleBatch';

/**
 * v7 steps 4-6: one silent batch attempt per app open, and again when he comes
 * back to the app (the module itself holds the gap, the 2-a-day cap, the
 * shared AI budget and the offline no-op). Replaces the v5 `useAutoTopUp`,
 * which spent AI calls on teach cards the v7 feed no longer shows.
 */
export function useModuleBatches(): void {
  useEffect(() => {
    const run = () => {
      void maybeModuleBatch().catch(() => {});
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
