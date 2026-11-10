import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TellAppRequest } from '../../src/types/contract';
import { THEMES } from '../../src/types/contract';
import handler, {
  TELL_LEARNED_MAX,
  TELL_REPLY_MAX,
  checkTellAppPayload,
  systemFor,
  validateProviderOutput,
  validateTellApp,
} from '../functions/ai';
import { rulebookFor } from '../rulebook';

// v8 (2026-11-10): the Ask box, server task `tell_app` (rulebook chapter 10).
// Every model reply here is fake: no key, no network.

type Raw = Record<string, unknown>;

const request = (over: Partial<TellAppRequest> = {}): TellAppRequest => ({
  text: 'Words are too easy. More about money please, and I want cricket cards.',
  themes: [...THEMES],
  levels: { words: 2, smalltalk: 2 },
  recent: [{ said: 'Hi', reply: 'Tell me what you want to see more or less of.' }],
  ...over,
});

describe('validateTellApp: the reply and what it learned', () => {
  it('keeps a good reply and every good learned item', () => {
    const out = validateTellApp(
      {
        reply: 'Got it: Words gets harder now, with more Money and a new Cricket topic.',
        learned: [
          { kind: 'level', module: 'words', delta: 1 },
          { kind: 'more', theme: 'money' },
          { kind: 'new_theme', theme: 'cricket' },
          { kind: 'wish', note: 'Examples from cricket matches.' },
        ],
      },
      request(),
    );
    expect(out).toEqual({
      reply: 'Got it: Words gets harder now, with more Money and a new Cricket topic.',
      learned: [
        { kind: 'level', module: 'words', delta: 1 },
        { kind: 'more', theme: 'Money' },
        { kind: 'new_theme', theme: 'Cricket' },
        { kind: 'wish', note: 'Examples from cricket matches.' },
      ],
    });
  });

  it('drops bad kinds and bad items, keeps the good ones, at most 4', () => {
    const out = validateTellApp(
      {
        reply: 'Done.',
        learned: [
          { kind: 'answer', text: 'Use "fewer" with things you can count.' }, // not a kind
          { kind: 'more', theme: 'Space' }, // not in themes
          { kind: 'fewer' }, // no theme
          { kind: 'level', module: 'words', delta: 2 }, // delta must be 1 or -1
          { kind: 'level', module: 'words', delta: '1' },
          { kind: 'wish', note: '' },
          { kind: 'wish', note: 'More cards, yaar.' }, // Hindi
          { kind: 'new_theme', theme: 'A very long topic name with many words' },
          { kind: 'new_theme', theme: '<script>' },
          'more money',
          null,
          { kind: 'fewer', theme: 'Work' },
          { kind: 'fewer', theme: 'work' }, // a repeat
          { kind: 'new_theme', theme: 'Food' }, // already a topic: more of it
          { kind: 'level', module: 'smalltalk', delta: -1 },
          { kind: 'wish', note: 'Shorter stories.' },
          { kind: 'wish', note: 'One too many.' },
        ],
      },
      request(),
    );
    expect(out.learned).toHaveLength(TELL_LEARNED_MAX);
    expect(out.learned).toEqual([
      { kind: 'fewer', theme: 'Work' },
      { kind: 'more', theme: 'Food' },
      { kind: 'level', module: 'smalltalk', delta: -1 },
      { kind: 'wish', note: 'Shorter stories.' },
    ]);
  });

  it('a missing learned list is an empty one', () => {
    expect(validateTellApp({ reply: 'This box tells the app what to show.' }, request()).learned).toEqual([]);
  });

  it('refuses a learned level for an unknown module', () => {
    const out = validateTellApp(
      { reply: 'Done.', learned: [{ kind: 'level', module: 'poetry', delta: 1 }, { kind: 'level', delta: 1 }] },
      request(),
    );
    expect(out.learned).toEqual([]);
  });

  it('cuts an over-long reply to two sentences, then to 240 characters', () => {
    const three = validateTellApp(
      { reply: 'Got it: more Money cards. Words gets harder now. I also think you should read more books every day.', learned: [] },
      request(),
    );
    expect(three.reply).toBe('Got it: more Money cards. Words gets harder now.');

    const longSecond = `Got it: more Money cards. ${'And then some more words here '.repeat(10)}.`;
    expect(validateTellApp({ reply: longSecond }, request()).reply).toBe('Got it: more Money cards.');

    const oneLong = `Got it ${'and more words '.repeat(30)}done`;
    const cut = validateTellApp({ reply: oneLong }, request()).reply;
    expect(cut.length).toBeLessThanOrEqual(TELL_REPLY_MAX);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/\s…$/);

    expect(validateTellApp({ reply: '**Got it:**   more   Money.' }, request()).reply).toBe('Got it: more Money.');
  });

  it('no reply, or Hindi in the reply, throws so the next provider is tried', () => {
    expect(() => validateTellApp({ learned: [] }, request())).toThrow(/reply/);
    expect(() => validateTellApp({ reply: '   ' }, request())).toThrow(/reply/);
    expect(() => validateTellApp({ reply: 'Accha, more Money cards now.' }, request())).toThrow(/Hindi/);
    expect(() => validateTellApp({ reply: 'ठीक है।' }, request())).toThrow(/Hindi/);
    expect(() => validateTellApp([], request())).toThrow();
  });

  it('a topic the request added via Ask counts as known', () => {
    const out = validateTellApp({ reply: 'More cricket.', learned: [{ kind: 'more', theme: 'Cricket' }] }, request({ themes: [...THEMES, 'Cricket'] }));
    expect(out.learned).toEqual([{ kind: 'more', theme: 'Cricket' }]);
  });

  it('is what validateProviderOutput runs for tell_app', () => {
    expect(validateProviderOutput('tell_app', { reply: 'Done.', learned: [] }, request())).toEqual({ reply: 'Done.', learned: [] });
  });
});

describe('checkTellAppPayload', () => {
  it('accepts a good request, with or without levels and turns', () => {
    expect(checkTellAppPayload(request())).toBeNull();
    expect(checkTellAppPayload(request({ levels: {}, recent: [] }))).toBeNull();
    expect(checkTellAppPayload(request({ text: 'x'.repeat(1000) }))).toBeNull();
  });

  it.each([
    ['no payload', null],
    ['no text', { ...request(), text: undefined }],
    ['empty text', request({ text: '   ' })],
    ['text over 1,000 characters', request({ text: 'x'.repeat(1001) })],
    ['no themes', { ...request(), themes: undefined }],
    ['21 themes', request({ themes: Array.from({ length: 21 }, (_, k) => `T${k}`) })],
    ['an unknown module in levels', { ...request(), levels: { poetry: 2 } }],
    ['level 6', request({ levels: { words: 6 as never } })],
    ['levels as a list', { ...request(), levels: [2, 3] }],
    ['6 recent turns', request({ recent: Array.from({ length: 6 }, () => ({ said: 'a', reply: 'b' })) })],
    ['a recent turn with no reply', { ...request(), recent: [{ said: 'a' }] }],
  ] as [string, unknown][])('refuses %s', (_name, payload) => {
    expect(checkTellAppPayload(payload)).not.toBeNull();
  });
});

describe('tell_app through the handler (fake model replies)', () => {
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

  function post(payload: unknown) {
    ip += 1;
    return handler(
      new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.19.0.${ip}` },
        body: JSON.stringify({ task: 'tell_app', payload }),
      }),
    );
  }

  const gemini = (text: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
  const groq = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

  it('a good reply: the checked result, the chapter 10 prompt, cool and short', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      gemini(JSON.stringify({ reply: 'Got it: Words gets harder now, and more Money.', learned: [{ kind: 'level', module: 'words', delta: 1 }, { kind: 'more', theme: 'Money' }] })),
    );
    global.fetch = fetchSpy as any;

    const res = await post(request());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toMatchObject({ ok: true, task: 'tell_app', provider: 'gemini' });
    expect(data.data).toEqual({
      reply: 'Got it: Words gets harder now, and more Money.',
      learned: [
        { kind: 'level', module: 'words', delta: 1 },
        { kind: 'more', theme: 'Money' },
      ],
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    const sent = body.systemInstruction.parts[0].text as string;
    expect(sent).toBe(systemFor('tell_app'));
    expect(sent.startsWith(rulebookFor('tell_app'))).toBe(true);
    expect(sent).toContain('## 10. The Ask box (Adarsh, 2026-11-10)');
    expect(sent).toContain('Feedback and wishes only');
    expect(body.generationConfig.temperature).toBe(0.3);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(body.contents[0].parts[0].text).toContain('cricket cards');
  });

  it('a Hindi reply fails over to the next provider', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'g';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(gemini(JSON.stringify({ reply: 'Haan, done.', learned: [] })))
      .mockResolvedValueOnce(groq(JSON.stringify({ reply: 'Done: more Money cards now.', learned: [{ kind: 'more', theme: 'Money' }] }))) as any;
    const data = (await (await post(request())).json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.reply).toBe('Done: more Money cards now.');
  });

  it('refuses a bad request with a plain 400 and never calls a model', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    for (const bad of [{ ...request(), levels: { poetry: 3 } }, request({ text: '' }), request({ text: 'x'.repeat(1001) }), {}]) {
      const res = await post(bad);
      expect(res.status, JSON.stringify(bad).slice(0, 80)).toBe(400);
      const data = (await res.json()) as any;
      expect(data.reason).toBe('bad_input');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no key: reason no_key, plain words', async () => {
    const data = (await (await post(request())).json()) as any;
    expect(data).toMatchObject({ ok: false, task: 'tell_app', reason: 'no_key' });
  });
});

describe('tell_app rulebook slice', () => {
  it('carries chapter 0, 9.3 and 10, and not the card shapes or the checker codes', () => {
    const part = rulebookFor('tell_app');
    for (const s of ['## 0. Purpose', '### 9.3 How his feedback steers a batch', '## 10. The Ask box', '### 10.1 What it is for', '### 10.2 The reply', '### 10.3 What you may learn']) {
      expect(part).toContain(s);
    }
    for (const s of ['### 9.1 The five shapes', '## 6. Verification rules', 'R1 INVENTED']) expect(part).not.toContain(s);
  });

  it('the level map is fixed in the rulebook: start level 2 writes card level 2', () => {
    const part = rulebookFor('tell_app');
    expect(part).toContain('batch level 1 → 1, 2 → 2, 3 → 3, 4-5 → 3');
    expect(part).not.toContain('1-2 → 1');
  });

  it('a stray field never leaks back to the phone', () => {
    const out = validateTellApp({ reply: 'Done.', learned: [{ kind: 'more', theme: 'Money', extra: 'x' }], secret: 'y' } as Raw, request()) as unknown as Raw;
    expect(Object.keys(out).sort()).toEqual(['learned', 'reply']);
    expect(out.learned).toEqual([{ kind: 'more', theme: 'Money' }]);
  });
});
