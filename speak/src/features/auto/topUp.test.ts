import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db, getMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { Card, InboxItem, Profile, TeachCard, Track, TrackLevel } from '../../types/contract';
import { AI_BUDGET_META, AI_DAILY_CAP, BACKGROUND_RESERVE, aiCallsUsed } from './budget';
import { AI_NEEDS_KEY_META } from '../coach/pipeline';
import {
  TOPUP_BATCH,
  TOPUP_GAP_MS,
  TOPUP_MAX_PER_DAY,
  TOPUP_MAX_UNSEEN,
  TOPUP_META,
  currentLevel,
  maybeTopUp,
  pickTrack,
  topUpTopics,
  unseenCounts,
} from './topUp';

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
    expect(await aiCallsUsed()).toBe(1);
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
    expect(await aiCallsUsed()).toBe(1);
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

  it('still allowed with exactly 10 left, and takes one call', async () => {
    await stockAll({ words: 5 });
    await useCalls(AI_DAILY_CAP - BACKGROUND_RESERVE);
    const fetchFn = topFetch();

    expect(await maybeTopUp(fetchFn)).toBe(TOPUP_BATCH);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP - BACKGROUND_RESERVE + 1);
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

  it('same provider generated and checked: nothing stored, needs-key note set, the ask still counted', async () => {
    await stockAll({ words: 5 });
    const fetchFn = topFetch({ gen: 'gemini', verify: 'gemini' });

    expect(await maybeTopUp(fetchFn)).toBe(0);
    expect(await storedTopUp()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await getMeta(AI_NEEDS_KEY_META)).toBe(true);
    expect(await aiCallsUsed()).toBe(1);
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
