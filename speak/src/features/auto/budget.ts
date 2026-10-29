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

// ── v5 (question 9A): Ask always goes first ─────────────────────────────────
// The cap stays 25. An Ask costs 2 calls (the answer + the check on the other
// provider) and is allowed all the way to the cap. Background work (top-ups,
// misses) stops once fewer than 10 are left, so Ask keeps room all day.

/** What one Ask spends: the answer and its check. */
export const ASK_CALLS_PER_QUESTION = 2;

/** Background work stops when fewer than this many calls are left today. */
export const BACKGROUND_RESERVE = 10;

/** Calls still free today. */
export async function aiCallsLeft(today: string = todayKey()): Promise<number> {
  return Math.max(0, AI_DAILY_CAP - (await aiCallsUsed(today)));
}

/**
 * Take `n` slots at once, all or nothing, in one transaction. false = not
 * enough left, nothing taken. Ask uses this with ASK_CALLS_PER_QUESTION.
 */
export async function tryConsumeAiCalls(n: number, today: string = todayKey()): Promise<boolean> {
  if (n <= 0) return true;
  return db.transaction('rw', db.meta, async () => {
    const row = await getMeta<DailyBudget>(AI_BUDGET_META);
    const used = row && row.date === today ? row.count : 0;
    if (used + n > AI_DAILY_CAP) return false;
    await setMeta(AI_BUDGET_META, { date: today, count: used + n });
    return true;
  });
}

/** Give slots back when the call never reached a model (e.g. no network). */
export async function refundAiCalls(n: number, today: string = todayKey()): Promise<void> {
  if (n <= 0) return;
  await db.transaction('rw', db.meta, async () => {
    const row = await getMeta<DailyBudget>(AI_BUDGET_META);
    if (!row || row.date !== today) return;
    await setMeta(AI_BUDGET_META, { date: today, count: Math.max(0, row.count - n) });
  });
}

/**
 * Background (non-Ask) calls: refused once fewer than BACKGROUND_RESERVE calls
 * are left, so the last stretch of the day belongs to Ask.
 */
export async function tryConsumeBackgroundAiCall(today: string = todayKey()): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const row = await getMeta<DailyBudget>(AI_BUDGET_META);
    const used = row && row.date === today ? row.count : 0;
    if (AI_DAILY_CAP - used < BACKGROUND_RESERVE) return false;
    await setMeta(AI_BUDGET_META, { date: today, count: used + 1 });
    return true;
  });
}

/**
 * `n` background slots at once (a generate + its check = 2), all or nothing.
 * Same reserve rule as `tryConsumeBackgroundAiCall`: refused when taking them
 * would leave fewer than BACKGROUND_RESERVE for Ask.
 */
export async function tryConsumeBackgroundAiCalls(n: number, today: string = todayKey()): Promise<boolean> {
  if (n <= 0) return true;
  return db.transaction('rw', db.meta, async () => {
    const row = await getMeta<DailyBudget>(AI_BUDGET_META);
    const used = row && row.date === today ? row.count : 0;
    if (AI_DAILY_CAP - used - n < BACKGROUND_RESERVE) return false;
    await setMeta(AI_BUDGET_META, { date: today, count: used + n });
    return true;
  });
}
