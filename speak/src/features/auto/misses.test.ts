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

  it('rejected cards feed expand_seed an avoid list (AG-008 stage 4)', async () => {
    const seed = wordCard('c-10');
    await db.cards.put(seed);
    await db.cards.put({
      ...wordCard('rej-1', 'cliche'),
      source: 'ai',
      status: 'rejected',
      rejectedAt: 5,
    } as unknown as Card);
    const fetchFn = missFetch([WORD_A]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);
    expect(callsOf(fetchFn)[0]!.payload.avoid).toEqual(['cliche']);
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

  it('background reserve: generate + check = 2 slots; refused when that would leave fewer than 10 (v5 Ask goes first)', async () => {
    const seed = wordCard('c-8');
    await db.cards.put(seed);
    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: todayKey(), count: AI_DAILY_CAP - 11 },
      updatedAt: 1,
    });
    const fetchFn = missFetch([WORD_A]);
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();

    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: todayKey(), count: AI_DAILY_CAP - 12 },
      updatedAt: 2,
    });
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);
    expect(fetchFn).toHaveBeenCalled();
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(AI_DAILY_CAP - 10);
  });

  it('same provider generate + verify: nothing stored, ask still counted, both slots spent', async () => {
    const seed = wordCard('c-6');
    await db.cards.put(seed);
    const fetchFn = missFetch([WORD_A, WORD_B], undefined, { gen: 'gemini', verify: 'gemini' });

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(await db.cards.count()).toBe(1);
    const counter = (await db.meta.get(MISS_META))?.value as { count: number };
    expect(counter.count).toBe(1);
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(2);
  });

  it('server says no second key: nothing stored, needs-key flag set, the check slot comes back', async () => {
    const seed = wordCard('c-nokey');
    await db.cards.put(seed);
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string };
      if (body.task === 'expand_seed') return okJson({ cards: [WORD_A] }, 'gemini');
      return { ok: true, json: async () => ({ ok: false, task: 'verify_batch', reason: 'no_key' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(await db.cards.count()).toBe(1);
    expect((await db.meta.get(AI_NEEDS_KEY_META))?.value).toBe(true);
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(1);
  });

  it('skips while the needs-a-second-key notice is fresh; runs again once it is a day old', async () => {
    const seed = wordCard('c-flag');
    await db.cards.put(seed);
    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: Date.now() });
    const fetchFn = missFetch([WORD_A]);
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();

    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: Date.now() - 25 * 3_600_000 });
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);
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
    // The generate call never reached a model: both budget slots come back.
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(0);
  });

  it('phone offline: no claim, no request, nothing counted', async () => {
    const seed = wordCard('c-off');
    await db.cards.put(seed);
    const fetchFn = missFetch([WORD_A]);
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await db.meta.get(MISS_META)).toBeUndefined();
    expect(await db.meta.get(AI_BUDGET_META)).toBeUndefined();
  });

  it('a successful old-type run spends 2 slots (generate + check)', async () => {
    const seed = wordCard('c-spend');
    await db.cards.put(seed);
    expect(await maybeSpawnMissSiblings(seed, missFetch([WORD_A]))).toBe(1);
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(2);
  });

  it('two misses at once never pass the daily cap together', async () => {
    await db.meta.put({
      key: MISS_META,
      value: { date: todayKey(), count: MISS_MAX_PER_DAY - 1 },
      updatedAt: 1,
    });
    const a = wordCard('c-par-a', 'alpha');
    const b = wordCard('c-par-b', 'beta');
    await db.cards.bulkPut([a, b]);
    const fetchFn = missFetch([WORD_A]);
    await Promise.all([maybeSpawnMissSiblings(a, fetchFn), maybeSpawnMissSiblings(b, fetchFn)]);
    const counter = (await db.meta.get(MISS_META))?.value as { count: number };
    expect(counter.count).toBe(MISS_MAX_PER_DAY);
    expect(callsOf(fetchFn).filter((c) => c.task === 'expand_seed')).toHaveLength(1);
  });
});

// ── v5 lesson cards ────────────────────────────────────────────────────────
function teachCard(id: string, over: Record<string, unknown> = {}): Card {
  return {
    id,
    type: 'teach',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
    track: 'smalltalk',
    level: 2,
    kind: 'learn',
    category: 'Openers',
    title: 'Ask about the weekend',
    rule: 'Ask one open question about their weekend.',
    examples: { work: 'How was your weekend, Priya?', everyday: 'Did you do anything fun on Sunday?' },
    analogy: 'Like opening a door, not a window.',
    tryPrompt: 'Ask a colleague about their weekend.',
    register: 'both',
    ...over,
  } as unknown as Card;
}

function teachDraft(title: string, track = 'smalltalk') {
  return {
    type: 'teach',
    track,
    level: 2,
    kind: 'use',
    category: 'Openers',
    title,
    rule: 'Ask one open question.',
    examples: { work: 'How did the demo go?', everyday: 'How was the trip?' },
    analogy: 'Like passing a ball.',
    tryPrompt: 'Ask about their trip.',
    register: 'both',
  };
}

describe('maybeSpawnMissSiblings — v5 teach cards', () => {
  it('a missed lesson card gets 2 verified sibling teach cards with the learner context sent', async () => {
    const seed = teachCard('t-1');
    await db.cards.put(seed);
    await db.cards.put({ ...wordCard('rej-t', 'circle back'), status: 'rejected', rejectedAt: 9 } as unknown as Card);
    await db.meta.put({
      key: 'learn.profile',
      value: {
        wishTopics: [{ text: 'cricket', at: 5 }],
        seenTopics: [{ text: 'billing migration', at: 4, source: 'chat' }],
        notes: [{ text: 'More cricket small talk', at: 5 }],
        avoid: [],
        amount: [],
        difficulty: [],
      },
      updatedAt: 1,
    });
    const fetchFn = missFetch([
      teachDraft('Ask about the match'),
      teachDraft('Follow up on their trip'),
      teachDraft('Wrong skill', 'words'),
    ]);

    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(2);

    const calls = callsOf(fetchFn);
    expect(calls.map((c) => c.task)).toEqual(['expand_seed', 'verify_batch']);
    const p = calls[0]!.payload;
    expect(p.type).toBe('teach');
    expect(p.count).toBe(2);
    expect(p.track).toBe('smalltalk');
    expect(p.level).toBe(2);
    expect(p.topics).toEqual(['Ask about the weekend', 'Openers', 'cricket', 'billing migration']);
    expect(p.avoid).toEqual(['circle back']);
    expect(p.notes).toEqual(['More cricket small talk']);
    expect(p.seed).toBeUndefined();
    expect((calls[1]!.payload.items as unknown[]).length).toBe(2);

    const stored = await db.cards.where('batchId').equals('miss-t-1').toArray();
    expect(stored).toHaveLength(2);
    for (const c of stored) {
      expect((c as { type: string }).type).toBe('teach');
      expect(c.seedId).toBe('t-1');
      expect(c.source).toBe('ai');
      expect(c.tags).toEqual(['ai', 'miss']);
    }
  });

  it('drops a sibling that repeats an existing lesson title', async () => {
    const seed = teachCard('t-2');
    await db.cards.put(seed);
    const fetchFn = missFetch([teachDraft('ask about the  WEEKEND'), teachDraft('Ask about the match')]);
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(1);
  });

  it('no usable drafts: the unused check slot goes back', async () => {
    const seed = teachCard('t-3');
    await db.cards.put(seed);
    const fetchFn = missFetch([{ type: 'teach', title: 'broken' }]);
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(callsOf(fetchFn).map((c) => c.task)).toEqual(['expand_seed']);
    const budget = (await db.meta.get(AI_BUDGET_META))?.value as { count: number };
    expect(budget.count).toBe(1);
  });

  it('one batch per lesson card, ever', async () => {
    const seed = teachCard('t-4');
    await db.cards.put(seed);
    await db.cards.put(teachCard('miss-t-4-0', { batchId: 'miss-t-4', title: 'Other' }));
    const fetchFn = missFetch([teachDraft('Ask about the match')]);
    expect(await maybeSpawnMissSiblings(seed, fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
