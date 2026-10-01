import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import handler, { validateProviderOutput } from '../functions/ai';

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
    expect(data.error).toMatch(/unavailable/i);
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
