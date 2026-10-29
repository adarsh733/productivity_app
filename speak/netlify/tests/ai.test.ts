import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import handler, {
  ANTHROPIC_MODEL,
  ASK_ANSWER_MAX,
  CHAT_BETTER_MAX,
  CHAT_POINT_MAX,
  GEMINI_MODEL,
  GROQ_MODEL,
  GROQ_TOKENS_PER_MINUTE,
  checkAnswerAskPayload,
  groqMaxTokens,
  checkCoachChatPayload,
  safeParse,
  systemFor,
  validateAnswerAsk,
  validateCoachChat,
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

  it('Rejects review_recording payloads with transcripts under 5 words', async () => {
    const shortReq = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'review_recording',
        payload: { transcript: 'Only three words' },
      }),
    });

    const res = await handler(shortReq);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toContain('minimum 5 words');
  });

  it('Validates provider output schema strictly', () => {
    // Valid response
    const validRaw = {
      summary: 'Strong delivery and clear articulation.',
      strongPoint: 'You highlighted "trade-off" naturally in the opening.',
      oneCorrection: 'Pause slightly longer before concluding.',
      suggestedAlternative: 'Instead of "we should wait", say "I recommend delaying launch".',
    };
    const validated = validateProviderOutput('review_recording', validRaw) as any;
    expect(validated.summary).toBe('Strong delivery and clear articulation.');
    expect(validated.strongPoint).toContain('trade-off');

    // Missing strongPoint -> throws
    expect(() =>
      validateProviderOutput('review_recording', {
        summary: 'Good',
        oneCorrection: 'Fix this',
      }),
    ).toThrow(/Missing or empty "strongPoint"/);

    // Missing summary -> throws
    expect(() =>
      validateProviderOutput('review_recording', {
        strongPoint: 'Good',
        oneCorrection: 'Fix this',
      }),
    ).toThrow(/Missing or empty "summary"/);

    // Empty oneCorrection -> throws
    expect(() =>
      validateProviderOutput('review_recording', {
        summary: 'Good',
        strongPoint: 'Good words',
        oneCorrection: '   ',
      }),
    ).toThrow(/Missing or empty "oneCorrection"/);
  });

  it('Fails over to second provider when first provider returns invalid JSON/schema', async () => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    // 1st call (Gemini, first in order): returns invalid schema (missing strongPoint)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({ summary: 'Invalid missing fields' }) },
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
                summary: 'Excellent concise status update.',
                strongPoint: 'You clearly framed "trade-off" in the second sentence.',
                oneCorrection: 'Breathe at the midpoint.',
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
        task: 'review_recording',
        payload: {
          transcript: 'Here is my five word speaking rep.',
          promptText: 'Status update',
          drillTitle: 'Rapid Rep',
          elapsedSec: 30,
        },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq'); // Successfully failed over to Groq!
    expect(data.data.summary).toBe('Excellent concise status update.');
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
                summary: 'Pacing was steady throughout.',
                strongPoint: 'Referenced "production outage" directly.',
                oneCorrection: 'Add a 1-second pause.',
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
        task: 'review_recording',
        payload: {
          transcript: 'Discussing the production outage with the team.',
          promptText: 'Incident',
          drillTitle: 'Incident Drill',
          elapsedSec: 45,
        },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.strongPoint).toContain('production outage');
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
        task: 'review_recording',
        payload: {
          transcript: 'This is an attempt during complete outage.',
          promptText: 'Prompt',
          drillTitle: 'Drill',
          elapsedSec: 30,
        },
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

  it('Validates classify_inbox output strictly (kind, subject, drafts)', () => {
    const good = {
      kind: 'word',
      subject: 'nuance',
      cards: [
        {
          type: 'word',
          term: 'nuance',
          pos: 'noun',
          meaning: 'a small difference in meaning',
          examples: ['There is a nuance here.', 'He explained the nuance to the client.'],
          say: 'Explain the nuance in one line.',
        },
      ],
    };
    const v = validateProviderOutput('classify_inbox', good) as any;
    expect(v.kind).toBe('word');
    expect(v.cards).toHaveLength(1);
    expect(() => validateProviderOutput('classify_inbox', { kind: 'nope', subject: 'x', cards: [] })).toThrow(
      /kind/,
    );
    expect(() => validateProviderOutput('classify_inbox', { kind: 'word', cards: [] })).toThrow(/subject/);
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'word',
        subject: 'x',
        cards: [{ type: 'word', term: 'x' }],
      }),
    ).toThrow(/Draft 0/);
  });

  it('Validates the widened classify draft types with code clamps (AG-008 stage 1)', () => {
    // swap — timerSec clamped into 5–60, loose answers trimmed and capped
    const swap = validateProviderOutput('classify_inbox', {
      kind: 'mistake',
      subject: 'very tired',
      cards: [
        { type: 'swap', weak: 'very tired', answers: ['exhausted', 'drained'], timerSec: 999 },
        { type: 'swap', weak: 'a lot of', answers: ['many', 'plenty', '', 'lots', 'masses', 'oodles'], timerSec: 1 },
      ],
    }) as any;
    expect(swap.cards[0].timerSec).toBe(60);
    expect(swap.cards[0].answers).toEqual(['exhausted', 'drained']);
    expect(swap.cards[1].timerSec).toBe(5);
    expect(swap.cards[1].answers).toHaveLength(5);

    // idiom — corporate must be a real boolean
    const idiom = validateProviderOutput('classify_inbox', {
      kind: 'other',
      subject: 'circle back',
      cards: [
        {
          type: 'idiom',
          phrase: 'circle back',
          meaning: 'revisit later',
          scenario: 'Ask your manager to revisit a decision.',
          example: "Let's circle back on this.",
          corporate: true,
        },
      ],
    }) as any;
    expect(idiom.cards[0].corporate).toBe(true);
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'other',
        subject: 'circle back',
        cards: [{ type: 'idiom', phrase: 'circle back', meaning: 'm', scenario: 's', example: 'e' }],
      }),
    ).toThrow(/corporate/);

    // situation — kind must be one of five; targetSec snaps to 30|45|60|90; title sliced to 40
    const situ = validateProviderOutput('classify_inbox', {
      kind: 'topic',
      subject: 'the missed flight',
      cards: [
        {
          type: 'situation',
          kind: 'incident',
          title: 'The missed flight and everything that happened after it at the gate',
          prompt: 'Tell the story of a flight you once missed and what happened next.',
          beats: ['Set the scene', 'What went wrong', 'How it ended'],
          targetVocab: [],
          targetSec: 55,
        },
      ],
    }) as any;
    expect(situ.cards[0].targetSec).toBe(60);
    expect(situ.cards[0].title).toHaveLength(40);
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'topic',
        subject: 'x',
        cards: [
          {
            type: 'situation',
            kind: 'flight',
            title: 't',
            prompt: 'p',
            beats: ['a', 'b', 'c'],
            targetVocab: [],
            targetSec: 60,
          },
        ],
      }),
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
    const desc = validateProviderOutput('classify_inbox', {
      kind: 'topic',
      subject: 'kitchen',
      cards: [describeGood],
    }) as any;
    expect(desc.cards[0].title).toBe('Busy kitchen');
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'topic',
        subject: 'kitchen',
        cards: [{ ...describeGood, targetVocab: ['steam'] }],
      }),
    ).toThrow(/targetVocab/);

    // teach_back — beats must be exactly 3
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'topic',
        subject: 'indexes',
        cards: [{ type: 'teach_back', prompt: 'Explain a database index.', beats: ['a', 'b'], targetSec: 60 }],
      }),
    ).toThrow(/exactly 3/);

    // Hindi word — lang 'hi' passes through; any other lang throws
    const hi = validateProviderOutput('classify_inbox', {
      kind: 'word',
      subject: 'जुगाड़',
      cards: [
        {
          type: 'word',
          term: 'जुगाड़',
          pos: 'noun',
          meaning: 'a clever workaround',
          examples: ['यह एक जुगाड़ है।', 'उसने जुगाड़ लगाया।'],
          say: 'जुगाड़',
          lang: 'hi',
        },
      ],
    }) as any;
    expect(hi.cards[0].lang).toBe('hi');
    expect(() =>
      validateProviderOutput('classify_inbox', {
        kind: 'word',
        subject: 'x',
        cards: [
          { type: 'word', term: 'x', pos: 'n.', meaning: 'm', examples: ['a', 'b'], say: 's', lang: 'en' },
        ],
      }),
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

  it('Rejects classify_inbox with empty text and verify_batch with bad payload', async () => {
    const badClassify = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'classify_inbox', payload: { text: '   ' } }),
    });
    expect((await handler(badClassify)).status).toBe(400);

    // `avoid` is optional, but when present it must be ≤50 non-empty strings.
    const badAvoidShape = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'classify_inbox', payload: { text: 'ok note', avoid: ['ok', 7] } }),
    });
    expect((await handler(badAvoidShape)).status).toBe(400);

    const badAvoidCap = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'classify_inbox',
        payload: { text: 'ok note', avoid: Array.from({ length: 51 }, (_, i) => `a${i}`) },
      }),
    });
    expect((await handler(badAvoidCap)).status).toBe(400);

    const badVerify = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'verify_batch', payload: {} }),
    });
    expect((await handler(badVerify)).status).toBe(400);
  });

  it('Accepts a watch list (max 10) on review_recording payloads', async () => {
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
                    summary: 'Good update.',
                    strongPoint: 'You said "trade-off" clearly.',
                    oneCorrection: 'Pause before the close.',
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
        task: 'review_recording',
        payload: {
          transcript: 'Here is my five word speaking rep now.',
          watch: [{ wrong: 'revert back', right: 'revert' }],
        },
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);

    const tooMany = new Request('http://localhost/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'review_recording',
        payload: {
          transcript: 'Here is my five word speaking rep now.',
          watch: Array.from({ length: 11 }, (_, i) => ({ wrong: `w${i}`, right: `r${i}` })),
        },
      }),
    });
    expect((await handler(tooMany)).status).toBe(400);
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

  it('review_recording keeps a valid mistake trimmed and capped (AG-008 stage 2)', () => {
    const base = { summary: 'Good.', strongPoint: 'Clear.', oneCorrection: 'Pause.' };
    const v = validateProviderOutput('review_recording', {
      ...base,
      mistake: { wrong: '  revert back  ', right: '  revert  ' },
    }) as any;
    expect(v.mistake).toEqual({ wrong: 'revert back', right: 'revert' });

    const long = validateProviderOutput('review_recording', {
      ...base,
      mistake: { wrong: 'w'.repeat(80), right: 'r'.repeat(80) },
    }) as any;
    expect(long.mistake.wrong).toHaveLength(60);
    expect(long.mistake.right).toHaveLength(60);
  });

  it('review_recording drops malformed mistakes silently, never fatal (AG-008 stage 2)', () => {
    const base = { summary: 'Good.', strongPoint: 'Clear.', oneCorrection: 'Pause.' };
    expect((validateProviderOutput('review_recording', { ...base, mistake: null }) as any).mistake).toBeUndefined();
    expect((validateProviderOutput('review_recording', { ...base, mistake: 'nope' }) as any).mistake).toBeUndefined();
    expect(
      (validateProviderOutput('review_recording', { ...base, mistake: { wrong: ' ', right: 'revert' } }) as any)
        .mistake,
    ).toBeUndefined();
    const same = validateProviderOutput('review_recording', {
      ...base,
      mistake: { wrong: 'revert', right: 'REVERT' },
    }) as any;
    expect(same.mistake).toBeUndefined();
    expect(same.summary).toBe('Good.');
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
    classify_inbox: { text: 'flag' },
    review_recording: { transcript: 'one two three four five six' },
    plan_week: { types: [{ type: 'word' }] },
    answer_ask: { text: 'what does flag mean' },
    coach_chat: { question: 'How was your weekend?', transcript: 'It was good, I went hiking.', track: 'smalltalk' },
  };
  type ConfiguredTaskName =
    | 'expand_seed'
    | 'verify_batch'
    | 'classify_inbox'
    | 'review_recording'
    | 'plan_week'
    | 'answer_ask'
    | 'coach_chat';
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

    await handler(post('review_recording', PAYLOADS.review_recording));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('api.groq.com');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(systemFor('review_recording'));
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

    await handler(post('review_recording', PAYLOADS.review_recording));

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
    expect(systemFor('classify_inbox')).toContain('"kind":"word"|"mistake"|"topic"|"other"');
    expect(systemFor('review_recording')).toContain('"suggestedAlternative"');
    expect(systemFor('plan_week')).toContain('"typeWeights"');
    expect(systemFor('answer_ask')).toContain('"askKind"');
    expect(systemFor('answer_ask')).toContain('[[double brackets]]');
    expect(systemFor('answer_ask')).toContain('3 to 8 teach cards');
    expect(systemFor('coach_chat')).toContain('"fixes":[{"text":string,"lesson":string}]');
    expect(systemFor('coach_chat')).toContain('one or two fixes, never more');
  });
});

// ── answer_ask (step 3: the Ask tab) ───────────────────────────────────────

/** A teach card inside every rulebook 1.2 limit. */
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'teach',
    track: 'words',
    level: 1,
    kind: 'learn',
    category: 'office words',
    title: 'Flag a problem',
    rule: 'To flag means to point out a problem early.',
    examples: { work: "I'd like to flag a risk on the release.", everyday: 'Flag it if the milk smells off.' },
    analogy: 'Like a linesman raising his flag at a cricket match.',
    tryPrompt: 'How would you say: you want to warn your manager about a delay?',
    register: 'both',
    ...over,
  };
}

const goodWordAsk = () => ({
  askKind: 'word',
  answer: 'To flag something means to point it out so someone looks at it.',
  cards: [
    card(),
    card({ title: 'Flag it early', kind: 'use' }),
    card({ title: 'Your turn: flag it', kind: 'try', answer: "I'd like to flag that we may slip a day." }),
  ],
});

const goodFixAsk = () => ({
  askKind: 'fix_sentence',
  answer: 'Lead with the ask and drop "kindly do the needful".',
  versions: {
    crisp: '[[Can we move]] the review to Friday?',
    confident: "Let's [[move the review]] to Friday. I'll send the invite.",
    polite: 'Could we [[move the review]] to Friday, if that works for you?',
  },
  chunks: ['move the review', 'can we move', 'not in any version'],
  weakSpot: { wrong: 'kindly do the needful', right: 'could you please' },
  cards: [
    card({ kind: 'fix', title: 'Ask, then thank', insteadOf: 'Kindly do the needful.' }),
    card({ title: 'Move the review', kind: 'use' }),
    card({ title: 'Try: ask to reschedule', kind: 'try', answer: 'Could we move this to Thursday?' }),
  ],
});

describe('answer_ask validator', () => {
  it('accepts a good word ask and keeps only contract fields', () => {
    const v = validateProviderOutput('answer_ask', goodWordAsk()) as any;
    expect(v.askKind).toBe('word');
    expect(v.cards).toHaveLength(3);
    expect(v.cards[0]).toEqual(card());
    expect(v.cards[2].answer).toContain('flag');
    expect(v.versions).toBeUndefined();
    expect(v.chunks).toBeUndefined();
  });

  it('maps rulebook kind names and field aliases to the contract', () => {
    const v = validateAnswerAsk({
      ...goodWordAsk(),
      askKind: 'Phrase-Idiom',
      cards: [
        card({ instead_of: 'Please revert back.', kind: 'fix', title: 'Reply, not revert' }),
        card({ tryPrompt: undefined, try: 'Say it your way about your day.', title: 'Try it' }),
        card({ source: 'Nancy Duarte', title: 'Credited' }),
      ],
    }) as any;
    expect(v.askKind).toBe('phrase_idiom');
    expect(v.cards[0].insteadOf).toBe('Please revert back.');
    expect(v.cards[0].instead_of).toBeUndefined();
    expect(v.cards[1].tryPrompt).toBe('Say it your way about your day.');
    expect(v.cards[2].credit).toBe('Nancy Duarte');
    expect(validateAnswerAsk({ ...goodWordAsk(), askKind: 'how-do-I-say' }).askKind).toBe('how_say');
    expect(validateAnswerAsk({ ...goodWordAsk(), askKind: 'difference-between' }).askKind).toBe('difference');
  });

  it('throws (so the next provider runs) on a bad kind, empty answer or missing cards', () => {
    expect(() => validateAnswerAsk(null)).toThrow(/must be an object/);
    expect(() => validateAnswerAsk([])).toThrow(/must be an object/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), askKind: 'joke' })).toThrow(/askKind/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), askKind: undefined })).toThrow(/askKind/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), answer: '   ' })).toThrow(/empty "answer"/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), answer: 42 })).toThrow(/empty "answer"/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), cards: undefined })).toThrow(/cards/);
    expect(() => validateAnswerAsk({ ...goodWordAsk(), cards: [card(), card({ title: 'Two' })] })).toThrow(
      /Only 2 usable cards/,
    );
  });

  it('drops cards that break a rule and keeps the rest', () => {
    const v = validateAnswerAsk({
      ...goodWordAsk(),
      cards: [
        ...goodWordAsk().cards,
        card({ title: 'Ask them', kind: 'ask_them' }), // ask_them on words → dropped
        card({ title: 'Long rule', rule: 'one two three four five six seven eight nine ten eleven twelve thirteen' }),
        card({ title: 'Fix with nothing', kind: 'fix' }), // fix without insteadOf
        card({ title: 'Bad track', track: 'grammar' }),
        card({ title: 'Bad register', register: 'formal' }),
        card({ title: 'No analogy', analogy: '' }),
        card({ title: 'Wrong type', type: 'word' }),
        card({ title: 'No level', level: 'two' }),
        card({ title: 'flag a problem' }), // repeats a title
        'not a card',
      ],
    });
    expect(v.cards.map((c) => c.title)).toEqual(['Flag a problem', 'Flag it early', 'Your turn: flag it']);
  });

  it('applies the 1.2 word limits per track', () => {
    const long = Array.from({ length: 16 }, (_, i) => `w${i}`).join(' ');
    const base = goodWordAsk().cards;
    // 16-word example: too long on words, fine on small talk.
    expect(() =>
      validateAnswerAsk({ ...goodWordAsk(), cards: [...base.slice(0, 2), card({ title: 'X', examples: { work: long, everyday: 'ok' } })] }),
    ).toThrow(/Only 2/);
    const st = validateAnswerAsk({
      ...goodWordAsk(),
      cards: [...base.slice(0, 2), card({ title: 'X', track: 'smalltalk', kind: 'ask_them', examples: { work: long, everyday: 'ok' } })],
    });
    expect(st.cards[2]?.kind).toBe('ask_them');
    // A 13-word rule is fine on stories (cap 15), not on words (cap 12).
    const rule13 = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    expect(validateAnswerAsk({ ...goodWordAsk(), cards: [...base.slice(0, 2), card({ title: 'S', track: 'stories', rule: rule13 })] }).cards).toHaveLength(3);
    // Analogy over 20 words, tryPrompt over 25 words.
    const w = (n: number) => Array.from({ length: n }, () => 'x').join(' ');
    for (const bad of [{ analogy: w(21) }, { tryPrompt: w(26) }, { insteadOf: w(21) }, { analogy: 'line one\nline two' }]) {
      expect(() => validateAnswerAsk({ ...goodWordAsk(), cards: [...base.slice(0, 2), card({ title: 'B', ...bad })] })).toThrow(/Only 2/);
    }
  });

  it('clamps sizes: at most 8 cards, level 1-5, title and answer cut cleanly', () => {
    const many = Array.from({ length: 11 }, (_, i) => card({ title: `Card ${i}` }));
    const v = validateAnswerAsk({ ...goodWordAsk(), cards: many });
    expect(v.cards).toHaveLength(8);

    const lv = validateAnswerAsk({
      ...goodWordAsk(),
      cards: [card({ level: 9 }), card({ title: 'B', level: 0 }), card({ title: 'C', level: 2.4 })],
    });
    expect(lv.cards.map((c) => c.level)).toEqual([5, 1, 2]);

    const longTitle = validateAnswerAsk({
      ...goodWordAsk(),
      cards: [card({ title: 'Flagging a problem early in the weekly stand-up meeting' }), ...goodWordAsk().cards.slice(1)],
    });
    expect(longTitle.cards[0]?.title.length).toBeLessThanOrEqual(40);
    expect(longTitle.cards[0]?.title).toBe('Flagging a problem early in the weekly');

    const sentence = 'This is one plain sentence about the word. ';
    const longAnswer = validateAnswerAsk({ ...goodWordAsk(), answer: sentence.repeat(20) });
    expect(longAnswer.answer.length).toBeLessThanOrEqual(ASK_ANSWER_MAX);
    expect(longAnswer.answer.endsWith('.')).toBe(true);
    const noStop = validateAnswerAsk({ ...goodWordAsk(), answer: 'word '.repeat(200) });
    expect(noStop.answer.length).toBeLessThanOrEqual(ASK_ANSWER_MAX);
    expect(noStop.answer.endsWith('…')).toBe(true);
  });

  it('fix_sentence: versions are required, chunks come from the [[markers]]', () => {
    const v = validateAnswerAsk(goodFixAsk());
    expect(v.askKind).toBe('fix_sentence');
    expect(v.versions?.crisp).toBe('[[Can we move]] the review to Friday?');
    // Marked chunks first, de-duplicated; a listed chunk that is in no version is dropped.
    expect(v.chunks).toEqual(['Can we move', 'move the review']);
    expect(v.weakSpot).toEqual({ wrong: 'kindly do the needful', right: 'could you please' });

    expect(() => validateAnswerAsk({ ...goodFixAsk(), versions: undefined })).toThrow(/needs "versions"/);
    expect(() =>
      validateAnswerAsk({ ...goodFixAsk(), versions: { ...goodFixAsk().versions, polite: ' ' } }),
    ).toThrow(/versions\.polite/);
    expect(() =>
      validateAnswerAsk({ ...goodFixAsk(), versions: { ...goodFixAsk().versions, crisp: 'Can we [[move it to Friday?' } }),
    ).toThrow(/broken \[\[chunk\]\] markers/);
    expect(() =>
      validateAnswerAsk({ ...goodFixAsk(), versions: { ...goodFixAsk().versions, crisp: '[[a [[b]] c]]' } }),
    ).toThrow(/broken/);
    expect(() =>
      validateAnswerAsk({ ...goodFixAsk(), versions: { ...goodFixAsk().versions, confident: 'x'.repeat(401) } }),
    ).toThrow(/too long/);

    // No markers and no real chunks → no chunks field, still valid.
    const plain = validateAnswerAsk({
      ...goodFixAsk(),
      versions: { crisp: 'Friday?', confident: "Let's do Friday.", polite: 'Could we do Friday?' },
      chunks: ['nowhere'],
    });
    expect(plain.chunks).toBeUndefined();
  });

  it('versions and chunks are dropped on other kinds; a bad weak spot is dropped, never fatal', () => {
    const { versions, chunks } = goodFixAsk();
    const v = validateAnswerAsk({ ...goodWordAsk(), versions, chunks });
    expect(v.versions).toBeUndefined();
    expect(v.chunks).toBeUndefined();

    for (const weakSpot of [null, 'x', { wrong: ' ', right: 'r' }, { wrong: 'Revert', right: 'revert' }, []]) {
      const r = validateAnswerAsk({ ...goodWordAsk(), weakSpot });
      expect(r.weakSpot).toBeUndefined();
      expect(r.cards).toHaveLength(3);
    }
    const long = validateAnswerAsk({ ...goodWordAsk(), weakSpot: { wrong: 'w'.repeat(80), right: 'r'.repeat(80) } });
    expect(long.weakSpot?.wrong).toHaveLength(60);
    expect(long.weakSpot?.right).toHaveLength(60);
  });

  it('safeParse: empty and broken JSON throw plainly; a ```json fence is stripped', () => {
    expect(() => safeParse('')).toThrow(/Empty response/);
    expect(() => safeParse('   ')).toThrow(/Empty response/);
    expect(() => safeParse('{"askKind":')).toThrow(/Malformed JSON/);
    // A sentence around the object is tolerated; the object inside is read.
    expect(safeParse('Sure! Here is your JSON: {}')).toEqual({});
    expect(safeParse('Here it is:\n{"a":3}\nHope this helps!')).toEqual({ a: 3 });
    expect(safeParse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeParse('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });
});

describe('answer_ask handler', () => {
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

  function ask(payload: unknown, prefer?: string) {
    ip += 1;
    return handler(
      new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.13.0.${ip}` },
        body: JSON.stringify({ task: 'answer_ask', payload, ...(prefer ? { prefer } : {}) }),
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
  const anthropic = (text: string) => ({ ok: true, json: async () => ({ content: [{ text }] }) });

  it('rejects bad payloads with a plain message and never calls a model', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const cases: Array<[unknown, RegExp | string]> = [
      [null, 'Invalid payload'],
      ['flag', 'Invalid payload'],
      [{}, 'Type a question first'],
      [{ text: '   ' }, 'Type a question first'],
      [{ text: 'x'.repeat(1001) }, /under 1000 characters/],
      [{ text: 'flag', avoid: ['ok', 3] }, 'Invalid payload'],
      [{ text: 'flag', avoid: Array.from({ length: 51 }, (_, i) => `a${i}`) }, 'Invalid payload'],
      [{ text: 'flag', levels: { grammar: 2 } }, 'Invalid payload'],
      [{ text: 'flag', levels: { words: 6 } }, 'Invalid payload'],
      [{ text: 'flag', levels: { words: 1.5 } }, 'Invalid payload'],
      [{ text: 'flag', levels: [1] }, 'Invalid payload'],
    ];
    for (const [payload, msg] of cases) {
      const res = await ask(payload);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(false);
      if (typeof msg === 'string') expect(data.error).toBe(msg);
      else expect(data.error).toMatch(msg);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(checkAnswerAskPayload({ text: 'flag', avoid: ['revert'], levels: { words: 2, stories: 1 } })).toBeNull();
  });

  it('returns the validated answer from the first provider', async () => {
    process.env.GEMINI_API_KEY = 'k';
    global.fetch = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify(goodFixAsk()))) as any;
    const res = await ask({ text: 'kindly do the needful and move the review', levels: { words: 1 } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.task).toBe('answer_ask');
    expect(data.provider).toBe('gemini');
    expect(data.data.versions.polite).toContain('Could we');
    expect(data.data.chunks).toEqual(['Can we move', 'move the review']);
    expect(data.data.cards).toHaveLength(3);
  });

  it('fails over to Groq when Gemini returns broken JSON', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(gemini('{"askKind":"word","answer":'))
      .mockResolvedValueOnce(groq(JSON.stringify(goodWordAsk()))) as any;
    const data = (await (await ask({ text: 'what does flag mean' })).json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.askKind).toBe('word');
  });

  it('fails over when a provider returns an empty answer, an empty reply, or too few cards', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(gemini(JSON.stringify({ ...goodWordAsk(), answer: '' })))
      .mockResolvedValueOnce(groq(''))
      .mockResolvedValueOnce(anthropic('```json\n' + JSON.stringify(goodWordAsk()) + '\n```')) as any;
    const data = (await (await ask({ text: 'what does flag mean' })).json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('anthropic');
    expect(data.data.cards).toHaveLength(3);

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(gemini(JSON.stringify({ ...goodWordAsk(), cards: [card()] })))
      .mockResolvedValueOnce(groq(JSON.stringify(goodWordAsk()))) as any;
    const second = (await (await ask({ text: 'what does flag mean' })).json()) as any;
    expect(second.provider).toBe('groq');
  });

  it('fails over on an HTTP error and on a fix_sentence without versions', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce(groq(JSON.stringify({ ...goodFixAsk(), versions: undefined }))) as any;
    const res = await ask({ text: 'pls do the needful' });
    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.data).toBeUndefined();
    expect(data.error).toMatch(/not set up|busy or unreachable|didn't pass/i);
    expect(data.error).not.toMatch(/http|versions|JSON/);
  });

  it('returns the plain unavailable message when no provider is set up or all fail', async () => {
    global.fetch = vi.fn() as any;
    const none = await ask({ text: 'what does flag mean' });
    expect(none.status).toBe(502);
    expect(((await none.json()) as any).error).toMatch(/not set up|busy or unreachable|didn't pass/i);
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
    const res = await ask({ text: 'what does flag mean' });
    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.data).toBeUndefined();
    expect(data.error).not.toMatch(/network down/);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('honours prefer and sends the answer_ask prompt with its rulebook slice', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(anthropic(JSON.stringify(goodWordAsk())));
    global.fetch = fetchSpy as any;
    const data = (await (await ask({ text: 'what does flag mean' }, 'anthropic')).json()) as any;
    expect(data.provider).toBe('anthropic');
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.system[0].text).toBe(systemFor('answer_ask'));
    expect(body.system[0].text.startsWith(rulebookFor('answer_ask'))).toBe(true);
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
    expect(JSON.parse(body.messages[0].content)).toEqual({ text: 'what does flag mean' });
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
    // Without a teach payload the old shapes still go through the classify clamps.
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

// ── coach_chat (step 5: the voice practice chat, rulebook §5) ──────────────

const TRANSCRIPT =
  'So basically we had a production outage on Monday and I revert back to the team by evening with the fix.';

const chatPayload = (over: Record<string, unknown> = {}) => ({
  question: 'Tell me about a hard day at work this month.',
  transcript: TRANSCRIPT,
  track: 'stories',
  ...over,
});

const goodChat = (over: Record<string, unknown> = {}) => ({
  good: 'You named the moment: "a production outage on Monday". One moment, not a timeline.',
  fixes: [
    { text: 'Add the stakes with but/so: what could have gone wrong?', lesson: 'Stories L1: but/so, not and-then' },
    { text: 'Drop the warm-up word and start with the moment.', lesson: 'Speak clearly L1: say the answer first' },
  ],
  better: 'On Monday we had a production outage. By evening I got back to the team with the fix.',
  slip: { wrong: 'revert back', right: 'get back' },
  ...over,
});

describe('coach_chat validator', () => {
  it('accepts good feedback and keeps only the contract fields', () => {
    const v = validateProviderOutput('coach_chat', { ...goodChat(), extra: 'x' }, chatPayload()) as any;
    expect(Object.keys(v).sort()).toEqual(['better', 'fixes', 'good', 'slip']);
    expect(v.fixes).toHaveLength(2);
    expect(v.fixes[0]).toEqual({ text: goodChat().fixes[0]!.text, lesson: 'Stories L1: but/so, not and-then' });
    expect(v.slip).toEqual({ wrong: 'revert back', right: 'get back' });
  });

  it('throws (so the next provider runs) on a missing part', () => {
    const p = chatPayload();
    expect(() => validateCoachChat(null, p)).toThrow(/must be an object/);
    expect(() => validateCoachChat([], p)).toThrow(/must be an object/);
    expect(() => validateCoachChat(goodChat({ good: ' ' }), p)).toThrow(/"good"/);
    expect(() => validateCoachChat(goodChat({ better: '' }), p)).toThrow(/"better"/);
    expect(() => validateCoachChat(goodChat({ fixes: 'add stakes' }), p)).toThrow(/"fixes"/);
    expect(() => validateCoachChat(goodChat({ fixes: [] }), p)).toThrow(/names its lesson/);
  });

  it('at most 2 fixes, each naming its lesson; a fix without one is dropped', () => {
    const three = validateCoachChat(
      goodChat({
        fixes: [{ text: 'No lesson here.' }, ...goodChat().fixes, { text: 'A third fix.', lesson: 'Words L2' }],
      }),
      chatPayload(),
    );
    expect(three.fixes.map((f) => f.lesson)).toEqual([
      'Stories L1: but/so, not and-then',
      'Speak clearly L1: say the answer first',
    ]);
    expect(() => validateCoachChat(goodChat({ fixes: [{ text: 'Add stakes.' }, 'x'] }), chatPayload())).toThrow(
      /names its lesson/,
    );
  });

  it('never quotes words that are not in the transcript', () => {
    const p = chatPayload();
    expect(() => validateCoachChat(goodChat({ good: 'You said "a major incident" clearly.' }), p)).toThrow(
      /not in the transcript/,
    );
    expect(() =>
      validateCoachChat(goodChat({ fixes: [{ text: 'Swap "kindly do the needful".', lesson: 'Words L1' }] }), p),
    ).toThrow(/not in the transcript/);
    // Case, punctuation, curly quotes and "..." gaps are fine when the words are his.
    const ok = validateCoachChat(
      goodChat({ good: 'You opened with “Production outage on Monday,” then "the team ... with the fix".' }),
      p,
    );
    expect(ok.good).toContain('Monday');
    // Point 1 must quote him at all.
    expect(() => validateCoachChat(goodChat({ good: 'Nice clear story.' }), p)).toThrow(/quotes none/);
    // A rewrite that keeps none of his words is invented, not his answer.
    expect(() => validateCoachChat(goodChat({ better: 'I love sunny weekends.' }), p)).toThrow(/his words/);
  });

  it('pace and loudness only when the phone measured them; no invented figures', () => {
    const noNumbers = chatPayload();
    const fix = (text: string) => goodChat({ fixes: [{ text, lesson: 'Speak clearly L2' }] });
    expect(() => validateCoachChat(fix('Slow down your pace a little.'), noNumbers)).toThrow(/pace/);
    expect(() => validateCoachChat(fix('Speak up so the room hears you.'), noNumbers)).toThrow(/loudness/);

    const measured = chatPayload({ wpm: 182, loudness: 'normal' });
    const paced = validateCoachChat(fix('At 182 wpm you were quick: slow down at the key line.'), measured);
    expect(paced.fixes[0]!.text).toContain('182 wpm');
    expect(() => validateCoachChat(fix('At 140 wpm you were fine.'), measured)).toThrow(/figure/);

    // Above his normal: never "project more" or "speak up" (rulebook §5.3).
    expect(() => validateCoachChat(fix('Project more on the last line.'), chatPayload({ loudness: 'above' }))).toThrow(
      /push harder/,
    );
    const easeOff = validateCoachChat(
      fix('You were louder than your normal: ease off and let it land.'),
      chatPayload({ loudness: 'above' }),
    );
    expect(easeOff.fixes[0]!.text).toContain('ease off');

    // Everyday words like "project" or "faster" are not voice comments.
    const project = validateCoachChat(fix('Name the project and get to the fix faster.'), noNumbers);
    expect(project.fixes[0]!.text).toContain('project');
  });

  it('the slip must be his own words; a watched mistake he repeated comes first', () => {
    const p = chatPayload();
    expect(validateCoachChat(goodChat({ slip: { wrong: 'do the needful', right: 'handle it' } }), p).slip).toBeNull();
    expect(validateCoachChat(goodChat({ slip: { wrong: 'revert back', right: 'Revert Back' } }), p).slip).toBeNull();
    expect(validateCoachChat(goodChat({ slip: { wrong: 'w'.repeat(61), right: 'r' } }), p).slip).toBeNull();
    expect(validateCoachChat(goodChat({ slip: 'revert back' }), p).slip).toBeNull();
    expect(validateCoachChat(goodChat({ slip: null }), p).slip).toBeNull();

    const watched = validateCoachChat(
      goodChat({ slip: null }),
      chatPayload({ watch: [{ wrong: 'basically', right: '(drop it)' }, { wrong: 'revert back', right: 'reply' }] }),
    );
    expect(watched.slip).toEqual({ wrong: 'basically', right: '(drop it)' });
  });

  it('a short answer is a nudge: no quote needed, still one fix with its lesson', () => {
    const v = validateCoachChat(
      {
        good: 'Thanks for starting.',
        fixes: [{ text: 'Add one detail: what did you eat?', lesson: 'Small talk L1: one real detail' }],
        better: 'It was good, I tried a new dosa place near the office.',
        slip: null,
      },
      chatPayload({ transcript: 'It was good.', track: 'smalltalk' }),
    );
    expect(v.fixes).toHaveLength(1);
  });

  it('clamps long lines at a sentence end', () => {
    const long = 'You named "a production outage on Monday" well. '.repeat(20);
    const v = validateCoachChat(
      goodChat({ good: long, better: 'On Monday we had a production outage. '.repeat(30) }),
      chatPayload(),
    );
    expect(v.good.length).toBeLessThanOrEqual(CHAT_POINT_MAX);
    expect(v.better.length).toBeLessThanOrEqual(CHAT_BETTER_MAX);
    expect(v.better.endsWith('.')).toBe(true);
  });
});

describe('coach_chat handler', () => {
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

  function chat(payload: unknown, prefer?: string) {
    ip += 1;
    return handler(
      new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.15.0.${ip}` },
        body: JSON.stringify({ task: 'coach_chat', payload, ...(prefer ? { prefer } : {}) }),
      }),
    );
  }

  const gemini = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });
  const groq = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const anthropic = (text: string) => ({ ok: true, json: async () => ({ content: [{ text }] }) });

  it('rejects bad payloads with a plain message and never calls a model', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const cases: Array<[unknown, RegExp | string]> = [
      [null, 'Invalid payload'],
      [[], 'Invalid payload'],
      [chatPayload({ question: ' ' }), /needs the question/],
      [chatPayload({ question: 'q'.repeat(501) }), 'Invalid payload'],
      [chatPayload({ transcript: undefined }), 'Invalid payload'],
      [chatPayload({ transcript: '   ' }), /didn't catch any words/],
      [chatPayload({ transcript: 'word '.repeat(1100) }), /too long for one turn/],
      [chatPayload({ track: 'grammar' }), 'Invalid payload'],
      [chatPayload({ wpm: '150' }), 'Invalid payload'],
      [chatPayload({ wpm: 0 }), 'Invalid payload'],
      [chatPayload({ wpm: 900 }), 'Invalid payload'],
      [chatPayload({ loudness: 'shouting' }), 'Invalid payload'],
      [chatPayload({ voicedSec: -1 }), 'Invalid payload'],
      [
        chatPayload({ watch: Array.from({ length: 11 }, (_, i) => ({ wrong: `w${i}`, right: `r${i}` })) }),
        'Invalid payload',
      ],
      [chatPayload({ watch: [{ wrong: 'revert back' }] }), 'Invalid payload'],
    ];
    for (const [payload, msg] of cases) {
      const res = await chat(payload);
      expect(res.status, JSON.stringify(payload)?.slice(0, 80)).toBe(400);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(false);
      if (typeof msg === 'string') expect(data.error).toBe(msg);
      else expect(data.error).toMatch(msg);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      checkCoachChatPayload(
        chatPayload({ wpm: 150, loudness: 'above', voicedSec: 30, watch: [{ wrong: 'a', right: 'b' }] }),
      ),
    ).toBeNull();
  });

  it('Haiku coaches first: Anthropic is called before Gemini without any prefer', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(anthropic(JSON.stringify(goodChat())));
    global.fetch = fetchSpy as any;
    const res = await chat(chatPayload({ wpm: 150, loudness: 'normal' }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.task).toBe('coach_chat');
    expect(data.provider).toBe('anthropic');
    expect(data.data.fixes).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('api.anthropic.com');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.system[0].text).toBe(systemFor('coach_chat'));
    expect(body.system[0].text.startsWith(rulebookFor('coach_chat'))).toBe(true);
    expect(JSON.parse(body.messages[0].content).wpm).toBe(150);
  });

  it('no Anthropic key: falls back to Gemini', async () => {
    process.env.GEMINI_API_KEY = 'k';
    global.fetch = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify(goodChat()))) as any;
    const data = (await (await chat(chatPayload())).json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('gemini');
  });

  it('provider error, bad JSON and a rule-breaking reply each fail over to the next provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 529, json: async () => ({}) }) // anthropic overloaded
      .mockResolvedValueOnce(gemini('{"good":"You said')) // broken JSON
      .mockResolvedValueOnce(groq(JSON.stringify(goodChat()))) as any;
    const data = (await (await chat(chatPayload())).json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(anthropic(JSON.stringify(goodChat({ good: 'You said "a big win" well.' }))))
      .mockResolvedValueOnce(gemini(JSON.stringify(goodChat()))) as any;
    const second = (await (await chat(chatPayload())).json()) as any;
    expect(second.provider).toBe('gemini');
    expect(second.data.good).toContain('production outage');
  });

  it('honours an explicit prefer over the Haiku default', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(groq(JSON.stringify(goodChat())));
    global.fetch = fetchSpy as any;
    const data = (await (await chat(chatPayload(), 'groq')).json()) as any;
    expect(data.provider).toBe('groq');
    expect((fetchSpy.mock.calls[0] as [string])[0]).toContain('api.groq.com');
  });

  it('no keys, or every provider failing: the plain unavailable message, no fake coaching', async () => {
    global.fetch = vi.fn() as any;
    const none = await chat(chatPayload());
    expect(none.status).toBe(502);
    expect(((await none.json()) as any).error).toMatch(/not set up|busy or unreachable|didn't pass/i);
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'k';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(gemini(''))
      .mockResolvedValueOnce(
        groq(JSON.stringify(goodChat({ fixes: [{ text: 'Slow your pace.', lesson: 'L2' }] }))),
      ) as any;
    const res = await chat(chatPayload());
    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.data).toBeUndefined();
    expect(data.error).not.toMatch(/http|JSON|pace|transcript/i);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
