import { describe, expect, it } from 'vitest';
import { readSeedFiles, retiredIds, validateSeedCard } from './seedLoader';
import type { BreathCard, CardType, TeachCard } from '../types/contract';

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
