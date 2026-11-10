import { describe, expect, it } from 'vitest';
import cards from './74-phrases-meetings.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';
import { tagProblems } from '../../features/cards/cardTags';

// v7 steps 4-6, pass 13: the 105 Office-phrase cards for meetings (70) and praise (35).
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('v7 library: phrases-meetings (74-phrases-meetings.json)', () => {
  it('passes the library rules and follows its outline card by card', () => {
    expect(checkLibraryFile(cards, 'phrases-meetings', outline['phrases-meetings'])).toEqual([]);
  });

  it('has 70 meetings cards then 35 praise cards', () => {
    expect(cards.filter((c) => c.group === 'meetings')).toHaveLength(70);
    expect(cards.filter((c) => c.group === 'praise')).toHaveLength(35);
  });

  it('gives every card a meaning, when to use it, an example, a tone chip, a careful line and 2 similar phrases', () => {
    const missing = cards.filter((c) =>
      ![c.meaning, c.useWhen, c.example, c.tone, c.careful, c.wrong.text].every((s) => typeof s === 'string' && s.trim())
      || c.similar.length !== 2);
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it('repeats no id or phrase from the 100 sample cards', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '74-phrases-meetings.json': cards,
    })).toEqual([]);
  });

  it('gives every card a topic from the fixed list and a level of 1, 2 or 3 (v8)', () => {
    const problems = (cards as unknown[]).flatMap((c) => tagProblems(c).map((p) => `${(c as { id: string }).id}: ${p}`));
    expect(problems).toEqual([]);
  });
});
