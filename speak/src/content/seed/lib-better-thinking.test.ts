import { describe, expect, it } from 'vitest';
import cards from './72-better-thinking.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 11: the 115 Say it better pairs for explaining your
// thinking, giving an update, explaining a delay and "what do you do?".
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;
const items = outline['better-thinking']!;

describe('library: better-thinking (72-better-thinking.json)', () => {
  it('passes the library check against its outline', () => {
    expect(checkLibraryFile(cards, 'better-thinking', items)).toEqual([]);
  });

  it('repeats no id and no "you might say" line from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '72-better-thinking.json': cards,
    })).toEqual([]);
  });

  it('follows the outline: situation = idea, topic = group, Explain your thinking = thinking: true (at least 60)', () => {
    cards.forEach((card, i) => {
      expect(card.situation).toBe(items[i]!.head);
      expect(card.topic).toBe(items[i]!.note);
      expect(card.thinking).toBe(items[i]!.note === 'Explain your thinking');
    });
    expect(cards.filter((card) => card.thinking).length).toBeGreaterThanOrEqual(60);
  });

  it('every pair is shorter or clearer, with 2-3 change chips, and leaves the Indian-English fixes to pushback', () => {
    for (const card of cards) {
      expect(card.better).not.toBe(card.mightSay);
      expect(card.changes.length).toBeGreaterThanOrEqual(2);
      expect(card.changes.length).toBeLessThanOrEqual(3);
      for (const phrase of ['revert', 'do the needful', 'prepone']) {
        expect(`${card.mightSay} ${card.better}`.toLowerCase()).not.toContain(phrase);
      }
    }
  });
});
