import { describe, expect, it } from 'vitest';
import { readSeedFiles } from '../../db/seedLoader';
import {
  CATEGORY_DECKS,
  getDeckCards,
  getDeckProgress,
  searchCards,
} from './categories';
import type { Card, Review } from '../../types/contract';

describe('Browse & Categories Comprehensive Suite', () => {
  const seedCards = readSeedFiles().cards;

  it('All 11 category decks are defined with icons and descriptions', () => {
    expect(CATEGORY_DECKS).toHaveLength(11);

    const expectedDeckIds = [
      'office',
      'vocab',
      'hindi',
      'story',
      'verbs',
      'phrases',
      'pronounce',
      'pace',
      'situations',
      'ideas',
      'feelings',
    ];

    for (const id of expectedDeckIds) {
      const deck = CATEGORY_DECKS.find((d) => d.id === id);
      expect(deck).toBeDefined();
      expect(deck?.name.length).toBeGreaterThan(0);
      expect(deck?.icon.length).toBeGreaterThan(0);
      expect(deck?.description.length).toBeGreaterThan(0);

      const cards = getDeckCards(seedCards, id);
      expect(cards.length).toBeGreaterThan(0);
    }
  });

  it('getDeckCards returns empty array for non-existent deck', () => {
    expect(getDeckCards(seedCards, 'non_existent_deck')).toEqual([]);
  });

  it('getDeckCards excludes buried or inactive cards', () => {
    const cards: Card[] = [
      {
        id: 'w1',
        type: 'word',
        lang: 'en',
        tags: [],
        source: 'seed',
        status: 'active',
        createdAt: 0,
        term: 'active_term',
        pos: 'n.',
        meaning: '',
        examples: ['', ''],
        say: '',
      },
      {
        id: 'w2',
        type: 'word',
        lang: 'en',
        tags: [],
        source: 'seed',
        status: 'buried',
        createdAt: 0,
        term: 'buried_term',
        pos: 'n.',
        meaning: '',
        examples: ['', ''],
        say: '',
      },
    ];

    const vocabCards = getDeckCards(cards, 'vocab');
    expect(vocabCards.map((c) => c.id)).toContain('w1');
    expect(vocabCards.map((c) => c.id)).not.toContain('w2');
  });

  it('getDeckProgress correctly computes seen count and percentage with various array & map formats', () => {
    const vocabCards = getDeckCards(seedCards, 'vocab');
    expect(vocabCards.length).toBeGreaterThan(0);

    const emptyProgress = getDeckProgress(vocabCards, []);
    expect(emptyProgress.total).toBe(vocabCards.length);
    expect(emptyProgress.seen).toBe(0);
    expect(emptyProgress.percent).toBe(0);

    // Empty deck edge case
    expect(getDeckProgress([], [])).toEqual({ total: 0, seen: 0, percent: 0 });

    const mockReviews: Review[] = [
      {
        cardId: vocabCards[0]!.id,
        due: '2026-08-20',
        intervalDays: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        state: 'review',
        lastSeenAt: 12345,
      },
    ];

    const updatedProgress = getDeckProgress(vocabCards, mockReviews);
    expect(updatedProgress.seen).toBe(1);
    expect(updatedProgress.percent).toBe(Math.round((1 / vocabCards.length) * 100));

    // Testing with Map structure
    const reviewMap = new Map<string, Review>([
      [vocabCards[0]!.id, mockReviews[0]!],
    ]);
    const mapProgress = getDeckProgress(vocabCards, reviewMap);
    expect(mapProgress.seen).toBe(1);
  });

  it('searchCards finds cards across different card types and properties', () => {
    // Empty query returns []
    expect(searchCards(seedCards, '')).toEqual([]);
    expect(searchCards(seedCards, '   ')).toEqual([]);

    // Search by word term
    const wordResults = searchCards(seedCards, 'abrupt');
    expect(wordResults.length).toBeGreaterThan(0);

    // Search by idiom phrase
    const idiomResults = searchCards(seedCards, 'needle');
    expect(idiomResults.length).toBeGreaterThan(0);

    // Search by swap weak/strong
    const swapResults = searchCards(seedCards, 'tired');
    expect(swapResults.length).toBeGreaterThan(0);

    // Search by Hindi term
    const hindiResults = searchCards(seedCards, 'टाल');
    expect(hindiResults.length).toBeGreaterThan(0);

    // Search by action verb
    const verbResults = searchCards(seedCards, 'lurch');
    expect(verbResults.length).toBeGreaterThan(0);

    // Search by pronounce syllables
    const pronounceResults = searchCards(seedCards, 'COMF');
    expect(pronounceResults.length).toBeGreaterThan(0);

    // Search by tags
    const tagResults = searchCards(seedCards, 'office');
    expect(tagResults.length).toBeGreaterThan(0);
  });
});
