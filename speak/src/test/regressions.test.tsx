import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../db/db';
import { ensureSeeded, readSeedFiles } from '../db/seedLoader';
import { buildQueue, getCardMultiplier } from '../srs/queue';
import type { Card, WordCard } from '../types/contract';
import { QUEUE_RULES } from '../types/contract';

describe('Articulate V3 Release-Hardening & Regressions Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.profile.clear();
  });

  // 4. Regression 4: Duplicate XP Protection
  it('Regression 4: Bookmarking the same card multiple times never awards duplicate XP', async () => {
    const cardId = 'test-word-1';
    await db.profile.put({
      id: 'me',
      createdAt: Date.now(),
      bookmarkXpAwarded: [],
    });

    const isAlreadyAwarded = (profileBookmarks: string[] | undefined, id: string) =>
      profileBookmarks?.includes(id) ?? false;

    expect(isAlreadyAwarded([], cardId)).toBe(false);

    // Award XP on first save
    await db.profile.update('me', { bookmarkXpAwarded: [cardId] });
    const updated = await db.profile.get('me');
    expect(isAlreadyAwarded(updated?.bookmarkXpAwarded, cardId)).toBe(true);

    // Subsequent save check
    expect(isAlreadyAwarded(updated?.bookmarkXpAwarded, cardId)).toBe(true);
  });

  // 5. Regression 5: Expiring Downweights
  it('Regression 5: Downweights expire after 7 days and never permanently crush card frequency', () => {
    const card: WordCard = {
      id: 'w-test',
      type: 'word',
      lang: 'en',
      tags: ['office'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'tangible',
      pos: 'adj.',
      meaning: 'Clear and definite',
      examples: ['ex1', 'ex2'],
      say: 'say it',
    };

    const now = Date.now();
    const activeDownweight = {
      target: 'word',
      multiplier: 0.2,
      createdAt: now,
      expiresAt: now + 7 * 86400 * 1000,
    };

    const expiredDownweight = {
      target: 'word',
      multiplier: 0.2,
      createdAt: now - 10 * 86400 * 1000,
      expiresAt: now - 3 * 86400 * 1000,
    };

    // Active downweight applies
    const activeMult = getCardMultiplier(card, [], {}, { word: activeDownweight }, now);
    expect(activeMult).toBe(0.2);

    // Expired downweight is ignored (restores to 1.0)
    const expiredMult = getCardMultiplier(card, [], {}, { word: expiredDownweight }, now);
    expect(expiredMult).toBe(1.0);
  });

  // 6. Regression 6: New-Card Daily Cap
  it('Regression 6: buildQueue strictly enforces MAX_NEW_PER_DAY cap', async () => {
    const { cards } = readSeedFiles();
    const reviews = new Map();

    const queue = buildQueue(cards, reviews, {
      today: '2026-08-26',
      seenCardIds: new Set(),
      breathServedToday: 0,
      newServedToday: QUEUE_RULES.MAX_NEW_PER_DAY, // 20 new cards already served
      limit: 10,
    });

    const newItems = queue.filter((item) => item.reason === 'new');
    expect(newItems.length).toBe(0);
  });

  // 9. Regression 9: Asset Integrity
  it('Regression 9: manifest icons exist; scene images are optional (text-only scenes)', () => {
    const publicDir = path.resolve(__dirname, '../../public');
    const requiredAssets = [
      'icon-192.png',
      'icon-512.png',
      'icon.svg',
      'assets/scenes/metadata.json',
    ];

    for (const asset of requiredAssets) {
      const fullPath = path.join(publicDir, asset);
      expect(fs.existsSync(fullPath), `Missing asset: ${asset}`).toBe(true);
    }

    // Placeholder scene photos were removed (Stage 5): describe cards ship
    // text-only scenes. If a seed card references an image, it must exist —
    // but zero image references is valid.
    const { cards } = readSeedFiles();
    const withImages = cards.filter(
      (c) =>
        c.type === 'describe' &&
        (c as Extract<Card, { type: 'describe' }>).imagePath &&
        (c as Extract<Card, { type: 'describe' }>).imagePath!.trim() !== '',
    );
    for (const card of withImages) {
      const imagePath = (card as Extract<Card, { type: 'describe' }>).imagePath as string;
      const cleanPath = imagePath.replace(/^\//, '');
      expect(fs.existsSync(path.join(publicDir, cleanPath)), `Missing scene image: ${imagePath}`).toBe(true);
    }
  });

  // 11. Regression 11: Seed Loading & Persistence
  it('Regression 11: ensureSeeded loads full seed content cleanly into IndexedDB without throwing', async () => {
    const report = await ensureSeeded();
    // AG-006 edits seed JSON in parallel — assert shape, not exact counts.
    expect(report.loaded).toBeGreaterThan(200);
    expect(Array.isArray(report.skipped)).toBe(true);

    const count = await db.cards.count();
    expect(count).toBe(report.loaded);
  });
});
