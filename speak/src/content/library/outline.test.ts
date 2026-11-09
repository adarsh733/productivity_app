import { describe, expect, it } from 'vitest';
import outlineJson from './outline.json';
import sampleWords from '../seed/50-words.json';
import sampleTalk from '../seed/51-small-talk.json';
import sampleBetter from '../seed/52-say-it-better.json';
import samplePhrases from '../seed/53-office-phrases.json';
import sampleStories from '../seed/54-stories.json';

// Self-contained check of the v7 library outline (steps 4-6, pass 2).
// Every card-writing pass (p3-p16) writes its cards from its list here, so this test keeps
// the lists apart: right counts, no repeats inside a module (also against the 100 samples),
// the 40 / 40 / 20 level mix (answer 4A), all five small-talk kinds, and no Hindi.

interface OutlineItem { id: string; head: string; level?: number; note: string }
const outline = outlineJson as Record<string, OutlineItem[]>;

type Module = 'words' | 'smalltalk' | 'better' | 'phrases' | 'stories';
const KEYS: Record<string, { module: Module; count: number }> = {
  'words-senses': { module: 'words', count: 97 },
  'words-feelings': { module: 'words', count: 97 },
  'words-people': { module: 'words', count: 97 },
  'words-thinking': { module: 'words', count: 97 },
  'words-work': { module: 'words', count: 96 },
  'words-money': { module: 'words', count: 96 },
  'talk-office': { module: 'smalltalk', count: 115 },
  'talk-home': { module: 'smalltalk', count: 115 },
  'better-thinking': { module: 'better', count: 115 },
  'better-pushback': { module: 'better', count: 115 },
  'phrases-meetings': { module: 'phrases', count: 105 },
  'phrases-email': { module: 'phrases', count: 90 },
  'phrases-pushback': { module: 'phrases', count: 85 },
  'stories-more': { module: 'stories', count: 80 },
};

const WORD_GROUP: Record<string, string> = {
  'words-senses': 'sounds and senses', 'words-feelings': 'feelings', 'words-people': 'people',
  'words-thinking': 'thinking and deciding', 'words-work': 'work', 'words-money': 'money and time',
};
const PHRASE_GROUPS: Record<string, Record<string, number>> = {
  'phrases-meetings': { meetings: 70, praise: 35 },
  'phrases-email': { email: 70, idioms: 20 },
  'phrases-pushback': { pushback: 45, deadlines: 40 },
};
const TALK_KINDS = ['reply', 'open', 'keep_going', 'exit', 'save_it'];
const TALK_SETTINGS: Record<string, string[]> = {
  'talk-office': ['office', 'client calls'],
  'talk-home': ['family', 'friends', 'weddings'],
};
const BETTER_SITUATIONS: Record<string, string[]> = {
  'better-thinking': ['Explain your thinking', 'Giving an update', 'Explaining a delay', 'What do you do?'],
  'better-pushback': ['Disagreeing politely', 'Saying no', 'Asking for help', 'Explaining work to a non-tech person', 'Indian-English fix'],
};
const STORY_TOPICS = ['Your day', 'A funny moment', 'A work win', 'Explaining a business idea', 'A trip'];
const HINDI = ['yaar', 'accha', 'achha', 'arre', 'haan', 'nahi', 'bhai', 'bhaiya', 'chalo', 'theek', 'jugaad', 'ji'];

/** Lower case, punctuation folded to spaces: "Let's wrap up." and "lets wrap up" are one head. */
const norm = (t: string) => t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SAMPLE_HEADS: Record<Module, string[]> = {
  words: sampleWords.map((c) => c.word),
  smalltalk: sampleTalk.map((c) => c.moment),
  better: sampleBetter.map((c) => c.mightSay),
  phrases: samplePhrases.map((c) => c.phrase),
  stories: sampleStories.map((c) => c.report),
};
const pct = (n: number, of: number) => (100 * n) / of;
const items = (key: string): OutlineItem[] => outline[key] ?? [];

describe('v7 library outline', () => {
  it('has exactly the 14 library keys and 1,400 items', () => {
    expect(Object.keys(outline).sort()).toEqual(Object.keys(KEYS).sort());
    expect(Object.values(outline).reduce((n, list) => n + list.length, 0)).toBe(1400);
  });

  it.each(Object.entries(KEYS))('%s: right count, ids in order, head and note filled', (key, { count }) => {
    const list = items(key);
    expect(list).toHaveLength(count);
    list.forEach((item, i) => {
      expect(item.id).toBe(`v7-${key}-${String(i + 1).padStart(3, '0')}`);
      expect(typeof item.head === 'string' && item.head.trim().length > 0).toBe(true);
      expect(item.head).toBe(item.head.trim());
      expect(typeof item.note === 'string' && item.note.length > 0).toBe(true);
    });
  });

  it('never repeats a head inside a module, across the outline and the 50-54 samples', () => {
    const problems: string[] = [];
    for (const module of ['words', 'smalltalk', 'better', 'phrases', 'stories'] as Module[]) {
      const seen = new Map<string, string>();
      for (const h of SAMPLE_HEADS[module]) seen.set(norm(h), `sample "${h}"`);
      for (const [key, { module: m }] of Object.entries(KEYS)) {
        if (m !== module) continue;
        for (const item of items(key)) {
          const k = norm(item.head);
          const before = seen.get(k);
          if (before) problems.push(`${item.id} "${item.head}" repeats ${before}`);
          else seen.set(k, item.id);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('shows no Hindi: no Devanagari and none of the banned words', () => {
    const banned = new RegExp(`\\b(${HINDI.join('|')})\\b`, 'i');
    const problems = Object.values(outline).flat()
      .filter((item) => /[ऀ-ॿ]/.test(item.head + item.note) || banned.test(item.head) || banned.test(item.note))
      .map((item) => item.id);
    expect(problems).toEqual([]);
  });

  it('only Words and Office phrases carry a level, always 1-3', () => {
    for (const [key, { module }] of Object.entries(KEYS)) {
      for (const item of items(key)) {
        if (module === 'words' || module === 'phrases') expect([1, 2, 3]).toContain(item.level);
        else expect(item.level).toBeUndefined();
      }
    }
  });

  it.each(Object.entries(KEYS).filter(([, v]) => v.module === 'words' || v.module === 'phrases').map(([k]) => k))(
    '%s: level mix is 40% everyday, 40% middle, 20% advanced (answer 4A, within 3 points)', (key) => {
      const list = items(key);
      const share = (l: number) => pct(list.filter((i) => i.level === l).length, list.length);
      expect(Math.abs(share(1) - 40)).toBeLessThanOrEqual(3);
      expect(Math.abs(share(2) - 40)).toBeLessThanOrEqual(3);
      expect(Math.abs(share(3) - 20)).toBeLessThanOrEqual(3);
    });

  it('Words: the note is the file group', () => {
    for (const [key, group] of Object.entries(WORD_GROUP)) {
      expect(items(key).every((i) => i.note === group)).toBe(true);
    }
  });

  it('Office phrases: groups and their sizes per file', () => {
    for (const [key, groups] of Object.entries(PHRASE_GROUPS)) {
      const counts: Record<string, number> = {};
      for (const i of items(key)) counts[i.note] = (counts[i.note] ?? 0) + 1;
      expect(counts).toEqual(groups);
    }
  });

  it('Small talk: note is "kind · setting", every kind at least 15% per file, every setting used', () => {
    for (const [key, settings] of Object.entries(TALK_SETTINGS)) {
      const list = items(key);
      const kinds: Record<string, number> = {};
      const used = new Set<string>();
      for (const item of list) {
        const [kind, setting] = item.note.split(' · ');
        expect(TALK_KINDS).toContain(kind);
        expect(settings).toContain(setting);
        kinds[kind!] = (kinds[kind!] ?? 0) + 1;
        used.add(setting!);
      }
      for (const kind of TALK_KINDS) expect(pct(kinds[kind] ?? 0, list.length)).toBeGreaterThanOrEqual(15);
      expect([...used].sort()).toEqual([...settings].sort());
    }
  });

  it('Say it better: known situations, at least 60 Explain your thinking, Indian-English fixes once each and only in pushback', () => {
    for (const [key, sits] of Object.entries(BETTER_SITUATIONS)) {
      for (const item of items(key)) expect(sits).toContain(item.note);
      for (const sit of sits) expect(items(key).some((i) => i.note === sit)).toBe(true);
    }
    expect(items('better-thinking').filter((i) => i.note === 'Explain your thinking').length).toBeGreaterThanOrEqual(60);
    const fixes = items('better-pushback').filter((i) => i.note === 'Indian-English fix');
    expect(fixes).toHaveLength(3);
    for (const word of [/\brevert\b/i, /\bneedful\b/i, /\bprepone/i]) {
      expect(fixes.filter((i) => word.test(i.head))).toHaveLength(1);
      expect(Object.values(outline).flat().filter((i) => word.test(i.head))).toHaveLength(1);
    }
  });

  it('Stories: 16 ideas for each of the five topics', () => {
    for (const topic of STORY_TOPICS) {
      expect(items('stories-more').filter((i) => i.note === topic)).toHaveLength(16);
    }
    expect(items('stories-more').every((i) => STORY_TOPICS.includes(i.note))).toBe(true);
  });
});
