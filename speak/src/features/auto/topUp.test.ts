import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db, getMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { Card, InboxItem, Profile, TeachCard, Track, TrackLevel } from '../../types/contract';
import { AI_BUDGET_META, AI_DAILY_CAP, BACKGROUND_RESERVE, aiCallsUsed } from './budget';
import { AI_NEEDS_KEY_META } from '../coach/pipeline';
import {
  TOPUP_BATCH,
  TOPUP_FAIR_MS,
  TOPUP_GAP_MS,
  TOPUP_MAX_PER_DAY,
  TOPUP_MAX_UNSEEN,
  TOPUP_META,
  currentLevel,
  highestUnlockedLevel,
  maybeTopUp,
  mergeTopics,
  missRates,
  overdueTracks,
  pickTrack,
  shiftedLevel,
  topUpTopics,
  trackWeights,
  unseenCounts,
} from './topUp';
import { LEARNER_META } from '../learn/profile';

interface TopUpStateLike {
  date: string;
  count: number;
  lastAt: number;
  tracks: string[];
}

const ALL_TRACKS: Track[] = ['smalltalk', 'stories', 'clearly', 'words'];

/** A teach draft the way expand_seed returns it. Title carries the index so each is unique. */
function draftOf(track: Track, i: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'teach',
    track,
    level: 1,
    kind: 'learn',
    category: 'basics',
    title: `${track} idea ${i}`,
    rule: `Rule for ${track} ${i}.`,
    examples: { work: `At work ${i}.`, everyday: `At home ${i}.` },
    analogy: `Like chai number ${i}.`,
    tryPrompt: `Say it your way ${i}.`,
    register: 'both',
    ...over,
  };
}

function teachCard(
  id: string,
  track: Track,
  over: Record<string, unknown> = {},
): Card {
  return {
    ...draftOf(track, 0),
    title: `stock ${id}`,
    id,
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
    ...over,
  } as unknown as Card;
}

/** `n` unseen practice cards for a track. */
function stockTrack(track: Track, n: number): Card[] {
  return Array.from({ length: n }, (_, i) => teachCard(`${track}-c${i}`, track));
}

async function stockAll(perTrack: Partial<Record<Track, number>> = {}): Promise<void> {
  const cards: Card[] = [];
  for (const t of ALL_TRACKS) cards.push(...stockTrack(t, perTrack[t] ?? TOPUP_MAX_UNSEEN));
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

/**
 * expand_seed returns `count` teach drafts for the requested track (`<track> idea 9xx`);
 * verify_batch passes everything unless `verifyResults` says otherwise.
 */
function topFetch(
  opts: {
    verifyResults?: Array<{ key: string; ok: boolean; reason: string }>;
    gen?: string;
    verify?: string;
    drafts?: (track: Track, count: number) => unknown[];
  } = {},
) {
  const gen = opts.gen ?? 'gemini';
  const ver = opts.verify ?? 'groq';
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as {
      task: string;
      payload: { track: Track; count: number; items?: unknown[] };
    };
    if (body.task === 'expand_seed') {
      const cards = opts.drafts
        ? opts.drafts(body.payload.track, body.payload.count)
        : Array.from({ length: body.payload.count }, (_, i) => draftOf(body.payload.track, 900 + i));
      return okJson({ cards }, gen);
    }
    const n = body.payload.items?.length ?? 0;
    return okJson(
      {
        results:
          opts.verifyResults ??
          Array.from({ length: n }, (_, i) => ({ key: `d${i}`, ok: true, reason: 'pass' })),
      },
      ver,
    );
  }) as unknown as typeof fetch;
}

function callsOf(fn: typeof fetch) {
  const calls = (fn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
  return calls.map(([, init]) =>
    JSON.parse(init.body as string) as {
      task: string;
      prefer?: string;
      payload: Record<string, unknown>;
    },
  );
}

beforeEach(async () => {
  await db.cards.clear();
  await db.reviews.clear();
  await db.outbox.clear();
  await db.meta.clear();
  await db.profile.clear();
  await db.inbox.clear();
  await db.lessonProgress.clear();
});

describe('unseenCounts / pickTrack (pure)', () => {
  it('every skill full: nothing to do', () => {
    const deck: Card[] = ALL_TRACKS.flatMap((t) => stockTrack(t, TOPUP_MAX_UNSEEN));
    expect(pickTrack(deck, new Set())).toBeNull();
    expect(unseenCounts(deck, new Set()).every((u) => u.unseen === TOPUP_MAX_UNSEEN)).toBe(true);
  });

  it('picks the emptiest skill; ties keep list order; exclude skips a skill', () => {
    const deck: Card[] = ALL_TRACKS.flatMap((t) =>
      stockTrack(t, t === 'clearly' ? 5 : t === 'words' ? 5 : TOPUP_MAX_UNSEEN),
    );
    expect(pickTrack(deck, new Set())).toBe('clearly'); // tie with words, list order
    expect(pickTrack(deck, new Set(), new Set(['clearly']))).toBe('words');
    expect(pickTrack(deck, new Set(), new Set(['clearly', 'words']))).toBeNull();
  });

  it('seen, rejected and lesson cards do not count as unseen', () => {
    const cards: Card[] = [
      teachCard('a', 'words'),
      teachCard('b', 'words'),
      teachCard('c', 'words', { status: 'rejected' }),
      teachCard('d', 'words', { lesson: { id: 'l', title: 'L', step: 1, order: 1 } }),
      teachCard('e', 'stories'),
      { ...(teachCard('f', 'words') as object), type: 'word' } as unknown as Card,
    ];
    const counts = Object.fromEntries(unseenCounts(cards, new Set(['b'])).map((u) => [u.track, u.unseen]));
    expect(counts).toEqual({ smalltalk: 0, stories: 1, clearly: 0, words: 1 });
  });
});

describe('currentLevel (pure)', () => {
  const lessonCard = (track: Track, level: TrackLevel, n: number): Card =>
    teachCard(`ls-${track}-${level}-${n}`, track, {
      level,
      lesson: { id: `${track}-${level}-${n}`, title: `L${n}`, step: 1, order: n },
    });

  it('Level 1 with no lessons; first open level otherwise; highest done when the ladder runs out', () => {
    expect(currentLevel('words', [], new Set())).toBe(1);

    const cards = [lessonCard('words', 1, 1), lessonCard('words', 2, 1)];
    expect(currentLevel('words', cards, new Set())).toBe(1);
    expect(currentLevel('words', cards, new Set(['words-1-1']))).toBe(2);
    expect(currentLevel('words', cards, new Set(['words-1-1', 'words-2-1']))).toBe(2);
    expect(currentLevel('stories', cards, new Set())).toBe(1); // other skill: nothing
  });
});

describe('topUpTopics (pure)', () => {
  it('interests first, then newest note subjects; capped at 20; duplicates collapse', () => {
    const notes = Array.from({ length: 25 }, (_, i) => note(i, `s${i}`));
    notes[24] = note(24, 'office');
    notes[20] = note(20, undefined);
    const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);

    const topics = topUpTopics(['office', 'Words'], sorted);
    expect(topics).toHaveLength(20);
    expect(topics.slice(0, 2)).toEqual(['office', 'Words']);
    expect(topics).toContain('s23');
    expect(topics).not.toContain('s4');
    expect(topics.filter((t) => t.toLowerCase() === 'office')).toHaveLength(1);
  });

  it('dedupes case-insensitively and skips discarded notes entirely', () => {
    const notes = [note(10, 'hiring'), note(9, 'budget', 'discarded'), note(8, 'HIRING'), note(7, 'Budget')];
    expect(topUpTopics(['Hiring'], notes)).toEqual(['Hiring', 'Budget']);
  });
});

describe('maybeTopUp: teach cards, one skill a batch (rulebook 3.1)', () => {
  it('stores one verified teach batch for the emptiest skill, verified on the other provider', async () => {
    await stockAll({ stories: 5 });
    await db.profile.put({ id: 'me', createdAt: 1, interests: ['office', 'Words'] } as Profile);
    await db.inbox.bulkPut([note(10, 'office'), note(9, 'budget')]);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);

    const stored = await db.cards.where('batchId').equals(`topup-${todayKey()}-stories`).toArray();
    expect(stored).toHaveLength(TOPUP_BATCH);
    for (const c of stored) {
      const t = c as unknown as TeachCard;
      expect(t.type).toBe('teach');
      expect(t.track).toBe('stories');
      expect(c.source).toBe('ai');
      expect(c.status).toBe('active');
      expect(c.lang).toBe('en');
      expect(c.tags).toEqual(['ai', 'topup']);
      expect(c.seedId).toBeUndefined();
    }
    expect(stored.map((c) => c.id).sort()).toEqual(
      Array.from({ length: TOPUP_BATCH }, (_, i) => `topup-${todayKey()}-stories-${i}`),
    );
    expect(await db.outbox.count()).toBe(TOPUP_BATCH);

    const calls = callsOf(fetchFn);
    expect(calls.map((c) => c.task)).toEqual(['expand_seed', 'verify_batch']);
    expect(calls[0]!.payload).toMatchObject({
      type: 'teach',
      track: 'stories',
      level: 1,
      count: TOPUP_BATCH,
      topics: ['office', 'Words', 'budget'],
    });
    expect(calls[0]!.prefer).toBeUndefined();
    expect(calls[1]!.prefer).toBe('groq'); // verifier is not the generator (gemini)
    expect((calls[1]!.payload.items as unknown[]).length).toBe(TOPUP_BATCH);

    const state = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(state?.date).toBe(todayKey());
    expect(state?.count).toBe(1);
    expect(state?.tracks).toEqual(['stories']);
    expect(await aiCallsUsed()).toBe(2); // generate + check
  });

  it('asks at his level: Level 2 once Level 1 lessons are done', async () => {
    const lessonCard = (level: TrackLevel): Card =>
      teachCard(`ls-words-${level}-1`, 'words', {
        level,
        lesson: { id: `words-${level}-1`, title: 'L', step: 1, order: 1 },
      });
    await stockAll({ words: 2 });
    await db.cards.bulkPut([lessonCard(1), lessonCard(2)]);
    await db.lessonProgress.put({ lessonId: 'words-1-1', doneAt: 1 });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(callsOf(fetchFn)[0]!.payload).toMatchObject({ track: 'words', level: 2 });
  });

  it('every skill already stocked: no request, no claim, no budget', async () => {
    await stockAll();
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('four batches a day, one per skill: never the same skill twice', async () => {
    await stockAll({ smalltalk: 1, stories: 2, clearly: 3, words: 4 });
    const fetchFn = topFetch();
    const rewind = async () => {
      const state = await getMeta<TopUpStateLike>(TOPUP_META);
      await db.meta.put({
        key: TOPUP_META,
        value: { ...state, lastAt: Date.now() - TOPUP_GAP_MS - 1 },
        updatedAt: Date.now(),
      });
    };

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH); // smalltalk
    expect(await maybeTopUp(fetchFn)).toBe(0); // inside the gap
    expect(callsOf(fetchFn)).toHaveLength(2);

    for (let i = 0; i < 3; i++) {
      await rewind();
      expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    }
    const asked = callsOf(fetchFn)
      .filter((c) => c.task === 'expand_seed')
      .map((c) => c.payload.track);
    expect(asked).toEqual(['smalltalk', 'stories', 'clearly', 'words']);

    await rewind();
    expect(await maybeTopUp(fetchFn)).toBe(0); // all four done
    const after = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(after?.count).toBe(TOPUP_MAX_PER_DAY);
    expect(after?.tracks).toEqual(['smalltalk', 'stories', 'clearly', 'words']);
  });

  it('stops at TOPUP_MAX_PER_DAY batches in a day', async () => {
    await stockAll({ words: 5 });
    await db.meta.put({
      key: TOPUP_META,
      value: {
        date: todayKey(),
        count: TOPUP_MAX_PER_DAY,
        lastAt: Date.now() - TOPUP_GAP_MS - 1,
        tracks: ['smalltalk', 'stories', 'clearly'],
      },
      updatedAt: 1,
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('a state row from another day resets cleanly', async () => {
    await stockAll({ words: 5 });
    await db.meta.put({
      key: TOPUP_META,
      value: { date: '2000-01-01', count: 99, lastAt: 0, tracks: ['words'] },
      updatedAt: 1,
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    const state = await getMeta<TopUpStateLike>(TOPUP_META);
    expect(state?.date).toBe(todayKey());
    expect(state?.count).toBe(1);
    expect(state?.tracks).toEqual(['words']);
  });

  it('offline: no fetch, nothing stored, no claim, no budget', async () => {
    await stockAll({ words: 5 });
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);
    spy.mockRestore();
  });

  it('two simultaneous opens: exactly one batch, one expand_seed call', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch();

    const [a, b] = await Promise.all([maybeTopUp(fetchFn), maybeTopUp(fetchFn)]);
    expect([a, b].sort()).toEqual([0, TOPUP_BATCH]);
    expect(callsOf(fetchFn).filter((c) => c.task === 'expand_seed')).toHaveLength(1);
    expect(await aiCallsUsed()).toBe(2);
  });

  it('no interests and no notes: the payload simply has no topics key', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect('topics' in callsOf(fetchFn)[0]!.payload).toBe(false);
    expect('avoid' in callsOf(fetchFn)[0]!.payload).toBe(false);
  });

  it('rejected cards feed expand_seed an avoid list (AG-008 stage 4)', async () => {
    await stockAll({ words: 5 });
    await db.cards.put({
      id: 'rej-word-3',
      type: 'word',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'rejected',
      rejectedAt: 5,
      createdAt: 1,
      term: 'word-3',
      pos: 'noun',
      meaning: 'm',
      examples: ['a', 'b'],
      say: 's',
    } as unknown as Card);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(callsOf(fetchFn)[0]!.payload.avoid).toEqual(['word-3']);
  });
});

describe('maybeTopUp: the shared AI budget (Ask goes first)', () => {
  async function useCalls(n: number) {
    await db.meta.put({ key: AI_BUDGET_META, value: { date: todayKey(), count: n }, updatedAt: 1 });
  }

  it('refused with fewer than 10 calls left; nothing claimed, no request', async () => {
    await stockAll({ words: 5 });
    await useCalls(AI_DAILY_CAP - BACKGROUND_RESERVE + 1); // 9 left
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP - BACKGROUND_RESERVE + 1);
  });

  it('generate + check = 2 slots: refused with 11 left, allowed with 12 (leaves exactly 10)', async () => {
    await stockAll({ words: 5 });
    await useCalls(AI_DAILY_CAP - BACKGROUND_RESERVE - 1); // 11 left
    const fetchFn = topFetch();
    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();

    await useCalls(AI_DAILY_CAP - BACKGROUND_RESERVE - 2); // 12 left
    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP - BACKGROUND_RESERVE);
  });

  it('the network down on the first call: both slots come back', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await aiCallsUsed()).toBe(0);
  });

  it('nothing usable to check: the check slot comes back', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({ drafts: () => [null] });
    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('over the whole daily cap: silently skipped', async () => {
    await stockAll({ words: 5 });
    await useCalls(AI_DAILY_CAP);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
  });
});

describe('maybeTopUp: AI quality gate and quiet failure', () => {
  const storedTopUp = () => db.cards.where('batchId').equals(`topup-${todayKey()}-words`).count();

  it('only the cards the other provider passes are stored', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({
      verifyResults: [
        { key: 'd0', ok: true, reason: 'pass' },
        { key: 'd1', ok: false, reason: 'R5 INVENTED: not a real phrase' },
        { key: 'd2', ok: true, reason: 'pass' },
      ],
    });

    expect(await maybeTopUp(fetchFn)).toBe(2);
    const titles = (await db.cards.where('batchId').equals(`topup-${todayKey()}-words`).toArray())
      .map((c) => (c as unknown as TeachCard).title)
      .sort();
    expect(titles).toEqual(['words idea 900', 'words idea 902']);
    expect(await getMeta(AI_NEEDS_KEY_META)).toBe(false);
  });

  it('verifier rejecting everything stores nothing, calmly', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({
      verifyResults: Array.from({ length: TOPUP_BATCH }, (_, i) => ({ key: `d${i}`, ok: false, reason: 'R2' })),
    });

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('same provider generated and checked: nothing stored, both calls still counted', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({ gen: 'gemini', verify: 'gemini' });

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await aiCallsUsed()).toBe(2);
  });

  it('server says no second key: nothing stored, needs-key note set, the check slot comes back', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string; payload: { track: Track; count: number } };
      if (body.task === 'expand_seed') {
        return okJson({ cards: [draftOf(body.payload.track, 900)] }, 'gemini');
      }
      return { ok: true, json: async () => ({ ok: false, task: 'verify_batch', reason: 'no_key' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await getMeta(AI_NEEDS_KEY_META)).toBe(true);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('while the needs-a-second-key notice is fresh: no request, no claim; a day-old notice is ignored', async () => {
    await stockAll({ words: 5 });
    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: Date.now() });
    const fetchFn = topFetch();
    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(TOPUP_META)).toBeUndefined();

    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: Date.now() - 25 * 3_600_000 });
    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
  });

  it('the check itself failing (network or server) stores nothing and never throws', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string; payload: { track: Track; count: number } };
      if (body.task === 'expand_seed') {
        return okJson(
          { cards: Array.from({ length: body.payload.count }, (_, i) => draftOf(body.payload.track, 900 + i)) },
          'gemini',
        );
      }
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(maybeTopUp(fetchFn)).resolves.toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('keys missing (the function answers 502): stores nothing, never throws', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(
      async () =>
        ({
          ok: false,
          status: 502,
          json: async () => ({ ok: false, task: 'expand_seed', error: 'AI is unavailable right now' }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    await expect(maybeTopUp(fetchFn)).resolves.toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((fetchFn as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1); // no check call without a draft
  });

  it('the network down on the first call: stores nothing, never throws', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(maybeTopUp(fetchFn)).resolves.toBe(0);
    expect(await storedTopUp()).toBe(0);
  });

  it('a garbled reply (not JSON) is skipped quietly', async () => {
    await stockAll({ words: 5 });
    const fetchFn = vi.fn(
      async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response,
    ) as unknown as typeof fetch;

    await expect(maybeTopUp(fetchFn)).resolves.toBe(0);
    expect(await storedTopUp()).toBe(0);
  });

  it('broken, off-skill and old-shape drafts are dropped before the check; none usable means no check call', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({
      drafts: () => [
        draftOf('stories', 1), // wrong skill
        { type: 'word', term: 'x', pos: 'noun', meaning: 'm', examples: ['a', 'b'], say: 's' }, // old shape
        draftOf('words', 2, { tryPrompt: '' }), // missing a part
        draftOf('words', 3, { register: 'rude' }), // bad register
        null,
      ],
    });

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(callsOf(fetchFn).map((c) => c.task)).toEqual(['expand_seed']);
    expect(await storedTopUp()).toBe(0);
  });

  it('only whole drafts of the right skill go to the check', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({
      drafts: () => [draftOf('words', 1), draftOf('stories', 2), draftOf('words', 3, { analogy: '' })],
    });

    expect(await maybeTopUp(fetchFn)).toBe(1);
    const verifyCall = callsOf(fetchFn).find((c) => c.task === 'verify_batch')!;
    expect((verifyCall.payload.items as unknown[]).length).toBe(1);
  });

  it('cards he already has (same skill and title) are dropped', async () => {
    await stockAll({ words: 5 });
    await db.cards.put(teachCard('existing', 'words', { title: 'Words Idea 900' })); // matches draft 0
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH - 1);
  });
});

// ── v5: learning from him ──────────────────────────────────────────────────
function review(cardId: string, over: Record<string, unknown> = {}) {
  return {
    cardId,
    state: 'review',
    due: '2026-01-01',
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    lastGrade: 'good',
    ...over,
  } as unknown as import('../../types/contract').Review;
}

async function putLearner(over: Record<string, unknown>) {
  await db.meta.put({
    key: LEARNER_META,
    value: { wishTopics: [], seenTopics: [], notes: [], avoid: [], amount: [], difficulty: [], ...over },
    updatedAt: 1,
  });
}

describe('track weighting (pure)', () => {
  it('more of / less of / misses shape the weights; never zero, capped at 1.5', () => {
    const w = trackWeights({ moreOf: ['stories'], lessOf: ['words'] }, { clearly: 0.5, smalltalk: 0.1 });
    expect(w).toEqual({ smalltalk: 1, stories: 1.5, clearly: 1.3, words: 0.5 });
    expect(trackWeights({ moreOf: ['clearly'], lessOf: [] }, { clearly: 0.9 }).clearly).toBe(1.5);
    expect(Object.values(trackWeights({ moreOf: [], lessOf: ['smalltalk', 'stories', 'clearly', 'words'] })).every((x) => x > 0)).toBe(true);
  });

  it('a "more of" skill goes first and is stocked deeper; a "less of" skill waits', () => {
    const deck: Card[] = ALL_TRACKS.flatMap((t) => stockTrack(t, t === 'stories' ? 27 : 20));
    expect(pickTrack(deck, new Set())).toBe('smalltalk'); // old rule: emptiest
    expect(pickTrack(deck, new Set(), new Set(), { weights: { stories: 1.5 } })).toBe('stories'); // 30/1.5 = 20, list order loses to...
    const full: Card[] = ALL_TRACKS.flatMap((t) => stockTrack(t, 70));
    expect(pickTrack(full, new Set())).toBeNull();
    expect(pickTrack(full, new Set(), new Set(), { weights: { stories: 1.5 } })).toBe('stories'); // ceiling 90
    const half: Card[] = ALL_TRACKS.flatMap((t) => stockTrack(t, t === 'words' ? 35 : TOPUP_MAX_UNSEEN));
    expect(pickTrack(half, new Set(), new Set(), { weights: { words: 0.5 } })).toBeNull(); // ceiling 30
  });

  it('an overdue skill goes first whatever its weight, so "less of" still comes once a week', () => {
    const deck: Card[] = ALL_TRACKS.flatMap((t) => stockTrack(t, t === 'words' ? 35 : 5));
    const weights = { words: 0.5 };
    expect(pickTrack(deck, new Set(), new Set(), { weights })).toBe('smalltalk');
    expect(pickTrack(deck, new Set(), new Set(), { weights, overdue: new Set<Track>(['words']) })).toBe('words');
  });

  it('overdueTracks: never topped up or a week ago = overdue', () => {
    const now = 10 * TOPUP_FAIR_MS;
    const state = {
      date: 'x',
      count: 0,
      lastAt: 0,
      tracks: [],
      lastByTrack: { smalltalk: now - 1000, stories: now - TOPUP_FAIR_MS },
    };
    expect([...overdueTracks(state, now)].sort()).toEqual(['clearly', 'stories', 'words']);
    expect(overdueTracks(undefined, now).size).toBe(4);
  });

  it('missRates: share of graded cards he missed, per skill, only with 5+ graded', () => {
    const cards = stockTrack('clearly', 6).concat(stockTrack('words', 3));
    const reviews = [
      ...cards.slice(0, 6).map((c, i) => review(c.id, i < 3 ? { lapses: 1, lastGrade: 'again' } : {})),
      ...cards.slice(6).map((c) => review(c.id, { lapses: 2 })),
      review('unknown-card', { lapses: 3 }),
      review(cards[0]!.id.replace('c0', 'zz'), {}),
    ];
    const r = missRates(cards, reviews);
    expect(r.clearly).toBeCloseTo(0.5);
    expect(r.words).toBe(0); // only 3 graded
  });
});

describe('level from his wishes (pure)', () => {
  const lessonCard = (track: Track, level: TrackLevel, n: number): Card =>
    teachCard(`ls-${track}-${level}-${n}`, track, {
      level,
      lesson: { id: `${track}-${level}-${n}`, title: `L${n}`, step: 1, order: n },
    });

  it('shiftedLevel clamps to 1..max; "harder" may stretch one level past it', () => {
    expect(shiftedLevel(2, -1, 2)).toBe(1);
    expect(shiftedLevel(1, -1, 2)).toBe(1);
    expect(shiftedLevel(2, 1, 2)).toBe(3);
    expect(shiftedLevel(2, 0, 2)).toBe(2);
    expect(shiftedLevel(1, 1, 2)).toBe(2);
    expect(shiftedLevel(5, 1, 5)).toBe(5);
  });

  it('highestUnlockedLevel: the highest open or finished level', () => {
    const cards = [lessonCard('words', 1, 1), lessonCard('words', 2, 1)];
    expect(highestUnlockedLevel('words', cards, new Set())).toBe(1);
    expect(highestUnlockedLevel('words', cards, new Set(['words-1-1']))).toBe(2);
    expect(highestUnlockedLevel('stories', cards, new Set())).toBe(1);
  });

  it('mergeTopics: first list first, deduped, max 20', () => {
    expect(mergeTopics(['Cricket', 'billing'], ['cricket', 'office'])).toEqual(['Cricket', 'billing', 'office']);
    expect(mergeTopics(Array.from({ length: 15 }, (_, i) => `a${i}`), Array.from({ length: 15 }, (_, i) => `b${i}`))).toHaveLength(20);
  });
});

describe('maybeTopUp: learns from him (v5)', () => {
  it('sends his wishes first in topics, his avoid list and his notes', async () => {
    await stockAll({ words: 5 });
    await db.profile.put({ id: 'me', createdAt: 1, interests: ['office'] } as Profile);
    await putLearner({
      wishTopics: [{ text: 'cricket', at: 9 }],
      seenTopics: [{ text: 'billing migration', at: 8, source: 'chat' }],
      notes: [{ text: 'More cricket small talk', at: 9 }],
      avoid: [{ text: 'revert back', at: 9 }],
    });
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    const p = callsOf(fetchFn)[0]!.payload;
    expect(p.topics).toEqual(['cricket', 'billing migration', 'office']);
    expect(p.avoid).toEqual(['revert back']);
    expect(p.notes).toEqual(['More cricket small talk']);
  });

  it('"more of" picks that skill first when the stock is close', async () => {
    await stockAll({ smalltalk: 20, stories: 25 });
    await putLearner({ amount: [{ track: 'stories', dir: 1, at: Date.now() }] });
    const fetchFn = topFetch();
    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(callsOf(fetchFn)[0]!.payload.track).toBe('stories');
  });

  it('a skill he keeps missing gets a boost', async () => {
    await stockAll({ smalltalk: 20, clearly: 24 });
    const missed = stockTrack('clearly', 6).map((c) => ({ ...c, id: `m-${c.id}` }) as Card);
    await db.cards.bulkPut(missed);
    await db.reviews.bulkPut(missed.map((c) => review(c.id, { lapses: 2, lastGrade: 'again' })));
    const fetchFn = topFetch();
    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(callsOf(fetchFn)[0]!.payload.track).toBe('clearly');
  });

  it('"too easy / too hard": easier lowers the level, harder stretches one level past what he unlocked', async () => {
    const lesson = (level: TrackLevel): Card =>
      teachCard(`ls-words-${level}-1`, 'words', {
        level,
        lesson: { id: `words-${level}-1`, title: 'L', step: 1, order: 1 },
      });
    await stockAll({ words: 2 });
    await db.cards.bulkPut([lesson(1), lesson(2)]);
    await db.lessonProgress.put({ lessonId: 'words-1-1', doneAt: 1 });

    await putLearner({ difficulty: [{ track: 'words', dir: -1, at: Date.now() }] });
    const easier = topFetch();
    expect(await maybeTopUp(easier)).toBe(TOPUP_BATCH);
    expect(callsOf(easier)[0]!.payload).toMatchObject({ track: 'words', level: 1 });

    await db.meta.delete(TOPUP_META);
    await db.cards.where('batchId').startsWith('topup-').delete();
    await putLearner({ difficulty: [{ track: 'words', dir: 1, at: Date.now() }] });
    const harder = topFetch();
    expect(await maybeTopUp(harder)).toBe(TOPUP_BATCH);
    expect(callsOf(harder)[0]!.payload).toMatchObject({ track: 'words', level: 3 });
  });

  it('remembers the last top-up per skill across days', async () => {
    await stockAll({ words: 5 });
    await db.meta.put({
      key: TOPUP_META,
      value: { date: '2000-01-01', count: 1, lastAt: 0, tracks: ['stories'], lastByTrack: { stories: 123 } },
      updatedAt: 1,
    });
    expect(await maybeTopUp(topFetch())).toBe(TOPUP_BATCH);
    const state = await getMeta<TopUpStateLike & { lastByTrack: Record<string, number> }>(TOPUP_META);
    expect(state?.lastByTrack.stories).toBe(123);
    expect(state?.lastByTrack.words).toBeGreaterThan(123);
  });
});
