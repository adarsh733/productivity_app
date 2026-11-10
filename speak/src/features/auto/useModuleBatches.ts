import { useEffect } from 'react';
import { maybeModuleBatch } from './moduleBatch';

/**
 * v7 steps 4-6: one silent batch attempt per app open, and again when he comes
 * back to the app (the module itself holds the gap, the 2-a-day cap, the
 * shared AI budget and the offline no-op). Replaces the v5 `useAutoTopUp`,
 * which spent AI calls on teach cards the v7 feed no longer shows.
 *
 * v8: the picker also takes a module with 10 Know-its since its last batch
 * (`KNOW_IT_TRIGGER`). The Know it tap itself calls `maybeModuleBatch` right
 * away (`features/learn/knowIt.ts`); this hook is the catch-up on open / return.
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
