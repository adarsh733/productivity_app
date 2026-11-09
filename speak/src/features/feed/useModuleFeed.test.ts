import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  CardFeedback,
  ModuleCard,
  ModuleId,
  ProductionEvent,
  SavedReview,
  SeenTerm,
  WordsCard,
} from '../../types/contract';
import { db } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { MODULE_FEED_CHUNK, useModuleFeed } from './useModuleFeed';

function makeCard(id: string, module: ModuleId): ModuleCard {
  return {
    id,
    type: 'module',
    module,
    lang: 'en',
    topic: 'test-topic',
    word: `Word-${id}`,
    pos: 'noun',
    say: 'say',
    meaning: 'meaning',
    examples: [
      { label: 'Ex 1', text: 'Line 1 **word**' },
      { label: 'Ex 2', text: 'Line 2 **word**' },
    ],
    right: { label: 'Right', text: 'Correct' },
    wrong: [{ label: 'Wrong', text: 'Wrong use' }],
    rule: 'The rule',
  } as WordsCard;
}

describe('useModuleFeed', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.feedback.clear();
    await db.events.clear();
    await db.days.clear();
    await db.outbox.clear();
    await db.profile.clear();
    await db.seen.clear();
    await db.savedReviews.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads module cards, ignores old card types, and initializes in Mix mode', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
    ];
    // Old cards that should NOT appear in the feed
    const oldCards = [
      { id: 'old-1', type: 'word', lang: 'en', word: 'old' },
      { id: 'teach-1', type: 'teach', lang: 'en', skill: 'words' },
    ];
    await db.cards.bulkPut([...(cards as any), ...oldCards]);

    const { result, unmount } = renderHook(() => useModuleFeed());

    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    expect(result.current.filter).toBe('mix');
    expect(result.current.index).toBe(0);
    expect(result.current.streak).toBe(0);
    expect(result.current.items.length).toBe(3);
    expect(result.current.items.map((c) => c.id)).toContain('w-1');
    expect(result.current.items.map((c) => c.id)).toContain('s-1');
    expect(result.current.items.map((c) => c.id)).toContain('b-1');
    expect(result.current.items.some((c) => c.id === 'old-1')).toBe(false);
    expect(result.current.items.some((c) => c.id === 'teach-1')).toBe(false);

    unmount();
  });

  it('excludes hidden cards (thumb down or wrong_english reason)', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('w-3', 'words'),
      makeCard('w-4', 'words'),
    ];
    await db.cards.bulkPut(cards as any);

    const feedbacks: CardFeedback[] = [
      {
        id: 'fb-w-1',
        cardId: 'w-1',
        module: 'words',
        thumb: 'down',
        reasons: ['too_easy'],
        reply: 'Got it',
        at: Date.now(),
      },
      {
        id: 'fb-w-2',
        cardId: 'w-2',
        module: 'words',
        thumb: 'up',
        reasons: ['wrong_english'],
        reply: 'Got it',
        at: Date.now(),
      },
      {
        id: 'fb-w-3',
        cardId: 'w-3',
        module: 'words',
        thumb: 'up',
        reasons: ['loved'],
        reply: 'Got it',
        at: Date.now(),
      },
    ];
    await db.feedback.bulkPut(feedbacks);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    const itemIds = result.current.items.map((c) => c.id);
    expect(itemIds).not.toContain('w-1'); // thumb down
    expect(itemIds).not.toContain('w-2'); // wrong_english
    expect(itemIds).toContain('w-3'); // up + loved
    expect(itemIds).toContain('w-4'); // no feedback

    unmount();
  });

  it('excludes already-seen cards from previous sessions', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
    ];
    await db.cards.bulkPut(cards as any);

    const event: ProductionEvent = {
      id: 'evt-view-w-1-123',
      type: 'card_viewed',
      cardId: 'w-1',
      cardType: 'module' as any,
      at: Date.now() - 100000,
      date: '2026-11-01',
      msSpent: 5000,
      mode: 'endless',
    };
    await db.events.put(event as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    const itemIds = result.current.items.map((c) => c.id);
    expect(itemIds).not.toContain('w-1');
    expect(itemIds).toContain('w-2');

    unmount();
  });

  it('moving forward onSettle records card left as viewed, with engagement tracking', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('w-3', 'words'),
    ];
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    // Mark card w-1 engaged
    const card0Id = result.current.items[0]!.id;
    act(() => {
      result.current.markEngaged(card0Id);
    });

    // Settle forward to card 1 (leaves card 0)
    await act(async () => {
      await result.current.onSettle(1);
    });

    expect(result.current.index).toBe(1);

    // Verify card_viewed event in IndexedDB
    const events = await db.events.toArray();
    const viewEvent = events.find((e) => e.cardId === card0Id && e.type === 'card_viewed');
    expect(viewEvent).toBeDefined();

    // Verify day record has 1 card completed and 1 XP earned
    const today = todayKey();
    const day = await db.days.get(today);
    expect(day).toBeDefined();
    expect(day?.cardsCompleted).toBe(1);
    expect(day?.xp).toBe(1);

    // Now settle forward to card 2 without markEngaged (skim)
    const card1Id = result.current.items[1]!.id;
    await act(async () => {
      await result.current.onSettle(2);
    });

    expect(result.current.index).toBe(2);

    // Skim creates viewed event, but cardsCompleted and xp do not increment
    const eventsAfter = await db.events.toArray();
    const skimEvent = eventsAfter.find((e) => e.cardId === card1Id && e.type === 'card_viewed');
    expect(skimEvent).toBeDefined();

    const dayAfter = await db.days.get(today);
    expect(dayAfter?.cardsCompleted).toBe(1);
    expect(dayAfter?.xp).toBe(1);

    unmount();
  });

  it('moving back onSettle records nothing', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('w-3', 'words'),
    ];
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    // Move forward 0 -> 1
    await act(async () => {
      await result.current.onSettle(1);
    });
    const eventsCountAfterStep1 = (await db.events.toArray()).length;
    expect(eventsCountAfterStep1).toBe(1);

    // Move backward 1 -> 0
    await act(async () => {
      await result.current.onSettle(0);
    });

    expect(result.current.index).toBe(0);
    // No new events recorded
    const eventsCountAfterBack = (await db.events.toArray()).length;
    expect(eventsCountAfterBack).toBe(eventsCountAfterStep1);

    unmount();
  });

  it('completing 5 engaged cards updates the streak', async () => {
    const cards: ModuleCard[] = Array.from({ length: 6 }, (_, i) => makeCard(`w-${i}`, 'words'));
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });
    expect(result.current.streak).toBe(0);

    // Engage and advance 5 cards (from 0 to 5)
    for (let i = 0; i < 5; i++) {
      const card = result.current.items[i]!;
      act(() => {
        result.current.markEngaged(card.id);
      });
      await act(async () => {
        await result.current.onSettle(i + 1);
      });
    }

    expect(result.current.index).toBe(5);
    expect(result.current.streak).toBe(1);

    const today = todayKey();
    const day = await db.days.get(today);
    expect(day?.cardsCompleted).toBe(5);
    expect(day?.coreThreeDone).toBe(true);

    unmount();
  });

  it('filter change restarts at card 1 (index 0) and shows only selected module', async () => {
    const cards: ModuleCard[] = [
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('s-1', 'smalltalk'),
      makeCard('b-1', 'better'),
      makeCard('p-1', 'phrases'),
      makeCard('st-1', 'stories'),
    ];
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    // Move to index 2
    await act(async () => {
      await result.current.onSettle(2);
    });
    expect(result.current.index).toBe(2);

    // Switch filter to 'words'
    act(() => {
      result.current.setFilter('words');
    });

    // Must restart at card 1 (index 0)
    expect(result.current.filter).toBe('words');
    expect(result.current.index).toBe(0);
    // Only words cards (excluding any card already seen)
    expect(result.current.items.every((c) => c.module === 'words')).toBe(true);

    unmount();
  });

  it('refills the items window when advancing near the end', async () => {
    // 30 words cards: initial chunk is 20, remaining 10 should refill
    const cards: ModuleCard[] = Array.from({ length: 30 }, (_, i) => makeCard(`w-${i}`, 'words'));
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed('words'));
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    expect(result.current.items.length).toBe(MODULE_FEED_CHUNK);

    // Settle to index 16, which is within REFILL_THRESHOLD of 20
    await act(async () => {
      await result.current.onSettle(16);
    });

    // Refill should have triggered, appending the remaining 10 cards
    expect(result.current.items.length).toBe(30);
    // Ensure all 30 unique cards are present without duplicates
    const uniqueIds = new Set(result.current.items.map((c) => c.id));
    expect(uniqueIds.size).toBe(30);

    unmount();
  });

  it('reload refreshes data from IndexedDB', async () => {
    const cards: ModuleCard[] = [makeCard('w-1', 'words')];
    await db.cards.bulkPut(cards as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });
    expect(result.current.items.length).toBe(1);

    // Add another card directly to the DB
    await db.cards.put(makeCard('w-2', 'words') as any);

    // Call reload
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.items.length).toBe(2);

    unmount();
  });
  it('leaving a card writes one SeenTerm (module:head) and queues it for backup', async () => {
    await db.cards.bulkPut([makeCard('w-1', 'words'), makeCard('w-2', 'words')] as any);

    const { result, unmount } = renderHook(() => useModuleFeed('words'));
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    const left = result.current.items[0]!;
    await act(async () => {
      await result.current.onSettle(1);
    });

    const terms = await db.seen.toArray();
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      id: `words:word-${left.id}`,
      module: 'words',
      head: `Word-${left.id}`,
      cardId: left.id,
    } satisfies Partial<SeenTerm>);
    const out = await db.outbox.toArray();
    expect(out.some((r) => r.table === 'seen' && r.key === terms[0]!.id)).toBe(true);

    unmount();
  });

  it('a card whose head was already seen is not served again', async () => {
    const twin = { ...makeCard('w-9', 'words'), word: 'WORD-W-1' } as ModuleCard;
    await db.cards.bulkPut([makeCard('w-2', 'words'), twin] as any);
    await db.seen.put({
      id: 'words:word-w-1',
      module: 'words',
      head: 'Word-w-1',
      cardId: 'w-1',
      at: 1,
    });

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    expect(result.current.items.map((c) => c.id)).toEqual(['w-2']);

    unmount();
  });

  it('puts due ♡ review cards first even though they were seen', async () => {
    await db.cards.bulkPut([
      makeCard('w-1', 'words'),
      makeCard('w-2', 'words'),
      makeCard('w-3', 'words'),
    ] as any);
    await db.seen.put({ id: 'words:word-w-3', module: 'words', head: 'Word-w-3', cardId: 'w-3', at: 1 });
    await db.events.put({
      id: 'evt-view-w-3-1',
      type: 'card_viewed',
      cardId: 'w-3',
      cardType: 'module',
      at: 1,
      date: '2026-11-01',
    } as any);
    const row: SavedReview = {
      cardId: 'w-3',
      module: 'words',
      savedAt: 1,
      step: 0,
      due: addDays(todayKey(), -1),
      rights: 0,
    };
    await db.savedReviews.put(row);

    const { result, unmount } = renderHook(() => useModuleFeed('words'));
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    expect(result.current.items[0]!.id).toBe('w-3');
    expect(result.current.items).toHaveLength(3);

    unmount();
  });

  it('setSaved creates the Sunday review (due in 3 days) and removes it again', async () => {
    const card = makeCard('w-1', 'words');
    await db.cards.put(card as any);

    const { result, unmount } = renderHook(() => useModuleFeed());
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 10000 });

    await act(async () => {
      await result.current.setSaved(card, true);
    });
    const row = await db.savedReviews.get('w-1');
    expect(row).toMatchObject({ cardId: 'w-1', module: 'words', step: 0, rights: 0 });
    expect(row!.due).toBe(addDays(todayKey(), 3));
    expect((await db.outbox.toArray()).some((r) => r.table === 'savedReviews' && r.op === 'put')).toBe(
      true,
    );

    // Saving again keeps the running review
    await db.savedReviews.put({ ...row!, step: 1, rights: 1 });
    await act(async () => {
      await result.current.setSaved(card, true);
    });
    expect((await db.savedReviews.get('w-1'))!.rights).toBe(1);

    await act(async () => {
      await result.current.setSaved(card, false);
    });
    expect(await db.savedReviews.get('w-1')).toBeUndefined();
    expect(
      (await db.outbox.toArray()).some((r) => r.table === 'savedReviews' && r.op === 'delete'),
    ).toBe(true);

    unmount();
  });
});
