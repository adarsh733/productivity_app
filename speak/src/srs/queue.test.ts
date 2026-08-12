import { describe, expect, it } from 'vitest';
import { buildQueue } from './queue';
import { newReview } from './scheduler';
import { QUEUE_RULES } from '../types/contract';
import type { Card, CardType, QueueOptions, Review } from '../types/contract';

const TODAY = '2026-08-11';

function card(id: string, type: CardType, lang: 'en' | 'hi' = 'en'): Card {
  const base = {
    id,
    lang,
    tags: [],
    source: 'seed' as const,
    status: 'active' as const,
    createdAt: 0,
  };
  switch (type) {
    case 'word':
      return { ...base, type, term: id, pos: 'n.', meaning: '', examples: ['', ''], say: '' };
    case 'swap':
      return { ...base, type, weak: id, answers: ['x'], timerSec: 5 };
    case 'idiom':
      return { ...base, type, phrase: id, meaning: '', scenario: '', example: '', corporate: true };
    case 'action_verb':
      return { ...base, type, verb: id, meaning: '', contrast: '', examples: ['', ''] };
    case 'pronounce':
      return { ...base, type, term: id, syllables: id, stressIndex: 0 };
    case 'say_it':
      return { ...base, type, line: id, marked: id, targetWpm: 140 };
    case 'breath':
      return { ...base, type, drill: 'mpt', title: id, instructions: [], logUnit: 'seconds' };
  }
}

function opts(over: Partial<QueueOptions> = {}): QueueOptions {
  return {
    today: TODAY,
    seenCardIds: new Set(),
    breathServedToday: 0,
    newServedToday: 0,
    limit: 10,
    mode: 'endless',
    ...over,
  };
}

const NONE = new Map<string, Review>();

describe('core mode', () => {
  const deck = [
    card('b1', 'breath'),
    card('s1', 'say_it'),
    card('w1', 'word'),
    card('i1', 'idiom'),
  ];

  it('returns exactly the Core 3, in the contracted order', () => {
    const q = buildQueue(deck, NONE, opts({ mode: 'core' }));
    expect(q.map((i) => i.card.type)).toEqual(QUEUE_RULES.CORE_SEQUENCE);
    expect(q).toHaveLength(3);
    expect(q.every((i) => i.reason === 'core')).toBe(true);
  });

  it('never puts a Hindi card in the Core 3', () => {
    const hindiOnly = [card('b1', 'breath'), card('s1', 'say_it'), card('hw', 'word', 'hi')];
    const q = buildQueue(hindiOnly, NONE, opts({ mode: 'core' }));
    expect(q.map((i) => i.card.id)).not.toContain('hw');
  });

  it('prefers a card that is due over one he has never seen', () => {
    const reviews = new Map<string, Review>([
      ['w2', { ...newReview('w2', TODAY), state: 'review', reps: 3, due: '2026-08-01' }],
    ]);
    const withDue = [...deck, card('w2', 'word')];
    const q = buildQueue(withDue, reviews, opts({ mode: 'core' }));
    expect(q.find((i) => i.card.type === 'word')!.card.id).toBe('w2');
  });

  it('skips a slot rather than substituting the wrong type', () => {
    const noBreath = [card('s1', 'say_it'), card('w1', 'word')];
    const q = buildQueue(noBreath, NONE, opts({ mode: 'core' }));
    expect(q.map((i) => i.card.type)).toEqual(['say_it', 'word']);
  });
});

describe('endless mode', () => {
  it('never serves two cards of the same type back to back', () => {
    const deck = [
      ...Array.from({ length: 8 }, (_, i) => card(`w${i}`, 'word')),
      ...Array.from({ length: 8 }, (_, i) => card(`p${i}`, 'pronounce')),
      ...Array.from({ length: 8 }, (_, i) => card(`s${i}`, 'swap')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 20 }));
    for (let i = 1; i < q.length; i++) {
      expect(q[i]!.card.type).not.toBe(q[i - 1]!.card.type);
    }
  });

  it('spreads types evenly rather than draining one at a time', () => {
    // The naive "first candidate of a different type" pick alternates two types
    // until they run out and then has nothing but the third left.
    const deck = [
      ...Array.from({ length: 6 }, (_, i) => card(`w${i}`, 'word')),
      ...Array.from({ length: 6 }, (_, i) => card(`p${i}`, 'pronounce')),
      ...Array.from({ length: 6 }, (_, i) => card(`s${i}`, 'swap')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 18 }));
    const counts = new Map<string, number>();
    for (const i of q) counts.set(i.card.type, (counts.get(i.card.type) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBe(6);
  });

  it('accepts a repeated type only when nothing else is left', () => {
    // 2 words then only swaps: a run of swaps is unavoidable and correct.
    const deck = [
      card('w0', 'word'),
      card('w1', 'word'),
      ...Array.from({ length: 6 }, (_, i) => card(`s${i}`, 'swap')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 8 }));
    expect(q).toHaveLength(8);
    // The two words are spent as separators before any run begins.
    const firstRunAt = q.findIndex(
      (_, i) => i > 0 && q[i]!.card.type === q[i - 1]!.card.type,
    );
    expect(firstRunAt).toBeGreaterThanOrEqual(4);
  });

  it('serves rare types early instead of starving them behind common ones', () => {
    // Realistic proportions: breath is ~3% of the deck. A selection rule based
    // on "most cards left" never reaches it, and a whole session goes by with
    // no breath drill at all.
    const deck = [
      ...Array.from({ length: 88 }, (_, i) => card(`w${i}`, 'word')),
      ...Array.from({ length: 51 }, (_, i) => card(`i${i}`, 'idiom')),
      ...Array.from({ length: 46 }, (_, i) => card(`p${i}`, 'pronounce')),
      ...Array.from({ length: 12 }, (_, i) => card(`b${i}`, 'breath')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 12 }));
    expect(q.some((i) => i.card.type === 'breath')).toBe(true);
    expect(new Set(q.map((i) => i.card.type)).size).toBe(4);
  });

  it('caps breath drills for the day', () => {
    const deck = [
      ...Array.from({ length: 10 }, (_, i) => card(`b${i}`, 'breath')),
      ...Array.from({ length: 10 }, (_, i) => card(`w${i}`, 'word')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 20 }));
    const breaths = q.filter((i) => i.card.type === 'breath');
    expect(breaths.length).toBeLessThanOrEqual(QUEUE_RULES.MAX_BREATH_PER_DAY);
  });

  it('respects breath drills already served earlier today', () => {
    const deck = [
      ...Array.from({ length: 10 }, (_, i) => card(`b${i}`, 'breath')),
      ...Array.from({ length: 10 }, (_, i) => card(`w${i}`, 'word')),
    ];
    const q = buildQueue(deck, NONE, opts({ limit: 20, breathServedToday: 3 }));
    expect(q.filter((i) => i.card.type === 'breath')).toHaveLength(0);
  });

  it('caps new cards for the day', () => {
    const deck = Array.from({ length: 60 }, (_, i) =>
      card(`c${i}`, i % 2 ? 'word' : 'pronounce'),
    );
    const q = buildQueue(deck, NONE, opts({ limit: 60 }));
    expect(q.filter((i) => i.reason === 'new').length).toBeLessThanOrEqual(
      QUEUE_RULES.MAX_NEW_PER_DAY,
    );
  });

  it('puts due reviews ahead of new material', () => {
    const deck = [card('w1', 'word'), card('p1', 'pronounce'), card('w2', 'word')];
    const reviews = new Map<string, Review>([
      ['w2', { ...newReview('w2', TODAY), state: 'review', reps: 4, due: '2026-08-01' }],
    ]);
    const q = buildQueue(deck, reviews, opts({ limit: 3 }));
    expect(q[0]!.card.id).toBe('w2');
    expect(q[0]!.reason).toBe('due');
  });

  it('serves the most-failed card first among due cards', () => {
    const deck = [card('a', 'word'), card('b', 'word'), card('c', 'pronounce')];
    const mk = (id: string, lapses: number): Review => ({
      ...newReview(id, TODAY),
      state: 'review',
      reps: 3,
      due: '2026-08-01',
      lapses,
    });
    const reviews = new Map([
      ['a', mk('a', 1)],
      ['b', mk('b', 7)],
    ]);
    const q = buildQueue(deck, reviews, opts({ limit: 3 }));
    expect(q[0]!.card.id).toBe('b');
  });

  it('excludes cards already passed today from the real queue', () => {
    const deck = [card('w1', 'word'), card('p1', 'pronounce')];
    const q = buildQueue(deck, NONE, opts({ seenCardIds: new Set(['w1']), limit: 5 }));
    const scheduled = q.filter((i) => i.reason !== 'filler');
    expect(scheduled.map((i) => i.card.id)).not.toContain('w1');
    // It may still come back as filler rather than let the feed dead-end.
    expect(q).toHaveLength(5);
  });

  it('never dead-ends — it refills rather than returning short', () => {
    const deck = [card('w1', 'word'), card('p1', 'pronounce'), card('s1', 'swap')];
    const q = buildQueue(deck, NONE, opts({ limit: 12 }));
    expect(q).toHaveLength(12);
    expect(q.some((i) => i.reason === 'filler')).toBe(true);
  });

  it('does not use breath drills as filler', () => {
    const deck = [card('b1', 'breath'), card('w1', 'word'), card('p1', 'pronounce')];
    const q = buildQueue(deck, NONE, opts({ limit: 12, breathServedToday: 3 }));
    expect(q.filter((i) => i.card.type === 'breath')).toHaveLength(0);
    expect(q).toHaveLength(12);
  });

  it('ignores buried cards entirely', () => {
    const buried = { ...card('w1', 'word'), status: 'buried' as const };
    const q = buildQueue([buried, card('p1', 'pronounce')], NONE, opts({ limit: 5 }));
    expect(q.map((i) => i.card.id)).not.toContain('w1');
  });

  it('returns an empty queue for an empty deck instead of looping', () => {
    expect(buildQueue([], NONE, opts({ limit: 10 }))).toEqual([]);
  });
});

describe('duplicates within one run', () => {
  const bigDeck = () => {
    const types: CardType[] = ['word', 'swap', 'pronounce', 'say_it', 'action_verb', 'idiom'];
    return Array.from({ length: 300 }, (_, i) => card(`c${i}`, types[i % types.length]!));
  };

  it('never repeats a card when the deck is bigger than the session', () => {
    const q = buildQueue(bigDeck(), NONE, opts({ limit: 30 }));
    const ids = q.map((i) => i.card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('still fills a long session past the new-card cap without repeating', () => {
    // 60 cards is far more than MAX_NEW_PER_DAY — the rest come from filler,
    // which must reach for unseen cards before it recycles anything.
    const q = buildQueue(bigDeck(), NONE, opts({ limit: 60 }));
    const ids = q.map((i) => i.card.id);
    expect(q).toHaveLength(60);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('repeats only when the deck is genuinely smaller than the session', () => {
    const tiny = [card('a', 'word'), card('b', 'pronounce'), card('c', 'swap')];
    const q = buildQueue(tiny, NONE, opts({ limit: 9 }));
    expect(q).toHaveLength(9);
    expect(new Set(q.map((i) => i.card.id)).size).toBe(3);
  });
});

describe('the 70% spoken floor', () => {
  it('holds across a realistic run', () => {
    const deck: Card[] = [];
    const mix: CardType[] = ['word', 'swap', 'pronounce', 'say_it', 'action_verb', 'idiom'];
    mix.forEach((t, ti) => {
      for (let i = 0; i < 10; i++) deck.push(card(`${t}${ti}${i}`, t));
    });
    deck.push(card('b1', 'breath'));

    const q = buildQueue(deck, NONE, opts({ limit: 30 }));
    const spoken = q.filter((i) =>
      ['word', 'swap', 'action_verb', 'pronounce', 'say_it'].includes(i.card.type),
    );
    expect(spoken.length / q.length).toBeGreaterThanOrEqual(0.7);
  });
});
