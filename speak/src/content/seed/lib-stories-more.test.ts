import { describe, expect, it } from 'vitest';
import cards from './77-stories-more.json';
import sampleWords from './50-words.json';
import sampleTalk from './51-small-talk.json';
import sampleBetter from './52-say-it-better.json';
import samplePhrases from './53-office-phrases.json';
import sampleStories from './54-stories.json';
import outlineJson from '../library/outline.json';
import { checkLibrary, checkLibraryFile, type OutlineItem } from '../../db/libraryCheck';

// v7 steps 4-6, pass 16: the 80 Stories pairs (dull report, real story, one trick).
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;
const TOPICS = ['Your day', 'A funny moment', 'A work win', 'Explaining a business idea', 'A trip'];

type Story = { topic: string; report: string; story: string; trick: string; tags: string[]; yourTurn?: { prompt: string; hint: string } };
const stories = cards as Story[];

describe('library: stories-more (77-stories-more.json)', () => {
  it('passes the library file check against its outline', () => {
    expect(checkLibraryFile(cards, 'stories-more', outline['stories-more'])).toEqual([]);
  });

  it('repeats no id and no report from the 50-54 sample files', () => {
    expect(checkLibrary({
      '50-words.json': sampleWords,
      '51-small-talk.json': sampleTalk,
      '52-say-it-better.json': sampleBetter,
      '53-office-phrases.json': samplePhrases,
      '54-stories.json': sampleStories,
      '77-stories-more.json': cards,
    })).toEqual([]);
  });

  it('follows the outline topics, 16 cards on each of the five', () => {
    expect(stories.map((c) => c.topic)).toEqual(outline['stories-more']!.map((o) => o.note));
    for (const topic of TOPICS) expect(stories.filter((c) => c.topic === topic)).toHaveLength(16);
  });

  it('gives about 1 in 3 cards a your-turn, each with a prompt and a hint', () => {
    const turns = stories.filter((c) => c.yourTurn);
    expect(turns.length).toBeGreaterThanOrEqual(24);
    expect(turns.length).toBeLessThanOrEqual(30);
    for (const c of turns) {
      expect(c.yourTurn!.prompt.trim()).not.toBe('');
      expect(c.yourTurn!.hint.trim()).not.toBe('');
    }
  });

  it('keeps every pair distinct: a dull report, a different real story, a one-line trick', () => {
    expect(new Set(stories.map((c) => c.story)).size).toBe(80);
    for (const c of stories) {
      expect(c.story).not.toBe(c.report);
      expect(c.trick.includes('\n')).toBe(false);
      expect(c.tags).toContain('stories');
      expect(c).not.toHaveProperty('analogy');
      expect(c).not.toHaveProperty('credit');
      expect(c).not.toHaveProperty('research');
    }
  });
});
