import { describe, expect, it } from 'vitest';
import cards from './71-talk-home.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outline from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

const items = (outline as unknown as Record<string, OutlineItem[]>)['talk-home'] ?? [];

describe('v7 library: talk-home (71-talk-home.json)', () => {
  it('passes the library check card by card against its outline', () => {
    expect(checkLibraryFile(cards, 'talk-home', items)).toEqual([]);
  });

  it('keeps each card on its outline kind (all 5 kinds)', () => {
    const wrongKind = cards.filter((c, i) => c.kind !== items[i]?.note.split(' · ')[0]).map((c) => c.id);
    expect(wrongKind).toEqual([]);
    expect(new Set(cards.map((c) => c.kind))).toEqual(new Set(['reply', 'open', 'keep_going', 'exit', 'save_it']));
  });

  it('repeats no id and no moment from the 50-54 samples', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '71-talk-home.json': cards,
    })).toEqual([]);
  });
});
