import { describe, expect, it } from 'vitest';
import cards from './60-words-senses.json';
import { tagProblems } from '../../features/cards/cardTags';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 3: the 97 Words cards on sounds and senses.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('library: words-senses (60-words-senses.json)', () => {
  it('passes the library file check against its outline', () => {
    expect(checkLibraryFile(cards, 'words-senses', outline['words-senses'])).toEqual([]);
  });

  it('repeats no id and no word from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '60-words-senses.json': cards,
    })).toEqual([]);
  });

  it('keeps to the plain shape: no analogy, credit or research fields, a ✓ right line, every card in the senses group', () => {
    for (const card of cards as Record<string, unknown>[]) {
      expect(card).not.toHaveProperty('analogy');
      expect(card).not.toHaveProperty('credit');
      expect(card).not.toHaveProperty('research');
      expect(card.tags).toContain('senses');
      expect(String((card.right as { label: string }).label).startsWith('✓')).toBe(true);
    }
  });

  it('gives every card a topic from the fixed list and a level 1-3', () => {
    expect(cards.flatMap((c) => tagProblems(c))).toEqual([]);
  });
});
