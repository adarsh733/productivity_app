import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyCard, Card, TeachDraft } from '../../types/contract';
import { db, getMeta } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import {
  AI_BUDGET_META,
  AI_DAILY_CAP,
  ASK_CALLS_PER_QUESTION,
  BACKGROUND_RESERVE,
  aiCallsLeft,
  aiCallsUsed,
  refundAiCalls,
  tryConsumeAiCalls,
  tryConsumeBackgroundAiCall,
} from '../auto/budget';
import { AI_NEEDS_KEY_META } from '../coach/pipeline';
import { buildLibraryIndex } from './librarySearch';
import {
  ASK_CHECK_LINES,
  ASK_LINES,
  ASK_RETURN_DAYS,
  addAskCardsToFeed,
  describePreference,
  hasLetter,
  isUsableDraft,
  retryAskCheck,
  runAsk,
  saveAsk,
  saveAskResult,
  saveWeakSpot,
  saveWeakSpotStatus,
  type AskView,
} from './askPipeline';
import { applyPreference, learnerContext } from '../learn/profile';

const base = { lang: 'en' as const, tags: [], source: 'seed' as const, status: 'active' as const, createdAt: 0 };

const LIB_CARD = {
  ...base,
  id: 'lib-1',
  type: 'word',
  term: 'discuss',
  pos: 'verb',
  meaning: 'talk about something, no "about" needed',
  examples: ['We discuss the plan.', 'Let us discuss it.'],
  say: '',
} as Card;

const INDEX = buildLibraryIndex([LIB_CARD]);

function draft(kind: TeachDraft['kind'], title: string, over: Partial<TeachDraft> = {}): TeachDraft {
  return {
    type: 'teach',
    track: 'clearly',
    level: 1,
    kind,
    category: 'verbs',
    title,
    rule: 'Say "discuss it", not "discuss about it".',
    examples: { work: 'Let us discuss the budget.', everyday: 'We discussed the film.' },
    insteadOf: kind === 'fix' ? 'discuss about it' : undefined,
    analogy: 'Discuss already carries the "about".',
    tryPrompt: 'Say it to a colleague.',
    register: 'both',
    ...over,
  } as TeachDraft;
}

const ANSWER = {
  askKind: 'mistake',
  answer: 'In global English people say "discuss it". "Discuss" already means "talk about".',
  weakSpot: { wrong: 'discuss about', right: 'discuss' },
  cards: [draft('learn', 'Discuss, no about'), draft('fix', 'Drop about'), draft('try', 'Use discuss')],
};

function okJson(data: unknown, provider: string): Response {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

/** answer_ask answered by `answerProvider`; verify_batch by `verifyProvider`. */
function mockFetch(
  opts: {
    answer?: unknown;
    answerProvider?: string;
    verifyProvider?: string;
    verifyOk?: (key: string) => boolean;
  } = {},
) {
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string; payload: { items?: Array<{ key: string }> } };
    if (body.task === 'answer_ask') {
      return okJson(opts.answer ?? ANSWER, opts.answerProvider ?? 'gemini');
    }
    const items = body.payload.items ?? [];
    return okJson(
      { results: items.map((it) => ({ key: it.key, ok: opts.verifyOk ? opts.verifyOk(it.key) : true, reason: 'real' })) },
      opts.verifyProvider ?? 'groq',
    );
  });
  return fn;
}

function asFetch(fn: ReturnType<typeof mockFetch>): typeof fetch {
  return fn as unknown as typeof fetch;
}

function sentBodies(fn: ReturnType<typeof mockFetch>): Array<{ task: string; prefer?: string }> {
  return fn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.reviews.clear(),
    db.asks.clear(),
    db.weakSpots.clear(),
    db.meta.clear(),
    db.outbox.clear(),
  ]);
});

describe('Ask pipeline: the good path', () => {
  it('answers, checks on the other provider, and hands back library + new checked cards', async () => {
    const fetchFn = mockFetch();
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(fetchFn) });

    expect(view.failure).toBeNull();
    expect(view.line).toBeNull();
    expect(view.answer).toContain('discuss it');
    expect(view.library.map((h) => h.card.id)).toEqual(['lib-1']);
    expect(view.fresh.map((d) => d.title)).toEqual(['Discuss, no about', 'Drop about', 'Use discuss']);

    const sent = sentBodies(fetchFn);
    expect(sent.map((t) => t.task)).toEqual(['answer_ask', 'verify_batch']);
    // The check goes to the provider that did NOT write the cards.
    expect(sent[1]!.prefer).toBe('groq');
    expect(await aiCallsUsed()).toBe(ASK_CALLS_PER_QUESTION);
  });

  it('drops drafts that fail the check, that are malformed, or that he already has', async () => {
    const existing = [{ ...draft('learn', 'Have this one'), id: 'e1', ...base } as unknown as AnyCard];
    const answer = {
      ...ANSWER,
      cards: [
        draft('learn', 'Fails the check'),
        draft('fix', 'Passes'),
        draft('try', 'Have this one'),
        { type: 'teach', title: 'No parts' },
      ],
    };
    // The malformed draft never reaches the check; d0 fails it.
    const fetchFn = mockFetch({ answer, verifyOk: (k) => k !== 'd0' });
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn), existing });
    expect(view.fresh.map((d) => d.title)).toEqual(['Passes']);
    expect(view.droppedCount).toBe(2);
  });

  it('isUsableDraft wants every part of a teaching card', () => {
    expect(isUsableDraft(draft('learn', 'ok'))).toBe(true);
    expect(isUsableDraft({ ...draft('learn', 'x'), tryPrompt: '' })).toBe(false);
    expect(isUsableDraft({ ...draft('learn', 'x'), level: 9 })).toBe(false);
    expect(isUsableDraft({ ...draft('learn', 'x'), track: 'cooking' })).toBe(false);
    expect(isUsableDraft(null)).toBe(false);
  });
});

describe('Ask pipeline: every failure is one plain line plus the library', () => {
  function expectLibraryOnly(view: AskView, failure: keyof typeof ASK_LINES) {
    expect(view.failure).toBe(failure);
    expect(view.line).toBe(ASK_LINES[failure]);
    expect(view.line!.split('\n')).toHaveLength(1);
    expect(view.answer).toBeNull();
    expect(view.fresh).toEqual([]);
    expect(view.library.map((h) => h.card.id)).toEqual(['lib-1']);
  }

  it('no network: library only, nothing asked, nothing spent', async () => {
    const fetchFn = mockFetch();
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn), online: false });
    expectLibraryOnly(view, 'offline');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('the connection drops mid-call: library only, and the budget is given back', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn });
    expectLibraryOnly(view, 'offline');
    expect(await aiCallsUsed()).toBe(0);
  });

  it('the server says no (AI unavailable): library only', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: 'AI is unavailable right now (offline or no key).' }),
    })) as unknown as typeof fetch;
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn });
    expectLibraryOnly(view, 'offline');
  });

  it('bad answer (empty, missing, or an unknown kind): library only', async () => {
    for (const bad of [
      { ...ANSWER, answer: '   ' },
      { ...ANSWER, answer: undefined },
      { ...ANSWER, askKind: 'poetry' },
    ]) {
      const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(mockFetch({ answer: bad })) });
      expectLibraryOnly(view, 'bad_answer');
    }
  });

  it('budget used up: library only, no call made, the count does not move', async () => {
    expect(await tryConsumeAiCalls(AI_DAILY_CAP)).toBe(true);
    const fetchFn = mockFetch();
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn) });
    expectLibraryOnly(view, 'budget');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
  });

  it('a failed ask is not kept as a question', async () => {
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(mockFetch()), online: false });
    expect(await saveAsk(view)).toBeNull();
    expect(await db.asks.count()).toBe(0);
  });
});

describe('Ask budget (question 9A)', () => {
  it('takes an Ask as 2 calls, all or nothing', async () => {
    await tryConsumeAiCalls(AI_DAILY_CAP - 1);
    expect(await tryConsumeAiCalls(ASK_CALLS_PER_QUESTION)).toBe(false);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP - 1);
    expect(await aiCallsLeft()).toBe(1);
  });

  it('gives slots back, never below zero', async () => {
    await tryConsumeAiCalls(2);
    await refundAiCalls(2);
    expect(await aiCallsUsed()).toBe(0);
    await refundAiCalls(5);
    expect(await aiCallsUsed()).toBe(0);
  });

  it('background work stops with fewer than 10 left; Ask can still use them', async () => {
    await tryConsumeAiCalls(AI_DAILY_CAP - BACKGROUND_RESERVE);
    expect(await tryConsumeBackgroundAiCall()).toBe(true);
    expect(await aiCallsLeft()).toBe(BACKGROUND_RESERVE - 1);
    expect(await tryConsumeBackgroundAiCall()).toBe(false);
    expect(await tryConsumeAiCalls(ASK_CALLS_PER_QUESTION)).toBe(true);
    const row = await getMeta<{ date: string; count: number }>(AI_BUDGET_META);
    expect(row?.date).toBe(todayKey());
  });
});

describe('Weak spots', () => {
  it('saves the exact wrong phrase and the right one, once', async () => {
    const first = await saveWeakSpot({ wrong: 'discuss about', right: 'discuss' }, 'a1', 10);
    expect(first).toMatchObject({ wrong: 'discuss about', right: 'discuss', source: 'ask' });
    expect(await saveWeakSpot({ wrong: 'Discuss About', right: 'discuss' }, 'a2', 20)).toBeNull();
    expect(await db.weakSpots.count()).toBe(1);
  });

  it('skips empty, identical and over-long text', async () => {
    expect(await saveWeakSpot({ wrong: '', right: 'x' }, 'a', 1)).toBeNull();
    expect(await saveWeakSpot({ wrong: 'same', right: 'Same' }, 'b', 1)).toBeNull();
    expect(await saveWeakSpot({ wrong: 'x'.repeat(61), right: 'ok' }, 'c', 1)).toBeNull();
    expect(await db.weakSpots.count()).toBe(0);
  });

  it('a mistake answer saves its weak spot with the question', async () => {
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(mockFetch()) });
    const id = await saveAsk(view);
    expect(id).not.toBeNull();
    const spots = await db.weakSpots.toArray();
    expect(spots.map((w) => [w.wrong, w.right])).toEqual([['discuss about', 'discuss']]);
    expect((await db.asks.get(id!))?.addedToFeed).toBe(false);
  });
});

describe('Add N cards to my feed', () => {
  it('stores the cards as source ai, tag ask, and plans Use now, Fix later, Try later', async () => {
    const at = 1_700_000_000_000;
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(mockFetch()) });
    const id = (await saveAsk(view, at))!;
    // Hand the cards over in a muddled order: the plan sorts them.
    const n = await addAskCardsToFeed(id, [view.fresh[2]!, view.fresh[0]!, view.fresh[1]!], at);
    expect(n).toBe(3);

    const cards = (await db.cards.toArray()) as unknown as Array<{
      id: string;
      kind: string;
      source: string;
      tags: string[];
      batchId: string;
      status: string;
    }>;
    cards.sort((a, b) => a.id.localeCompare(b.id));
    expect(cards.map((c) => c.kind)).toEqual(['learn', 'fix', 'try']);
    for (const c of cards) {
      expect(c.source).toBe('ai');
      expect(c.tags).toContain('ask');
      expect(c.batchId).toBe(`ask-${id}`);
      expect(c.status).toBe('active');
    }

    const today = todayKey(new Date(at));
    const [use, fix, tryCard] = cards;
    expect(await db.reviews.get(use!.id)).toBeUndefined(); // Use is served right away as a new card
    expect((await db.reviews.get(fix!.id))?.due).toBe(addDays(today, ASK_RETURN_DAYS.fix));
    expect((await db.reviews.get(tryCard!.id))?.due).toBe(addDays(today, ASK_RETURN_DAYS.try));
    expect((await db.reviews.get(fix!.id))?.state).toBe('learning');

    const rec = await db.asks.get(id);
    expect(rec?.addedToFeed).toBe(true);
    expect(rec?.cardIds).toEqual(cards.map((c) => c.id));
  });

  it('is safe to tap twice', async () => {
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(mockFetch()) });
    const id = (await saveAsk(view))!;
    expect(await addAskCardsToFeed(id, view.fresh)).toBe(3);
    expect(await addAskCardsToFeed(id, view.fresh)).toBe(0);
    expect(await db.cards.count()).toBe(3);
  });

  it('adds nothing when there are no checked cards', async () => {
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(mockFetch({ verifyOk: () => false })) });
    const id = (await saveAsk(view))!;
    expect(view.fresh).toEqual([]);
    expect(await addAskCardsToFeed(id, view.fresh)).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
});

// ── v5 fixes: a failed check keeps the answer ─────────────────────────────
type SentBody = {
  task: string;
  prefer?: string;
  exclude?: string[];
  payload: { items?: Array<Record<string, unknown>>; avoid?: string[]; learner?: unknown; levels?: unknown };
};

function bodiesOf(fn: { mock: { calls: unknown[][] } }): SentBody[] {
  return fn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as SentBody);
}

function failJson(status: number, json: unknown): Response {
  return { ok: false, status, json: async () => json } as unknown as Response;
}

/** answer_ask works; verify_batch answers with `verify` (a Response) or throws. */
function answerThen(verify: () => Response, answer: unknown = ANSWER) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string };
    if (body.task === 'answer_ask') return okJson(answer, 'gemini');
    return verify();
  });
}

describe('Ask: the check runs with the answer, on a different provider', () => {
  it('one verify_batch call judges the cards AND the answer, excluding the writer', async () => {
    const fetchFn = mockFetch();
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(fetchFn) });
    const sent = bodiesOf(fetchFn);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.exclude).toEqual(['gemini']);
    expect(sent[1]!.prefer).toBe('groq');
    const items = sent[1]!.payload.items!;
    expect(items.map((i) => i.key)).toEqual(['d0', 'd1', 'd2', 'answer']);
    expect(items[3]).toMatchObject({
      type: 'ask_answer',
      question: 'is discuss about okay',
      answer: ANSWER.answer,
      weakSpot: ANSWER.weakSpot,
    });
    expect(view.answerCheck).toBe('passed');
  });

  it('an answer the check rejects: the warning shows and the weak spot is not saved', async () => {
    const fetchFn = mockFetch({ verifyOk: (k) => k !== 'answer' });
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.answer).not.toBeNull();
    expect(view.answerCheck).toBe('rejected');
    const saved = await saveAskResult(view);
    expect(saved.id).not.toBeNull();
    expect(saved.weakSpot).toBeNull();
    expect(await db.weakSpots.count()).toBe(0);
  });

  it('no verdict for the answer counts as rejected for the weak spot', async () => {
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string };
      if (body.task === 'answer_ask') return okJson(ANSWER, 'gemini');
      return okJson({ results: [{ key: 'd0', ok: true, reason: '' }] }, 'groq');
    });
    const view = await runAsk({ text: 'discuss about', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.answerCheck).toBe('rejected');
    expect(view.fresh).toHaveLength(1);
    await saveAskResult(view);
    expect(await db.weakSpots.count()).toBe(0);
  });

  it('a busy checker keeps the answer: zero cards, a plain retry line, no needs-key notice', async () => {
    const fetchFn = answerThen(() => failJson(503, { ok: false, error: 'x', reason: 'busy' }));
    const view = await runAsk({ text: 'discuss about', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.failure).toBeNull();
    expect(view.answer).toBe(ANSWER.answer);
    expect(view.fresh).toEqual([]);
    expect(view.checkLine).toBe(ASK_CHECK_LINES.retryCards);
    expect(view.canRetryCheck).toBe(true);
    expect(view.answerCheck).toBe('unchecked');
    expect(await getMeta<boolean>(AI_NEEDS_KEY_META)).toBeUndefined();
    // The busy check reached the providers: both calls stay spent.
    expect(await aiCallsUsed()).toBe(2);
  });

  it('the check never leaves the phone (no network): the answer stays and the check slot comes back', async () => {
    const fetchFn = answerThen(() => {
      throw new TypeError('Failed to fetch');
    });
    const view = await runAsk({ text: 'discuss about', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.answer).toBe(ANSWER.answer);
    expect(view.canRetryCheck).toBe(true);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('a reply from the writer itself is a temporary failure, not the needs-key state', async () => {
    const fetchFn = mockFetch({ answerProvider: 'gemini', verifyProvider: 'gemini' });
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.answer).not.toBeNull();
    expect(view.fresh).toEqual([]);
    expect(view.canRetryCheck).toBe(true);
    expect(view.checkLine).toBe(ASK_CHECK_LINES.retryCards);
    expect(await getMeta<boolean>(AI_NEEDS_KEY_META)).toBeUndefined();
  });

  it('only the server reason no_key says "needs a second AI key"; the answer still shows', async () => {
    const fetchFn = answerThen(() => failJson(503, { ok: false, error: 'No second key.', reason: 'no_key' }));
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.failure).toBeNull();
    expect(view.answer).toBe(ANSWER.answer);
    expect(view.fresh).toEqual([]);
    expect(view.checkLine).toBe(ASK_CHECK_LINES.noKey);
    expect(view.canRetryCheck).toBe(false);
    expect(await getMeta<boolean>(AI_NEEDS_KEY_META)).toBe(true);
    // The check never reached a model: given back.
    expect(await aiCallsUsed()).toBe(1);
  });

  it('tap to try again re-runs only the check, for one call, and fills the cards', async () => {
    let checkUp = false;
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string; payload: { items?: Array<{ key: string }> } };
      if (body.task === 'answer_ask') return okJson(ANSWER, 'gemini');
      if (!checkUp) return failJson(503, { ok: false, error: 'x', reason: 'busy' });
      return okJson({ results: (body.payload.items ?? []).map((i) => ({ key: i.key, ok: true, reason: '' })) }, 'groq');
    });
    const first = await runAsk({ text: 'discuss about', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(first.canRetryCheck).toBe(true);
    expect(await aiCallsUsed()).toBe(2);

    checkUp = true;
    const again = await retryAskCheck(first, { fetchFn: asFetch(fetchFn) });
    expect(bodiesOf(fetchFn).map((b) => b.task)).toEqual(['answer_ask', 'verify_batch', 'verify_batch']);
    expect(again.fresh.map((d) => d.title)).toEqual(['Discuss, no about', 'Drop about', 'Use discuss']);
    expect(again.canRetryCheck).toBe(false);
    expect(again.checkLine).toBeNull();
    expect(again.answerCheck).toBe('passed');
    expect(await aiCallsUsed()).toBe(3);
  });

  it('a retry that cannot reach the network gives its call back', async () => {
    const fetchFn = answerThen(() => failJson(503, { ok: false, error: 'x', reason: 'busy' }));
    const first = await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(fetchFn) });
    const dead = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const again = await retryAskCheck(first, { fetchFn: dead });
    expect(again.canRetryCheck).toBe(true);
    expect(await aiCallsUsed()).toBe(2);
  });
});

describe('Ask: refusals and refunds', () => {
  it('bad_input shows the server plain words, and both calls come back', async () => {
    const fetchFn = vi.fn(async () =>
      failJson(400, { ok: false, error: 'Keep the question under 1000 characters.', reason: 'bad_input' }),
    ) as unknown as typeof fetch;
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn });
    expect(view.failure).toBe('refused');
    expect(view.line).toBe('Keep the question under 1000 characters.');
    expect(view.answer).toBeNull();
    expect(view.library.map((h) => h.card.id)).toEqual(['lib-1']);
    expect(await aiCallsUsed()).toBe(0);
  });

  it('a busy answer call spends one (it reached a provider), the unused check comes back', async () => {
    const fetchFn = vi.fn(async () => failJson(503, { ok: false, error: 'x', reason: 'busy' })) as unknown as typeof fetch;
    const view = await runAsk({ text: 'discuss', index: INDEX, fetchFn });
    expect(view.failure).toBe('offline');
    expect(await aiCallsUsed()).toBe(1);
  });

  it('a bad answer gives back the check it never needed', async () => {
    await runAsk({ text: 'discuss', index: INDEX, fetchFn: asFetch(mockFetch({ answer: { ...ANSWER, answer: '' } })) });
    expect(await aiCallsUsed()).toBe(1);
  });

  it('hasLetter wants a letter in any script', () => {
    expect(hasLetter('🙂🙂')).toBe(false);
    expect(hasLetter('123 ?')).toBe(false);
    expect(hasLetter('क्या')).toBe(true);
    expect(hasLetter('ok?')).toBe(true);
  });
});

describe('Ask: the learner memory', () => {
  it('sends avoid, topics, notes and watch, and remembers what the question was about', async () => {
    await applyPreference({ note: 'More cricket small talk', topics: ['cricket'], avoid: ['revert back'] }, 'more cricket');
    await db.weakSpots.put({ id: 'w1', wrong: 'discuss about', right: 'discuss', source: 'ask', createdAt: 1 });
    const fetchFn = mockFetch({ answer: { ...ANSWER, topics: ['meetings', 'verbs'] } });
    await runAsk({
      text: 'discuss',
      index: INDEX,
      fetchFn: asFetch(fetchFn),
      levels: { words: 2 },
    });
    const sent = bodiesOf(fetchFn)[0]!;
    expect(sent.payload.avoid).toEqual(['revert back']);
    expect(sent.payload.levels).toEqual({ words: 2 });
    expect(sent.payload.learner).toEqual({
      topics: ['cricket'],
      notes: ['More cricket small talk'],
      watch: [{ wrong: 'discuss about', right: 'discuss' }],
    });
    const ctx = await learnerContext();
    expect(ctx.topics).toEqual(['cricket', 'meetings', 'verbs']);
  });

  it('a wish is saved into memory, shown with "What I will change", and needs no cards', async () => {
    const wish = {
      askKind: 'preference',
      answer: 'Got it — more small talk about cricket, and no more "revert back".',
      preference: {
        note: 'More cricket small talk',
        moreOf: ['smalltalk', 'cooking'],
        topics: ['cricket'],
        avoid: ['revert back'],
      },
      cards: [],
    };
    const view = await runAsk({
      text: 'more cricket small talk please',
      index: INDEX,
      fetchFn: asFetch(mockFetch({ answer: wish })),
    });
    expect(view.failure).toBeNull();
    expect(view.line).toBeNull();
    expect(view.fresh).toEqual([]);
    expect(view.changes).toBe("More: Small talk · Topics: cricket · Never show: 'revert back'");

    const saved = await saveAskResult(view);
    expect(saved.id).not.toBeNull();
    expect((await db.asks.get(saved.id!))?.askKind).toBe('preference');
    const ctx = await learnerContext();
    expect(ctx.moreOf).toEqual(['smalltalk']);
    expect(ctx.avoid).toContain('revert back');
    expect(ctx.notes).toEqual(['More cricket small talk']);
  });

  it('"other" answers keep at most 2 cards', async () => {
    const answer = {
      askKind: 'other',
      answer: 'A short answer.',
      cards: [draft('learn', 'One'), draft('use', 'Two'), draft('try', 'Three')],
    };
    const fetchFn = mockFetch({ answer });
    const view = await runAsk({ text: 'something else', index: INDEX, fetchFn: asFetch(fetchFn) });
    expect(view.fresh.map((d) => d.title)).toEqual(['One', 'Two']);
    expect(bodiesOf(fetchFn)[1]!.payload.items!.map((i) => i.key)).toEqual(['d0', 'd1', 'answer']);
  });

  it('describePreference: a wish with nothing to change says what it remembers', () => {
    expect(describePreference({ note: 'I like short cards' })).toBe("I'll remember: I like short cards");
    expect(describePreference({ note: '' })).toBeNull();
    expect(describePreference({ note: 'x', harder: ['words'], easier: ['stories'], lessOf: ['clearly'] })).toBe(
      'Less: Speak clearly · Harder: Words · Easier: Stories',
    );
  });
});

describe('Ask: weak spot status', () => {
  it('says saved the first time and duplicate after', async () => {
    const view = await runAsk({ text: 'is discuss about okay', index: INDEX, fetchFn: asFetch(mockFetch()) });
    expect((await saveAskResult(view)).weakSpot).toBe('saved');
    const again = await runAsk({ text: 'discuss about again', index: INDEX, fetchFn: asFetch(mockFetch()) });
    expect((await saveAskResult(again)).weakSpot).toBe('duplicate');
    expect(await saveWeakSpotStatus({ wrong: '', right: 'x' }, 'z')).toBe('invalid');
  });
});
