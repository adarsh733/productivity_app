import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/db';
import { toggleBookmarkWithXp } from './useBookmarks';
import type { WordCard } from '../../types/contract';

describe('useBookmarks Repository & Gamification Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.bookmarks.clear();
    await db.profile.clear();
    await db.days.clear();
    await db.profile.put({ id: 'me', createdAt: Date.now(), bookmarkXpAwarded: [] });
  });

  it('bookmarks card and awards 3 XP on first bookmark', async () => {
    const card: WordCard = {
      id: 'w-test-1',
      type: 'word',
      lang: 'en',
      tags: ['vocab'],
      source: 'seed',
      status: 'active',
      createdAt: Date.now(),
      term: 'resilient',
      pos: 'adjective',
      meaning: 'Able to withstand or recover quickly from difficult conditions',
      examples: ['Our distributed cluster is resilient to node failure.', 'The client is resilient to network disconnects.'],
      say: 'Use when describing fault-tolerant architectures',
    };
    await db.cards.put(card);

    const res1 = await toggleBookmarkWithXp('w-test-1', 'word');
    expect(res1.isBookmarked).toBe(true);
    expect(res1.xpEarned).toBe(3);

    // Toggle off
    const res2 = await toggleBookmarkWithXp('w-test-1', 'word');
    expect(res2.isBookmarked).toBe(false);
    expect(res2.xpEarned).toBe(0);

    // Toggle on again -> no XP farming (0 XP earned)
    const res3 = await toggleBookmarkWithXp('w-test-1', 'word');
    expect(res3.isBookmarked).toBe(true);
    expect(res3.xpEarned).toBe(0);
  });
});
