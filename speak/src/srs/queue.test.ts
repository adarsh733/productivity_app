import { describe, expect, it } from 'vitest';
import { buildQueue, dayCardHash, getCardMultiplier, skimReview } from './queue';
import { grade, newReview } from './scheduler';
import { QUEUE_RULES } from '../types/contract';
import type { Card, CardType, DownweightRecord, QueueOptions, Review } from '../types/contract';
import { readSeedFiles } from '../db/seedLoader';

const TODAY = '2026-08-11';

function card(id: string, type: CardType, lang: 'en' | 'hi' = 'en', tags: string[] = []): Card {
  const base = {
    id,
    lang,
    tags,
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
    case 'phrase':
      return { ...base, type, weak: id, strong: id, why: '', register: 'office' };
    case 'feeling':
      return { ...base, type, term: id, meaning: '', contrast: '', example: '' };
    case 'story_move':
      return { ...base, type, move: id, why: '', example: '' };
    case 'describe':
      return { ...base, type, imagePath: '', alt: '', prompt: id, beats: ['', '', ''], targetVocab: [], targetSec: 30 };
    case 'explain':
      return { ...base, type, topic: id, angle: '', beats: ['', '', ''], targetVocab: [], targetSec: 60 };
    case 'teach_back':
      return { ...base, type, prompt: id, beats: ['', '', ''], targetSec: 60 };
    case 'situation':
      return { ...base, type, kind: 'incident', title: id, prompt: id, beats: ['', '', ''], targetVocab: [], targetSec: 60 };
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

describe('V3 Queue Acceptance Suite', () => {
  const seedCards = readSeedFiles().cards;

  it('A 1,000-card queue walk on the real seed data returns a card every time. item is never null', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 1000 }));
    expect(q).toHaveLength(1000);
    expect(q.every((item) => item && item.card && item.card.id)).toBe(true);
  });

  it('0 breath cards in 1,000 feed cards', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 1000 }));
    const breaths = q.filter((i) => i.card.type === 'breath');
    expect(breaths).toHaveLength(0);
  });

  it('0 gym drill cards (describe, explain, teach_back) in 1,000 feed cards', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 1000 }));
    const gymCards = q.filter((i) => ['describe', 'explain', 'teach_back'].includes(i.card.type));
    expect(gymCards).toHaveLength(0);
  });

  it('0 adjacent same-type pairs in 1,000 feed cards when types are available', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 1000 }));
    for (let i = 1; i < q.length; i++) {
      expect(q[i]!.card.type).not.toBe(q[i - 1]!.card.type);
    }
  });

  it('First card of a fresh profile is an English word or idiom, across 50 fresh runs', () => {
    for (let run = 0; run < 50; run++) {
      const shuffled = [...seedCards].sort(() => Math.random() - 0.5);
      const q = buildQueue(shuffled, NONE, opts({ limit: 5 }));
      expect(['word', 'idiom']).toContain(q[0]!.card.type);
      expect(q[0]!.card.lang).toBe('en');
    }
  });

  it('Hindi is strictly between 8% and 18% of a 1,000-card walk', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 1000 }));
    const hindiCount = q.filter((i) => i.card.lang === 'hi').length;
    const ratio = hindiCount / q.length;
    expect(ratio).toBeGreaterThanOrEqual(0.08);
    expect(ratio).toBeLessThanOrEqual(0.18);
  });

  it('New-card cap remains 20 across refills and walk extensions', () => {
    const q = buildQueue(seedCards, NONE, opts({ limit: 200, newServedToday: 0 }));
    const newCards = q.filter((i) => i.reason === 'new');
    expect(newCards.length).toBeLessThanOrEqual(QUEUE_RULES.MAX_NEW_PER_DAY);
    expect(newCards.length).toBe(20);
  });

  it('With only 20 cards in the DB, a 200-card walk still never dead-ends', () => {
    const types: CardType[] = ['word', 'swap', 'idiom', 'action_verb', 'pronounce'];
    const smallDeck = Array.from({ length: 20 }, (_, i) => card(`small_${i}`, types[i % types.length]!));
    const q = buildQueue(smallDeck, NONE, opts({ limit: 200 }));
    expect(q).toHaveLength(200);
    expect(q.every((item) => Boolean(item && item.card))).toBe(true);
    for (let i = 1; i < q.length; i++) {
      expect(q[i]!.card.type).not.toBe(q[i - 1]!.card.type);
    }
  });
});

describe('Preferences, Downweights & Shuffling', () => {
  const baseTime = 1770000000000;
  const testCard = card('test_card', 'idiom', 'en', ['negotiation', 'corporate']);

  it('Downweight expires after exactly seven local calendar days', () => {
    const activeDownweight: Record<string, DownweightRecord> = {
      negotiation: {
        target: 'negotiation',
        type: 'idiom',
        multiplier: 0.5,
        createdAt: baseTime,
        expiresAt: baseTime + 7 * 86_400_000,
      },
    };

    // Day 6 (before expiry): downweighted
    const beforeExpiry = getCardMultiplier(testCard, [], undefined, activeDownweight, baseTime + 6 * 86_400_000);
    expect(beforeExpiry).toBe(0.5);

    // Day 7 (after 7 days): downweight expired, returns to 1.0
    const afterExpiry = getCardMultiplier(testCard, [], undefined, activeDownweight, baseTime + 7 * 86_400_000 + 1000);
    expect(afterExpiry).toBe(1.0);
  });

  it('Repeated downweights do not permanently crush a type below 0.15', () => {
    const heavilyDownweighted: Record<string, DownweightRecord> = {
      idiom: {
        target: 'idiom',
        type: 'idiom',
        multiplier: 0.001, // Extreme value
        createdAt: baseTime,
        expiresAt: baseTime + 7 * 86_400_000,
      },
    };

    const mult = getCardMultiplier(testCard, [], undefined, heavilyDownweighted, baseTime + 1000);
    expect(mult).toBeGreaterThanOrEqual(0.15);
  });

  it('Deterministic daily shuffling is reproducible for the same day and different across days', () => {
    const scoreDay1A = dayCardHash('card_123', '2026-08-26');
    const scoreDay1B = dayCardHash('card_123', '2026-08-26');
    const scoreDay2 = dayCardHash('card_123', '2026-08-27');

    expect(scoreDay1A).toBe(scoreDay1B);
    expect(scoreDay1A).not.toBe(scoreDay2);
  });
});

describe('V3 Queue Rules and Rotation', () => {
  it('caps new cards for the day at MAX_NEW_PER_DAY', () => {
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

  it('excludes cards passed today from new/due, but recycles if needed', () => {
    const deck = [card('w1', 'word'), card('p1', 'pronounce')];
    const q = buildQueue(deck, NONE, opts({ seenCardIds: new Set(['w1']), limit: 5 }));
    const scheduled = q.filter((i) => i.reason !== 'filler');
    expect(scheduled.map((i) => i.card.id)).not.toContain('w1');
    expect(q).toHaveLength(5);
  });

  it('ignores buried cards entirely', () => {
    const buried = { ...card('w1', 'word'), status: 'buried' as const };
    const q = buildQueue([buried, card('p1', 'pronounce')], NONE, opts({ limit: 5 }));
    expect(q.map((i) => i.card.id)).not.toContain('w1');
  });

  it('returns an empty queue for an empty deck instead of looping', () => {
    expect(buildQueue([], NONE, opts({ limit: 10 }))).toEqual([]);
  });

  it('a card graded again (due today) resurfaces within the first 10 cards', () => {
    const deck = Array.from({ length: 40 }, (_, i) =>
      card(`c${i}`, (['word', 'idiom', 'pronounce'] as CardType[])[i % 3]!),
    );
    const againReview: Review = {
      ...newReview('c7', TODAY),
      state: 'learning',
      reps: 0,
      lapses: 1,
      due: TODAY,
      lastGrade: 'again',
    };
    const reviews = new Map<string, Review>([['c7', againReview]]);
    const q = buildQueue(deck, reviews, opts({ limit: 200 }));
    const pos = q.findIndex((i) => i.card.id === 'c7');
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThan(10);
  });

  it('deck rings count reviews: seen/total from stored review state', async () => {
    const { getDeckProgress } = await import('../features/browse/categories');
    const deck = [card('a', 'word'), card('b', 'word'), card('c', 'word')];
    const reviews = new Map<string, Review>([
      ['a', { ...newReview('a', TODAY), state: 'learning', reps: 1 }],
    ]);
    const progress = getDeckProgress(deck, reviews);
    expect(progress.total).toBe(3);
    expect(progress.seen).toBe(1);
    expect(progress.percent).toBe(33);
  });

  it('downweighted type shows up measurably less often across a 200-card queue', () => {
    const deck: Card[] = [];    for (let i = 0; i < 40; i++) deck.push(card(`w${i}`, 'word'));
    for (let i = 0; i < 40; i++) deck.push(card(`i${i}`, 'idiom'));
    for (let i = 0; i < 40; i++) deck.push(card(`p${i}`, 'pronounce'));
    const now = Date.now();
    const down: Record<string, DownweightRecord> = {
      idiom: { target: 'idiom', type: 'idiom', multiplier: 0.15, expiresAt: now + 7 * 86_400_000, createdAt: now },
    };
    const plain = buildQueue(deck, NONE, opts({ limit: 200 }));
    const downQ = buildQueue(deck, NONE, opts({ limit: 200, downweights: down }));
    const plainIdioms = plain.filter((i) => i.card.type === 'idiom').length;
    const downIdioms = downQ.filter((i) => i.card.type === 'idiom').length;
    expect(downIdioms).toBeLessThan(plainIdioms);
  });
});

describe('Skimmed cards (AG-007 stage 2)', () => {
  const NOW = new Date('2026-08-11T10:00:00Z').getTime();
  const DAY = 86_400_000;

  function skimmed(id: string, skippedAt: number): Review {
    return { ...newReview(id, TODAY), lastSeenAt: skippedAt, skippedAt } as Review;
  }

  function deck6(): Card[] {
    const types: CardType[] = ['word', 'idiom', 'phrase', 'swap', 'feeling', 'pronounce'];
    return types.map((t, i) => card(`k${i}`, t));
  }

  it('skimReview() stays new with reps 0 and stamps lastSeenAt + skippedAt', () => {
    const r = skimReview('c1', TODAY, NOW) as Review & { skippedAt?: number };
    expect(r.state).toBe('new');
    expect(r.reps).toBe(0);
    expect(r.lastSeenAt).toBe(NOW);
    expect(r.skippedAt).toBe(NOW);
  });

  it('a freshly skimmed card is not served as new again', () => {
    const deck = deck6();
    const reviews = new Map<string, Review>([['k2', skimmed('k2', NOW)]]);
    const q = buildQueue(deck, reviews, opts({ limit: 5 }), NOW);
    expect(q).toHaveLength(5);
    expect(q.map((i) => i.card.id)).not.toContain('k2');
    expect(q.every((i) => i.reason === 'new')).toBe(true);
  });

  it('a skim older than 14 days is served as new again', () => {
    const deck = deck6();
    const reviews = new Map<string, Review>([['k2', skimmed('k2', NOW - 15 * DAY)]]);
    const q = buildQueue(deck, reviews, opts({ limit: 6 }), NOW);
    const found = q.find((i) => i.card.id === 'k2');
    expect(found).toBeDefined();
    expect(found!.reason).toBe('new');
  });

  it('an engaged card (graded good, due today) is served as due', () => {
    const deck = deck6();
    const { review } = grade(newReview('k3', '2026-08-10'), 'good', '2026-08-10', NOW);
    const reviews = new Map<string, Review>([['k3', review]]);
    const q = buildQueue(deck, reviews, opts({ limit: 6 }), NOW);
    expect(q[0]!.card.id).toBe('k3');
    expect(q[0]!.reason).toBe('due');
  });

  it('fresh skims are not recycled as filler while other cards remain', () => {
    const deck = [card('f0', 'word'), card('f1', 'idiom'), card('f2', 'phrase')];
    const reviews = new Map<string, Review>([['f2', skimmed('f2', NOW)]]);
    const q = buildQueue(deck, reviews, opts({ limit: 8 }), NOW);
    expect(q).toHaveLength(8);
    expect(q.map((i) => i.card.id)).not.toContain('f2');
  });

  it('an all-skimmed deck still never dead-ends', () => {
    const deck = [card('g0', 'word'), card('g1', 'idiom')];
    const reviews = new Map<string, Review>([
      ['g0', skimmed('g0', NOW)],
      ['g1', skimmed('g1', NOW)],
    ]);
    const q = buildQueue(deck, reviews, opts({ limit: 5 }), NOW);
    expect(q).toHaveLength(5);
  });
});

describe('Coach cards (AG-008 stage 1)', () => {
  it('English coach cards float within the first 3; a Hindi coach card rides normal spacing', () => {
    const types: CardType[] = ['word', 'idiom', 'swap', 'phrase', 'feeling', 'pronounce'];
    const deck: Card[] = Array.from({ length: 40 }, (_, i) => card(`mix${i}`, types[i % types.length]!));
    deck.push(card('coach-en-1', 'word', 'en', ['coach']));
    deck.push(card('coach-en-2', 'idiom', 'en', ['coach']));
    deck.push(card('coach-hi-1', 'word', 'hi', ['coach']));

    const q = buildQueue(deck, NONE, opts({ limit: 30 }));
    const ids = q.map((i) => i.card.id);
    const idxHi = ids.indexOf('coach-hi-1');

    expect(ids.indexOf('coach-en-1')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('coach-en-1')).toBeLessThanOrEqual(2);
    expect(ids.indexOf('coach-en-2')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('coach-en-2')).toBeLessThanOrEqual(2);
    expect(idxHi).toBeGreaterThanOrEqual(0);
    expect(idxHi).toBeGreaterThan(2);
  });
});



