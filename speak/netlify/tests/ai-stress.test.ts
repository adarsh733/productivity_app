import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, {
  checkAnswerAskPayload,
  safeParse,
  validateAnswerAsk,
  validateCoachChat,
  validateExpandSeed,
} from '../functions/ai';

/**
 * The stress run of 2026-10-29, kept as a test: realistic bad inputs and bad
 * model replies, and what a careful coach should do with each. Cases the code
 * cannot judge (a Hinglish example, a rewrite that invents a fact) belong to
 * the second-model check and the prompts, not to these validators.
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
const ask = (o: Record<string, unknown> = {}) => ({
  askKind: 'word',
  answer: 'To flag something means to point it out.',
  topics: [],
  cards: cards(3),
  ...o,
});
const Q = (text: string) => ({ text });

describe('Ask: any kind of question', () => {
  it('an off-topic question answers with 0-2 cards instead of failing', () => {
    const r = validateAnswerAsk(ask({ askKind: 'other', answer: 'I help with speaking, not weather.', cards: [] }), Q('weather?'));
    expect(r.cards).toHaveLength(0);
    const r2 = validateAnswerAsk(ask({ askKind: 'other', cards: cards(5) }), Q('weather?'));
    expect(r2.cards).toHaveLength(2);
  });

  it('other kinds still need 3 good cards', () => {
    expect(() => validateAnswerAsk(ask({ cards: cards(1) }), Q('what does flag mean'))).toThrow(/need 3/);
  });

  it('a wish is understood and cleaned: tracks, topics, never-show words, a note', () => {
    const r = validateAnswerAsk(
      ask({
        askKind: 'preference',
        answer: 'Got it: more cricket small talk.',
        cards: [],
        preference: { topics: ['cricket', ''], moreOf: ['smalltalk', 'small talk'], easier: ['words'], avoid: ['revert back'], note: 'More cricket small talk, easier words' },
      }),
      Q('give me more cricket small talk and easier words, never show revert back'),
    );
    expect(r.preference).toEqual({
      note: 'More cricket small talk, easier words',
      topics: ['cricket'],
      avoid: ['revert back'],
      moreOf: ['smalltalk'],
      easier: ['words'],
    });
  });

  it('a wish with nothing usable fails over (the next model gets a turn)', () => {
    expect(() => validateAnswerAsk(ask({ askKind: 'preference', cards: [], preference: { note: '' } }), Q('x'))).toThrow(/preference/);
  });

  it('markdown in the short answer is turned into plain text', () => {
    const r = validateAnswerAsk(ask({ answer: '**Flag** means to _point out_.\n- use it at work' }), Q('flag'));
    expect(r.answer).toBe('Flag means to point out. use it at work');
  });

  it('a weak spot must be words he typed', () => {
    expect(validateAnswerAsk(ask({ weakSpot: { wrong: 'flag', right: 'point out' } }), Q('what does raise mean')).weakSpot).toBeUndefined();
    expect(
      validateAnswerAsk(ask({ askKind: 'mistake', weakSpot: { wrong: 'discuss about', right: 'discuss' } }), Q("is 'discuss about' okay?")).weakSpot,
    ).toEqual({ wrong: 'discuss about', right: 'discuss' });
  });

  it('a Try card with nothing to reveal becomes a Learn card; never a Try card without an answer', () => {
    const r = validateAnswerAsk(ask({ cards: cards(3, { kind: 'try' }) }), Q('flag'));
    expect(r.cards).toHaveLength(3);
    expect(r.cards.every((c) => c.kind === 'learn' && c.answer === undefined)).toBe(true);
  });

  it('live 2026-11-09: one Try card missing its answer no longer costs the whole reply', () => {
    const r = validateAnswerAsk(
      ask({
        cards: [
          card({ title: 'Flag means raise' }),
          card({ title: 'Flag it early', kind: 'use' }),
          card({ title: 'Try flagging', kind: 'try', answer: '   ' }),
          card({ title: 'Say it your way', kind: 'try', answer: 'I flagged the delay this morning.' }),
        ],
      }),
      Q('what does flag mean'),
    );
    expect(r.cards).toHaveLength(4);
    expect(r.cards.filter((c) => c.kind === 'try' && !c.answer)).toHaveLength(0);
    expect(r.cards.find((c) => c.title === 'Try flagging')?.kind).toBe('learn');
    expect(r.cards.find((c) => c.title === 'Say it your way')).toMatchObject({ kind: 'try', answer: 'I flagged the delay this morning.' });
  });

  it('3 cards sent and 1 breaks a rule: the 2 good ones are served; 2 sent is still too few', () => {
    const r = validateAnswerAsk(ask({ cards: [...cards(2), card({ title: 'Ask them', kind: 'ask_them' })] }), Q('flag'));
    expect(r.cards).toHaveLength(2);
    expect(() => validateAnswerAsk(ask({ cards: [...cards(1), card({ title: 'Ask them', kind: 'ask_them' })] }), Q('flag'))).toThrow(
      /Only 1 usable cards \(need 3\)/,
    );
    expect(() =>
      validateAnswerAsk(ask({ cards: [...cards(1), card({ title: 'X', kind: 'ask_them' }), card({ title: 'Y', kind: 'ask_them' })] }), Q('flag')),
    ).toThrow(/Only 1 usable cards \(need 2\)/);
  });

  it('topics: specific subjects kept, generic ones dropped, max 3', () => {
    const r = validateAnswerAsk(ask({ topics: ['English', 'client calls', 'cricket', 'speaking', 'standups', 'appraisal'] }), Q('x'));
    expect(r.topics).toEqual(['client calls', 'cricket', 'standups']);
  });

  it('input: emoji and Hindi pass to the model; empty, too long and bad memory are refused', () => {
    expect(checkAnswerAskPayload({ text: 'मुझे meeting में कैसे बोलना चाहिए?' })).toBeNull();
    expect(checkAnswerAskPayload({ text: '   ' })).toMatch(/Type a question/);
    expect(checkAnswerAskPayload({ text: 'a'.repeat(1500) })).toMatch(/under 1000/);
    expect(checkAnswerAskPayload({ text: 'hi', learner: { topics: ['cricket'], notes: ['more stories'], watch: [{ wrong: 'a', right: 'b' }] } })).toBeNull();
    expect(checkAnswerAskPayload({ text: 'hi', learner: { watch: [{ wrong: '', right: 'b' }] } })).toBe('Invalid payload');
  });
});

describe('Model replies wrapped in extra words', () => {
  it('a sentence or a fence around the JSON is tolerated; a cut-off reply is not', () => {
    expect(safeParse('Here is the JSON:\n{"a":1}')).toEqual({ a: 1 });
    expect(safeParse('```json\n{"a":1}\n```\nHope this helps!')).toEqual({ a: 1 });
    expect(() => safeParse('{"cards":[{"type":"teach","tit')).toThrow(/Malformed/);
  });
});

describe('Evening chat coaching: fair, never invented', () => {
  const T =
    'So basically yesterday I led the migration of our billing service and it went fine, we finished before the deadline.';
  const chat = (o: Record<string, unknown> = {}) => ({
    good: 'You said "I led the migration", which puts you in the story.',
    fixes: [{ text: 'Say the result first: we finished early.', lesson: 'Speak clearly: say the answer first' }],
    better: 'We finished the billing migration before the deadline. I led it.',
    slip: null,
    ...o,
  });
  const P = (o: Record<string, unknown> = {}) => ({ question: 'What did you do yesterday?', transcript: T, track: 'stories', ...o });
  const fix = (text: string) => ({ fixes: [{ text, lesson: 'Stories: clean last line' }] });

  it("praise in 'single quotes' counts as quoting him", () => {
    expect(() => validateCoachChat(chat({ good: "You said 'I led the migration', which puts you in the story." }), P())).not.toThrow();
  });

  it("an invented quote is caught in 'single' or \"double\" quotes", () => {
    expect(() => validateCoachChat(chat({ good: 'Nice: "I led the migration". You also said \'I am very proud\'.' }), P())).toThrow(/not in the transcript/);
    expect(() => validateCoachChat(chat({ good: 'You said "I am very proud of my team".' }), P())).toThrow(/not in the transcript/);
  });

  it("apostrophes are not quotes (don't, the team's)", () => {
    expect(() => validateCoachChat(chat({ ...fix("Don't bury the team's result; say it first.") }), P())).not.toThrow();
  });

  it('content words are allowed with no measured numbers: softer word, rushed ending, quiet weekend, say it out loud', () => {
    for (const t of [
      'Use a softer word than basically: try actually.',
      'The ending felt rushed; add one detail.',
      'Name one detail, like a quiet weekend before the launch.',
      'Say the first line out loud once more.',
    ]) {
      expect(() => validateCoachChat(chat(fix(t)), P())).not.toThrow();
    }
  });

  it('voice tips still need the measured number', () => {
    expect(() => validateCoachChat(chat(fix('Speak faster to sound confident.')), P())).toThrow(/pace/);
    expect(() => validateCoachChat(chat(fix('Speak up so people hear you.')), P())).toThrow(/loudness/);
  });

  it('above his normal: "no need to speak up" is fine, "project your voice" is not', () => {
    expect(() => validateCoachChat(chat(fix('No need to speak up so hard; ease off a little.')), P({ loudness: 'above' }))).not.toThrow();
    expect(() => validateCoachChat(chat(fix('Project your voice more.')), P({ loudness: 'above' }))).toThrow(/push harder/);
  });

  it('a pace figure in any spelling must be the measured one', () => {
    for (const t of ['At 90 wpm you were calm.', 'At 90 words/min you were calm.', 'At 90 words a minute you were calm.', 'At 90 words per min you were calm.']) {
      expect(() => validateCoachChat(chat(fix(t)), P({ wpm: 150 }))).toThrow(/pace figure/);
    }
    expect(() => validateCoachChat(chat(fix('At 150 words/min you were clear.')), P({ wpm: 150 }))).not.toThrow();
  });

  it('a slip he never said is dropped; Hinglish quotes are his words', () => {
    expect(validateCoachChat(chat({ slip: { wrong: 'discuss about', right: 'discuss' } }), P()).slip).toBeNull();
    expect(() =>
      validateCoachChat(
        chat({ good: 'You said "it went fine yaar", which is warm.', better: 'It went fine, we finished early.' }),
        P({ transcript: 'Haan so it went fine yaar, we finished early only.' }),
      ),
    ).not.toThrow();
  });

  it('topics he talked about come back, cleaned', () => {
    const r = validateCoachChat(chat({ topics: ['billing migration', 'English', 'deadline'] }), P());
    expect(r.topics).toEqual(['billing migration', 'deadline']);
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

  it('an off-topic question gets a polite answer, not "AI unavailable"', async () => {
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn(reply(JSON.stringify({ askKind: 'other', answer: 'I help with speaking.', topics: [], cards: [] }))) as never;
    const res = await post({ task: 'answer_ask', payload: { text: 'what is the weather today' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { askKind: string } }).data.askKind).toBe('other');
  });

  it('no keys at all: reason no_key, plain words', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await post({ task: 'answer_ask', payload: { text: 'flag' } });
    const data = (await res.json()) as { reason: string; error: string };
    expect(data.reason).toBe('no_key');
    expect(data.error).toMatch(/not set up/);
  });

  it('every model answers badly: reason bad_reply', async () => {
    process.env.GEMINI_API_KEY = 'x';
    process.env.GROQ_API_KEY = 'x';
    global.fetch = vi.fn(reply('{"nope":1}')) as never;
    const data = (await (await post({ task: 'answer_ask', payload: { text: 'flag' } })).json()) as { reason: string };
    expect(data.reason).toBe('bad_reply');
  });

  it('a network failure: reason busy', async () => {
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn().mockRejectedValue(new Error('down')) as never;
    const data = (await (await post({ task: 'answer_ask', payload: { text: 'flag' } })).json()) as { reason: string };
    expect(data.reason).toBe('busy');
  });

  it('a refused request: reason bad_input with his plain words', async () => {
    const data = (await (await post({ task: 'answer_ask', payload: { text: 'a'.repeat(1200) } })).json()) as { reason: string; error: string };
    expect(data.reason).toBe('bad_input');
    expect(data.error).toMatch(/under 1000/);
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

describe('Live 2026-11-09: answer_ask failures say why, and Haiku gets a request it accepts', () => {
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
    const res = await post({ task: 'answer_ask', payload: { text: 'what does flag mean' } });
    expect(res.status).toBe(502);
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes('answer_ask failed')) ?? '';
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
    await post({ task: 'answer_ask', payload: { text: 'flag' } });
    const line = String(warn.mock.calls.at(-1)?.[0]);
    expect(line).toContain('gemini: http 503 |');
    expect(line).toContain('anthropic: http 503: Service Unavailable');
  });

  it('Haiku is sent no temperature, and a reply that starts with a thinking block is read from its text block', async () => {
    process.env.ANTHROPIC_API_KEY = 'x';
    const good = JSON.stringify(ask({ cards: [...cards(2), card({ title: 'Try it', kind: 'try' })] }));
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: good }] }), { status: 200 }),
    );
    global.fetch = fetchSpy as never;
    const res = await post({ task: 'answer_ask', payload: { text: 'what does flag mean' } });
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).not.toHaveProperty('temperature');
    expect(sent.model).toBe('claude-haiku-5-5');
    const data = (await res.json()) as { ok: boolean; provider: string; data: { cards: { kind: string; answer?: string }[] } };
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('anthropic');
    expect(data.data.cards).toHaveLength(3);
    expect(data.data.cards.some((c) => c.kind === 'try' && !c.answer)).toBe(false);
  });
});
