import { describe, expect, it } from 'vitest';
import cards from './61-words-feelings.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 4: the 97 Words cards about feelings.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('v7 library: words-feelings', () => {
  it('passes the library rules and follows its outline card by card', () => {
    expect(checkLibraryFile(cards, 'words-feelings', outline['words-feelings'])).toEqual([]);
  });

  it('repeats no id or word from the 100 sample cards', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '61-words-feelings.json': cards,
    })).toEqual([]);
  });
});
