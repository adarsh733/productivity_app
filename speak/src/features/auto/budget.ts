import { db, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';

/**
 * AG-008 stage 3 — one local daily budget for every AI generation call.
 *
 * Coach, misses, top-up and (stage 5) the weekly plan all draw from a single
 * counter stored in Dexie `meta` under `ai.dailyCalls` — local only, never
 * synced, same store as the other AI operational flags. Over budget ⇒ callers
 * skip silently and retry tomorrow. `verify_batch` and `review_recording` are
 * not generation calls and don't draw from it.
 */

export const AI_DAILY_CAP = 25;

/** Local-only daily counter (db.meta). Never synced. */
export const AI_BUDGET_META = 'ai.dailyCalls';

interface DailyBudget {
  date: string;
  count: number;
}

/** Today's consumed count; 0 when the stored row is from another day. */
export async function aiCallsUsed(today: string = todayKey()): Promise<number> {
  const row = await getMeta<DailyBudget>(AI_BUDGET_META);
  return row && row.date === today ? row.count : 0;
}

/**
 * Take one slot from today's budget. A single Dexie transaction, so two
 * simultaneous callers can never both take the last slot. false = over budget.
 * Safe to call inside an outer transaction on `db.meta` — Dexie joins scopes.
 */
export async function tryConsumeAiCall(today: string = todayKey()): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const row = await getMeta<DailyBudget>(AI_BUDGET_META);
    const used = row && row.date === today ? row.count : 0;
    if (used >= AI_DAILY_CAP) return false;
    await setMeta(AI_BUDGET_META, { date: today, count: used + 1 });
    return true;
  });
}
