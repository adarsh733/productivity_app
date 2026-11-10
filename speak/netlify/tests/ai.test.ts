import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import handler, {
  ANTHROPIC_MODEL,
  GEMINI_MODEL,
  GROQ_MODEL,
  GROQ_TOKENS_PER_MINUTE,
  groqMaxTokens,
  safeParse,
  systemFor,
  validateProviderOutput,
} from '../functions/ai';
import { rulebookFor } from '../rulebook';

describe('Netlify AI Function Handler Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('Rejects requests with unknown tasks', async () => {
    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'arbitrary_task', payload: {} }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toBe('unknown task');
  });

  it('Refuses the tasks removed on 2026-11-10 and never calls a model', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const gone = ['answer_ask', 'coach_chat', 'review_recording', 'classify_inbox'];
    for (const task of gone) {
      const req = new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.98.0.${gone.indexOf(task)}` },
        body: JSON.stringify({ task, payload: { text: 'flag', transcript: 'one two three four five six' } }),
      });
      const res = await handler(req);
      expect(res.status, task).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error, task).toBe('unknown task');
      expect(data.reason, task).toBe('bad_input');
      // No validator either: nothing unchecked could ever reach the phone.
      expect(() => validateProviderOutput(task as any, {}), task).toThrow(/No validator/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Fails over to second provider when first provider returns invalid JSON/schema', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    // 1st call (Gemini, first in order): returns invalid schema (a result with no reason)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({ results: [{ key: 'd0', ok: true }] }) },
              ],
            },
          },
        ],
      }),
    } as any);

    // 2nd call (Groq): returns valid schema
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [{ key: 'd0', ok: true, reason: 'pass' }],
              }),
            },
          },
        ],
      }),
    } as any);

    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'verify_batch',
        payload: { items: [{ key: 'd0', type: 'word', term: 'nuance' }] },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq'); // Successfully failed over to Groq!
    expect(data.data.results).toEqual([{ key: 'd0', ok: true, reason: 'pass' }]);
  });

  it('Fails over to next provider when first provider times out / aborts', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    // 1st call (Gemini): simulate abort / timeout error
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValueOnce(abortError);

    // 2nd call (Groq): success
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                typeWeights: { word: 1.2 },
                note: 'Word reps first this week.',
              }),
            },
          },
        ],
      }),
    } as any);

    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'plan_week',
        payload: { types: [{ type: 'word', unseen: 20, views: 5, againRate: 0.3, skips: 1 }] },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.note).toBe('Word reps first this week.');
  });

  it('Returns a plain unavailable message (never raw errors) when all providers fail', async () => {
    process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';

    global.fetch = vi.fn().mockRejectedValue(new Error('Network service unavailable')) as any;

    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'expand_seed',
        payload: { type: 'word', count: 2 },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.data).toBeUndefined(); // Zero fake coaching data returned
    expect(data.error).toMatch(/not set up|busy or unreachable|didn't pass/i);
    expect(data.error).not.toMatch(/http \d+/);
  });

  it('Validates the widened expand_seed draft types with code clamps (AG-008 stage 1)', () => {
    const drafts = (cards: unknown[]) => validateProviderOutput('expand_seed', { cards }) as any;
    // swap — timerSec clamped into 5–60, loose answers trimmed and capped
    const swap = drafts([
        { type: 'swap', weak: 'very tired', answers: ['exhausted', 'drained'], timerSec: 999 },
        { type: 'swap', weak: 'a lot of', answers: ['many', 'plenty', '', 'lots', 'masses', 'oodles'], timerSec: 1 },
      ]);
    expect(swap.cards[0].timerSec).toBe(60);
    expect(swap.cards[0].answers).toEqual(['exhausted', 'drained']);
    expect(swap.cards[1].timerSec).toBe(5);
    expect(swap.cards[1].answers).toHaveLength(5);

    // idiom — corporate must be a real boolean
    const idiom = drafts([
        {
          type: 'idiom',
          phrase: 'circle back',
          meaning: 'revisit later',
          scenario: 'Ask your manager to revisit a decision.',
          example: "Let's circle back on this.",
          corporate: true,
        },
      ]);
    expect(idiom.cards[0].corporate).toBe(true);
    expect(() =>
      drafts([{ type: 'idiom', phrase: 'circle back', meaning: 'm', scenario: 's', example: 'e' }]),
    ).toThrow(/corporate/);

    // situation — kind must be one of five; targetSec snaps to 30|45|60|90; title sliced to 40
    const situ = drafts([
        {
          type: 'situation',
          kind: 'incident',
          title: 'The missed flight and everything that happened after it at the gate',
          prompt: 'Tell the story of a flight you once missed and what happened next.',
          beats: ['Set the scene', 'What went wrong', 'How it ended'],
          targetVocab: [],
          targetSec: 55,
        },
      ]);
    expect(situ.cards[0].targetSec).toBe(60);
    expect(situ.cards[0].title).toHaveLength(40);
    expect(() =>
      drafts([
          {
            type: 'situation',
            kind: 'flight',
            title: 't',
            prompt: 'p',
            beats: ['a', 'b', 'c'],
            targetVocab: [],
            targetSec: 60,
          },
        ]),
    ).toThrow(/invalid "kind"/);

    // describe — title/scene required, targetVocab needs at least 3
    const describeGood = {
      type: 'describe',
      title: 'Busy kitchen',
      scene: 'Steam rises over two cooks moving fast.',
      alt: 'steam and motion',
      prompt: 'Tell me what happens.',
      beats: ['What you see', 'Who is doing what', 'The mood'],
      targetVocab: ['steam', 'clatter', 'rush'],
      targetSec: 60,
    };
    const desc = drafts([describeGood]);
    expect(desc.cards[0].title).toBe('Busy kitchen');
    expect(() =>
      drafts([{ ...describeGood, targetVocab: ['steam'] }]),
    ).toThrow(/targetVocab/);

    // teach_back — beats must be exactly 3
    expect(() =>
      drafts([{ type: 'teach_back', prompt: 'Explain a database index.', beats: ['a', 'b'], targetSec: 60 }]),
    ).toThrow(/exactly 3/);

    // Hindi word — lang 'hi' passes through; any other lang throws
    const hi = drafts([
        {
          type: 'word',
          term: 'जुगाड़',
          pos: 'noun',
          meaning: 'a clever workaround',
          examples: ['यह एक जुगाड़ है।', 'उसने जुगाड़ लगाया।'],
          say: 'जुगाड़',
          lang: 'hi',
        },
      ]);
    expect(hi.cards[0].lang).toBe('hi');
    expect(() =>
      drafts([
          { type: 'word', term: 'x', pos: 'n.', meaning: 'm', examples: ['a', 'b'], say: 's', lang: 'en' },
        ]),
    ).toThrow(/lang/);
  });

  it('Validates verify_batch output strictly (key, ok, reason)', () => {
    const good = { results: [{ key: 'd0', ok: true, reason: 'real and natural' }] };
    const v = validateProviderOutput('verify_batch', good) as any;
    expect(v.results[0].ok).toBe(true);
    expect(() => validateProviderOutput('verify_batch', { results: [{ key: 'd0', ok: true }] })).toThrow(
      /reason/,
    );
    expect(() => validateProviderOutput('verify_batch', {})).toThrow(/results/);
  });

  it('Rejects verify_batch with a bad payload', async () => {
    const badVerify = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'verify_batch', payload: {} }),
    });
    expect((await handler(badVerify)).status).toBe(400);
  });

  it('Validates expand_seed with the shared draft clamps; never-produce types throw (AG-008 stage 2)', () => {
    const good = {
      cards: [
        {
          type: 'word',
          term: 'cadence',
          pos: 'noun',
          meaning: 'rhythm in speech',
          examples: ['His cadence is calm.', 'Vary your cadence.'],
          say: 'Use cadence in one line.',
        },
      ],
    };
    const v = validateProviderOutput('expand_seed', good) as any;
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0].term).toBe('cadence');
    expect(() => validateProviderOutput('expand_seed', {})).toThrow(/cards/);
    expect(() => validateProviderOutput('expand_seed', { cards: [{ type: 'word', term: 'x' }] })).toThrow(
      /Draft 0/,
    );
    expect(() =>
      validateProviderOutput('expand_seed', { cards: [{ type: 'pronounce', term: 'x' }] }),
    ).toThrow(/unknown type/);
  });

  it('Rejects expand_seed payloads with a forbidden type, bad count, bad seed or bad topics (AG-008 stage 2)', async () => {
    const post = (payload: unknown) =>
      handler(
        new Request('http://localhost/.netlify/functions/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task: 'expand_seed', payload }),
        }),
      );

    expect((await post({ type: 'breath', count: 2 })).status).toBe(400);
    expect((await post({ type: 'word', count: 99 })).status).toBe(400);
    expect((await post({ type: 'word', count: 2.5 })).status).toBe(400);
    expect((await post({ type: 'word' })).status).toBe(400);
    // Seed must itself be a valid draft, and of the requested type.
    expect((await post({ type: 'word', count: 2, seed: { type: 'word', term: 'x' } })).status).toBe(400);
    expect(
      (
        await post({
          type: 'word',
          count: 2,
          seed: { type: 'phrase', weak: 'a', strong: 'b', why: 'w', register: 'office' },
        })
      ).status,
    ).toBe(400);
    // topics (max 20) and avoid (max 50): string arrays of non-empty entries.
    expect((await post({ type: 'word', count: 2, topics: ['ok', 5] })).status).toBe(400);
    expect(
      (await post({ type: 'word', count: 2, topics: Array.from({ length: 21 }, (_, i) => `t${i}`) }))
        .status,
    ).toBe(400);
    expect((await post({ type: 'word', count: 2, avoid: ['ok', 5] })).status).toBe(400);
    expect((await post({ type: 'word', count: 2, avoid: ['  '] })).status).toBe(400);
    expect(
      (await post({ type: 'word', count: 2, avoid: Array.from({ length: 51 }, (_, i) => `a${i}`) }))
        .status,
    ).toBe(400);
  });

  it('Accepts a valid expand_seed request and returns the generated cards (AG-008 stage 2)', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    cards: [
                      {
                        type: 'word',
                        term: 'cadence',
                        pos: 'noun',
                        meaning: 'rhythm in speech',
                        examples: ['His cadence is calm.', 'Vary your cadence when presenting.'],
                        say: 'Use cadence in one line.',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as any);

    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'expand_seed',
        payload: {
          type: 'word',
          count: 2,
          seed: {
            type: 'word',
            term: 'nuance',
            pos: 'noun',
            meaning: 'a small difference in meaning',
            examples: ['There is a nuance here.', 'He explained the nuance.'],
            say: 'Explain the nuance.',
          },
          topics: ['office english'],
          avoid: ['revert back'],
        },
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('gemini');
    expect(data.data.cards).toHaveLength(1);
    expect(data.data.cards[0].term).toBe('cadence');
  });

  it('Validates plan_week structurally; loose numbers pass through for the client clamp (AG-008 stage 5)', () => {
    const manyWords = Array.from({ length: 11 }, (_, i) => `w${i}`);
    const good = {
      typeWeights: { word: 9, idiom: 0.1, nonsense: 1, swap: 'x' },
      challengeFocus: '  softer  ',
      focusWords: ['  Hiring ', '', 7, ...manyWords],
      note: '  Push word gaps this week.  ',
    };
    const v = validateProviderOutput('plan_week', good) as any;
    // Out-of-range and unknown types pass the structural check on purpose:
    // `features/auto/plan.ts` clamps them before anything is stored.
    expect(v.typeWeights).toEqual({ word: 9, idiom: 0.1, nonsense: 1 });
    expect(v.challengeFocus).toBe('softer');
    expect(v.focusWords).toHaveLength(10);
    expect(v.focusWords[0]).toBe('Hiring');
    expect(v.note).toBe('Push word gaps this week.');

    const nonFinite = validateProviderOutput('plan_week', {
      typeWeights: { word: Number.NaN, idiom: 1.2 },
      note: 'Keep idiom reps.',
    }) as any;
    expect(nonFinite.typeWeights).toEqual({ idiom: 1.2 });

    expect(() => validateProviderOutput('plan_week', {})).toThrow(/no usable content/);
    expect(() => validateProviderOutput('plan_week', { typeWeights: {} })).toThrow(/no usable content/);
    expect(() => validateProviderOutput('plan_week', { typeWeights: { word: Number.NaN } })).toThrow(
      /no usable content/,
    );
    expect(() => validateProviderOutput('plan_week', { focusWords: [' ', 5] })).toThrow(/no usable content/);
    expect(() => validateProviderOutput('plan_week', null)).toThrow(/must be an object/);
  });

  it('Rejects plan_week payloads with bad types, voice or coachSubjects shapes (AG-008 stage 5)', async () => {
    // Unique IP per request: the shared 'anonymous' bucket is nearly spent by
    // the rest of this suite, and these rejections never reach a provider.
    let n = 0;
    const post = (payload: unknown) => {
      n++;
      return handler(
        new Request('http://localhost/.netlify/functions/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.99.0.${n}` },
          body: JSON.stringify({ task: 'plan_week', payload }),
        }),
      );
    };

    const row = { type: 'word', unseen: 20, views: 5, againRate: 0.3, skips: 1 };
    expect((await post({})).status).toBe(400); // types missing
    expect((await post({ types: [] })).status).toBe(400);
    expect((await post({ types: Array.from({ length: 16 }, () => row) })).status).toBe(400);
    expect((await post({ types: [row, 'word'] })).status).toBe(400);
    expect((await post({ types: [{ seen: 1 }] })).status).toBe(400); // entry without a string type
    expect((await post({ types: [row], voice: ['soft'] })).status).toBe(400); // voice must be an object
    expect(
      (await post({ types: [row], coachSubjects: Array.from({ length: 11 }, (_, i) => `s${i}`) })).status,
    ).toBe(400);
    expect((await post({ types: [row], coachSubjects: ['ok', 3] })).status).toBe(400);
  });

  it('Accepts a valid plan_week request and returns the plan (AG-008 stage 5)', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    typeWeights: { word: 1.3 },
                    challengeFocus: 'pause_first',
                    focusWords: ['Hiring'],
                    note: 'Word reps first, then pauses.',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as any);

    const req = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.99.1.1' },
      body: JSON.stringify({
        task: 'plan_week',
        payload: {
          types: [{ type: 'word', unseen: 20, views: 5, againRate: 0.3, skips: 1 }],
          voice: { calibrated: true, paceTarget: 120, recentWpm: 130 },
          coachSubjects: ['Hiring', 'budget review'],
        },
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('gemini');
    expect(data.data.typeWeights).toEqual({ word: 1.3 });
    expect(data.data.challengeFocus).toBe('pause_first');
    expect(data.data.note).toBe('Word reps first, then pauses.');
  });
});

// ── Models and rulebook prompts (step 0) ───────────────────────────────────

describe('AI models and rulebook prompts', () => {
  const originalEnv = process.env;
  let ipCounter = 0;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  /** A fresh client address per request keeps these tests out of the shared rate-limit bucket. */
  function post(task: string, payload: unknown, prefer?: string) {
    ipCounter += 1;
    return new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${ipCounter}` },
      body: JSON.stringify({ task, payload, ...(prefer ? { prefer } : {}) }),
    });
  }

  /** Minimal payloads that pass each task's payload check. */
  const PAYLOADS: Record<ConfiguredTaskName, unknown> = {
    expand_seed: { type: 'word', count: 1 },
    verify_batch: { items: [] },
    plan_week: { types: [{ type: 'word' }] },
  };
  type ConfiguredTaskName = 'expand_seed' | 'verify_batch' | 'plan_week';
  const TASKS = Object.keys(PAYLOADS) as ConfiguredTaskName[];

  it('pins the model names', () => {
    expect(GROQ_MODEL).toBe('openai/gpt-oss-120b');
    expect(ANTHROPIC_MODEL).toBe('claude-haiku-5-5');
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('sends the pinned Groq model with the rulebook slice as the system prompt', async () => {
    process.env.GROQ_API_KEY = 'mock-groq-key';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    global.fetch = fetchSpy as any;

    await handler(post('plan_week', PAYLOADS.plan_week));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('api.groq.com');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(systemFor('plan_week'));
  });

  it.each(TASKS)('%s: Groq prompt + answer room fit its 8,000 tokens a minute', async (task) => {
    process.env.GROQ_API_KEY = 'mock-groq-key';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    global.fetch = fetchSpy as any;

    await handler(post(task, PAYLOADS[task]));

    const [, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    const promptChars = body.messages.reduce((n: number, m: { content: string }) => n + m.content.length, 0);
    // ~3.9 characters a token in practice; 3.5 is the safe side.
    expect(Math.ceil(promptChars / 3.5) + body.max_tokens).toBeLessThanOrEqual(GROQ_TOKENS_PER_MINUTE);
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
    expect(body.reasoning_effort).toBe('low');
  });

  it('caps Groq answer room only when the prompt needs it', () => {
    expect(groqMaxTokens('x'.repeat(350), '', 1024)).toBe(1024);
    expect(groqMaxTokens('x'.repeat(19_250), '', 6144)).toBe(8000 - 5500 - 100);
    expect(groqMaxTokens('x'.repeat(40_000), '', 2048)).toBe(512);
  });

  it('sends the pinned Gemini model', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    });
    global.fetch = fetchSpy as any;

    await handler(post('plan_week', PAYLOADS.plan_week));

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent');
  });

  it('sends the pinned Anthropic model with a cached system block', async () => {
    process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{}' }] }),
    });
    global.fetch = fetchSpy as any;

    await handler(post('verify_batch', PAYLOADS.verify_batch, 'anthropic'));

    const [url, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('api.anthropic.com');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system).toHaveLength(1);
    expect(body.system[0].type).toBe('text');
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[0].text).toBe(systemFor('verify_batch'));
  });

  it.each(TASKS)('%s: the prompt that reaches the model starts with its rulebook slice', async (task) => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    });
    global.fetch = fetchSpy as any;

    await handler(post(task, PAYLOADS[task]));

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    const sent = JSON.parse(init.body).systemInstruction.parts[0].text as string;
    expect(sent.startsWith(rulebookFor(task))).toBe(true);
    expect(sent).toContain('=== THIS JOB ===');
    expect(rulebookFor(task).length).toBeGreaterThan(1000);
  });

  it('verify_batch judges against rulebook section 6 reject codes and answers in the existing shape', () => {
    const prompt = systemFor('verify_batch');
    for (let n = 1; n <= 17; n++) expect(prompt).toContain(`R${n} `);
    expect(prompt).toContain('R1 INVENTED');
    expect(prompt).toContain('R17 MEANING');
    expect(prompt).toContain('"results":[{"key":string,"ok":boolean,"reason":string}]');
  });

  it('keeps each task\'s own JSON-shape lines after the rulebook', () => {
    expect(systemFor('expand_seed')).toContain('Return ONLY JSON: {"cards":[...]}');
    expect(systemFor('verify_batch')).toContain('"results":[{"key":string,"ok":boolean,"reason":string}]');
    expect(systemFor('plan_week')).toContain('"typeWeights"');
  });
});

describe('safeParse', () => {
  it('empty and broken JSON throw plainly; a ```json fence is stripped', () => {
    expect(() => safeParse('')).toThrow(/Empty response/);
    expect(() => safeParse('   ')).toThrow(/Empty response/);
    expect(() => safeParse('{"cards":')).toThrow(/Malformed JSON/);
    // A sentence around the object is tolerated; the object inside is read.
    expect(safeParse('Sure! Here is your JSON: {}')).toEqual({});
    expect(safeParse('Here it is:\n{"a":3}\nHope this helps!')).toEqual({ a: 3 });
    expect(safeParse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeParse('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });
});

describe('expand_seed with teach cards (v5 top-up)', () => {
  const originalEnv = process.env;
  let ip = 0;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function expand(payload: unknown) {
    ip += 1;
    return handler(
      new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.14.0.${ip}` },
        body: JSON.stringify({ task: 'expand_seed', payload }),
      }),
    );
  }

  const gemini = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });
  const groq = (content: string) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });

  const teach = (over: Record<string, unknown> = {}) => ({
    type: 'teach',
    track: 'words',
    level: 1,
    kind: 'learn',
    category: 'precise verbs',
    title: 'Flag a problem',
    rule: 'To flag means to point out a problem early.',
    examples: { work: "I'd like to flag a risk on the release.", everyday: 'Flag it if the milk smells off.' },
    analogy: 'Like a linesman raising his flag at a cricket match.',
    tryPrompt: 'How would you say: you want to warn your manager about a delay?',
    register: 'both',
    ...over,
  });

  it('validates teach drafts, drops bad or off-track ones, and throws when none are left', () => {
    const payload = { type: 'teach', track: 'words', count: 3 };
    const out = validateProviderOutput(
      'expand_seed',
      {
        cards: [
          teach(),
          teach({ title: 'Flag it early', kind: 'use' }),
          teach({ title: 'Too long', rule: 'one two three four five six seven eight nine ten eleven twelve thirteen' }),
          teach({ title: 'Wrong track', track: 'stories' }),
          teach({ title: 'FLAG A PROBLEM' }),
        ],
      },
      payload,
    ) as { cards: Array<{ title: string; type: string }> };
    expect(out.cards.map((c) => c.title)).toEqual(['Flag a problem', 'Flag it early']);
    expect(out.cards.every((c) => c.type === 'teach')).toBe(true);

    expect(() =>
      validateProviderOutput('expand_seed', { cards: [teach({ track: 'stories' })] }, payload),
    ).toThrow(/No usable teach cards/);
    expect(() => validateProviderOutput('expand_seed', { cards: [] }, payload)).toThrow();
    // Without a teach payload the old shapes still go through the draft clamps.
    expect(() => validateProviderOutput('expand_seed', { cards: [teach()] })).toThrow();
  });

  it('rejects bad teach payloads with a plain message and never calls a model', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    for (const bad of [
      { type: 'teach', count: 3 },
      { type: 'teach', track: 'poetry', count: 3 },
      { type: 'teach', track: 'words', count: 6 },
      { type: 'teach', track: 'words', count: 0 },
      { type: 'teach', track: 'words', count: 3, level: 9 },
      { type: 'teach', track: 'words', count: 3, seed: teach() },
      { type: 'teach', track: 'words', count: 3, topics: 'office' },
    ]) {
      const res = await expand(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns validated teach cards for a good request and sends the teach rule in the prompt', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    fetchSpy.mockResolvedValueOnce(
      gemini(JSON.stringify({ cards: [teach(), teach({ title: 'Flag it early', kind: 'use' })] })) as any,
    );

    const res = await expand({ type: 'teach', track: 'words', level: 2, count: 2, topics: ['office'], avoid: ['revert'] });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('gemini');
    expect(data.data.cards).toHaveLength(2);
    expect(data.data.cards[0].type).toBe('teach');
    expect(data.data.cards[0].examples.work).toContain('flag');

    const sent = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(JSON.stringify(sent)).toContain('When the requested type is \\"teach\\"');
  });

  it('fails over to the next provider when the first returns no usable teach card', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'g';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    fetchSpy.mockResolvedValueOnce(gemini(JSON.stringify({ cards: [teach({ track: 'stories' })] })) as any);
    fetchSpy.mockResolvedValueOnce(groq(JSON.stringify({ cards: [teach()] })) as any);

    const res = await expand({ type: 'teach', track: 'words', count: 1 });
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.cards).toHaveLength(1);
  });

  it('with no keys it answers plainly (502), never a raw error', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = await expand({ type: 'teach', track: 'words', count: 1 });
    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/not set up|busy or unreachable|didn't pass/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
