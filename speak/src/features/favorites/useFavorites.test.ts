import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';
import { newSavedReview } from '../../srs/savedReview';
import type { FeedFilter, ModuleCard } from '../../types/contract';
import { useFavorites } from './useFavorites';

async function moduleCards(): Promise<ModuleCard[]> {
  const rows = await db.cards.where('type').equals('module').toArray();
  return rows as unknown as ModuleCard[];
}

async function clearAll() {
  await db.cards.clear();
  await db.bookmarks.clear();
  await db.savedReviews.clear();
  await db.outbox.clear();
  await db.events.clear();
  await db.days.clear();
  await db.profile.clear();
}

describe('useFavorites', () => {
  let w0: ModuleCard;
  let w1: ModuleCard;
  let story: ModuleCard;

  beforeEach(async () => {
    cleanup();
    await clearAll();
    await ensureSeeded();
    const all = await moduleCards();
    const words = all.filter((c) => c.module === 'words');
    expect(words.length).toBeGreaterThanOrEqual(2);
    w0 = words[0]!;
    w1 = words[1]!;
    story = all.find((c) => c.module === 'stories')!;
    expect(story).toBeTruthy();
    // Saved oldest → newest: w0, story, w1.
    await db.bookmarks.bulkPut([
      { cardId: w0.id, createdAt: 1_000 },
      { cardId: story.id, createdAt: 2_000 },
      { cardId: w1.id, createdAt: 3_000 },
    ]);
  });

  afterEach(async () => {
    cleanup();
    await clearAll();
  });

  it('lists saved module cards newest ♡ first on Mix', async () => {
    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, story.id, w0.id]);
    expect(result.current.total).toBe(3);
  });

  it('two cards come back newest first', async () => {
    await db.bookmarks.delete(story.id);
    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, w0.id]);
  });

  it('ignores ♡ on old (non-module) cards and missing cards', async () => {
    const old = await db.cards.filter((c) => (c as { type: string }).type !== 'module').first();
    if (old) await db.bookmarks.put({ cardId: old.id, createdAt: 8_000 });
    await db.bookmarks.put({ cardId: 'not-a-card', createdAt: 9_000 });
    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.cards.map((c) => c.id);
    expect(ids).not.toContain('not-a-card');
    if (old) expect(ids).not.toContain(old.id);
    expect(result.current.total).toBe(3);
  });

  it('a module filter keeps only that module; total stays all saved', async () => {
    const { result, rerender } = renderHook(({ f }: { f: FeedFilter }) => useFavorites(f), {
      initialProps: { f: 'words' as FeedFilter },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, w0.id]);
    expect(result.current.total).toBe(3);

    rerender({ f: 'smalltalk' });
    expect(result.current.cards).toHaveLength(0);
    expect(result.current.total).toBe(3);
  });

  it('unsave takes the ♡ off and ends its Sunday review, like the Feed ♡', async () => {
    await db.savedReviews.put(newSavedReview(story, Date.now()));
    await db.outbox.clear();

    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.total).toBe(3));

    await act(async () => {
      await result.current.unsave(story.id);
    });

    expect(await db.bookmarks.get(story.id)).toBeUndefined();
    expect(await db.savedReviews.get(story.id)).toBeUndefined();
    const outbox = await db.outbox.toArray();
    expect(outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'savedReviews', key: story.id, op: 'delete' }),
      ]),
    );
    const events = await db.events.toArray();
    expect(events.some((e) => e.type === 'card_unsaved' && e.cardId === story.id)).toBe(true);

    // Answer 4: it stays listed (♡ hollow) until the next open.
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, story.id, w0.id]);
    expect(result.current.isSaved(story.id)).toBe(false);
    expect(result.current.isSaved(w1.id)).toBe(true);
  });

  it('a fresh open no longer lists a card un-saved last time', async () => {
    const first = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => {
      await first.result.current.unsave(story.id);
    });
    first.unmount();

    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, w0.id]);
  });

  it('resave puts the ♡ back and restarts the Sunday review, keeping its place', async () => {
    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.unsave(story.id);
    });
    await act(async () => {
      await result.current.resave(story.id);
    });
    expect(await db.bookmarks.get(story.id)).toBeDefined();
    expect(await db.savedReviews.get(story.id)).toBeDefined();
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.isSaved(story.id)).toBe(true);
    expect(result.current.cards.map((c) => c.id)).toEqual([w1.id, story.id, w0.id]);
  });

  it('unsave twice does not save it again', async () => {
    const { result } = renderHook(() => useFavorites('mix'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.unsave(story.id);
      await result.current.unsave(story.id);
    });
    expect(await db.bookmarks.get(story.id)).toBeUndefined();
  });
});
