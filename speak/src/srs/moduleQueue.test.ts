import { describe, expect, it } from 'vitest';
import type {
  DayKey,
  ModuleCard,
  ModuleId,
  OfficePhraseCard,
  SayBetterCard,
  SmallTalkCard,
  StoryCard,
  WordsCard,
} from '../types/contract';
import { buildModuleQueue, seenHeadKey } from './moduleQueue';

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
