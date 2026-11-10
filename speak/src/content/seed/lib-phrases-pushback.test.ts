import { describe, expect, it } from 'vitest';
import cards from './76-phrases-pushback.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';
import { tagProblems } from '../../features/cards/cardTags';

// v7 steps 4-6, pass 15: the 85 Office-phrase cards on pushback (45) and deadlines (40).
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;
const items = outline['phrases-pushback']!;

describe('library: phrases-pushback (76-phrases-pushback.json)', () => {
  it('passes the library file check against its outline', () => {
    expect(checkLibraryFile(cards, 'phrases-pushback', items)).toEqual([]);
  });

  it('repeats no id and no phrase from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '76-phrases-pushback.json': cards,
    })).toEqual([]);
  });

  it('splits 45 pushback and 40 deadlines cards, levels as in the outline', () => {
    expect(cards.filter((c) => c.group === 'pushback')).toHaveLength(45);
    expect(cards.filter((c) => c.group === 'deadlines')).toHaveLength(40);
    expect(cards.map((c) => c.level)).toEqual(items.map((o) => o.level));
  });

  it('keeps to the plain phrase shape: a ✗ wrong use, two similar phrases, no analogy, credit or research', () => {
    for (const card of cards as Record<string, unknown>[]) {
      expect(card).not.toHaveProperty('analogy');
      expect(card).not.toHaveProperty('credit');
      expect(card).not.toHaveProperty('research');
      const wrong = card.wrong as { label: string; text: string };
      expect(wrong.label.startsWith('✗')).toBe(true);
      expect(wrong.text.trim().length).toBeGreaterThan(0);
      expect(card.similar).toHaveLength(2);
      expect(card.tags).toContain(card.group);
    }
  });

  it('gives every card a topic from the fixed list and a level of 1, 2 or 3 (v8)', () => {
    const problems = (cards as unknown[]).flatMap((c) => tagProblems(c).map((p) => `${(c as { id: string }).id}: ${p}`));
    expect(problems).toEqual([]);
  });
});
