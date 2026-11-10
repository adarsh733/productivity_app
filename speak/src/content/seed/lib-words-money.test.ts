import { describe, expect, it } from 'vitest';
import cards from './65-words-money-time.json';
import { tagProblems } from '../../features/cards/cardTags';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 8: the 96 Words cards on money and time.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('library: words-money (65-words-money-time.json)', () => {
  it('passes the library file check against its outline', () => {
    expect(checkLibraryFile(cards, 'words-money', outline['words-money'])).toEqual([]);
  });

  it('repeats no id and no word from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '65-words-money-time.json': cards,
    })).toEqual([]);
  });

  it('keeps to the plain shape: no analogy, credit or research, a ✓ right line, quick checks only on every 3rd card', () => {
    (cards as Record<string, unknown>[]).forEach((card, i) => {
      expect(card).not.toHaveProperty('analogy');
      expect(card).not.toHaveProperty('credit');
      expect(card).not.toHaveProperty('research');
      expect(String((card.right as { label: string }).label).startsWith('✓')).toBe(true);
      expect(card.tags).toEqual(['words', String(card.topic).toLowerCase()]);
      expect(card.check !== undefined).toBe((i + 1) % 3 === 0);
    });
  });

  it('gives every card a topic from the fixed list and a level 1-3', () => {
    expect(cards.flatMap((c) => tagProblems(c))).toEqual([]);
  });
});
