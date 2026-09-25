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

  it('Returns explicit 502 unavailable response when all providers fail (zero generic coaching)', async () => {
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
    expect(data.error).toBeDefined();
  });
});
