import { describe, expect, it } from 'vitest';
import cards from './70-talk-office.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';
import { tagProblems } from '../../features/cards/cardTags';

// v7 steps 4-6, pass 9: the 115 Small talk cards for office and client calls.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;
const KINDS = ['reply', 'open', 'keep_going', 'exit', 'save_it'];

describe('library: talk-office (70-talk-office.json)', () => {
  it('passes the library file check against its outline', () => {
    expect(checkLibraryFile(cards, 'talk-office', outline['talk-office'])).toEqual([]);
  });

  it('repeats no id and no moment from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '70-talk-office.json': cards,
    })).toEqual([]);
  });

  it('covers all 5 kinds, each at least 15% of the file, in the kind the outline asks for', () => {
    const items = outline['talk-office']!;
    for (const kind of KINDS) {
      expect(cards.filter((c) => c.kind === kind).length).toBeGreaterThanOrEqual(Math.ceil(cards.length * 0.15));
    }
    cards.forEach((c, i) => expect(c.kind).toBe(items[i]!.note.split(' · ')[0]));
  });

  it('keeps the small talk shape: a dead end, one good reply, a formula, 3 more replies, 1-3 don\'ts, no analogy', () => {
    for (const card of cards as Record<string, unknown>[]) {
      expect(card).not.toHaveProperty('analogy');
      expect(card).not.toHaveProperty('credit');
      expect(card).not.toHaveProperty('research');
      expect(card.tags).toContain('smalltalk');
      expect(String(card.deadEnd).trim()).not.toBe('');
      expect(String(card.reply).trim()).not.toBe('');
      expect(String(card.formula).trim()).not.toBe('');
      expect(card.more).toHaveLength(3);
      const donts = card.donts as string[];
      expect(donts.length).toBeGreaterThanOrEqual(1);
      expect(donts.length).toBeLessThanOrEqual(3);
      expect(card.reply).not.toBe(card.deadEnd);
    }
  });

  it('sets every card in the office or on a client call, as the outline says', () => {
    const items = outline['talk-office']!;
    cards.forEach((c, i) => {
      const setting = items[i]!.note.split(' · ')[1];
      expect(c.tags).toContain(setting === 'client calls' ? 'client-calls' : 'office');
    });
  });
  it('gives every card a topic from the fixed list and a level of 1, 2 or 3', () => {
    const bad = cards.flatMap((card) => tagProblems(card).map((p) => `${card.id}: ${p}`));
    expect(bad).toEqual([]);
  });
});
