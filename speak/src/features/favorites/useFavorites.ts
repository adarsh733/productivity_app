import { useCallback, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, enqueue, toggleBookmarkWithXp } from '../../db/db';
import { newSavedReview } from '../../srs/savedReview';
import type { FeedFilter, ModuleCard } from '../../types/contract';

export interface FavoritesApi {
  /**
   * His ♡ module cards in the chosen module (all of them on Mix), newest ♡ first.
   * A card he un-saves on this visit stays in the list (♡ hollow) until the
   * screen is opened again (answer 4).
   */
  cards: ModuleCard[];
  /** Module cards still saved, whatever the filter (picks the empty line). */
  total: number;
  loading: boolean;
  /** True while the card is still ♡ — false for one un-saved on this visit. */
  isSaved(cardId: string): boolean;
  /** Takes the ♡ off and ends the card's Sunday review — the Feed's ♡ writes. */
  unsave(cardId: string): Promise<void>;
  /** Puts the ♡ back on a card un-saved on this visit — the Feed's ♡ writes. */
  resave(cardId: string): Promise<void>;
}

interface SavedCard {
  card: ModuleCard;
  savedAt: number;
}

export function useFavorites(filter: FeedFilter): FavoritesApi {
  const saved = useLiveQuery(async (): Promise<SavedCard[]> => {
    const bookmarks = await db.bookmarks.toArray();
    if (bookmarks.length === 0) return [];
    const savedAt = new Map(bookmarks.map((b) => [b.cardId, b.createdAt]));
    const rows = await db.cards.bulkGet(bookmarks.map((b) => b.cardId));
    const out: SavedCard[] = [];
    for (const row of rows) {
      const r = row as unknown as ModuleCard | undefined;
      // Only v7 module cards; ♡ on old v4 cards stays stored but is not listed.
      if (!r || r.type !== 'module') continue;
      out.push({ card: r, savedAt: savedAt.get(r.id) ?? r.createdAt });
    }
    return out;
  }, []);

  // Every card listed on this visit, with its place in the order.
  const shownRef = useRef<Map<string, SavedCard>>(new Map());
  // Cards un-saved on this visit: they stay listed until the next open.
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(new Set());

  const all = useMemo((): SavedCard[] => {
    // A card keeps its first place on this visit, so a re-♡ does not jump it to the top.
    const live = (saved ?? []).map((s) => {
      const first = shownRef.current.get(s.card.id);
      const kept = first ? { card: s.card, savedAt: first.savedAt } : s;
      shownRef.current.set(s.card.id, kept);
      return kept;
    });
    const liveIds = new Set(live.map((s) => s.card.id));
    const held: SavedCard[] = [];
    for (const id of unsaved) {
      const s = shownRef.current.get(id);
      if (s && !liveIds.has(id)) held.push(s);
    }
    // Newest ♡ first; the card's own age breaks a tie.
    return [...live, ...held].sort(
      (a, b) => b.savedAt - a.savedAt || b.card.createdAt - a.card.createdAt,
    );
  }, [saved, unsaved]);

  const cards = useMemo(() => {
    const list = all.map((s) => s.card);
    return filter === 'mix' ? list : list.filter((c) => c.module === filter);
  }, [all, filter]);

  const isSaved = useCallback((cardId: string) => !unsaved.has(cardId), [unsaved]);

  const unsave = useCallback(async (cardId: string): Promise<void> => {
    setUnsaved((prev) => new Set(prev).add(cardId));
    if (await db.bookmarks.get(cardId)) {
      await toggleBookmarkWithXp(cardId, 'module');
    }
    // Same as the Feed's ♡ off: the Sunday review for this card ends.
    await db.transaction('rw', db.savedReviews, db.outbox, async () => {
      if (await db.savedReviews.get(cardId)) {
        await db.savedReviews.delete(cardId);
        await enqueue('savedReviews', cardId, 'delete');
      }
    });
  }, []);

  const resave = useCallback(async (cardId: string): Promise<void> => {
    const card = shownRef.current.get(cardId)?.card;
    if (!card) return;
    if (!(await db.bookmarks.get(cardId))) {
      await toggleBookmarkWithXp(cardId, 'module');
    }
    // Same as the Feed's ♡ on: a running review is kept, a retired one restarts.
    await db.transaction('rw', db.savedReviews, db.outbox, async () => {
      const existing = await db.savedReviews.get(cardId);
      if (existing && existing.retiredAt === undefined) return;
      await db.savedReviews.put(newSavedReview(card, Date.now()));
      await enqueue('savedReviews', cardId);
    });
    setUnsaved((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }, []);

  return {
    cards,
    total: saved?.length ?? 0,
    loading: saved === undefined,
    isSaved,
    unsave,
    resave,
  };
}
