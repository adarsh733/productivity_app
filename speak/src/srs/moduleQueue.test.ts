import { describe, expect, it } from 'vitest';
import type {
  CardLevel,
  DayKey,
  ModuleCard,
  ModuleId,
  OfficePhraseCard,
  SayBetterCard,
  SmallTalkCard,
  StoryCard,
  WordsCard,
} from '../types/contract';
import { RUN_LENGTH, belowFloor, buildModuleQueue, seenHeadKey } from './moduleQueue';
import { themeOf } from '../features/cards/cardTags';

function makeCard(id: string, module: ModuleId): ModuleCard {
  switch (module) {
    case 'words':
      return {
        id,
        type: 'module',
        module: 'words',
        lang: 'en',
        topic: 'vocabulary',
        word: `Word-${id}`,
        pos: 'noun',
        say: 'say',
        meaning: 'meaning',
        examples: [
          { label: 'Ex 1', text: 'Sentence **word**' },
          { label: 'Ex 2', text: 'Another **word**' },
        ],
        right: { label: 'Right', text: 'Right' },
        wrong: [{ label: 'Wrong', text: 'Wrong' }],
        rule: 'rule',
      } as WordsCard;
    case 'smalltalk':
      return {
        id,
        type: 'module',
        module: 'smalltalk',
        lang: 'en',
        topic: 'chit-chat',
        kind: 'reply',
        moment: 'moment',
        deadEnd: 'dead',
        reply: 'reply',
        formula: 'formula',
        more: [
          { label: '1', text: 'Line 1' },
          { label: '2', text: 'Line 2' },
          { label: '3', text: 'Line 3' },
        ],
        donts: ['dont do this'],
      } as SmallTalkCard;
    case 'better':
      return {
        id,
        type: 'module',
        module: 'better',
        lang: 'en',
        topic: 'speaking',
        situation: 'situation',
        thinking: true,
        mightSay: 'might',
        better: 'better',
        changes: ['a', 'b'],
        next: { title: 'Next', lines: [{ label: '1', text: 'Line 1' }] },
      } as SayBetterCard;
    case 'phrases':
      return {
        id,
        type: 'module',
        module: 'phrases',
        lang: 'en',
        topic: 'office',
        group: 'meetings',
        phrase: 'touch base',
        meaning: 'connect',
        useWhen: 'planning',
        example: 'Let us touch base tomorrow',
        tone: 'casual',
        careful: 'careful note',
        wrong: { label: 'Wrong', text: 'Wrong use' },
        similar: ['check in', 'follow up'],
      } as OfficePhraseCard;
    case 'stories':
      return {
        id,
        type: 'module',
        module: 'stories',
        lang: 'en',
        topic: 'storytelling',
        report: 'Report style',
        story: 'Story style',
        trick: 'The trick',
      } as StoryCard;
  }
}

describe('buildModuleQueue', () => {
  const today: DayKey = '2026-11-08';

  it('round-robins across the 5 modules in Mix mode', () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
      makeCard('p-1', 'phrases'),
      makeCard('st-1', 'stories'),
      makeCard('w-2', 'words'),
      makeCard('s-2', 'smalltalk'),
      makeCard('b-2', 'better'),
      makeCard('p-2', 'phrases'),
      makeCard('st-2', 'stories'),
    ];

    const queue = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(queue.length).toBe(10);
    // First round of 5 must cover all 5 distinct modules
    const firstRound = queue.slice(0, 5).map((c) => c.module);
    expect(firstRound).toEqual(['words', 'smalltalk', 'better', 'phrases', 'stories']);
    // Second round of 5 also covers all 5
    const secondRound = queue.slice(5, 10).map((c) => c.module);
    expect(secondRound).toEqual(['words', 'smalltalk', 'better', 'phrases', 'stories']);
  });

  it('never places the same module twice in a row when another module has cards left', () => {
    // Unbalanced deck: 6 words, 1 smalltalk, 2 better, 1 phrases, 1 stories
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('w-3', 'words'),
      makeCard('w-4', 'words'),
      makeCard('w-5', 'words'),
      makeCard('w-6', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
      makeCard('b-2', 'better'),
      makeCard('p-1', 'phrases'),
      makeCard('st-1', 'stories'),
    ];

    const queue = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 20,
    });

    expect(queue.length).toBe(11);

    // Verify: for every consecutive pair (i, i+1), if they share the same module,
    // then NO other module must have been remaining at position i+1.
    for (let i = 0; i < queue.length - 1; i++) {
      if (queue[i]!.module === queue[i + 1]!.module) {
        // All subsequent cards must belong to that same module (meaning no other was left)
        const remaining = queue.slice(i + 1);
        const allSame = remaining.every((c) => c.module === queue[i]!.module);
        expect(allSame).toBe(true);
      }
    }
  });

  it('filters by single module when not in mix mode', () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
      makeCard('p-1', 'phrases'),
      makeCard('st-1', 'stories'),
    ];

    const wordsQueue = buildModuleQueue(cards, {
      today,
      filter: 'words',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(wordsQueue.length).toBe(2);
    expect(wordsQueue.every((c) => c.module === 'words')).toBe(true);

    const betterQueue = buildModuleQueue(cards, {
      today,
      filter: 'better',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(betterQueue.length).toBe(1);
    expect(betterQueue[0]?.id).toBe('b-1');
  });

  it('ignores non-module cards', () => {
    const mixed = [
      makeCard('w-1', 'words'),
      { id: 'old-1', type: 'word', lang: 'en', word: 'test' } as unknown as ModuleCard,
      { id: 'teach-1', type: 'teach', lang: 'en', skill: 'words' } as unknown as ModuleCard,
      makeCard('s-1', 'smalltalk'),
    ];

    const queue = buildModuleQueue(mixed, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(queue.map((c) => c.id)).toEqual(['w-1', 's-1']);
  });

  it('excludes already-seen cards', () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('s-1', 'smalltalk'),
    ];

    const queue = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(['w-1']),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(queue.map((c) => c.id)).toEqual(['w-2', 's-1']);
  });

  it('excludes hidden cards', () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('s-1', 'smalltalk'),
    ];

    const queue = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(['s-1']),
      limit: 10,
    });

    expect(queue.map((c) => c.id)).toEqual(['w-1', 'w-2']);
  });

  it('deterministically shuffles cards using dayCardHash based on today', () => {
    const ids = ['apple', 'zebra', 'banana', 'orange', 'grape', 'melon', 'cherry'];
    const cards: ModuleCard[] = ids.map((id) => makeCard(id, 'words'));

    const queueDay1 = buildModuleQueue(cards, {
      today: '2026-11-08',
      filter: 'words',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    const queueDay1Again = buildModuleQueue(cards, {
      today: '2026-11-08',
      filter: 'words',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    // Identical on the same day
    expect(queueDay1.map((c) => c.id)).toEqual(queueDay1Again.map((c) => c.id));

    // Permuted on a different day
    const queueDay2 = buildModuleQueue(cards, {
      today: '2026-11-20',
      filter: 'words',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 10,
    });

    expect(queueDay1.map((c) => c.id)).not.toEqual(queueDay2.map((c) => c.id));
  });

  it('respects limit and returns empty array when limit <= 0', () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
    ];

    const qLimit2 = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 2,
    });
    expect(qLimit2.length).toBe(2);

    const qLimit0 = buildModuleQueue(cards, {
      today,
      filter: 'mix',
      seenIds: new Set(),
      hiddenIds: new Set(),
      limit: 0,
    });
    expect(qLimit0).toEqual([]);
  });
  describe('review slot and seen heads', () => {
    const base = { today, seenIds: new Set<string>(), hiddenIds: new Set<string>(), limit: 10 };

    it('puts review cards first, in the order given, even when seen', () => {
      const cards = [
        makeCard('w-1', 'words'),
        makeCard('w-2', 'words'),
        makeCard('s-1', 'smalltalk'),
        makeCard('b-1', 'better'),
      ];
      const queue = buildModuleQueue(cards, {
        ...base,
        filter: 'mix',
        seenIds: new Set(['s-1', 'w-2']),
        reviewIds: ['s-1', 'w-2'],
      });
      expect(queue.map((c) => c.id)).toEqual(['s-1', 'w-2', 'w-1', 'b-1']);
    });

    it('a review card never appears twice, and a hidden one stays out', () => {
      const cards = [makeCard('w-1', 'words'), makeCard('w-2', 'words'), makeCard('w-3', 'words')];
      const queue = buildModuleQueue(cards, {
        ...base,
        filter: 'words',
        hiddenIds: new Set(['w-3']),
        reviewIds: ['w-2', 'w-2', 'w-3', 'missing'],
      });
      expect(queue.map((c) => c.id)).toEqual(['w-2', 'w-1']);
    });

    it('review cards follow the module filter and the limit', () => {
      const cards = [
        makeCard('w-1', 'words'),
        makeCard('w-2', 'words'),
        makeCard('s-1', 'smalltalk'),
      ];
      const onlyWords = buildModuleQueue(cards, {
        ...base,
        filter: 'words',
        reviewIds: ['s-1', 'w-2'],
      });
      expect(onlyWords.map((c) => c.id)).toEqual(['w-2', 'w-1']);

      const capped = buildModuleQueue(cards, {
        ...base,
        filter: 'mix',
        limit: 1,
        reviewIds: ['s-1', 'w-2'],
      });
      expect(capped.map((c) => c.id)).toEqual(['s-1']);
    });

    it('skips a card whose head was already seen under another id', () => {
      const first = makeCard('w-1', 'words'); // head: Word-w-1
      const twin = { ...makeCard('w-9', 'words'), word: 'WORD-W-1' } as ModuleCard;
      const other = makeCard('w-2', 'words');
      const queue = buildModuleQueue([twin, other], {
        ...base,
        filter: 'words',
        seenHeads: new Set([seenHeadKey(first)]),
      });
      expect(queue.map((c) => c.id)).toEqual(['w-2']);

      const bare = buildModuleQueue([twin, other], {
        ...base,
        filter: 'words',
        seenHeads: new Set(['word-w-1']),
      });
      expect(bare.map((c) => c.id)).toEqual(['w-2']);
    });

    it('a review card is exempt from seen heads', () => {
      const card = makeCard('w-1', 'words');
      const queue = buildModuleQueue([card], {
        ...base,
        filter: 'mix',
        seenHeads: new Set([seenHeadKey(card)]),
        seenIds: new Set(['w-1']),
        reviewIds: ['w-1'],
      });
      expect(queue.map((c) => c.id)).toEqual(['w-1']);
    });

    it('seenHeadKey is module plus lower-case head', () => {
      expect(seenHeadKey(makeCard('x', 'words'))).toBe('words:word-x');
      expect(seenHeadKey(makeCard('x', 'phrases'))).toBe('phrases:touch base');
    });
  });
});

// ─── v8 (2026-11-10): levels, topic runs, 👍 weights, front cards ─────────────

const MODS: ModuleId[] = ['words', 'smalltalk', 'better', 'phrases', 'stories'];

function tagged(id: string, module: ModuleId, theme?: string, level?: CardLevel): ModuleCard {
  const c = makeCard(id, module) as ModuleCard & { theme?: string; level?: CardLevel };
  if (theme !== undefined) c.theme = theme;
  if (level !== undefined) c.level = level;
  return c;
}

/** `n` cards of one theme, spread over the 5 modules. */
function themeDeck(theme: string, n: number, level?: CardLevel): ModuleCard[] {
  return Array.from({ length: n }, (_, i) => tagged(`${theme}-${i}`, MODS[i % 5]!, theme, level));
}

describe('buildModuleQueue v8 options', () => {
  const today: DayKey = '2026-11-10';
  const base = { today, seenIds: new Set<string>(), hiddenIds: new Set<string>(), limit: 200 };

  it('RUN_LENGTH is 4 cards (answer 2 = B)', () => {
    expect(RUN_LENGTH).toBe(4);
  });

  it('no v8 options gives exactly the v7 order', () => {
    const cards = [...themeDeck('Money', 7, 1), ...themeDeck('Food', 6, 3), ...themeDeck('Work', 5)];
    for (const filter of ['mix', 'words', 'stories'] as const) {
      const v7 = buildModuleQueue(cards, { ...base, filter }).map((c) => c.id);
      expect(buildModuleQueue(cards, { ...base, filter, runLength: 1 }).map((c) => c.id)).toEqual(v7);
      // Weights alone change nothing: they only steer topic runs.
      expect(
        buildModuleQueue(cards, { ...base, filter, themeWeights: { Money: 9 } }).map((c) => c.id),
      ).toEqual(v7);
      expect(buildModuleQueue(cards, { ...base, filter, frontIds: [] }).map((c) => c.id)).toEqual(v7);
    }
    // v7 Mix is still the strict round-robin, level-1 cards included.
    const mix = buildModuleQueue(cards, { ...base, filter: 'mix' });
    expect(mix.slice(0, 5).map((c) => c.module)).toEqual(MODS);
    expect(mix).toHaveLength(cards.length);
  });

  it('skips level-1 cards at the start: a module with no level is at level 2 (answer 8 = A)', () => {
    const cards = MODS.flatMap((m) => [
      tagged(`${m}-l1`, m, 'General', 1),
      tagged(`${m}-l2`, m, 'General', 2),
      tagged(`${m}-l3`, m, 'General', 3),
      tagged(`${m}-none`, m), // no level stored: counts as 2
    ]);
    const start = buildModuleQueue(cards, { ...base, filter: 'mix', levels: {} });
    expect(start).toHaveLength(15);
    expect(start.some((c) => c.id.endsWith('-l1'))).toBe(false);
    expect(start.some((c) => c.id.endsWith('-none'))).toBe(true);

    // Words back at level 1 brings its level-1 card back, only for Words.
    const wordsEasy = buildModuleQueue(cards, { ...base, filter: 'mix', levels: { words: 1 } });
    expect(wordsEasy.filter((c) => c.id.endsWith('-l1')).map((c) => c.id)).toEqual(['words-l1']);

    // Level 3 and above serve level-3 cards only.
    for (const lv of [3, 4, 5] as const) {
      const hard = buildModuleQueue(cards, { ...base, filter: 'words', levels: { words: lv } });
      expect(hard.map((c) => c.id)).toEqual(['words-l3']);
    }
    expect(belowFloor(cards[1]!, { words: 3 })).toBe(true);
    expect(belowFloor(cards[2]!, { words: 3 })).toBe(false);
  });

  it('a ♡ review card is served even below the floor', () => {
    const easy = tagged('w-easy', 'words', 'General', 1);
    const queue = buildModuleQueue([easy, tagged('w-3', 'words', 'General', 3)], {
      ...base,
      filter: 'words',
      levels: { words: 3 },
      reviewIds: ['w-easy'],
    });
    expect(queue.map((c) => c.id)).toEqual(['w-easy', 'w-3']);
  });

  it('serves topic runs of RUN_LENGTH cards of one theme, spread across modules (answer 3 = A)', () => {
    const cards = [...themeDeck('Money', 12), ...themeDeck('Food', 12), ...themeDeck('Travel', 12)];
    const queue = buildModuleQueue(cards, { ...base, filter: 'mix', runLength: RUN_LENGTH });
    expect(queue).toHaveLength(36);
    const runs: ModuleCard[][] = [];
    for (let i = 0; i < queue.length; i += RUN_LENGTH) runs.push(queue.slice(i, i + RUN_LENGTH));
    for (const run of runs) {
      expect(new Set(run.map((c) => themeOf(c))).size).toBe(1);
      // one topic across modules: never two cards of one module in a row inside a run
      for (let i = 1; i < run.length; i++) expect(run[i]!.module).not.toBe(run[i - 1]!.module);
    }
    // never the same theme twice in a row while another has cards
    for (let i = 1; i < runs.length; i++) {
      const prev = themeOf(runs[i - 1]![0]!);
      const otherLeft = queue.slice(i * RUN_LENGTH).some((c) => themeOf(c) !== prev);
      if (otherLeft) expect(themeOf(runs[i]![0]!)).not.toBe(prev);
    }
    // same day, same order; another day, another order
    const again = buildModuleQueue(cards, { ...base, filter: 'mix', runLength: RUN_LENGTH });
    expect(again.map((c) => c.id)).toEqual(queue.map((c) => c.id));
    const other = buildModuleQueue(cards, {
      ...base,
      today: '2026-11-21',
      filter: 'mix',
      runLength: RUN_LENGTH,
    });
    expect(other.map((c) => c.id)).not.toEqual(queue.map((c) => c.id));
  });

  it('a single-module feed also runs by theme; cards with no theme count as General', () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => tagged(`m-${i}`, 'words', 'Money')),
      ...Array.from({ length: 6 }, (_, i) => tagged(`g-${i}`, 'words')),
      tagged('s-1', 'smalltalk', 'Money'),
    ];
    const queue = buildModuleQueue(cards, { ...base, filter: 'words', runLength: RUN_LENGTH });
    expect(queue).toHaveLength(12);
    expect(queue.every((c) => c.module === 'words')).toBe(true);
    expect(new Set(queue.slice(0, 4).map((c) => themeOf(c))).size).toBe(1);
    expect(themeOf(queue[4]!)).not.toBe(themeOf(queue[0]!));
  });

  it('a theme that runs out lets the other theme repeat, and nothing is lost', () => {
    const cards = [...themeDeck('Money', 14), ...themeDeck('Food', 2)];
    const queue = buildModuleQueue(cards, {
      ...base,
      filter: 'mix',
      runLength: RUN_LENGTH,
      themeWeights: { Money: 1000 },
    });
    expect(queue).toHaveLength(16);
    // Heavy Money still lets Food in as the second run.
    expect(queue.slice(0, 4).every((c) => themeOf(c) === 'Money')).toBe(true);
    expect(queue.slice(4, 6).every((c) => themeOf(c) === 'Food')).toBe(true);
    expect(queue.slice(6).every((c) => themeOf(c) === 'Money')).toBe(true);
  });

  it('themes with more 👍 come up more often, Ask "fewer" less often', () => {
    const themes = ['Money', 'Food', 'Travel', 'Work', 'Home'];
    const cards = themes.flatMap((t) => themeDeck(t, 20));
    const moneyEarly = (weights?: Record<string, number>) => {
      let n = 0;
      for (let d = 1; d <= 30; d++) {
        const q = buildModuleQueue(cards, {
          ...base,
          today: `2026-12-${String(d).padStart(2, '0')}`,
          filter: 'mix',
          runLength: RUN_LENGTH,
          limit: 12,
          themeWeights: weights,
        });
        n += q.filter((c) => themeOf(c) === 'Money').length;
      }
      return n;
    };
    const plain = moneyEarly();
    expect(moneyEarly({ Money: 4 })).toBeGreaterThan(plain * 1.5);
    expect(moneyEarly({ Money: 0.25 })).toBeLessThan(plain);
  });

  it('front cards come next after review cards, mixed in one-for-one (answer 4 = A)', () => {
    const cards = [
      ...themeDeck('General', 10),
      tagged('ai-1', 'words', 'Money', 3),
      tagged('ai-2', 'words', 'Money', 3),
      tagged('ai-3', 'words', 'Money', 3),
      tagged('ai-seen', 'words', 'Money', 3),
      tagged('ai-easy', 'words', 'Money', 1),
    ];
    const queue = buildModuleQueue(cards, {
      ...base,
      filter: 'mix',
      seenIds: new Set(['ai-seen']),
      reviewIds: ['General-4'],
      levels: {},
      runLength: RUN_LENGTH,
      frontIds: ['ai-3', 'ai-1', 'ai-seen', 'ai-easy', 'missing', 'ai-2', 'ai-1'],
    });
    const ids = queue.map((c) => c.id);
    expect(ids[0]).toBe('General-4');
    expect([ids[1], ids[3], ids[5]]).toEqual(['ai-3', 'ai-1', 'ai-2']);
    for (const i of [2, 4, 6]) expect(ids[i]!.startsWith('General-')).toBe(true);
    // seen and too-easy front cards still stay out; nothing appears twice
    expect(ids).not.toContain('ai-seen');
    expect(ids).not.toContain('ai-easy');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(13);

    // front cards follow the module filter and the limit
    const stories = buildModuleQueue(cards, { ...base, filter: 'stories', frontIds: ['ai-1'] });
    expect(stories.map((c) => c.id)).not.toContain('ai-1');
    const capped = buildModuleQueue(cards, { ...base, filter: 'mix', limit: 2, frontIds: ['ai-2'] });
    expect(capped.map((c) => c.id)).toHaveLength(2);
    expect(capped[0]!.id).toBe('ai-2');
  });
});
