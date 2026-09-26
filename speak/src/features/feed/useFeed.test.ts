import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { buildQueue, getTypeMultiplier } from '../../srs/queue';
import { applyCardCompletion, emptyDay, isDayComplete, isPass } from '../session/day';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { useFeed } from './useFeed';
import type { Card, Review } from '../../types/contract';

describe('useFeed State Machine & Logic', () => {
  it('emptyDay initializes day record with 0 completed cards, 0 spoken reps, and 0 XP', () => {
    const day = emptyDay('2026-08-20');
    expect(day.date).toBe('2026-08-20');
    expect(day.cardsCompleted).toBe(0);
    expect(day.spokenReps).toBe(0);
    expect(day.xp).toBe(0);
    expect(day.coreThreeDone).toBe(false);
  });

  it('isPass correctly determines whether grade is a pass (hard, good, easy) or fail (again)', () => {
    expect(isPass('again')).toBe(false);
    expect(isPass('hard')).toBe(true);
    expect(isPass('good')).toBe(true);
    expect(isPass('easy')).toBe(true);
  });

  it('Silently viewing a feed card for 10 seconds does not increment spokenReps', () => {
    const day = emptyDay('2026-08-26');
    const updated = applyCardCompletion(day, { msSpent: 10000 });
    expect(updated.spokenReps).toBe(0);
    expect(updated.cardsCompleted).toBe(1);
    expect(updated.secondsActive).toBe(10);
    expect(updated.xp).toBe(1);
  });

  it('Four silent cards do not complete the day', () => {
    let day = emptyDay('2026-08-26');
    for (let i = 0; i < 4; i++) {
      day = applyCardCompletion(day, { msSpent: 5000 });
    }
    expect(day.cardsCompleted).toBe(4);
    expect(day.spokenReps).toBe(0);
    expect(isDayComplete(day)).toBe(false);
    expect(day.coreThreeDone).toBe(false);
  });

  it('Five silent cards complete the day', () => {
    let day = emptyDay('2026-08-26');
    for (let i = 0; i < 5; i++) {
      day = applyCardCompletion(day, { msSpent: 3000 });
    }
    expect(day.cardsCompleted).toBe(5);
    expect(day.spokenReps).toBe(0);
    expect(isDayComplete(day)).toBe(true);
    expect(day.coreThreeDone).toBe(true);
  });

  it('getTypeMultiplier calculates multipliers based on typeWeights and interests with floor at 0.15', () => {
    expect(getTypeMultiplier('word')).toBe(1.0);
    expect(getTypeMultiplier('swap', [], { swap: 0.3 })).toBeCloseTo(0.3, 2);
    expect(getTypeMultiplier('swap', [], { swap: 0.001 })).toBe(0.15);

    expect(getTypeMultiplier('idiom', ['Office English'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('phrase', ['office'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('swap', ['💼 Office English'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('word', ['Office English'])).toBe(1.0);

    expect(getTypeMultiplier('word', ['Everyday words'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('pronounce', ['words'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('say_it', ['speaking'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('pronounce', ['🎙️ Speaking'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('story_move', ['Storytelling'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('action_verb', ['story'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('feeling', ['Ideas & opinions'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('phrase', ['🧠 Ideas & opinions'])).toBeCloseTo(1.6, 1);
  });
});

describe('useFeed endless repetition (AG-007 stage 1)', () => {
  const TYPES = [
    'word',
    'idiom',
    'phrase',
    'swap',
    'feeling',
    'action_verb',
    'pronounce',
    'say_it',
    'story_move',
    'situation',
  ] as const;

  beforeEach(async () => {
    await db.cards.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.days.clear();
    await db.outbox.clear();
    await db.profile.clear();
    // 200 synthetic cards: large enough for 150 unique serves, small enough
    // to keep the test fast. Never asserts seed counts (AG-007 §2).
    const cards: Card[] = Array.from({ length: 200 }, (_, i) => ({
      id: `t-repeat-${i}`,
      type: TYPES[i % TYPES.length]!,
      lang: i % 8 === 7 ? 'hi' : 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: Date.now(),
    }) as unknown as Card);
    await db.cards.bulkPut(cards);
  });

  afterEach(() => {
    cleanup();
  });

  it('serves 150 cards on a fresh day with no grades and zero duplicate ids', async () => {
    const { result, unmount } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });
    await waitFor(() => expect(result.current.item).not.toBeNull(), { timeout: 10000 });

    const seen = new Set<string>();
    for (let n = 0; n < 150; n++) {
      const item = result.current.item;
      expect(item, `queue drained at card ${n}`).not.toBeNull();
      const id = item!.card.id;
      expect(seen.has(id), `card ${id} repeated at position ${n}`).toBe(false);
      seen.add(id);
      await act(async () => {
        await result.current.advanceCard();
      });
    }
    expect(seen.size).toBe(150);
    unmount();
  }, 60000);
});

describe('useFeed markEngaged wiring (AG-007 stage 2)', () => {
  const TYPES = [
    'word',
    'idiom',
    'phrase',
    'swap',
    'feeling',
    'action_verb',
    'pronounce',
    'say_it',
    'story_move',
    'situation',
  ] as const;

  beforeEach(async () => {
    await db.cards.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.days.clear();
    await db.outbox.clear();
    await db.profile.clear();
    // Synthetic deck only — never asserts seed counts (AG-007 §2).
    const cards: Card[] = Array.from({ length: 60 }, (_, i) => ({
      id: `t-engaged-${i}`,
      type: TYPES[i % TYPES.length]!,
      lang: i % 8 === 7 ? 'hi' : 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: Date.now(),
    }) as unknown as Card);
    await db.cards.bulkPut(cards);
  });

  afterEach(() => {
    cleanup();
  });

  it('engaged first sight grades good due tomorrow; skimmed first sight stays new with a 14-day reserve and earns no XP', async () => {
    const { result, unmount } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });
    await waitFor(() => expect(result.current.item).not.toBeNull(), { timeout: 10000 });

    // markEngaged has a stable identity across renders (FeedScreen holds it in a ref).
    const markEngagedFirst = result.current.markEngaged;
    expect(typeof markEngagedFirst).toBe('function');

    // Engaged first sight.
    const engagedId = result.current.item!.card.id;
    act(() => {
      result.current.markEngaged(engagedId);
    });
    await act(async () => {
      await result.current.advanceCard();
    });
    expect(result.current.markEngaged).toBe(markEngagedFirst);

    // Skimmed first sight: served but never markEngaged before advance.
    const skimId = result.current.item!.card.id;
    expect(skimId).not.toBe(engagedId);
    await act(async () => {
      await result.current.advanceCard();
    });

    // Review rows: engaged keeps current behaviour, skim stays new with reps 0.
    const reviews = await db.reviews.toArray();
    const byId = new Map(reviews.map((r) => [r.cardId, r]));
    const eng = byId.get(engagedId)!;
    expect(eng.state).toBe('learning');
    expect(eng.reps).toBe(1);
    expect(eng.due).toBe(addDays(todayKey(), 1));
    const skim = byId.get(skimId)! as Review & { skippedAt?: number };
    expect(skim.state).toBe('new');
    expect(skim.reps).toBe(0);
    expect(skim.lastSeenAt).toBeDefined();
    expect(skim.skippedAt).toBeDefined();

    // XP and cards-today count the engaged card only.
    expect(result.current.todayXp).toBe(1);
    expect(result.current.cardsToday).toBe(1);

    // Queue: the skimmed card is not served as new again within 14 days,
    // while the engaged card is scheduled as due tomorrow.
    const cards = await db.cards.toArray();
    const baseOpts = {
      seenCardIds: new Set<string>(),
      breathServedToday: 0,
      newServedToday: 0,
      limit: 60,
      mode: 'endless' as const,
    };
    const freshQueue = buildQueue(cards, byId, { ...baseOpts, today: todayKey() }, Date.now());
    expect(freshQueue.map((i) => i.card.id)).not.toContain(skimId);
    const tomorrowQueue = buildQueue(
      cards,
      byId,
      { ...baseOpts, today: addDays(todayKey(), 1) },
      Date.now(),
    );
    expect(tomorrowQueue.find((i) => i.card.id === engagedId)?.reason).toBe('due');

    unmount();
  }, 30000);

  it('new coach cards jump within the first 10 of the next feed session (AG-007 stage 3)', async () => {
    const coachCards: Card[] = [0, 1, 2].map(
      (n) =>
        ({
          id: `t-coach-${n}`,
          type: 'word',
          lang: 'en',
          tags: ['coach', 'word'],
          source: 'inbox',
          status: 'active',
          createdAt: Date.now(),
        }) as unknown as Card,
    );
    await db.cards.bulkPut(coachCards);

    const { result, unmount } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });
    await waitFor(() => expect(result.current.item).not.toBeNull(), { timeout: 10000 });

    const firstTen: string[] = [];
    for (let n = 0; n < 10; n++) {
      firstTen.push(result.current.item!.card.id);
      await act(async () => {
        await result.current.advanceCard();
      });
    }
    for (const c of coachCards) {
      expect(firstTen).toContain(c.id);
    }
    unmount();
  }, 30000);
});

