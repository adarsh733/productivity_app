import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, enqueue, getProfile } from '../../db/db';
import type { WeekPlan } from '../../types/contract';
import { undoWeekPlan } from './plan';

export interface UseWeekPlanReturn {
  plan: WeekPlan | undefined;
  undo: () => Promise<void>;
}

/**
 * AG-008 stage 5 — the stored weekly plan and its one-tap Undo. Undo restores
 * the previous type weights and clears the plan; the 7-day gate in `plan.ts`
 * is left alone, so it never immediately re-plans.
 */
export function useWeekPlan(): UseWeekPlanReturn {
  const plan = useLiveQuery(async () => (await db.profile.get('me'))?.weekPlan, []);

  const undo = useCallback(async () => {
    await db.transaction('rw', db.profile, db.outbox, async () => {
      const current = await getProfile();
      if (!current.weekPlan) return;
      await db.profile.put(undoWeekPlan(current));
      await enqueue('profile', 'me');
    });
  }, []);

  return { plan, undo };
}
