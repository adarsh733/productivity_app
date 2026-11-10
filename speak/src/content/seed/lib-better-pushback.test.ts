import { describe, expect, it } from 'vitest';
import cards from './73-better-pushback.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';
import { tagProblems } from '../../features/cards/cardTags';

// v7 steps 4-6, pass 12: the 115 Say-it-better pairs for pushback, saying no,
// asking for help, explaining work to a non-tech person and the Indian-English fixes.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

describe('library: better-pushback (73-better-pushback.json)', () => {
  it('passes the library check against its outline', () => {
    expect(checkLibraryFile(cards, 'better-pushback', outline['better-pushback'])).toEqual([]);
  });

  it('follows the outline: each situation and topic match its item', () => {
    const items = outline['better-pushback'] ?? [];
    const off = cards
      .map((c, i) => ({ c, item: items[i] }))
      .filter(({ c, item }) => !item || c.situation !== item.head || c.topic !== item.note)
      .map(({ c }) => c.id);
    expect(off).toEqual([]);
  });

  it('teaches each Indian-English fix (revert, do the needful, prepone) exactly once', () => {
    const count = (re: RegExp) => cards.filter((c) => re.test(c.mightSay)).length;
    expect(count(/\brevert\b/i)).toBe(1);
    expect(count(/\bneedful\b/i)).toBe(1);
    expect(count(/\bprepone/i)).toBe(1);
    // Nowhere else in the file: the fix words sit only on their own three cards.
    const elsewhere = cards
      .filter((c) => c.topic !== 'Indian-English fix')
      .filter((c) => /\b(revert|needful|prepone)/i.test(JSON.stringify(c)))
      .map((c) => c.id);
    expect(elsewhere).toEqual([]);
  });

  it('repeats no id and no head from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '73-better-pushback.json': cards,
    })).toEqual([]);
  });
  it('gives every card a topic from the fixed list and a level of 1, 2 or 3', () => {
    const bad = cards.flatMap((card) => tagProblems(card).map((p) => `${card.id}: ${p}`));
    expect(bad).toEqual([]);
  });
});
