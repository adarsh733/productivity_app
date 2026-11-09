import { describe, expect, it } from 'vitest';
import cards from './75-phrases-email.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 14: the 90 Office-phrase cards for email (70) and idioms (20).
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('library: phrases-email (75-phrases-email.json)', () => {
  it('passes the library check against its outline', () => {
    expect(checkLibraryFile(cards, 'phrases-email', outline['phrases-email'])).toEqual([]);
  });

  it('repeats no id and no phrase from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '75-phrases-email.json': cards,
    })).toEqual([]);
  });

  it('holds 70 email and 20 idiom cards', () => {
    const groups = cards.map((c) => c.group);
    expect(groups.filter((g) => g === 'email')).toHaveLength(70);
    expect(groups.filter((g) => g === 'idioms')).toHaveLength(20);
  });
});
