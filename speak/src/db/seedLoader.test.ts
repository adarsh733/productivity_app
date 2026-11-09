import { describe, expect, it } from 'vitest';
import { readSeedFiles, retiredIds, validateSeedCard } from './seedLoader';
import type { BreathCard, CardType, ModuleCard, TeachCard, WordsCard } from '../types/contract';

const { cards, report } = readSeedFiles();
const breath = cards.filter((c): c is BreathCard => c.type === 'breath');

describe('the seed deck', () => {
  it('loads without throwing; skips are reported, never thrown', () => {
    // NOTE: AG-006 edits seed JSON in parallel — exact counts and zero-skipped
    // cannot be asserted. The loader must skip bad cards, never throw.
    expect(cards.length).toBeGreaterThan(200);
    for (const s of report.skipped) {
      expect(typeof s.file).toBe('string');
      expect(typeof s.reason).toBe('string');
    }
  });

  it('has no duplicate ids across files', () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains valid cards for all 14 card contract types', () => {
    const types: CardType[] = [
      'word',
      'swap',
      'idiom',
      'action_verb',
      'pronounce',
      'say_it',
      'breath',
      'phrase',
      'feeling',
      'story_move',
      'describe',
      'explain',
      'teach_back',
      'situation',
    ];

    for (const t of types) {
      const matching = cards.filter((c) => c.type === t);
      expect(matching.length, `Expected seed cards for type: ${t}`).toBeGreaterThan(0);
    }
  });

  it('every card has an active status, seed source, and non-empty ID', () => {
    for (const c of cards) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.status).toBe('active');
      expect(c.source).toBe('seed');
      expect(Array.isArray(c.tags)).toBe(true);
    }
  });
});

describe('the breath deck, corrected against the measurements', () => {
  it('has exactly one drill that logs seconds', () => {
    const timed = breath.filter((c) => c.logUnit === 'seconds');
    expect(timed.map((c) => c.id)).toEqual(['br-mpt-open']);
  });

  it('measures the habitual volume, not a comfortable one', () => {
    const mpt = breath.find((c) => c.id === 'br-mpt-open')!;
    expect(mpt.instructions.join(' ')).toMatch(/normal speaking volume/i);
  });

  it('retired every capacity drill', () => {
    for (const c of breath) {
      expect(c.tags, c.id).not.toContain('capacity');
    }
    for (const id of ['br-ladder-back', 'br-phrase-hold', 'br-stairs', 'br-ladder']) {
      expect(breath.map((c) => c.id)).not.toContain(id);
    }
  });

  it('ends every drill with a transfer rep', () => {
    for (const c of breath) {
      if (c.logUnit === 'seconds') continue;
      expect(
        c.instructions.some((i) => i.startsWith('TRANSFER:')),
        `${c.id} has no transfer rep`,
      ).toBe(true);
    }
  });

  it('keeps a majority of the deck on semi-occluded work', () => {
    const sovt = breath.filter((c) => c.tags.includes('sovt'));
    expect(sovt.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps every instruction short enough to read mid-drill', () => {
    for (const c of breath) {
      expect(c.instructions.length, `${c.id} step count`).toBeLessThanOrEqual(4);
      for (const line of c.instructions) {
        expect(line.length, `${c.id}: ${line}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it('still supplies enough breath cards for the Core 3 to have one every day', () => {
    expect(breath.length).toBeGreaterThanOrEqual(7);
  });
});

describe('teach cards (v5, rulebook 1.2)', () => {
  const good = {
    id: 'ls-smalltalk-1-1-1',
    type: 'teach',
    track: 'smalltalk',
    level: 1,
    kind: 'learn',
    category: 'answer well',
    title: 'Answer, then add one thing',
    rule: 'Give your answer, then one detail they can pick up.',
    examples: { work: 'Good, thanks. Busy with the launch.', everyday: 'Fine! Just back from my cousin’s wedding.' },
    analogy: 'Like passing the ball back in cricket practice.',
    tryPrompt: 'Someone asks how your weekend was. Answer and add one thing.',
    register: 'both',
    tags: ['greetings'],
    lesson: { id: 'ls-smalltalk-1-1', title: 'Answer well', step: 1, order: 1 },
  };
  const without = (field: string) => {
    const copy: Record<string, unknown> = { ...good };
    delete copy[field];
    return copy;
  };

  it('accepts a complete teach card and stamps it as an active seed card', () => {
    const res = validateSeedCard(good);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const card = res.card as unknown as TeachCard;
    expect(card.type).toBe('teach');
    expect(card.source).toBe('seed');
    expect(card.status).toBe('active');
    expect(card.lang).toBe('en');
    expect(card.examples.work).toMatch(/launch/);
    expect(card.lesson?.step).toBe(1);
  });

  it.each(['track', 'level', 'kind', 'category', 'title', 'rule', 'examples', 'analogy', 'tryPrompt', 'register'])(
    'skips a teach card missing %s',
    (field) => {
      const res = validateSeedCard(without(field));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain(field);
    },
  );

  it.each([
    ['unknown track', { track: 'grammar' }],
    ['level out of range', { level: 6 }],
    ['unknown kind', { kind: 'quiz' }],
    ['ask_them outside small talk', { track: 'words', kind: 'ask_them' }],
    ['title over 40 chars', { title: 'x'.repeat(41) }],
    ['examples as an array', { examples: ['a', 'b'] }],
    ['examples missing everyday', { examples: { work: 'a' } }],
    ['unknown register', { register: 'friends' }],
    ['fix card with no insteadOf', { kind: 'fix' }],
    ['bad lesson step', { lesson: { id: 'l', title: 't', step: 0, order: 1 } }],
    ['links not strings', { links: [1] }],
  ])('skips a teach card with %s', (_label, patch) => {
    expect(validateSeedCard({ ...good, ...patch }).ok).toBe(false);
  });

  it('accepts a fix card that says what it replaces, and a Try card with an answer', () => {
    expect(validateSeedCard({ ...good, kind: 'fix', insteadOf: 'I will revert back.', links: ['ls-words-1-1'] }).ok).toBe(true);
    expect(validateSeedCard({ ...good, kind: 'try', answer: 'Pretty good, thanks.' }).ok).toBe(true);
  });

  it('moves a framework-name source into credit; provenance stays seed', () => {
    const res = validateSeedCard({ ...good, source: 'Dale Carnegie' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const card = res.card as unknown as TeachCard;
    expect(card.source).toBe('seed');
    expect(card.credit).toBe('Dale Carnegie');
  });
});

describe('the optional skill tag on old cards', () => {
  const word = {
    id: 'w-test',
    type: 'word',
    term: 'postpone',
    pos: 'verb',
    meaning: 'move to a later time',
    examples: ['They postponed the call.', 'We postponed dinner.'],
    say: 'Use it about your week.',
    tags: [],
  };

  it('loads an old card with no skill tag exactly as before', () => {
    const res = validateSeedCard(word);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.card.skill).toBeUndefined();
  });

  it('keeps a valid skill tag', () => {
    const skill = { track: 'words', level: 1, kind: 'learn', work: 'Can we postpone the review?', everyday: 'Let’s postpone dinner.' };
    const res = validateSeedCard({ ...word, skill });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.card.skill).toEqual(skill);
  });

  it.each([
    ['not an object', 'words'],
    ['unknown track', { track: 'grammar', kind: 'learn' }],
    ['unknown kind', { track: 'words', kind: 'quiz' }],
    ['level out of range', { track: 'words', kind: 'learn', level: 9 }],
    ['empty analogy', { track: 'words', kind: 'learn', analogy: '' }],
  ])('skips a card whose skill tag has %s', (_label, skill) => {
    expect(validateSeedCard({ ...word, skill }).ok).toBe(false);
  });
});

describe('retiredIds', () => {
  it('names the cards on the device that the files no longer author', () => {
    expect(retiredIds(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b']);
  });

  it('is empty when the device matches the files', () => {
    expect(retiredIds(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });

  it('does not retire a card the device has never seen', () => {
    expect(retiredIds([], new Set(['a']))).toEqual([]);
  });
});

describe('module cards (v7 Night glass)', () => {
  const base = { type: 'module', topic: 'everyday', tags: ['v7'] };
  const words = {
    ...base,
    id: 'v7-words-01',
    module: 'words',
    word: 'deafening',
    pos: 'adjective',
    say: 'DEF-uh-ning',
    meaning: "So loud you can't hear anything else.",
    examples: [
      { label: 'At home', icon: 'home', text: 'The party next door is **deafening**.' },
      { label: 'With friends', icon: 'friends', text: 'The stadium was **deafening**.' },
    ],
    right: { label: 'For sounds', text: 'The traffic is **deafening**.' },
    wrong: [{ label: 'Not for smells', text: 'Her perfume was deafening.' }],
    rule: 'only for sound',
    check: {
      question: 'Which one is right?',
      options: [
        { text: 'The sunlight was deafening.', right: false },
        { text: 'The drums were deafening.', right: true },
        { text: 'His idea was deafening.', right: false },
      ],
    },
  };
  const talk = {
    ...base,
    id: 'v7-talk-01',
    module: 'smalltalk',
    kind: 'reply',
    moment: 'Monday at the coffee machine',
    they: 'How was your weekend?',
    deadEnd: 'Good.',
    reply: 'Lazy, in a good way. Did you do anything fun?',
    formula: 'feeling + one detail + ask back',
    more: [
      { label: 'Busy', text: 'Packed! How was yours?' },
      { label: 'Quiet', text: 'Very quiet. You?' },
      { label: 'Bad', text: 'A bit rough. Yours?' },
    ],
    donts: ['Stop at one word.'],
  };
  const better = {
    ...base,
    id: 'v7-better-01',
    module: 'better',
    situation: 'Explaining a delay',
    thinking: false,
    mightSay: 'Actually what happened is, the server was down.',
    better: "Yesterday's release slipped because the server went down.",
    changes: ['point first', 'cut the warm-up'],
    next: { title: 'Even better', lines: [{ label: 'Add the next step', text: "We'll ship it today by 4." }] },
  };
  const phrase = {
    ...base,
    id: 'v7-phrases-01',
    module: 'phrases',
    group: 'meetings',
    phrase: "Let's take this offline.",
    meaning: "Let's discuss this later, with only the people who need to.",
    useWhen: 'One topic is eating up a group meeting.',
    example: "Good point, Rahul. **Let's take this offline** after the call.",
    tone: 'polite · very common',
    careful: "Don't use it to dodge a topic.",
    wrong: { label: 'Not one-to-one', text: "Let's take this offline, on a one-to-one call." },
    similar: ["Let's park this for now.", 'Can we pick this up after the call?'],
  };
  const story = {
    ...base,
    id: 'v7-stories-01',
    module: 'stories',
    report: 'I went to the airport, the flight was delayed, and I reached late.',
    story: 'I had one job: reach Delhi by six.',
    trick: 'start with what you wanted',
  };

  it('accepts one good card of each module and stamps it as an active seed card', () => {
    for (const raw of [words, talk, better, phrase, story]) {
      const res = validateSeedCard(raw);
      expect(res.ok, raw.id).toBe(true);
      if (!res.ok) continue;
      const card = res.card as unknown as ModuleCard;
      expect(card.type).toBe('module');
      expect(card.module).toBe(raw.module);
      expect(card.source).toBe('seed');
      expect(card.status).toBe('active');
      expect(card.lang).toBe('en');
    }
    const w = (validateSeedCard(words) as { ok: true; card: unknown }).card as WordsCard;
    expect(w.examples[0].text).toMatch(/\*\*deafening\*\*/);
  });

  const reason = (raw: unknown) => {
    const res = validateSeedCard(raw);
    return res.ok ? null : res.reason;
  };

  it('refuses an unknown module and a missing topic', () => {
    expect(reason({ ...story, module: 'grammar' })).toBe('unknown module grammar');
    expect(reason({ ...story, topic: '' })).toBe('topic must be a non-empty string');
  });

  it('refuses a Words card with broken parts', () => {
    const { rule: _r, ...noRule } = words;
    expect(reason(noRule)).toBe('missing rule');
    expect(reason({ ...words, examples: [words.examples[0]] })).toMatch(/exactly two/);
    expect(reason({ ...words, wrong: [] })).toMatch(/wrong must be 1-2/);
    expect(reason({ ...words, wrong: [...words.wrong, ...words.wrong, ...words.wrong] })).toMatch(/wrong must be 1-2/);
    expect(reason({ ...words, right: { label: 'x' } })).toMatch(/right must be/);
    expect(reason({ ...words, examples: [{ ...words.examples[0], icon: 'car' }, words.examples[1]] })).toMatch(/exactly two/);
    const twoRight = { ...words.check, options: words.check.options.map((o) => ({ ...o, right: true })) };
    expect(reason({ ...words, check: twoRight })).toBe('check must have exactly one right option');
    expect(reason({ ...words, check: { ...words.check, options: words.check.options.slice(0, 2) } })).toMatch(/three/);
  });

  it('refuses a Small talk card with broken parts', () => {
    expect(reason({ ...talk, kind: 'gossip' })).toBe('unknown small talk kind gossip');
    expect(reason({ ...talk, more: talk.more.slice(0, 2) })).toMatch(/exactly three/);
    expect(reason({ ...talk, donts: [] })).toMatch(/donts must be 1-3/);
    expect(reason({ ...talk, they: '' })).toBe('they must be a non-empty string');
    const { they: _t, ...noThey } = talk;
    expect(reason(noThey)).toBeNull();
  });

  it('refuses a Say it better card with broken parts', () => {
    expect(reason({ ...better, thinking: 'yes' })).toBe('thinking must be true or false');
    expect(reason({ ...better, changes: ['one'] })).toMatch(/changes must be 2-3/);
    expect(reason({ ...better, next: { title: 'Even better', lines: [] } })).toMatch(/next must be/);
  });

  it('refuses an Office phrase card with broken parts', () => {
    expect(reason({ ...phrase, group: 'gossip' })).toBe('unknown phrase group gossip');
    expect(reason({ ...phrase, similar: ['only one'] })).toMatch(/similar must be exactly two/);
    expect(reason({ ...phrase, wrong: 'not a line' })).toMatch(/wrong must be/);
  });

  it('refuses a Stories card with a broken your-turn part', () => {
    expect(reason({ ...story, yourTurn: { prompt: 'Tell it.' } })).toBe('yourTurn must be { prompt, hint }');
    expect(reason({ ...story, yourTurn: { prompt: 'Tell it.', hint: 'Two lines.' } })).toBeNull();
  });
});
