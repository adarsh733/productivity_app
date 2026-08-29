import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toggleBookmarkWithXp } from '../../db/db';
import { readSeedFiles } from '../../db/seedLoader';
import type { Card, CardType } from '../../types/contract';

export { toggleBookmarkWithXp };

export interface UseBookmarksReturn {
  bookmarkedIds: Set<string>;
  savedCards: Card[];
  isBookmarked: (cardId: string) => boolean;
  toggleBookmark: (cardId: string, cardType?: CardType) => Promise<{ isBookmarked: boolean; xpEarned: number }>;
  removeBookmark: (cardId: string) => Promise<void>;
  isLoading: boolean;
}

export function useBookmarks(): UseBookmarksReturn {
  const dbBookmarks = useLiveQuery(() => db.bookmarks.toArray(), []);
  const dbCards = useLiveQuery(() => db.cards.toArray(), []);

  const bookmarkedIds = useMemo(() => {
    return new Set(dbBookmarks?.map((b) => b.cardId) ?? []);
  }, [dbBookmarks]);

  const allCards = useMemo<Card[]>(() => {
    if (dbCards && dbCards.length > 0) {
      return dbCards.filter((c) => c.status === 'active');
    }
    return readSeedFiles().cards;
  }, [dbCards]);

  const savedCards = useMemo(() => {
    return allCards.filter((c) => bookmarkedIds.has(c.id));
  }, [allCards, bookmarkedIds]);

  const isBookmarked = useCallback(
    (cardId: string) => bookmarkedIds.has(cardId),
    [bookmarkedIds],
  );

  const toggleBookmark = useCallback(
    async (cardId: string, cardType?: CardType) => {
      return await toggleBookmarkWithXp(cardId, cardType);
    },
    [],
  );

  const removeBookmark = useCallback(async (cardId: string) => {
    await db.bookmarks.delete(cardId);
  }, []);

  return {
    bookmarkedIds,
    savedCards,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
    isLoading: dbBookmarks === undefined || dbCards === undefined,
  };
}
