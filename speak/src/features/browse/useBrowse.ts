import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { readSeedFiles } from '../../db/seedLoader';
import type { Card } from '../../types/contract';
import {
  CATEGORY_DECKS,
  getDeckCards,
  getDeckProgress,
  searchCards,
  type CategoryDeck,
} from './categories';

export interface UseBrowseReturn {
  query: string;
  setQuery: (query: string) => void;
  filteredDecks: CategoryDeck[];
  matchingCards: Card[];
  deckStats: Record<string, { total: number; seen: number; percent: number; cards: Card[] }>;
  allCards: Card[];
}

export function useBrowse(): UseBrowseReturn {
  const [query, setQuery] = useState('');

  const dbCards = useLiveQuery(() => db.cards.toArray(), []);
  const dbReviews = useLiveQuery(() => db.reviews.toArray(), []);

  const allCards = useMemo<Card[]>(() => {
    if (dbCards && dbCards.length > 0) {
      return dbCards.filter((c) => c.status === 'active');
    }
    return readSeedFiles().cards;
  }, [dbCards]);

  const reviewsList = useMemo(() => dbReviews ?? [], [dbReviews]);

  const deckStats = useMemo(() => {
    const stats: Record<string, { total: number; seen: number; percent: number; cards: Card[] }> = {};
    for (const deck of CATEGORY_DECKS) {
      const cards = getDeckCards(allCards, deck.id);
      const progress = getDeckProgress(cards, reviewsList);
      stats[deck.id] = { ...progress, cards };
    }
    return stats;
  }, [allCards, reviewsList]);

  const filteredDecks = useMemo(() => {
    if (!query.trim()) return CATEGORY_DECKS;
    const q = query.toLowerCase().trim();
    return CATEGORY_DECKS.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.badge.toLowerCase().includes(q),
    );
  }, [query]);

  const matchingCards = useMemo(() => {
    if (!query.trim()) return [];
    return searchCards(allCards, query);
  }, [allCards, query]);

  return {
    query,
    setQuery,
    filteredDecks,
    matchingCards,
    deckStats,
    allCards,
  };
}
