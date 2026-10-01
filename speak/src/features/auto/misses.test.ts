import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db } from '../../db/db';
import { todayKey } from '../../lib/date';
import { grade, newReview } from '../../srs/scheduler';
import type { Card, WordCard } from '../../types/contract';
import { AI_NEEDS_KEY_META } from '../coach/pipeline';
import { AI_BUDGET_META, AI_DAILY_CAP } from './budget';
import { MISS_MAX_PER_DAY, MISS_META, maybeSpawnMissSiblings, shouldSpawnSiblings } from './misses';

const WORD_A = {
  type: 'word' as const,
  term: 'cadence',
  pos: 'noun',
  meaning: 'rhythm in speech',
  examples: ['His cadence is calm.', 'Vary your cadence when presenting.'] as [string, string],
  say: 'Use cadence in one line.',
};

const WORD_B = {
  type: 'word' as const,
  term: 'brevity',
  pos: 'noun',
  meaning: 'shortness of speech',
  examples: ['Brevity wins in updates.', 'He values brevity in email.'] as [string, string],
  say: 'Use brevity in one line.',
};

function wordCard(id: string, term = 'nuance'): WordCard {
  return {
    id,
    type: 'word',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
    term,
    pos: 'noun',
    meaning: 'a small difference in meaning',
    examples: ['There is a nuance here.', 'He explained the nuance.'],
    say: 'Explain the nuance.',
  };
}

function okJson(data: unknown, provider?: string) {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

/** Routes expand_seed → generator, everything else → the verifier. */
function missFetch(
  cards: unknown[],
  verifyResults?: Array<{ key: string; ok: boolean; reason: string }>,
  providers: { gen?: string; verify?: string } = {},
) {
  const gen = providers.gen ?? 'gemini';
  const ver = providers.verify ?? 'groq';
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string };
    if (body.task === 'expand_seed') return okJson({ cards }, gen);
    return okJson(
      { results: verifyResults ?? cards.map((_, i) => ({ key: `d${i}`, ok: true, reason: 'real' })) },
      ver,
    );
  }) as unknown as typeof fetch;
}

function callsOf(fn: typeof fetch) {
  const calls = (fn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
  return calls.map(([, init]) => {
    const body = JSON.parse(init.body as string) as {
      task: string;
      prefer?: string;
      payload: Record<string, unknown>;
    };
    return body;
  });
}

beforeEach(async () => {
  await db.cards.clear();
  await db.outbox.clear();
  await db.meta.clear();
});

describe('shouldSpawnSiblings (AG-008 stage 2)', () => {
  it('fires exactly on the second lifetime miss, not the first', () => {
    const today = todayKey();
    const firstMiss = grade(newReview('c-1', today), 'again', today).review;
    expect(firstMiss.lapses).toBe(1);
    expect(shouldSpawnSiblings('again', firstMiss)).toBe(false);

    const secondMiss = grade(firstMiss, 'again', today).review;
    expect(secondMiss.lapses).toBe(2);
    expect(shouldSpawnSiblings('again', secondMiss)).toBe(true);
    expect(shouldSpawnSiblings('good', secondMiss)).toBe(false);
    expect(shouldSpawnSiblings(undefined, secondMiss)).toBe(false);
  });
});

describe('maybeSpawnMissSiblings (AG-008 stage 2)', () => {
  it('stores two verified siblings under miss-<id>, source ai, never the seed fields', async () => {
    const seed = wordCard('c-1');
    await db.cards.put(seed);
    const fetchFn = missFetch([WORD_A, WORD_B]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(2);

    const stored = await db.cards.where('batchId').equals('miss-c-1').toArray();
    expect(stored).toHaveLength(2);
    for (const c of stored) {
      expect(c.source).toBe('ai');
      expect(c.status).toBe('active');
      expect(c.seedId).toBe('c-1');
      expect(c.tags).toEqual(['ai', 'miss']);
    }
    const outbox = await db.outbox.toArray();
    expect(outbox.filter((o) => o.table === 'cards')).toHaveLength(2);

    // Generator asks for the seed's type; the verifier runs on the OTHER provider.
    const calls = callsOf(fetchFn);
    expect(calls.map((c) => c.task)).toEqual(['expand_seed', 'verify_batch']);
    expect(calls[0]!.payload.type).toBe('word');
    expect(calls[0]!.payload.count).toBe(2);
    expect(calls[0]!.prefer).toBeUndefined();
    expect(calls[1]!.prefer).toBe('groq');
    const seedSent = calls[0]!.payload.seed as Record<string, unknown>;
    expect(seedSent.id).toBeUndefined();
    expect(seedSent.batchId).toBeUndefined();
    expect(seedSent.term).toBe('nuance');
  });

  it('drops drafts that repeat the seed and drafts of another type before verify', async () => {
    const seed = wordCard('c-2');
    await db.cards.put(seed);
    const sameAsSeed = { ...WORD_A, term: 'nuance' };
    const foreignType = { type: 'phrase', weak: 'x', strong: 'y', why: 'z', register: 'office' };
    const fetchFn = missFetch([sameAsSeed, WORD_B, foreignType]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);

    const stored = await db.cards.where('batchId').equals('miss-c-2').toArray();
    expect(stored).toHaveLength(1);
    expect((stored[0] as WordCard).term).toBe('brevity');

    const verifyItems = callsOf(fetchFn)[1]!.payload.items as Array<{ card: { type: string } }>;
    expect(verifyItems).toHaveLength(2);
    expect(verifyItems.every((i) => i.card.type === 'word')).toBe(true);
  });

  it('one batch per seed card, ever: an existing miss batch blocks a second run', async () => {
    const seed = wordCard('c-3');
    await db.cards.put(seed);
    await db.cards.put({
      ...wordCard('miss-c-3-0', 'brevity'),
      source: 'ai',
      batchId: 'miss-c-3',
      seedId: 'c-3',
    });
    const fetchFn = missFetch([WORD_A]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops after MISS_MAX_PER_DAY batches on the same day', async () => {
    const seed = wordCard('c-4');
    await db.cards.put(seed);
    await db.meta.put({
      key: MISS_META,
      value: { date: todayKey(), count: MISS_MAX_PER_DAY },
      updatedAt: 1,
    });
    const fetchFn = missFetch([WORD_A]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a counter from another day does not block — it resets to today', async () => {
    const seed = wordCard('c-5');
    await db.cards.put(seed);
    await db.meta.put({ key: MISS_META, value: { date: '2000-01-01', count: 99 }, updatedAt: 1 });
    const fetchFn = missFetch([WORD_A]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);
    const counter = (await db.meta.get(MISS_META))?.value as { date: string; count: number };
    expect(counter).toEqual({ date: todayKey(), count: 1 });
  });

  it('over the shared daily budget: no request, no miss batch counted (AG-008 stage 3)', async () => {
    const seed = wordCard('c-7');
    await db.cards.put(seed);
    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: todayKey(), count: AI_DAILY_CAP },
      updatedAt: 1,
    });
    const fetchFn = missFetch([WORD_A]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await db.meta.get(MISS_META)).toBeUndefined();
  });

  it('same provider generate + verify: nothing stored, needs-key flag set, ask still counted', async () => {
    const seed = wordCard('c-6');
    await db.cards.put(seed);
    const fetchFn = missFetch([WORD_A, WORD_B], undefined, { gen: 'gemini', verify: 'gemini' });

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(await db.cards.count()).toBe(1);
    expect((await db.meta.get(AI_NEEDS_KEY_META))?.value).toBe(true);
    const counter = (await db.meta.get(MISS_META))?.value as { count: number };
    expect(counter.count).toBe(1);
  });

  it('never runs for the types the AI may not produce', async () => {
    for (const type of ['pronounce', 'say_it', 'breath', 'action_verb']) {
      const weird = { ...wordCard(`c-${type}`), type } as unknown as Card;
      await db.cards.put(weird);
      const fetchFn = missFetch([WORD_A]);
      expect(await maybeSpawnMissSiblings(weird, fetchFn), type).toBe(0);
      expect(fetchFn, type).not.toHaveBeenCalled();
    }
  });

  it('verifier rejecting everything stores nothing, calmly', async () => {
    const seed = wordCard('c-9');
    await db.cards.put(seed);
    const fetchFn = missFetch([WORD_A, WORD_B], [
      { key: 'd0', ok: false, reason: 'unnatural' },
      { key: 'd1', ok: false, reason: 'off register' },
    ]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(await db.cards.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('offline asks fail silently, are still counted, and never throw', async () => {
    const seed = wordCard('c-8');
    await db.cards.put(seed);
    const dead = vi.fn(async () => {
      throw new Error('Network service unavailable');
    }) as unknown as typeof fetch;

    await expect(maybeSpawnMissSiblings(seed, dead)).resolves.toBe(0);
    const counter = (await db.meta.get(MISS_META))?.value as { count: number };
    expect(counter.count).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });
});
