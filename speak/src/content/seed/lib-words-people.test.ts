import { describe, expect, it } from 'vitest';
import cards from './62-words-people.json';
import { tagProblems } from '../../features/cards/cardTags';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outline from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

const items = (outline as unknown as Record<string, OutlineItem[]>)['words-people'];

describe('v7 library: words-people (62-words-people.json)', () => {
  it('passes the library check card by card against its outline', () => {
    expect(checkLibraryFile(cards, 'words-people', items)).toEqual([]);
  });

  it('repeats no id and no word from the 50-54 samples', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '62-words-people.json': cards,
    })).toEqual([]);
  });

  it('gives every card a topic from the fixed list and a level 1-3', () => {
    expect(cards.flatMap((c) => tagProblems(c))).toEqual([]);
  });
});
