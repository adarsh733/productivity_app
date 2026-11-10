import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  AiCallError,
  CoachCheckFailedError,
  CoachNeedsKeyError,
  aiPost,
  markNeedsSecondKey,
  neverReachedModel,
  verifyDrafts,
  withTimeout,
} from './pipeline';

describe('AI client time limit', () => {
  it('a hung request ends as the plain failure line, and the fetch is aborted', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const hang = vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      });
      const p = aiPost('expand_seed', { text: 'x' }, hang as unknown as typeof fetch);
      const caught = p.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/unavailable/i);
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a quick answer is untouched', async () => {
    await expect(withTimeout(async () => 'ok', 1000)).resolves.toBe('ok');
  });
});
import { db } from '../../db/db';
import type { Card } from '../../types/contract';
import {
  NEEDS_KEY_TTL_MS,
  needsSecondKey,
  AI_NEEDS_KEY_META,
  COACH_FAIL_PLAIN,
  draftsToBatchCards,
  getWatchList,
} from './pipeline';

const WORD_DRAFT = {
  type: 'word' as const,
  term: 'nuance',
  pos: 'noun',
  meaning: 'a small difference in meaning',
  examples: ['There is a nuance here.', 'He explained the nuance to the client.'] as [string, string],
  say: 'Explain the nuance in one line.',
};

const PHRASE_A = {
  type: 'phrase' as const,
  weak: 'revert back',
  strong: 'revert',
  why: 'Revert already means back.',
  register: 'office' as const,
};

const SWAP_DRAFT = {
  type: 'swap' as const,
  weak: 'very tired',
  answers: ['exhausted', 'drained'],
  timerSec: 10,
};

const IDIOM_DRAFT = {
  type: 'idiom' as const,
  phrase: 'circle back',
  meaning: 'return to a topic at a later time',
  scenario: 'Tell your manager you want to revisit a decision next week.',
  example: "Let's circle back on this after the client call.",
  corporate: true,
};

const FEELING_DRAFT = {
  type: 'feeling' as const,
  term: 'wary',
  meaning: 'careful because something may go wrong',
  contrast: 'Not as strong as afraid — it is alert, not scared.',
  example: 'I am wary of promising a date before testing.',
};

const STORY_DRAFT = {
  type: 'story_move' as const,
  move: 'Land the ending on a short sentence.',
  why: 'A short last line sticks in the room.',
  example: 'We shipped it. Done.',
};

const DESCRIBE_DRAFT = {
  type: 'describe' as const,
  title: 'Busy kitchen',
  scene: 'Steam climbs over two cooks moving fast between pans.',
  alt: 'A small kitchen at dinner rush with steam and motion',
  prompt: 'Tell me what is happening — and how it feels.',
  beats: ['What you see first', 'Who is doing what', 'The mood'] as [string, string, string],
  targetVocab: ['steam', 'clatter', 'rush'],
  targetSec: 60,
};

const EXPLAIN_DRAFT = {
  type: 'explain' as const,
  topic: 'Monsoons',
  angle: 'Why Indian farming depends on the monsoon arriving on time',
  beats: ['What the monsoon is', 'What happens when it is late', 'Who feels it most'] as [string, string, string],
  targetVocab: ['onset', 'yield', 'reservoir'],
  targetSec: 90,
};

const TEACH_DRAFT = {
  type: 'teach_back' as const,
  prompt: 'Explain what a database index is, as if to a new teammate.',
  beats: ['The problem without it', 'What it actually is', 'When not to add one'] as [string, string, string],
  targetSec: 60,
};

const SITUATION_DRAFT = {
  type: 'situation' as const,
  kind: 'incident' as const,
  title: 'The missed flight',
  prompt: 'Tell the story of a flight you once missed and what happened next.',
  beats: ['Set the scene', 'What went wrong', 'How it ended'] as [string, string, string],
  targetVocab: [],
  targetSec: 60,
};

const TYPE_DRAFTS: Array<{ type: string; draft: unknown }> = [
  { type: 'word', draft: WORD_DRAFT },
  { type: 'swap', draft: SWAP_DRAFT },
  { type: 'idiom', draft: IDIOM_DRAFT },
  { type: 'phrase', draft: PHRASE_A },
  { type: 'feeling', draft: FEELING_DRAFT },
  { type: 'story_move', draft: STORY_DRAFT },
  { type: 'describe', draft: DESCRIBE_DRAFT },
  { type: 'explain', draft: EXPLAIN_DRAFT },
  { type: 'teach_back', draft: TEACH_DRAFT },
  { type: 'situation', draft: SITUATION_DRAFT },
];

function okJson(data: unknown, provider?: string) {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

/** Drafts stored as one coach batch, the shape the coach box used. */
function coachCards(inboxId: string, drafts: readonly unknown[]): Card[] {
  return draftsToBatchCards(drafts as Parameters<typeof draftsToBatchCards>[0], {
    batchId: `coach-${inboxId}`,
    source: 'inbox',
    seedId: inboxId,
    tags: ['coach', 'word'],
  });
}

beforeEach(async () => {
  await db.cards.clear();
  await db.inbox.clear();
  await db.notes.clear();
  await db.outbox.clear();
  await db.meta.clear();
});

describe('watch list and draft cards', () => {
  it('watch list holds at most 10 mistakes', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      createdAt: i,
      text: `m${i}`,
      status: 'raw' as const,
      kind: 'mistake' as const,
      subject: `wrong${i}`,
      fix: `right${i}`,
    }));
    expect(getWatchList(items)).toHaveLength(10);
  });

  it('every allowed draft type becomes a stored card of that type (AG-008 stage 1)', () => {
    for (const { type, draft } of TYPE_DRAFTS) {
      const [card] = coachCards(`in-type-${type}`, [draft]);
      expect(card?.id, type).toBe(`coach-in-type-${type}-0`);
      expect(card?.type, type).toBe(type);
      expect(card?.tags, type).toEqual(['coach', 'word']);
      expect(card?.source, type).toBe('inbox');
      expect(card?.status, type).toBe('active');
      expect(card?.seedId, type).toBe(`in-type-${type}`);
      expect(card?.lang, type).toBe('en');
    }
  });

  it('a Hindi word draft is stored lang "hi" — it rides the Hindi slots, never the English float (AG-008 stage 1)', () => {
    const [card] = coachCards('in-hi', [{ ...WORD_DRAFT, term: 'जुगाड़', lang: 'hi' }]);
    expect(card?.lang).toBe('hi');
    expect(card?.tags).toEqual(['coach', 'word']);
  });
});

describe('aiPost failures carry the server reason', () => {
  function reply(status: number, json: unknown) {
    return vi.fn(async () => ({ ok: status < 400, status, json: async () => json })) as unknown as typeof fetch;
  }

  it('bad_input shows the server plain words', async () => {
    const fetchFn = reply(400, { ok: false, error: 'Keep the question under 1000 characters.', reason: 'bad_input' });
    const err = await aiPost('expand_seed', { text: 'x' }, fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiCallError);
    expect((err as AiCallError).reason).toBe('bad_input');
    expect((err as AiCallError).message).toBe('Keep the question under 1000 characters.');
  });

  it('a 400 with no reason is still bad_input', async () => {
    const err = (await aiPost('expand_seed', {}, reply(400, { ok: false, error: 'Too long.' })).catch((e) => e)) as AiCallError;
    expect(err.reason).toBe('bad_input');
    expect(err.message).toBe('Too long.');
  });

  it('other server reasons pass through with the plain unavailable line', async () => {
    for (const reason of ['no_key', 'busy', 'bad_reply'] as const) {
      const err = (await aiPost('expand_seed', {}, reply(503, { ok: false, error: 'x', reason })).catch((e) => e)) as AiCallError;
      expect(err.reason).toBe(reason);
      expect(err.message).toBe(COACH_FAIL_PLAIN);
      expect(err.serverError).toBe('x');
    }
  });

  it('a reply that is not JSON (an HTML 502 page) is busy', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch;
    const err = (await aiPost('expand_seed', {}, fetchFn).catch((e) => e)) as AiCallError;
    expect(err.reason).toBe('busy');
    expect(neverReachedModel(err)).toBe(false);
  });

  it('no network is offline, the plain line, and never reached a model', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const err = (await aiPost('expand_seed', {}, fetchFn).catch((e) => e)) as AiCallError;
    expect(err.reason).toBe('offline');
    expect(err.message).toBe(COACH_FAIL_PLAIN);
    expect(neverReachedModel(err)).toBe(true);
  });

  it('sends exclude only when asked', async () => {
    const fetchFn = vi.fn(async () => okJson({ results: [] }, 'groq')) as unknown as typeof fetch;
    await aiPost('verify_batch', {}, fetchFn, 'groq', { exclude: ['gemini'] });
    await aiPost('expand_seed', {}, fetchFn);
    const calls = (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    expect(JSON.parse(calls[0]![1].body as string)).toMatchObject({ prefer: 'groq', exclude: ['gemini'] });
    expect('exclude' in JSON.parse(calls[1]![1].body as string)).toBe(false);
  });
});

describe('verifyDrafts: the check on a different provider', () => {
  function verifyReply(res: { ok: boolean; status?: number; json: unknown }) {
    return vi.fn(async () => ({ ok: res.ok, status: res.status ?? 200, json: async () => res.json })) as unknown as typeof fetch;
  }
  const passAll = { ok: true, json: { ok: true, provider: 'groq', data: { results: [{ key: 'd0', ok: true, reason: '' }] } } };

  it('sends the generator as exclude and the other provider as prefer', async () => {
    const fetchFn = verifyReply(passAll);
    expect(await verifyDrafts([WORD_DRAFT], 'gemini', fetchFn)).toHaveLength(1);
    const calls = (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    expect(JSON.parse(calls[0]![1].body as string)).toMatchObject({ task: 'verify_batch', prefer: 'groq', exclude: ['gemini'] });
  });

  it('no generator name: fails closed, nothing passes, no call', async () => {
    const fetchFn = verifyReply(passAll);
    expect(await verifyDrafts([WORD_DRAFT], undefined, fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('only reason no_key is the needs-second-key state', async () => {
    const noKey = verifyReply({ ok: false, status: 503, json: { ok: false, error: 'x', reason: 'no_key' } });
    await expect(verifyDrafts([WORD_DRAFT], 'gemini', noKey)).rejects.toBeInstanceOf(CoachNeedsKeyError);
    expect(await needsSecondKey()).toBe(true);

    await db.meta.clear();
    for (const reason of ['busy', 'bad_reply', 'rate_limited']) {
      const f = verifyReply({ ok: false, status: 503, json: { ok: false, error: 'x', reason } });
      const err = await verifyDrafts([WORD_DRAFT], 'gemini', f).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CoachCheckFailedError);
      expect(err).not.toBeInstanceOf(CoachNeedsKeyError);
      expect((err as CoachCheckFailedError).reason).toBe(reason);
    }
    expect(await needsSecondKey()).toBe(false);
  });

  it('a successful check clears the notice', async () => {
    await markNeedsSecondKey();
    expect(await needsSecondKey()).toBe(true);
    await verifyDrafts([WORD_DRAFT], 'gemini', verifyReply(passAll));
    expect(await needsSecondKey()).toBe(false);
  });

  it('the notice expires after 24 hours', async () => {
    const now = Date.now();
    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: now - NEEDS_KEY_TTL_MS + 1000 });
    expect(await needsSecondKey(now)).toBe(true);
    expect(await needsSecondKey(now + 2000)).toBe(false);
  });
});
