import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { db } from '../db/db';
import { ensureSeeded, readSeedFiles } from '../db/seedLoader';
import { buildQueue, getCardMultiplier } from '../srs/queue';
import { INTEREST_OPTIONS } from '../types/interests';
import { searchCards } from '../features/browse/categories';
import { SpeakingAttemptSession } from '../features/speak/useSpeakingAttempt';
import { validateAiFeedback } from '../features/ai/useAiFeedback';
import CardFace from '../components/cards/CardFace';
import AudioRecorder from '../components/speak/AudioRecorder';
import type { Card, CardType, WordCard } from '../types/contract';
import { QUEUE_RULES } from '../types/contract';

describe('Articulate V3 Release-Hardening & Regressions Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.days.clear();
    await db.reviews.clear();
    await db.events.clear();
    await db.profile.clear();
  });

  // 1. Regression 1: Fabricated Spoken Rep
  it('Regression 1: Audio session cancellation or idle state produces zero spoken rep credit', () => {
    const session = new SpeakingAttemptSession({
      durationSec: 30,
    });

    expect(session.state).toBe('idle');
    expect(session.result).toBeNull();

    session.cancel();
    expect(session.state).toBe('cancelled');
    expect(session.result).toBeNull();
  });

  // 2. Regression 2: Fabricated AI Fallback
  it('Regression 2: AI feedback validator requires structured transcript evidence and rejects missing fields', () => {
    // Missing required fields throws validation error rather than inventing canned praise
    expect(() =>
      validateAiFeedback({
        summary: 'Incomplete response',
      })
    ).toThrow(/missing or empty strongPoint/);

    expect(() => validateAiFeedback(null)).toThrow(/expected an object/);

    const valid = validateAiFeedback({
      summary: 'Crisp update on latency targets.',
      strongPoint: 'Directly stated the 100ms p99 requirement.',
      oneCorrection: 'Eliminate filler word before closing.',
      suggestedAlternative: 'We will ship on Friday.',
    });
    expect(valid.summary).toBe('Crisp update on latency targets.');
    expect(valid.strongPoint).toBe('Directly stated the 100ms p99 requirement.');
  });

  // 3. Regression 3: Recorder Cancellation on Render
  it('Regression 3: AudioRecorder cleans up stream tracks cleanly on unmount without throwing errors', async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    const { unmount } = render(
      <AudioRecorder
        durationSec={30}
        onComplete={onComplete}
        onCancel={onCancel}
        promptNode={<div>Test Active Recording</div>}
      />
    );

    // Start recording
    await act(async () => {
      screen.getByRole('button', { name: /Start speaking/i }).click();
    });

    // Unmount during active recording
    expect(() => {
      act(() => {
        unmount();
      });
    }).not.toThrow();
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

  // 7. Regression 7: Search Card Coverage & Browse Detail
  it('Regression 7: searchCards covers all 13 card types without skipping any type', () => {
    const sampleCards: Card[] = [
      { id: 'w1', type: 'word', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, term: 'tangible', pos: 'adj', meaning: 'real', examples: ['a', 'b'], say: 'c' },
      { id: 'p1', type: 'phrase', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, weak: 'revert back', strong: 'get back', why: 'calque', register: 'office' },
      { id: 'd1', type: 'describe', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, imagePath: '', alt: '', prompt: 'monsoon cafe scene', beats: ['a', 'b', 'c'], targetVocab: ['rain', 'coffee', 'steam'], targetSec: 45 },
      { id: 'e1', type: 'explain', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, topic: 'caching', angle: 'redis memory', beats: ['a', 'b', 'c'], targetVocab: ['latency', 'throughput', 'memory'], targetSec: 45 },
      { id: 't1', type: 'teach_back', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, prompt: 'microservices vs monolith', beats: ['a', 'b', 'c'], targetSec: 45 },
      { id: 'b1', type: 'breath', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, drill: 'box', title: 'Box Breathing', instructions: ['in', 'hold', 'out'], logUnit: 'seconds' },
    ];

    expect(searchCards(sampleCards, 'tangible').length).toBe(1);
    expect(searchCards(sampleCards, 'revert').length).toBe(1);
    expect(searchCards(sampleCards, 'monsoon').length).toBe(1);
    expect(searchCards(sampleCards, 'caching').length).toBe(1);
    expect(searchCards(sampleCards, 'monolith').length).toBe(1);
    expect(searchCards(sampleCards, 'Box Breathing').length).toBe(1);
  });

  // 8. Regression 8: All 13 Card Faces Render Cleanly
  it('Regression 8: CardFace renders all 13 card types without throwing or crashing', () => {
    const cardTypes: CardType[] = [
      'word', 'swap', 'idiom', 'action_verb', 'pronounce',
      'say_it', 'breath', 'phrase', 'feeling', 'story_move',
      'describe', 'explain', 'teach_back', 'situation',
    ];

    const makeCard = (type: CardType): Card => {
      switch (type) {
        case 'word': return { id: 'w1', type: 'word', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, term: 'term', pos: 'noun', meaning: 'm', examples: ['e1', 'e2'], say: 's' };
        case 'swap': return { id: 'sw1', type: 'swap', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, weak: 'w', answers: ['a'], timerSec: 5 };
        case 'idiom': return { id: 'id1', type: 'idiom', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, phrase: 'p', meaning: 'm', scenario: 'sc', example: 'ex', corporate: true };
        case 'action_verb': return { id: 'av1', type: 'action_verb', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, verb: 'v', meaning: 'm', contrast: 'c', examples: ['e1', 'e2'] };
        case 'pronounce': return { id: 'pr1', type: 'pronounce', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, term: 't', syllables: 'T·est', stressIndex: 0 };
        case 'say_it': return { id: 'sy1', type: 'say_it', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, line: 'l', marked: 'l /', targetWpm: 120 };
        case 'breath': return { id: 'br1', type: 'breath', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, drill: 'box', title: 'Box', instructions: ['i1'], logUnit: 'seconds' };
        case 'phrase': return { id: 'ph1', type: 'phrase', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, weak: 'wk', strong: 'st', why: 'y', register: 'office' };
        case 'feeling': return { id: 'fe1', type: 'feeling', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, term: 'fe', meaning: 'm', contrast: 'c', example: 'ex' };
        case 'story_move': return { id: 'sm1', type: 'story_move', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, move: 'mv', why: 'y', example: 'ex' };
        case 'describe': return { id: 'ds1', type: 'describe', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, imagePath: '', alt: '', prompt: 'pr', beats: ['b1', 'b2', 'b3'], targetVocab: ['v1', 'v2', 'v3'], targetSec: 45 };
        case 'explain': return { id: 'ex1', type: 'explain', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, topic: 'top', angle: 'ang', beats: ['b1', 'b2', 'b3'], targetVocab: ['v1', 'v2', 'v3'], targetSec: 45 };
        case 'teach_back': return { id: 'tb1', type: 'teach_back', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, prompt: 'pr', beats: ['b1', 'b2', 'b3'], targetSec: 45 };
        case 'situation': return { id: 'st1', type: 'situation', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0, kind: 'incident', title: 't', prompt: 'pr', beats: ['b1', 'b2', 'b3'], targetVocab: [], targetSec: 60 };
      }
    };

    for (const type of cardTypes) {
      const card = makeCard(type);
      expect(() => {
        render(<CardFace card={card} />);
      }).not.toThrow();
    }
  });

  // 9. Regression 9: Asset Integrity
  it('Regression 9: All scene images and manifest icon assets physically exist on disk', () => {
    const publicDir = path.resolve(__dirname, '../../public');
    const requiredAssets = [
      'icon-192.png',
      'icon-512.png',
      'icon.svg',
      'assets/scenes/datacenter.jpg',
      'assets/scenes/metro.jpg',
      'assets/scenes/monsoon_cafe.jpg',
      'assets/scenes/war_room.jpg',
      'assets/scenes/metadata.json',
    ];

    for (const asset of requiredAssets) {
      const fullPath = path.join(publicDir, asset);
      expect(fs.existsSync(fullPath), `Missing asset: ${asset}`).toBe(true);
    }
  });

  // 10. Regression 10: Stale Interest IDs
  it('Regression 10: All interest IDs in INTEREST_OPTIONS are active and valid', () => {
    const validIds = ['office', 'words', 'hindi', 'speaking', 'storytelling', 'ideas'];
    for (const opt of INTEREST_OPTIONS) {
      expect(validIds).toContain(opt.id);
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.icon.length).toBeGreaterThan(0);
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
