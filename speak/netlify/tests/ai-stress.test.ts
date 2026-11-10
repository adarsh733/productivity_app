import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { safeParse, validateExpandSeed } from '../functions/ai';

/**
 * The stress run of 2026-10-29, kept as a test: realistic bad inputs and bad
 * model replies, and what a careful coach should do with each. Cases the code
 * cannot judge (a Hinglish example, a rewrite that invents a fact) belong to
 * the second-model check and the prompts, not to these validators.
 *
 * 2026-11-10 (v7 trim): the Ask and evening chat cases left with answer_ask and
 * coach_chat; the whole-function cases now run on the three kept tasks.
 * 2026-11-10 (v8): plus the Ask box task tell_app.
 */

const card = (o: Record<string, unknown> = {}) => ({
  type: 'teach',
  track: 'words',
  level: 1,
  kind: 'learn',
  category: 'Meaning',
  title: 'Flag means raise',
  rule: 'To flag means to point out a problem early.',
  examples: { work: 'I flagged the delay to my manager.', everyday: 'She flagged the wrong bill.' },
  analogy: 'Like raising a small red flag on a map.',
  tryPrompt: 'Flag one risk in your project today.',
  register: 'both',
  ...o,
});
const cards = (n: number, o: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => card({ title: `Card number ${i + 1}`, ...o }));
describe('Model replies wrapped in extra words', () => {
  it('a sentence or a fence around the JSON is tolerated; a cut-off reply is not', () => {
    expect(safeParse('Here is the JSON:\n{"a":1}')).toEqual({ a: 1 });
    expect(safeParse('```json\n{"a":1}\n```\nHope this helps!')).toEqual({ a: 1 });
    expect(() => safeParse('{"cards":[{"type":"teach","tit')).toThrow(/Malformed/);
  });
});

describe('Top-up keeps only what was asked for', () => {
  it('asked for 3, model sent 5: 3 are kept', () => {
    const r = validateExpandSeed({ cards: cards(5) }, { type: 'teach', track: 'words', count: 3 }) as { cards: unknown[] };
    expect(r.cards).toHaveLength(3);
  });
});

describe('Whole function: honest reasons, and a checker never checks itself', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const post = (body: unknown) =>
    handler(new Request('http://x/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const reply = (text: string) => async (url: string | URL | Request) => {
    const u = String(url);
    const body = u.includes('anthropic')
      ? { content: [{ text }] }
      : u.includes('groq')
        ? { choices: [{ message: { content: text } }] }
        : { candidates: [{ content: { parts: [{ text }] } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  it('a removed task name is refused as bad input and never reaches a model', async () => {
    process.env.GEMINI_API_KEY = 'x';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;
    for (const task of ['answer_ask', 'coach_chat', 'review_recording', 'classify_inbox']) {
      const res = await post({ task, payload: { text: 'flag', transcript: 'one two three four five six', question: 'q', track: 'words' } });
      expect(res.status, task).toBe(400);
      const data = (await res.json()) as { reason: string; error: string };
      expect(data.reason, task).toBe('bad_input');
      expect(data.error, task).toBe('unknown task');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no keys at all: reason no_key, plain words', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await post({ task: 'verify_batch', payload: { items: [] } });
    const data = (await res.json()) as { reason: string; error: string };
    expect(data.reason).toBe('no_key');
    expect(data.error).toMatch(/not set up/);
  });

  it('every model answers badly: reason bad_reply', async () => {
    process.env.GEMINI_API_KEY = 'x';
    process.env.GROQ_API_KEY = 'x';
    global.fetch = vi.fn(reply('{"nope":1}')) as never;
    const data = (await (await post({ task: 'verify_batch', payload: { items: [] } })).json()) as { reason: string };
    expect(data.reason).toBe('bad_reply');
  });

  it('a network failure: reason busy', async () => {
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn().mockRejectedValue(new Error('down')) as never;
    const data = (await (await post({ task: 'plan_week', payload: { types: [{ type: 'word' }] } })).json()) as { reason: string };
    expect(data.reason).toBe('busy');
  });

  it('tell_app: a model that teaches instead of listening is cut short; junk is bad_reply', async () => {
    process.env.GEMINI_API_KEY = 'x';
    const ask = { text: 'What is the difference between fewer and less?', themes: ['Money', 'General'], levels: {}, recent: [] };
    const lesson =
      'This box tells the app what to show. Fewer is for things you can count. Less is for things you cannot count, like water or time, and many people mix them up.';
    global.fetch = vi.fn(reply(JSON.stringify({ reply: lesson, learned: [{ kind: 'answer', text: 'fewer vs less' }] }))) as never;
    const ok = (await (await post({ task: 'tell_app', payload: ask })).json()) as { ok: boolean; data: { reply: string; learned: unknown[] } };
    expect(ok.ok).toBe(true);
    expect(ok.data.reply).toBe('This box tells the app what to show. Fewer is for things you can count.');
    expect(ok.data.learned).toEqual([]);

    global.fetch = vi.fn(reply('{"answer":"fewer"}')) as never;
    const bad = (await (await post({ task: 'tell_app', payload: ask })).json()) as { reason: string };
    expect(bad.reason).toBe('bad_reply');
  });

  it('a refused request: reason bad_input with plain words', async () => {
    const data = (await (await post({ task: 'expand_seed', payload: { type: 'teach', track: 'words', count: 99 } })).json()) as { reason: string; error: string };
    expect(data.reason).toBe('bad_input');
    expect(data.error).toBe('Invalid count');
  });

  it('exclude is strict: the checker never falls back to the writer', async () => {
    process.env.GEMINI_API_KEY = 'x';
    process.env.GROQ_API_KEY = 'x';
    const fetchSpy = vi.fn().mockRejectedValue(new Error('groq 429'));
    global.fetch = fetchSpy as never;
    const res = await post({ task: 'verify_batch', payload: { items: [] }, prefer: 'groq', exclude: ['gemini'] });
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('generativelanguage'))).toBe(false);
    expect(((await res.json()) as { reason: string }).reason).toBe('busy');
  });

  it('only the writer has a key: reason no_key, "needs a second AI key"', async () => {
    process.env.GEMINI_API_KEY = 'x';
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = vi.fn() as never;
    const data = (await (await post({ task: 'verify_batch', payload: { items: [] }, exclude: ['gemini'] })).json()) as { reason: string; error: string };
    expect(data.reason).toBe('no_key');
    expect(data.error).toMatch(/second AI key/);
  });

  it('a junk exclude list is refused', async () => {
    const res = await post({ task: 'verify_batch', payload: { items: [] }, exclude: ['openai'] });
    expect(res.status).toBe(400);
  });
});

describe('Live 2026-11-09: failures say why, and Haiku gets a request it accepts', () => {
  const originalEnv = process.env;
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
  const post = (body: unknown) =>
    handler(new Request('http://x/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  /** A v5 teach top-up: the kept expand_seed path these live failures now run on. */
  const TOP_UP = { type: 'teach', track: 'words', count: 3 };
  const errorBody = (message: string) => JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } });

  it("the provider's own error message (at most 200 characters) is in the logged failure reason; never the key", async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-key-123456';
    process.env.GROQ_API_KEY = 'gsk_secretgroqkey123';
    const long = 'temperature: only the default value is supported for this model. ' + 'x'.repeat(400);
    global.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('anthropic')
        ? new Response(errorBody(long), { status: 400 })
        : new Response(errorBody('Rate limit reached for gsk_secretgroqkey123'), { status: 429 }),
    ) as never;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await post({ task: 'expand_seed', payload: { ...TOP_UP, topics: ['what does flag mean'] } });
    expect(res.status).toBe(502);
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes('expand_seed failed')) ?? '';
    expect(line).toContain('anthropic: http 400: temperature: only the default value is supported');
    expect(line).toContain('groq: http 429: Rate limit reached for [key]');
    const anthropicPart = line.split(' | ').find((p) => p.startsWith('anthropic:')) ?? '';
    expect(anthropicPart.length).toBeLessThanOrEqual('anthropic: http 400: '.length + 200);
    expect(line).not.toContain('sk-ant-secret');
    expect(line).not.toContain('gsk_secret');
    expect(line).not.toContain('what does flag mean'); // never the payload
    // The phone still gets plain words, not the provider's message.
    expect(JSON.stringify(await res.json())).not.toContain('temperature');
  });

  it('an error page that is not JSON still logs a short snippet; an empty one logs just the status', async () => {
    process.env.ANTHROPIC_API_KEY = 'x';
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('anthropic')
        ? new Response('<html><body>Service Unavailable</body></html>', { status: 503 })
        : new Response('', { status: 503 }),
    ) as never;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await post({ task: 'expand_seed', payload: TOP_UP });
    const line = String(warn.mock.calls.at(-1)?.[0]);
    expect(line).toContain('gemini: http 503 |');
    expect(line).toContain('anthropic: http 503: Service Unavailable');
  });

  it('Haiku is sent no temperature, and a reply that starts with a thinking block is read from its text block', async () => {
    process.env.ANTHROPIC_API_KEY = 'x';
    const good = JSON.stringify({ cards: [...cards(2), card({ title: 'Try it', kind: 'try' })] });
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: good }] }), { status: 200 }),
    );
    global.fetch = fetchSpy as never;
    const res = await post({ task: 'expand_seed', payload: TOP_UP });
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).not.toHaveProperty('temperature');
    expect(sent.model).toBe('claude-haiku-5-5');
    const data = (await res.json()) as { ok: boolean; provider: string; data: { cards: { kind: string; answer?: string }[] } };
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('anthropic');
    // A Try card with nothing to reveal is dropped; never a Try card without an answer.
    expect(data.data.cards).toHaveLength(2);
    expect(data.data.cards.some((c) => c.kind === 'try' && !c.answer)).toBe(false);
  });
});
