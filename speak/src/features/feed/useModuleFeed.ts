import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DayKey,
  DayRecord,
  FeedFilter,
  ModuleCard,
  ProductionEvent,
  SeenTerm,
} from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { headOf } from '../../db/libraryCheck';
import { todayKey } from '../../lib/date';
import { applyCardView, currentStreak, emptyDay } from '../session/day';
import { buildModuleQueue, seenHeadKey } from '../../srs/moduleQueue';
import { newSavedReview, reviewDue } from '../../srs/savedReview';

export const MODULE_FEED_CHUNK = 20;
export const MODULE_FEED_REFILL_THRESHOLD = 5;

export interface ModuleFeedApi {
  ready: boolean;
  filter: FeedFilter;
  setFilter(f: FeedFilter): void;
  items: ModuleCard[];
  index: number;
  streak: number;
  onSettle(index: number): Promise<void>;
  markEngaged(cardId: string): void;
  /** ♡ on a card creates its Sunday review; taking the ♡ off removes it. */
  setSaved(card: ModuleCard, saved: boolean): Promise<void>;
  reload(): Promise<void>;
}

export function useModuleFeed(initialFilter: FeedFilter = 'mix'): ModuleFeedApi {
  const [ready, setReady] = useState(false);
  const [filter, setFilterState] = useState<FeedFilter>(initialFilter);
  const [items, setItems] = useState<ModuleCard[]>([]);
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);

  const filterRef = useRef<FeedFilter>(initialFilter);
  filterRef.current = filter;

  const itemsRef = useRef<ModuleCard[]>([]);
  itemsRef.current = items;

  const indexRef = useRef(0);
  indexRef.current = index;

  const today = todayKey();
  const todayRef = useRef<DayKey>(today);
  todayRef.current = today;

  const allModuleCardsRef = useRef<ModuleCard[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenTodayRef = useRef<Set<string>>(new Set());
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const seenHeadsRef = useRef<Set<string>>(new Set());
  const reviewIdsRef = useRef<string[]>([]);
  const engagedIdsRef = useRef<Set<string>>(new Set());
  const dayRef = useRef<DayRecord>(emptyDay(today));

  // Serialize settle calls to avoid races during rapid scrolling
  const settlingPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // ─── LOAD & RELOAD ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const currentDate = todayRef.current;
    const [rawCards, feedbacks, events, dayRow, allDays, seenTerms, savedRows] =
      await Promise.all([
        db.cards.toArray(),
        db.feedback.toArray(),
        db.events.toArray(),
        db.days.get(currentDate),
        db.days.toArray(),
        db.seen.toArray(),
        db.savedReviews.toArray(),
      ]);

    // 1. Module cards only
    const moduleCards = (rawCards as unknown[]).filter(
      (c): c is ModuleCard =>
        Boolean(c) && typeof c === 'object' && (c as { type?: string }).type === 'module',
    );
    allModuleCardsRef.current = moduleCards;

    // 2. Hidden cards per answers: thumb down or wrong_english reason (or hidden flag)
    const hidden = new Set<string>();
    for (const fb of feedbacks) {
      if (fb.thumb === 'down' || fb.reasons?.includes('wrong_english') || fb.hidden === true) {
        hidden.add(fb.cardId);
      }
    }
    hiddenIdsRef.current = hidden;

    // 3. Seen cards:
    //  - seenToday: seen today for XP/cardsCompleted rules
    //  - seenIds: cards seen across all time (Answer 3A: seen card never comes back)
    const seenAll = new Set<string>();
    const seenToday = new Set<string>();
    for (const e of events) {
      if (e.cardId) {
        if (e.type === 'card_viewed' || !e.type) {
          seenAll.add(e.cardId);
        }
        if (e.date === currentDate || todayKey(new Date(e.at)) === currentDate) {
          seenToday.add(e.cardId);
        }
      }
    }
    seenIdsRef.current = seenAll;
    seenTodayRef.current = seenToday;

    // 3b. Seen heads (the seen-once rule) and ♡ cards due for the Sunday review
    seenHeadsRef.current = new Set(seenTerms.map((t) => t.id));
    reviewIdsRef.current = reviewDue(savedRows, currentDate);

    // 4. Day & Streak
    const currentDay = dayRow ?? emptyDay(currentDate);
    dayRef.current = currentDay;
    const dayMap = new Map(allDays.map((d) => [d.date, d]));
    const computedStreak = currentStreak(dayMap, currentDate);
    setStreak(computedStreak);

    // 5. Initial queue window
    const initialQueue = buildModuleQueue(moduleCards, {
      today: currentDate,
      filter: filterRef.current,
      seenIds: seenAll,
      hiddenIds: hidden,
      limit: MODULE_FEED_CHUNK,
      reviewIds: reviewIdsRef.current,
      seenHeads: seenHeadsRef.current,
    });

    itemsRef.current = initialQueue;
    setItems(initialQueue);
    indexRef.current = 0;
    setIndex(0);
    setReady(true);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ─── FILTER CHANGE ──────────────────────────────────────────────────────────
  const setFilter = useCallback((nextFilter: FeedFilter) => {
    setFilterState(nextFilter);
    filterRef.current = nextFilter;

    // Filter change restarts at card 1 (index 0)
    setIndex(0);
    indexRef.current = 0;

    const initialQueue = buildModuleQueue(allModuleCardsRef.current, {
      today: todayRef.current,
      filter: nextFilter,
      seenIds: seenIdsRef.current,
      hiddenIds: hiddenIdsRef.current,
      limit: MODULE_FEED_CHUNK,
      reviewIds: reviewIdsRef.current,
      seenHeads: seenHeadsRef.current,
    });

    itemsRef.current = initialQueue;
    setItems(initialQueue);
  }, []);

  // ─── ENGAGEMENT ─────────────────────────────────────────────────────────────
  const markEngaged = useCallback((cardId: string) => {
    engagedIdsRef.current.add(cardId);
  }, []);

  // ─── ♡ ↔ SUNDAY REVIEW ──────────────────────────────────────────────────────
  const setSaved = useCallback(async (card: ModuleCard, saved: boolean): Promise<void> => {
    await db.transaction('rw', db.savedReviews, db.outbox, async () => {
      const existing = await db.savedReviews.get(card.id);
      if (saved) {
        // Keep a review that is already running; restart a retired one.
        if (existing && existing.retiredAt === undefined) return;
        await db.savedReviews.put(newSavedReview(card, Date.now()));
        await enqueue('savedReviews', card.id);
      } else if (existing) {
        await db.savedReviews.delete(card.id);
        await enqueue('savedReviews', card.id, 'delete');
      }
    });
  }, []);

  // ─── ON SETTLE ──────────────────────────────────────────────────────────────
  const onSettle = useCallback((nextIndex: number): Promise<void> => {
    const runSettle = async () => {
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;
      if (nextIndex < 0 || nextIndex >= currentItems.length) return;

      const prevIndex = indexRef.current;

      // Moving back or staying in place records nothing
      if (nextIndex <= prevIndex) {
        indexRef.current = nextIndex;
        setIndex(nextIndex);
        return;
      }

      // Moving forward records every card left as viewed
      const currentDate = todayRef.current;
      for (let i = prevIndex; i < nextIndex; i++) {
        const cardLeft = currentItems[i];
        if (!cardLeft) continue;

        const now = Date.now();
        const engaged = engagedIdsRef.current.has(cardLeft.id);
        engagedIdsRef.current.delete(cardLeft.id);

        const { day: nextDay } = applyCardView(
          dayRef.current,
          cardLeft.id,
          seenTodayRef.current,
          { engaged },
        );

        seenTodayRef.current.add(cardLeft.id);
        seenIdsRef.current.add(cardLeft.id);
        dayRef.current = nextDay;

        const event: ProductionEvent = {
          id: `evt-view-${cardLeft.id}-${now}`,
          type: 'card_viewed',
          cardId: cardLeft.id,
          cardType: cardLeft.type,
          at: now,
          date: currentDate,
          msSpent: 0,
          mode: 'endless',
        };

        // The seen-once rule: remember the head, not just the card id.
        const headKey = seenHeadKey(cardLeft);
        const term: SeenTerm | null = seenHeadsRef.current.has(headKey)
          ? null
          : {
              id: headKey,
              module: cardLeft.module,
              head: headOf(cardLeft),
              cardId: cardLeft.id,
              at: now,
            };
        if (term) seenHeadsRef.current.add(term.id);

        await db.transaction('rw', [db.events, db.days, db.seen, db.outbox], async () => {
          await db.events.put(event as any);
          await db.days.put(nextDay);
          await enqueue('events', event.id);
          await enqueue('days', nextDay.date);
          if (term) {
            await db.seen.put(term);
            await enqueue('seen', term.id);
          }
        });
      }

      // Update streak
      const allDays = await db.days.toArray();
      const dayMap = new Map(allDays.map((d) => [d.date, d]));
      setStreak(currentStreak(dayMap, currentDate));

      // Update index
      indexRef.current = nextIndex;
      setIndex(nextIndex);

      // Check for refill near the end of the window
      if (currentItems.length - nextIndex <= MODULE_FEED_REFILL_THRESHOLD) {
        const inQueueOrSeen = new Set([
          ...seenIdsRef.current,
          ...currentItems.map((c) => c.id),
        ]);
        const moreCards = buildModuleQueue(allModuleCardsRef.current, {
          today: currentDate,
          filter: filterRef.current,
          seenIds: inQueueOrSeen,
          hiddenIds: hiddenIdsRef.current,
          limit: MODULE_FEED_CHUNK,
          seenHeads: seenHeadsRef.current,
        });

        if (moreCards.length > 0) {
          const updatedItems = [...currentItems, ...moreCards];
          itemsRef.current = updatedItems;
          setItems(updatedItems);
        }
      }
    };

    settlingPromiseRef.current = settlingPromiseRef.current.then(runSettle, runSettle);
    return settlingPromiseRef.current;
  }, []);

  // ─── RELOAD ─────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return {
    ready,
    filter,
    setFilter,
    items,
    index,
    streak,
    onSettle,
    markEngaged,
    setSaved,
    reload,
  };
}
