import { describe, expect, it } from 'vitest';
import { THEMES } from '../../types/contract';
import { floorFor, knowItLevel, levelOf, tagProblems, themeOf } from './cardTags';

describe('themeOf / levelOf', () => {
  it('reads the tags a card carries', () => {
    expect(themeOf({ theme: 'Money' })).toBe('Money');
    expect(levelOf({ level: 3 })).toBe(3);
  });

  it('an untagged (pre-v8 AI) card is General, level 2', () => {
    expect(themeOf({})).toBe('General');
    expect(themeOf({ theme: '' })).toBe('General');
    expect(levelOf({})).toBe(2);
  });
});

describe('floorFor', () => {
  it('module level 1 serves every card, 2 skips level 1, 3-5 serve level 3 only', () => {
    expect(floorFor(1)).toBe(1);
    expect(floorFor(2)).toBe(2);
    expect(floorFor(3)).toBe(3);
    expect(floorFor(4)).toBe(3);
    expect(floorFor(5)).toBe(3);
  });
});

describe('knowItLevel (answer 1 = A: one tap drops that level and easier)', () => {
  it('Know it on a level-2 card at the start level → only level-3 cards from then on', () => {
    const next = knowItLevel(2, 2);
    expect(next).toBe(3);
    expect(floorFor(next)).toBe(3);
  });

  it('Know it on a level-1 card at module level 1 → level 1 drops', () => {
    expect(knowItLevel(1, 1)).toBe(2);
    expect(floorFor(knowItLevel(1, 1))).toBe(2);
  });

  it('never lowers the module, and a second tap at the same level changes nothing', () => {
    expect(knowItLevel(4, 1)).toBe(4);
    expect(knowItLevel(3, 2)).toBe(3);
    expect(knowItLevel(knowItLevel(2, 2), 2)).toBe(3);
  });

  it('Know it on a level-3 card asks for harder than the library, capped at 5', () => {
    expect(knowItLevel(3, 3)).toBe(4);
    expect(knowItLevel(5, 3)).toBe(5);
  });
});

describe('tagProblems', () => {
  it('a card with a listed theme and level 1-3 is fine', () => {
    for (const theme of THEMES) expect(tagProblems({ theme, level: 1 })).toEqual([]);
    expect(tagProblems({ theme: 'Senses & weather', level: 3 })).toEqual([]);
  });

  it('a topic added via Ask is fine only when passed in', () => {
    expect(tagProblems({ theme: 'Cricket', level: 2 })).toEqual(['unknown theme "Cricket"']);
    expect(tagProblems({ theme: 'Cricket', level: 2 }, ['Cricket'])).toEqual([]);
  });

  it('missing or bad tags are named', () => {
    expect(tagProblems({})).toEqual(['no theme', 'no level']);
    expect(tagProblems({ theme: 'money', level: 2 })).toEqual(['unknown theme "money"']);
    expect(tagProblems({ theme: 'Work', level: 4 })).toEqual(['level must be 1, 2 or 3 (got 4)']);
    expect(tagProblems({ theme: 'Work', level: '2' })).toEqual(['level must be 1, 2 or 3 (got 2)']);
    expect(tagProblems(null)).toEqual(['not a card']);
  });
});
