import { describe, expect, it, beforeEach } from 'vitest';
import { db, getMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import { AI_BUDGET_META, AI_DAILY_CAP, aiCallsUsed, tryConsumeAiCall } from './budget';

beforeEach(async () => {
  await db.meta.clear();
});

describe('shared daily AI budget (AG-008 stage 3)', () => {
  it('allows exactly AI_DAILY_CAP calls, then refuses; refusals do not count', async () => {
    for (let i = 0; i < AI_DAILY_CAP; i++) {
      expect(await tryConsumeAiCall(), `call ${i + 1}`).toBe(true);
    }
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);

    expect(await tryConsumeAiCall()).toBe(false);
    expect(await tryConsumeAiCall()).toBe(false);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
  });

  it('a counter from another day reads 0 and the next call rewrites today', async () => {
    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: '2000-01-01', count: 99 },
      updatedAt: 1,
    });
    expect(await aiCallsUsed()).toBe(0);

    expect(await tryConsumeAiCall()).toBe(true);
    expect(await aiCallsUsed()).toBe(1);
    const row = await getMeta<{ date: string; count: number }>(AI_BUDGET_META);
    expect(row).toEqual({ date: todayKey(), count: 1 });
  });

  it('two simultaneous callers can never take the last slot twice', async () => {
    for (let i = 0; i < AI_DAILY_CAP - 1; i++) {
      expect(await tryConsumeAiCall()).toBe(true);
    }
    const [a, b] = await Promise.all([tryConsumeAiCall(), tryConsumeAiCall()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
    expect(await tryConsumeAiCall()).toBe(false);
  });
});
