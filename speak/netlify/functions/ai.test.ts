import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import handler, { validateProviderOutput } from './ai';

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
});
