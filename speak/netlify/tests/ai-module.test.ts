import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleBatchRequest, ModuleId } from '../../src/types/contract';
import handler, {
  GROQ_TOKENS_PER_MINUTE,
  MODULE_BATCH_MAX,
  MODULE_MAX_TOKENS,
  cardLevelFor,
  checkModuleBatchPayload,
  moduleBatchSystem,
  moduleHeadOf,
  systemFor,
  themeFrom,
  validateModuleBatch,
  validateModuleDraft,
  validateProviderOutput,
} from '../functions/ai';
import { rulebookFor } from '../rulebook';

// v7 steps 4-6: AI module batches ride `expand_seed` with a `ModuleBatchRequest`
// (rulebook chapter 9). Every model reply here is fake: no key, no network.

type Raw = Record<string, unknown>;

const words = (word: string, over: Raw = {}): Raw => ({
  type: 'module',
  module: 'words',
  topic: word,
  lang: 'en',
  level: 1,
  word,
  pos: 'adjective',
  say: 'rih-LEEVD',
  meaning: 'Glad because a worry has gone away.',
  examples: [
    { label: 'At home', text: `I'm **${word}** the keys were in my bag.`, icon: 'home' },
    { label: 'With friends', text: `She looked **${word}** when I called.`, icon: 'friends' },
  ],
  right: { label: '✓ Use it right', text: `I felt **${word}** after the test.` },
  wrong: [{ label: '✗ Wrong use', text: `I ${word} when you called.` }],
  rule: `feel ${word}`,
  ...over,
});

const check = {
  question: 'Your missing cat comes home. How do you feel?',
  options: [
    { text: 'Damp.', right: false },
    { text: 'Stale.', right: false },
    { text: 'Relieved.', right: true },
  ],
};

const talk = (moment: string, over: Raw = {}): Raw => ({
  type: 'module',
  module: 'smalltalk',
  topic: moment,
  kind: 'reply',
  moment,
  they: 'Have you eaten?',
  deadEnd: 'Yes.',
  reply: 'Yes, I tried the new cafe. Have you been?',
  formula: 'answer + detail + question',
  more: [
    { label: 'Home food', text: 'Brought lunch today. What did you get?' },
    { label: 'Not yet', text: 'Not yet. Know anywhere good nearby?' },
    { label: 'Quick meal', text: 'Just a sandwich. Are you heading out?' },
  ],
  donts: ['Comment on how much they eat.'],
  ...over,
});

const better = (mightSay: string, over: Raw = {}): Raw => ({
  type: 'module',
  module: 'better',
  topic: 'Choosing a deadline',
  situation: 'Choosing a deadline',
  thinking: true,
  mightSay,
  better: "I'd aim for Friday. That gives us two days to test.",
  changes: ['recommendation', 'reason'],
  next: { title: 'Name the risk', lines: [{ label: 'Risk', text: "Thursday is possible, but we'd have no time to test." }] },
  ...over,
});

const phrase = (p: string, over: Raw = {}): Raw => ({
  type: 'module',
  module: 'phrases',
  topic: p,
  level: 2,
  group: 'meetings',
  phrase: p,
  meaning: 'Return to this topic later.',
  useWhen: 'Another point needs attention first.',
  example: 'Let us come back to that after we agree on the budget.',
  tone: 'calm',
  careful: 'Name when you will return to the topic.',
  wrong: { label: '✗ Wrong use', text: 'Let us come back to that yesterday.' },
  similar: ["Let's discuss that later.", 'Can we return to that after lunch?'],
  ...over,
});

const story = (report: string, over: Raw = {}): Raw => ({
  type: 'module',
  module: 'stories',
  topic: 'Cooking surprise',
  report,
  story: 'I wanted to impress my friends with dinner. One bite in, everyone reached for water at the same time.',
  trick: 'Show the reaction instead of naming the problem.',
  ...over,
});

const request = (over: Partial<ModuleBatchRequest> = {}): ModuleBatchRequest => ({
  type: 'module',
  module: 'words',
  count: 3,
  level: 2,
  liked: ['relieved'],
  disliked: [{ head: 'wary', reasons: ['too_hard'] }],
  comments: ['Too basic. I already use this word daily.'],
  seen: ['relieved', 'Deafening'],
  startId: 'v7-ai-words-0001',
  ...over,
});

describe('validateModuleDraft: the library rules on one AI card', () => {
  it('accepts a good card of every module and keeps only its own fields', () => {
    const goods: [ModuleId, Raw][] = [
      ['words', words('calm', { extra: 'x', track: 'words', kind: 'learn' })],
      ['smalltalk', talk('Lunch chat')],
      ['better', better('Maybe Friday would be good, I am not sure.')],
      ['phrases', phrase("Let's come back to that.")],
      ['stories', story('I cooked dinner and it was too spicy.', { yourTurn: { prompt: 'Tell a cooking moment.', hint: 'Show a reaction.' } })],
    ];
    for (const [module, raw] of goods) {
      const card = validateModuleDraft(raw, 0, module) as unknown as Raw;
      expect(card.type).toBe('module');
      expect(card.module).toBe(module);
      expect(card.lang).toBe('en');
      expect(card.id).toBeUndefined();
      expect(card.extra).toBeUndefined();
      expect(card.tags).toEqual([module, 'ai']);
      expect(moduleHeadOf(card)).toBe(moduleHeadOf(raw));
    }
  });

  it('fills a missing topic and type from the card itself', () => {
    const { topic: _t, type: _ty, module: _m, lang: _l, ...bare } = words('calm');
    const card = validateModuleDraft(bare, 0, 'words') as unknown as Raw;
    expect(card.topic).toBe('calm');
    expect(card.type).toBe('module');
  });

  it.each([
    ['another module', words('calm'), 'phrases', /not in the module/],
    ['a Hindi lang', words('calm', { lang: 'hi' }), 'words', /lang must be "en"/],
    ['an analogy', words('calm', { analogy: 'Like a still lake.' }), 'words', /analogy/],
    ['a credit', story('A dull day.', { credit: 'Matthew Dicks' }), 'stories', /credit/],
    ['a word not marked in an example', words('calm', { examples: [{ label: 'a', text: 'I am calm.' }, { label: 'b', text: 'Stay **calm**.' }] }), 'words', /must mark the word/],
    ['no wrong line', words('calm', { wrong: [] }), 'words', /wrong/],
    ['three wrong lines', words('calm', { wrong: [1, 2, 3].map((n) => ({ label: '✗ Wrong', text: `bad ${n}` })) }), 'words', /wrong/],
    ['a wrong label without ✗', words('calm', { wrong: [{ label: 'Wrong use', text: 'I calm.' }] }), 'words', /must start with ✗/],
    ['a phrase wrong label without ✗', phrase('Circle back', { wrong: { label: 'Wrong', text: 'x' } }), 'phrases', /must start with ✗/],
    ['an unknown phrase group', phrase('Circle back', { group: 'sales' }), 'phrases', /group/],
    ['an unknown small talk kind', talk('Lunch', { kind: 'flirt' }), 'smalltalk', /kind/],
    ['two more lines, not three', talk('Lunch', { more: [{ label: 'a', text: 'b' }, { label: 'c', text: 'd' }] }), 'smalltalk', /more/],
    ['four donts', talk('Lunch', { donts: ['a', 'b', 'c', 'd'] }), 'smalltalk', /donts/],
    ['thinking not a boolean', better('Maybe Friday.', { thinking: 'yes' }), 'better', /thinking/],
    ['one change chip', better('Maybe Friday.', { changes: ['shorter'] }), 'better', /changes/],
    ['one similar phrase', phrase('Circle back', { similar: ['only one'] }), 'phrases', /similar/],
    ['a broken your turn', story('A dull day.', { yourTurn: { prompt: 'Go' } }), 'stories', /yourTurn/],
    ['a check with two right options', words('calm', { check: { question: 'q', options: [{ text: 'a', right: true }, { text: 'b', right: true }, { text: 'c', right: false }] } }), 'words', /exactly one right/],
  ] as [string, Raw, ModuleId, RegExp][])('drops %s', (_name, raw, module, reason) => {
    expect(() => validateModuleDraft(raw, 0, module)).toThrow(reason);
  });

  it('v8: every module card keeps its theme and level 1-3', () => {
    const goods: [ModuleId, Raw][] = [
      ['words', words('calm', { theme: 'Emotions', level: 1 })],
      ['smalltalk', talk('Lunch chat', { theme: 'Food', level: 2 })],
      ['better', better('Maybe Friday would be good, I am not sure.', { theme: 'Work', level: 3 })],
      ['phrases', phrase("Let's come back to that.", { theme: 'Work', level: 3 })],
      ['stories', story('I cooked dinner and it was too spicy.', { theme: 'Food', level: 1 })],
    ];
    for (const [module, raw] of goods) {
      const card = validateModuleDraft(raw, 0, module, { themes: ['Emotions', 'Food', 'Work', 'General'], level: 2 }) as unknown as Raw;
      expect(card.theme, module).toBe(raw.theme);
      expect(card.level, module).toBe(raw.level);
      // The card's own headline is untouched by the topic label.
      expect(card.topic, module).toBe(raw.topic);
    }
  });

  it('v8: a theme outside the request list becomes General; case is matched to the list', () => {
    const ctx = { themes: ['Money', 'Food', 'General', 'Cricket'] };
    expect(validateModuleDraft(words('calm', { theme: 'Space travel' }), 0, 'words', ctx).theme).toBe('General');
    expect(validateModuleDraft(words('calm', { theme: 'cricket' }), 0, 'words', ctx).theme).toBe('Cricket');
    expect(validateModuleDraft(words('calm', { theme: 'Emotions' }), 0, 'words', ctx).theme).toBe('General');
    expect(validateModuleDraft(words('calm', { theme: undefined }), 0, 'words', ctx).theme).toBe('General');
    // A request from before v8 sends no themes: the fixed start list applies.
    expect(validateModuleDraft(words('calm', { theme: 'Emotions' }), 0, 'words').theme).toBe('Emotions');
    expect(validateModuleDraft(words('calm', { theme: 'Cricket' }), 0, 'words').theme).toBe('General');
    expect(themeFrom(42, ['Money'])).toBe('General');
  });

  it('v8: a missing or bad level takes the mapped card level of the batch', () => {
    expect(validateModuleDraft(words('calm', { level: undefined }), 0, 'words', { level: 2 }).level).toBe(2);
    expect(validateModuleDraft(words('calm', { level: 4 }), 0, 'words', { level: 1 }).level).toBe(1);
    expect(validateModuleDraft(phrase('Circle back', { level: undefined }), 0, 'phrases', { level: 5 }).level).toBe(3);
    expect(validateModuleDraft(talk('Lunch', { level: '2' }), 0, 'smalltalk', { level: 3 }).level).toBe(3);
    // No batch level at all: the start level 2 maps to card level 2.
    expect(validateModuleDraft(story('A dull day.'), 0, 'stories').level).toBe(2);
  });

  it('v8 level map: module level 1 -> 1, 2 -> 2, 3 -> 3, 4-5 -> 3', () => {
    expect([1, 2, 3, 4, 5].map((l) => cardLevelFor(l as 1 | 2 | 3 | 4 | 5))).toEqual([1, 2, 3, 3, 3]);
  });

  it('every 3rd Words card in the reply must carry the quick check', () => {
    expect(() => validateModuleDraft(words('calm'), 2, 'words')).toThrow(/quick check/);
    expect(validateModuleDraft(words('calm', { check }), 2, 'words')).toMatchObject({ check });
    expect(() => validateModuleDraft(words('calm'), 1, 'words')).not.toThrow();
  });

  it('drops a slide over 40 words (the ** marks and lone symbols do not count)', () => {
    const long = Array.from({ length: 41 }, (_, k) => `word${k}`).join(' ');
    expect(() => validateModuleDraft(story('A dull day.', { story: long }), 0, 'stories')).toThrow(/slide 1 has \d+ words \(max 40\)/);
    const forty = `${Array.from({ length: 36 }, (_, k) => `w${k}`).join(' ')} · → —`;
    expect(() => validateModuleDraft(story('A b c d', { story: forty }), 0, 'stories')).not.toThrow();
  });

  it('refuses Hindi on screen: Devanagari anywhere, Hindi words as whole words', () => {
    expect(() => validateModuleDraft(talk('Lunch', { reply: 'Haan, I ate already.' }), 0, 'smalltalk')).toThrow(/Hindi word "Haan"/);
    expect(() => validateModuleDraft(talk('Lunch', { reply: 'Yes, chalo let us go.' }), 0, 'smalltalk')).toThrow(/Hindi word "chalo"/);
    expect(() => validateModuleDraft(story('A day', { trick: 'Say नमस्ते first.' }), 0, 'stories')).toThrow(/Devanagari/);
    expect(() => validateModuleDraft(talk('Lunch', { more: [{ label: 'Yaar', text: 'a' }, { label: 'b', text: 'c' }, { label: 'd', text: 'e' }] }), 0, 'smalltalk')).toThrow(/Hindi/);
    // Whole words only: "Jim" is not "ji".
    expect(() => validateModuleDraft(talk('Lunch with Jim', { reply: 'Yes, Jim and I tried the new cafe.' }), 0, 'smalltalk')).not.toThrow();
  });
});

describe('validateModuleBatch: one writer reply', () => {
  it('keeps a good batch and numbers it from startId upward', () => {
    const out = validateModuleBatch([words('calm'), words('tidy'), words('eager', { check })], request({ startId: 'v7-ai-words-0009' }));
    expect(out.cards.map((c) => c.id)).toEqual(['v7-ai-words-0009', 'v7-ai-words-0010', 'v7-ai-words-0011']);
    expect(out.cards.map(moduleHeadOf)).toEqual(['calm', 'tidy', 'eager']);
  });

  it('drops a bad card and keeps the rest', () => {
    const out = validateModuleBatch([words('calm'), words('tidy', { wrong: [] }), words('eager', { check })], request());
    expect(out.cards.map(moduleHeadOf)).toEqual(['calm', 'eager']);
    expect(out.cards.map((c) => c.id)).toEqual(['v7-ai-words-0001', 'v7-ai-words-0002']);
  });

  it('refuses a head he has already seen (any case) and a head repeated inside the batch', () => {
    const out = validateModuleBatch([words('RELIEVED'), words('deafening'), words('calm', { check }), words('Calm')], request());
    expect(out.cards.map(moduleHeadOf)).toEqual(['calm']);
  });

  it('cuts to count', () => {
    const out = validateModuleBatch([words('calm'), words('tidy'), words('eager', { check }), words('brave')], request({ count: 2 }));
    expect(out.cards).toHaveLength(2);
  });

  it('v8: passes the request themes and level to every card', () => {
    const out = validateModuleBatch(
      [words('calm', { theme: 'Money', level: undefined }), words('tidy', { theme: 'Home', level: 3 })],
      request({ level: 2, themes: ['Money', 'General'] }),
    );
    expect(out.cards.map((c) => [c.theme, c.level])).toEqual([
      ['Money', 2],
      ['General', 3],
    ]);
  });

  it('throws when nothing is left, so the next provider is tried', () => {
    expect(() => validateModuleBatch([words('relieved')], request())).toThrow(/No usable module cards: .*already seen/);
    expect(() => validateModuleBatch([], request())).toThrow(/No usable module cards/);
  });

  it('is what validateProviderOutput runs for a module payload', () => {
    const out = validateProviderOutput('expand_seed', { cards: [phrase('Circle back')] }, request({ module: 'phrases', startId: 'v7-ai-phrases-0040' })) as {
      cards: Raw[];
    };
    expect(out.cards[0]).toMatchObject({ id: 'v7-ai-phrases-0040', module: 'phrases', phrase: 'Circle back' });
  });
});

describe('checkModuleBatchPayload', () => {
  it('accepts a good request', () => {
    expect(checkModuleBatchPayload(request())).toBeNull();
    expect(checkModuleBatchPayload(request({ liked: [], disliked: [], comments: [], seen: [] }))).toBeNull();
    expect(checkModuleBatchPayload(request({ count: MODULE_BATCH_MAX, level: 5, module: 'smalltalk', startId: 'v7-ai-smalltalk-0101' }))).toBeNull();
  });

  it('v8: accepts the three new optional fields, and an old request without them', () => {
    expect(checkModuleBatchPayload(request({ themes: ['Money', 'General', 'Cricket'], likedThemes: ['Money'], wishes: ['More cricket examples.'] }))).toBeNull();
    expect(checkModuleBatchPayload(request({ themes: [], likedThemes: [], wishes: [] }))).toBeNull();
    const old = request() as unknown as Raw;
    expect('themes' in old || 'likedThemes' in old || 'wishes' in old).toBe(false);
    expect(checkModuleBatchPayload(old)).toBeNull();
  });

  it.each([
    ['an unknown module', { module: 'poetry' }],
    ['count 0', { count: 0 }],
    ['count 11', { count: 11 }],
    ['level 6', { level: 6 }],
    ['level 0', { level: 0 }],
    ['a bad startId', { startId: 'card-1' }],
    ['no seen list', { seen: undefined }],
    ['a seen list of numbers', { seen: [1, 2] }],
    ['21 comments', { comments: Array.from({ length: 21 }, (_, k) => `c${k}`) }],
    ['an unknown dislike reason', { disliked: [{ head: 'wary', reasons: ['boring'] }] }],
    ['a dislike with no head', { disliked: [{ head: '', reasons: [] }] }],
    ['a seed card', { seed: words('calm') }],
    ['themes not a list', { themes: 'Money' }],
    ['21 themes', { themes: Array.from({ length: 21 }, (_, k) => `T${k}`) }],
    ['a theme over 40 characters', { themes: ['x'.repeat(41)] }],
    ['an empty liked theme', { likedThemes: [''] }],
    ['7 wishes', { wishes: Array.from({ length: 7 }, (_, k) => `w${k}`) }],
    ['a wish over 500 characters', { wishes: ['x'.repeat(501)] }],
  ] as [string, Raw][])('refuses %s', (_name, over) => {
    expect(checkModuleBatchPayload({ ...request(), ...over })).not.toBeNull();
  });
});

describe('expand_seed module batch through the handler (fake model replies)', () => {
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

  function post(task: string, payload: unknown) {
    ip += 1;
    return handler(
      new Request('http://localhost/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.18.0.${ip}` },
        body: JSON.stringify({ task, payload }),
      }),
    );
  }

  const gemini = (text: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
  const groq = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

  it('good batch: returns the checked cards, sends 4,096 tokens and the chapter 9 prompt', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify({ cards: [words('calm'), words('tidy'), words('eager', { check })] })));
    global.fetch = fetchSpy as any;

    const res = await post('expand_seed', request());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('gemini');
    expect(data.data.cards.map((c: Raw) => c.id)).toEqual(['v7-ai-words-0001', 'v7-ai-words-0002', 'v7-ai-words-0003']);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(MODULE_MAX_TOKENS);
    const sent = body.systemInstruction.parts[0].text as string;
    expect(sent).toBe(moduleBatchSystem('words', 2));
    expect(sent.startsWith(rulebookFor('expand_seed'))).toBe(true);
    expect(sent).toContain('## 9. v7 module cards (Adarsh, 2026-11-08)');
    expect(sent).toContain('"module":"words"');
    expect(sent).not.toContain('"module":"phrases"');
    // The writer is told what he has seen, liked, disliked and said.
    const user = body.contents[0].parts[0].text as string;
    for (const s of ['Deafening', 'too_hard', 'Too basic']) expect(user).toContain(s);
  });

  it('bad card dropped, seen head refused, Hindi refused, over count cut', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const reply = {
      cards: [
        words('calm'),
        words('relieved'), // seen
        words('tidy', { wrong: [{ label: 'Wrong use', text: 'I tidy.' }] }), // no ✗
        words('eager', { meaning: 'Wanting it a lot, yaar.' }), // Hindi
        words('brave'),
        words('steady'),
      ],
    };
    global.fetch = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify(reply))) as any;

    const res = await post('expand_seed', request({ count: 2 }));
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.cards.map((c: Raw) => c.word)).toEqual(['calm', 'brave']);
  });

  it('v8: start level 2 asks for card level 2 (not 1), and every shape names theme and level', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify({ cards: [words('calm', { level: undefined, theme: 'Emotions' })] })));
    global.fetch = fetchSpy as any;

    const res = await post('expand_seed', request({ level: 2, count: 1, themes: ['Emotions', 'General'] }));
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.cards[0]).toMatchObject({ level: 2, theme: 'Emotions', topic: 'calm' });

    const sent = JSON.parse(fetchSpy.mock.calls[0]![1].body as string).systemInstruction.parts[0].text as string;
    expect(sent).toContain('This batch is level 2: write every card at "level":2.');
    expect(sent).toContain('2 gives 2');
    expect(sent).not.toContain('1-2 gives 1');
    expect(rulebookFor('expand_seed')).toContain('batch level 1 → 1, 2 → 2, 3 → 3, 4-5 → 3');
    expect(rulebookFor('expand_seed')).not.toContain('batch level 1-2 → 1');
    expect(moduleBatchSystem('stories', 5)).toContain('"level":3, harder than the library\'s level 3');
    for (const module of ['words', 'smalltalk', 'better', 'phrases', 'stories'] as ModuleId[]) {
      const prompt = moduleBatchSystem(module, 3);
      expect(prompt, module).toContain(`"module":"${module}","topic":string,"theme":string,"level":1|2|3`);
      expect(prompt, module).toContain('"level":3.');
    }
  });

  it('v8: an old request without themes, likedThemes or wishes still runs', async () => {
    process.env.GEMINI_API_KEY = 'k';
    global.fetch = vi.fn().mockResolvedValueOnce(gemini(JSON.stringify({ cards: [talk('Lunch chat')] }))) as any;
    const res = await post('expand_seed', request({ module: 'smalltalk', count: 1, startId: 'v7-ai-smalltalk-0001' }));
    const data = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(data.data.cards[0]).toMatchObject({ theme: 'General', level: 2 });
  });

  it('fails over when the first reply has no usable card, and the Groq call still fits its minute', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GROQ_API_KEY = 'g';
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(gemini(JSON.stringify({ cards: [words('relieved')] })))
      .mockResolvedValueOnce(groq(JSON.stringify({ cards: [words('calm')] })));
    global.fetch = fetchSpy as any;

    const res = await post('expand_seed', request({ count: 1 }));
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.provider).toBe('groq');
    expect(data.data.cards).toHaveLength(1);

    const body = JSON.parse(fetchSpy.mock.calls[1]![1].body as string);
    const promptChars = body.messages.reduce((n: number, m: { content: string }) => n + m.content.length, 0);
    expect(Math.ceil(promptChars / 3.5) + body.max_tokens).toBeLessThanOrEqual(GROQ_TOKENS_PER_MINUTE);
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
  });

  it('refuses a bad module request with a plain 400 and never calls a model', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    for (const bad of [request({ count: 11 }), request({ module: 'poetry' as ModuleId }), { type: 'module', module: 'words', count: 3 }]) {
      const res = await post('expand_seed', bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('verify_batch takes module cards as items and judges them by chapter 9', async () => {
    process.env.GROQ_API_KEY = 'g';
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      groq(JSON.stringify({ results: [{ key: 'd0', ok: true, reason: 'pass' }, { key: 'd1', ok: false, reason: 'R4 MISSING: no ✗ line' }] })),
    );
    global.fetch = fetchSpy as any;

    const items = [
      { key: 'd0', card: { id: 'v7-ai-words-0001', ...words('calm') } },
      { key: 'd1', card: { id: 'v7-ai-phrases-0001', ...phrase('Circle back') } },
    ];
    const res = await post('verify_batch', { items });
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.results).toEqual([
      { key: 'd0', ok: true, reason: 'pass' },
      { key: 'd1', ok: false, reason: 'R4 MISSING: no ✗ line' },
    ]);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.messages[0].content).toBe(systemFor('verify_batch'));
    expect(body.messages[0].content).toContain('### 9.2 Rules on every module card');
    expect(body.messages[0].content).toContain('a v7 module card');
    expect(body.messages[1].content).toContain('v7-ai-phrases-0001');
  });
});
