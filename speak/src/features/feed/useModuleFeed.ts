import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CardFeedback,
  DayKey,
  DayRecord,
  FeedFilter,
  ModuleCard,
  ModuleId,
  ModuleLevel,
  ProductionEvent,
  SeenTerm,
} from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { headOf } from '../../db/libraryCheck';
import { todayKey } from '../../lib/date';
import { applyCardView, currentStreak, emptyDay } from '../session/day';
import { RUN_LENGTH, belowFloor, buildModuleQueue, seenHeadKey } from '../../srs/moduleQueue';
import { newSavedReview, reviewDue } from '../../srs/savedReview';
import { themeOf } from '../cards/cardTags';
import { themeBoosts } from '../learn/askLearned';
import { recordKnowIt } from '../learn/knowIt';

export const MODULE_FEED_CHUNK = 20;
export const MODULE_FEED_REFILL_THRESHOLD = 5;
/** v8: most a theme's 👍 / Loved count adds to its weight. */
export const LIKED_THEME_CAP = 3;

type Levels = Partial<Record<ModuleId, ModuleLevel>>;

/** 👎 or Wrong English (or removed by a recheck) hides a card. */
export function hiddenCardIds(rows: readonly CardFeedback[]): Set<string> {
  const hidden = new Set<string>();
  for (const fb of rows) {
    if (fb.thumb === 'down' || fb.reasons?.includes('wrong_english') || fb.hidden === true) {
      hidden.add(fb.cardId);
    }
  }
  return hidden;
}

/**
 * v8 topic weights: 1 + his 👍 / Loved count on that theme (max +3), times the
 * Ask box's boost ("more" 2, "fewer" 0.5). Themes absent from the result weigh 1.
 */
export function themeWeightsFrom(
  cards: readonly ModuleCard[],
  rows: readonly CardFeedback[],
  boosts: Record<string, number>,
): Record<string, number> {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const liked = new Map<string, number>();
  for (const fb of rows) {
    const up = fb.thumb === 'up' || fb.reasons?.includes('loved');
    if (!up || fb.thumb === 'down' || fb.reasons?.includes('wrong_english')) continue;
    const card = byId.get(fb.cardId);
    if (!card) continue;
    const t = themeOf(card);
    liked.set(t, (liked.get(t) ?? 0) + 1);
  }
  const weights: Record<string, number> = {};
  for (const t of new Set([...liked.keys(), ...Object.keys(boosts)])) {
    weights[t] = (1 + Math.min(LIKED_THEME_CAP, liked.get(t) ?? 0)) * (boosts[t] ?? 1);
  }
  return weights;
}

/** v8 front cards: unseen AI cards, newest batch first (then by id). */
export function frontIdsFrom(cards: readonly ModuleCard[], seenIds: ReadonlySet<string>): string[] {
  type Raw = ModuleCard & { source?: string; createdAt?: number };
  return (cards as readonly Raw[])
    .filter((c) => c.source === 'ai' && !seenIds.has(c.id))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

const noBoosts = (): Record<string, number> => ({});

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
  /**
   * v8 "Know it": records Too easy (and the level rise), then drops every
   * queued card after the current one that is now below its module's floor.
   */
  knowIt(card: ModuleCard): Promise<void>;
  /**
   * v8: re-reads levels, 👍 and Ask boosts, and re-builds the cards after the
   * current one (after the sheet's Too easy / Too hard, and after an Ask reply).
   */
  applyLevels(): Promise<void>;
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
  // v8 signals for the queue
  const levelsRef = useRef<Levels>({});
  const themeWeightsRef = useRef<Record<string, number>>({});
  const frontIdsRef = useRef<string[]>([]);

  /** The v8 options every queue build passes. */
  const v8Opts = () => ({
    levels: levelsRef.current,
    runLength: RUN_LENGTH,
    themeWeights: themeWeightsRef.current,
    frontIds: frontIdsRef.current,
  });

  /** Re-reads the cards, hidden set, levels, 👍 and Ask boosts, and the front list. */
  const loadSignals = async (): Promise<void> => {
    const [rawCards, feedbacks, profile, boosts] = await Promise.all([
      db.cards.toArray(),
      db.feedback.toArray(),
      db.profile.get('me'),
      themeBoosts().catch(noBoosts),
    ]);
    const moduleCards = (rawCards as unknown[]).filter(
      (c): c is ModuleCard =>
        Boolean(c) && typeof c === 'object' && (c as { type?: string }).type === 'module',
    );
    allModuleCardsRef.current = moduleCards;
    hiddenIdsRef.current = hiddenCardIds(feedbacks);
    levelsRef.current = { ...(profile?.moduleLevels ?? {}) };
    themeWeightsRef.current = themeWeightsFrom(moduleCards, feedbacks, boosts);
    frontIdsRef.current = frontIdsFrom(moduleCards, seenIdsRef.current);
  };

  /** Appends a chunk when few cards are left after `at`. */
  const refillIfLow = (list: ModuleCard[], at: number): ModuleCard[] => {
    if (list.length - at > MODULE_FEED_REFILL_THRESHOLD) return list;
    const inQueueOrSeen = new Set([...seenIdsRef.current, ...list.map((c) => c.id)]);
    const moreCards = buildModuleQueue(allModuleCardsRef.current, {
      today: todayRef.current,
      filter: filterRef.current,
      seenIds: inQueueOrSeen,
      hiddenIds: hiddenIdsRef.current,
      limit: MODULE_FEED_CHUNK,
      seenHeads: seenHeadsRef.current,
      ...v8Opts(),
    });
    return moreCards.length > 0 ? [...list, ...moreCards] : list;
  };

  // Serialize settle calls to avoid races during rapid scrolling
  const settlingPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // ─── LOAD & RELOAD ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const currentDate = todayRef.current;
    const [rawCards, feedbacks, events, dayRow, allDays, seenTerms, savedRows, profile, boosts] =
      await Promise.all([
        db.cards.toArray(),
        db.feedback.toArray(),
        db.events.toArray(),
        db.days.get(currentDate),
        db.days.toArray(),
        db.seen.toArray(),
        db.savedReviews.toArray(),
        db.profile.get('me'),
        themeBoosts().catch(noBoosts),
      ]);

    // 1. Module cards only
    const moduleCards = (rawCards as unknown[]).filter(
      (c): c is ModuleCard =>
        Boolean(c) && typeof c === 'object' && (c as { type?: string }).type === 'module',
    );
    allModuleCardsRef.current = moduleCards;

    // 2. Hidden cards per answers: thumb down or wrong_english reason (or hidden flag)
    const hidden = hiddenCardIds(feedbacks);
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

    // 3c. v8: his level per module (none yet = start level), topic weights, new AI cards first
    levelsRef.current = { ...(profile?.moduleLevels ?? {}) };
    themeWeightsRef.current = themeWeightsFrom(moduleCards, feedbacks, boosts);
    frontIdsRef.current = frontIdsFrom(moduleCards, seenAll);

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
      ...v8Opts(),
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
      ...v8Opts(),
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
      const updatedItems = refillIfLow(currentItems, nextIndex);
      if (updatedItems !== currentItems) {
        itemsRef.current = updatedItems;
        setItems(updatedItems);
      }
    };

    settlingPromiseRef.current = settlingPromiseRef.current.then(runSettle, runSettle);
    return settlingPromiseRef.current;
  }, []);

  // ─── RELOAD ─────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    await loadData();
  }, [loadData]);

  /** Runs `job` after any settle or level change already in flight. */
  const serial = (job: () => Promise<void>): Promise<void> => {
    settlingPromiseRef.current = settlingPromiseRef.current.then(job, job);
    return settlingPromiseRef.current;
  };

  // ─── KNOW IT ────────────────────────────────────────────────────────────────
  const knowIt = useCallback(
    (card: ModuleCard): Promise<void> =>
      serial(async () => {
        const { level } = await recordKnowIt(card);
        levelsRef.current = { ...levelsRef.current, [card.module]: level };
        const list = itemsRef.current;
        const at = indexRef.current;
        const review = new Set(reviewIdsRef.current);
        const kept = list.filter(
          (c, i) => i <= at || review.has(c.id) || !belowFloor(c, levelsRef.current),
        );
        const next = refillIfLow(kept, at);
        if (next.length !== list.length || next.some((c, i) => c !== list[i])) {
          itemsRef.current = next;
          setItems(next);
        }
      }),
    [],
  );

  // ─── APPLY LEVELS ───────────────────────────────────────────────────────────
  const applyLevels = useCallback(
    (): Promise<void> =>
      serial(async () => {
        await loadSignals();
        const list = itemsRef.current;
        const at = indexRef.current;
        const head = list.slice(0, at + 1);
        const headIds = new Set(head.map((c) => c.id));
        const tail = buildModuleQueue(allModuleCardsRef.current, {
          today: todayRef.current,
          filter: filterRef.current,
          seenIds: new Set([...seenIdsRef.current, ...headIds]),
          hiddenIds: hiddenIdsRef.current,
          limit: Math.max(MODULE_FEED_CHUNK, list.length - head.length),
          reviewIds: reviewIdsRef.current.filter((id) => !headIds.has(id)),
          seenHeads: seenHeadsRef.current,
          ...v8Opts(),
        });
        const next = [...head, ...tail];
        itemsRef.current = next;
        setItems(next);
      }),
    [],
  );

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
    knowIt,
    applyLevels,
  };
}
