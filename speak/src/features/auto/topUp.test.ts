import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db, getMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { Card, DraftCardType, InboxItem, Profile } from '../../types/contract';
import { AI_BUDGET_META, AI_DAILY_CAP, aiCallsUsed } from './budget';
import { AI_DRAFT_TYPES, AI_NEEDS_KEY_META } from '../coach/pipeline';
import {
  TOPUP_BATCH,
  TOPUP_GAP_MS,
  TOPUP_MAX_PER_DAY,
  TOPUP_META,
  TOPUP_MIN_UNSEEN,
  maybeTopUp,
  pickDeficientType,
  topUpTopics,
  unseenCounts,
} from './topUp';

interface TopUpStateLike {
  date: string;
  count: number;
  lastAt: number;
  types: string[];
}

/** Minimal valid-ish identity field per type; identity value is `<type>-<i>`. */
function draftOf(type: DraftCardType, i: number): Record<string, unknown> {
  const t = `${type}-${i}`;
  switch (type) {
    case 'word':
      return {
        type,
        term: t,
        pos: 'noun',
        meaning: `meaning of ${t}`,
        examples: [`Use ${t} at work today.`, `He said ${t} twice.`],
        say: `Say ${t} in one line.`,
      };
    case 'swap':
      return { type, weak: t, answers: [`${t} a`, `${t} b`], timerSec: 8 };
    case 'idiom':
      return {
        type,
        phrase: t,
        meaning: `meaning of ${t}`,
        scenario: `Use ${t} in a meeting.`,
        example: `He used ${t} in the call.`,
        corporate: true,
      };
    case 'phrase':
      return { type, weak: t, strong: `${t} strong`, why: `why ${t} lands`, register: 'office' };
    case 'feeling':
      return {
        type,
        term: t,
        meaning: `meaning of ${t}`,
        contrast: `not quite ${t}`,
        example: `I felt ${t} before the review.`,
      };
    case 'story_move':
      return { type, move: t, why: `why ${t}`, example: `Once I tried ${t}.` };
    case 'describe':
      return {
        type,
        title: t,
        scene: `Scene for ${t}.`,
        alt: `alt ${t}`,
        prompt: `Describe ${t}.`,
        beats: ['one', 'two', 'three'],
        targetVocab: [`${t} v1`, `${t} v2`, `${t} v3`],
        targetSec: 60,
      };
    case 'explain':
      return {
        type,
        topic: t,
        angle: `angle ${t}`,
        beats: ['one', 'two', 'three'],
        targetVocab: [`${t} v1`, `${t} v2`, `${t} v3`],
        targetSec: 60,
      };
    case 'teach_back':
      return { type, prompt: `Teach ${t}.`, beats: ['one', 'two', 'three'], targetSec: 60 };
    case 'situation':
      return {
        type,
        kind: 'office',
        title: t,
        prompt: `Handle ${t}.`,
        beats: ['one', 'two', 'three'],
        targetVocab: [],
        targetSec: 60,
      };
    default:
      throw new Error(`no draft shape for ${String(type)}`);
  }
}

function stubCard(id: string, type: string, i: number): Card {
  const shape = (AI_DRAFT_TYPES as readonly string[]).includes(type) ? draftOf(type as DraftCardType, i) : {};
  return {
    ...shape,
    id,
    type,
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
  } as unknown as Card;
}

/** Fill every draftable type with TOPUP_MIN_UNSEEN unseen cards unless overridden. */
async function stock(perType: Partial<Record<DraftCardType, number>> = {}): Promise<void> {
  const cards: Card[] = [];
  for (const type of AI_DRAFT_TYPES) {
    const n = perType[type] ?? TOPUP_MIN_UNSEEN;
    for (let i = 0; i < n; i++) cards.push(stubCard(`${type}-c${i}`, type, i));
  }
  await db.cards.bulkPut(cards);
}

function note(i: number, subject?: string, status: InboxItem['status'] = 'processed'): InboxItem {
  return {
    id: `n-${i}`,
    createdAt: i,
    text: `note ${i}`,
    status,
    ...(subject !== undefined ? { subject } : {}),
  };
}

function okJson(data: unknown, provider?: string) {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

/** expand_seed returns `count` drafts of the requested type (terms `<type>-9xx`), verify all-ok. */
function topFetch(
  verifyResults?: Array<{ key: string; ok: boolean; reason: string }>,
  providers: { gen?: string; verify?: string } = {},
) {
  const gen = providers.gen ?? 'gemini';
  const ver = providers.verify ?? 'groq';
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as {
      task: string;
      payload: { type: DraftCardType; count: number };
    };
    if (body.task === 'expand_seed') {
      const cards = Array.from({ length: body.payload.count }, (_, i) =>
        draftOf(body.payload.type, 900 + i),
      );
      return okJson({ cards }, gen);
    }
    return okJson(
      {
        results:
          verifyResults ??
          Array.from({ length: TOPUP_BATCH }, (_, i) => ({ key: `d${i}`, ok: true, reason: 'real' })),
      },
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
  await db.reviews.clear();
  await db.outbox.clear();
  await db.meta.clear();
  await db.profile.clear();
  await db.inbox.clear();
});

describe('unseenCounts / pickDeficientType (pure)', () => {
  function fullDeck(): Card[] {
    const cards: Card[] = [];
    for (const type of AI_DRAFT_TYPES) {
      for (let i = 0; i < TOPUP_MIN_UNSEEN; i++) cards.push(stubCard(`${type}-c${i}`, type, i));
    }
    return cards;
  }

  it('every type at the threshold: nothing is deficient', () => {
    expect(pickDeficientType(fullDeck(), new Set())).toBeNull();
    expect(unseenCounts(fullDeck(), new Set()).every((u) => u.unseen === TOPUP_MIN_UNSEEN)).toBe(true);
  });

  it('picks the lowest unseen type; ties keep list order', () => {
    const low = fullDeck().filter((c) => !(c.type === 'word' && c.id === 'word-c0'));
    expect(pickDeficientType(low, new Set())).toBe('word');

    const tie = fullDeck().filter(
      (c) => !((c.type === 'phrase' || c.type === 'feeling') && c.id.endsWith('-c0')),
    );
    expect(pickDeficientType(tie, new Set())).toBe('phrase');
  });

  it('seen cards and rejected cards do not count as unseen; exclude skips a type', () => {
    const deck = fullDeck();
    const seen = new Set(deck.filter((c) => c.type === 'word').map((c) => c.id));
    expect(pickDeficientType(deck, seen)).toBe('word'); // word: 30 active, 0 unseen

    const rejected = fullDeck().map((c) =>
      c.type === 'word' && c.id === 'word-c0' ? ({ ...c, status: 'rejected' } as Card) : c,
    );
    expect(pickDeficientType(rejected, new Set())).toBe('word'); // 29

    const wordLight: Card[] = [];
    for (const type of AI_DRAFT_TYPES) {
      const n = type === 'word' ? 5 : TOPUP_MIN_UNSEEN;
      for (let i = 0; i < n; i++) wordLight.push(stubCard(`${type}-c${i}`, type, i));
    }
    expect(pickDeficientType(wordLight, new Set())).toBe('word');
    expect(pickDeficientType(wordLight, new Set(), new Set(['word']))).toBeNull();
  });
});

describe('topUpTopics (pure)', () => {
  it('interests first, then newest note subjects; capped at 20; duplicates collapse', () => {
    const notes = Array.from({ length: 25 }, (_, i) => note(i, `s${i}`));
    notes[24] = note(24, 'office'); // dupe of the first interest, and the newest
    notes[20] = note(20, undefined); // subject-less: skipped
    const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);

    const topics = topUpTopics(['office', 'Words'], sorted);
    expect(topics).toHaveLength(20);
    expect(topics.slice(0, 2)).toEqual(['office', 'Words']);
    expect(topics).toContain('s23');
    expect(topics).not.toContain('s4'); // never scanned / cut by the cap
    expect(topics.filter((t) => t.toLowerCase() === 'office')).toHaveLength(1);
  });

  it('dedupes case-insensitively and skips discarded notes entirely', () => {
    const notes = [note(10, 'hiring'), note(9, 'budget', 'discarded'), note(8, 'HIRING'), note(7, 'Budget')];
    expect(topUpTopics(['Hiring'], notes)).toEqual(['Hiring', 'Budget']);
  });
});

describe('maybeTopUp (AG-008 stage 3)', () => {
  it('stores one verified batch for the lowest deficient type; topics from interests + notes', async () => {
    await stock({ phrase: 5 });
    await db.profile.put({ id: 'me', createdAt: 1, interests: ['office', 'Words'] } as Profile);
    await db.inbox.bulkPut([note(10, 'office'), note(9, 'budget')]);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);

    const stored = await db.cards.where('batchId').equals(`topup-${todayKey()}-phrase`).toArray();
    expect(stored).toHaveLength(TOPUP_BATCH);
    for (const c of stored) {
      expect(c.source).toBe('ai');
      expect(c.status).toBe('active');
      expect(c.seedId).toBeUndefined();
      expect(c.tags).toEqual(['ai', 'topup']);
      expect(c.type).toBe('phrase');
    }
    expect(await db.outbox.count()).toBe(TOPUP_BATCH);

    const calls = callsOf(fetchFn);
    expect(calls.map((c) => c.task)).toEqual(['expand_seed', 'verify_batch']);
    expect(calls[0]!.payload.type).toBe('phrase');
    expect(calls[0]!.payload.count).toBe(TOPUP_BATCH);
    expect(calls[0]!.prefer).toBeUndefined();
    expect(calls[1]!.prefer).toBe('groq'); // verifier ≠ generator
    expect(calls[0]!.payload.topics).toEqual(['office', 'Words', 'budget']);

    const state = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(state?.date).toBe(todayKey());
    expect(state?.count).toBe(1);
    expect(state?.types).toEqual(['phrase']);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('fires at 29 unseen, not at 30', async () => {
    await stock();
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);

    await db.cards.delete('phrase-c0');
    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
  });

  it('one batch per 6 h, and never the same type twice in a day', async () => {
    await stock({ phrase: 2, feeling: 12 });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH); // phrase
    expect(await maybeTopUp(fetchFn)).toBe(0); // inside the 6 h gate
    expect(callsOf(fetchFn)).toHaveLength(2);

    // Rewind the gate. phrase (12) ties feeling (12) and would win by list
    // order — feeling wins only because phrase is excluded for today.
    const state = await getMeta<TopUpStateLike>(TOPUP_META);
    await db.meta.put({
      key: TOPUP_META,
      value: { ...state, lastAt: Date.now() - TOPUP_GAP_MS - 1 },
      updatedAt: Date.now(),
    });

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    const calls = callsOf(fetchFn);
    expect(calls).toHaveLength(4);
    expect(calls[2]!.payload.type).toBe('feeling');
    expect(await db.cards.where('batchId').equals(`topup-${todayKey()}-feeling`).count()).toBe(
      TOPUP_BATCH,
    );
    const after = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(after?.count).toBe(2);
    expect(after?.types).toEqual(['phrase', 'feeling']);
  });

  it('stops after TOPUP_MAX_PER_DAY batches in a day', async () => {
    await stock({ phrase: 5 });
    await db.meta.put({
      key: TOPUP_META,
      value: {
        date: todayKey(),
        count: TOPUP_MAX_PER_DAY,
        lastAt: Date.now() - TOPUP_GAP_MS - 1,
        types: ['swap', 'idiom', 'word'],
      },
      updatedAt: 1,
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('a state row from another day resets cleanly', async () => {
    await stock({ phrase: 5 });
    await db.meta.put({
      key: TOPUP_META,
      value: { date: '2000-01-01', count: 99, lastAt: 0, types: ['phrase'] },
      updatedAt: 1,
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    const state = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(state?.date).toBe(todayKey());
    expect(state?.count).toBe(1);
    expect(state?.types).toEqual(['phrase']);
  });

  it('offline: no fetch, nothing stored, no claim, no budget', async () => {
    await stock({ phrase: 5 });
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);
    spy.mockRestore();
  });

  it('over the shared daily budget: silently skipped, nothing claimed', async () => {
    await stock({ phrase: 5 });
    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: todayKey(), count: AI_DAILY_CAP },
      updatedAt: 1,
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
  });

  it('same provider generate + verify: nothing stored, needs-key flag set, ask still claimed', async () => {
    await stock({ phrase: 5 });
    const fetchFn = topFetch(undefined, { gen: 'gemini', verify: 'gemini' });

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await db.cards.where('batchId').equals(`topup-${todayKey()}-phrase`).count()).toBe(0);
    expect(await getMeta(AI_NEEDS_KEY_META)).toBe(true);
    expect(await aiCallsUsed()).toBe(1);
    expect((await getMeta<TopUpStateLike>(TOPUP_META))?.count).toBe(1);
  });

  it('verifier rejecting everything stores nothing, calmly', async () => {
    await stock({ phrase: 5 });
    const results = Array.from({ length: TOPUP_BATCH }, (_, i) => ({
      key: `d${i}`,
      ok: false,
      reason: 'unnatural',
    }));
    const fetchFn = topFetch(results);

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await db.cards.where('batchId').equals(`topup-${todayKey()}-phrase`).count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('drafts that already exist are dropped before storing', async () => {
    await stock({ phrase: 5 });
    await db.cards.put(stubCard('existing', 'phrase', 900)); // collides with draft 0
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH - 1);
  });

  it('two simultaneous opens: exactly one batch, one expand_seed call', async () => {
    await stock({ phrase: 5 });
    const fetchFn = topFetch();

    const [a, b] = await Promise.all([maybeTopUp(fetchFn), maybeTopUp(fetchFn)]);
    expect([a, b].sort()).toEqual([0, TOPUP_BATCH]);
    expect(callsOf(fetchFn).filter((c) => c.task === 'expand_seed')).toHaveLength(1);
    expect(await db.cards.where('batchId').equals(`topup-${todayKey()}-phrase`).count()).toBe(
      TOPUP_BATCH,
    );
    expect(await aiCallsUsed()).toBe(1);
  });

  it('no interests and no notes: the payload simply has no topics key', async () => {
    await stock({ phrase: 5 });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect('topics' in callsOf(fetchFn)[0]!.payload).toBe(false);
    expect('avoid' in callsOf(fetchFn)[0]!.payload).toBe(false);
  });

  it('rejected cards feed expand_seed an avoid list (AG-008 stage 4)', async () => {
    await stock({ phrase: 5 });
    await db.cards.put({
      ...stubCard('rej-word-3', 'word', 3),
      status: 'rejected',
      rejectedAt: 5,
    } as Card);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(callsOf(fetchFn)[0]!.payload.avoid).toEqual(['word-3']);
  });
});
