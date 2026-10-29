import { describe, expect, it } from 'vitest';
import type { AnyCard, Card } from '../../types/contract';
import { buildLibraryIndex, queryTokens, searchLibrary } from './librarySearch';

const base = { lang: 'en' as const, tags: [], source: 'seed' as const, status: 'active' as const, createdAt: 0 };

const WORD = {
  ...base,
  id: 'w1',
  type: 'word',
  term: 'ubiquitous',
  pos: 'adj.',
  meaning: 'found everywhere at once',
  examples: ['Phones are ubiquitous.', 'Cloud tools are ubiquitous.'],
  say: '',
} as Card;

const IDIOM = {
  ...base,
  id: 'i1',
  type: 'idiom',
  phrase: 'ballpark figure',
  meaning: 'a rough number',
  scenario: 'when you only need an estimate',
  example: 'Give me a ballpark figure.',
  corporate: true,
} as Card;

const TEACH = {
  ...base,
  id: 't1',
  type: 'teach',
  track: 'clearly',
  level: 1,
  kind: 'fix',
  category: 'hedges',
  title: 'Drop the hedge',
  rule: 'Say the point first, then the reason.',
  examples: { work: 'The release slips a week.', everyday: 'I need an hour.' },
  insteadOf: 'I was just thinking maybe',
  analogy: 'A hedge hides the door.',
  tryPrompt: 'Say it without hedging.',
  register: 'both',
} as unknown as AnyCard;

const HINDI = { ...WORD, id: 'h1', lang: 'hi', term: 'ubiquitous-hi' } as Card;
const REJECTED = { ...IDIOM, id: 'i2', status: 'rejected', phrase: 'ballpark rejected' } as Card;
const BREATH = { ...base, id: 'b1', type: 'breath', drill: 'mpt', title: 'ubiquitous breath', instructions: [], logUnit: 'seconds' } as Card;

const INDEX = buildLibraryIndex([WORD, IDIOM, TEACH, HINDI, REJECTED, BREATH]);

describe('library search (no network)', () => {
  it('finds a word by its first letters as he types', () => {
    const hits = searchLibrary('ubiq', INDEX);
    expect(hits.map((h) => h.card.id)).toEqual(['w1']);
    expect(hits[0]!.title).toBe('ubiquitous');
    expect(hits[0]!.line).toBe('found everywhere at once');
  });

  it('ignores the chip openers and question words', () => {
    expect(queryTokens('What does this word mean: ubiquitous')).toEqual(['ubiquitous']);
    expect(searchLibrary('What does this word mean: ubiquitous', INDEX)[0]!.card.id).toBe('w1');
  });

  it('a headline match beats a match inside the body', () => {
    const hits = searchLibrary('hedge', INDEX);
    expect(hits[0]!.card.id).toBe('t1');
    const bodyOnly = searchLibrary('estimate', INDEX);
    expect(bodyOnly.map((h) => h.card.id)).toEqual(['i1']);
  });

  it('every meaningful word must match, so noise does not come back', () => {
    expect(searchLibrary('ubiquitous banana', INDEX)).toEqual([]);
  });

  it('leaves out Hindi, rejected and drill cards', () => {
    const ids = searchLibrary('ubiquitous', INDEX).map((h) => h.card.id);
    expect(ids).toEqual(['w1']);
    expect(searchLibrary('rejected', INDEX)).toEqual([]);
  });

  it('needs two characters, and honours the limit', () => {
    expect(searchLibrary('u', INDEX)).toEqual([]);
    expect(searchLibrary('', INDEX)).toEqual([]);
    const many = buildLibraryIndex(
      Array.from({ length: 12 }, (_, i) => ({ ...WORD, id: `m${i}`, term: `ubiquity${i}` }) as Card),
    );
    expect(searchLibrary('ubiquity', many, 3)).toHaveLength(3);
  });

  it('is fast enough to run on every keystroke over a big deck', () => {
    const big = buildLibraryIndex(
      Array.from({ length: 3000 }, (_, i) => ({ ...WORD, id: `x${i}`, term: `term${i}`, meaning: `meaning ${i}` }) as Card),
    );
    const t0 = performance.now();
    searchLibrary('term29', big);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
