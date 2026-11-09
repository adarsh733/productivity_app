import { describe, expect, it } from 'vitest';
import cards from './63-words-thinking.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 6: the 97 Words cards for "thinking and deciding".
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('library: words-thinking (63-words-thinking.json)', () => {
  it('passes the library check against its outline', () => {
    expect(checkLibraryFile(cards, 'words-thinking', outline['words-thinking'])).toEqual([]);
  });

  it('repeats no id and no word from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '63-words-thinking.json': cards,
    })).toEqual([]);
  });
});
