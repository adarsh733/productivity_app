import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, saveRecording, RECORDING_KEEP_LIMIT, SpeakDB } from './db';
import type { Recording } from '../types/contract';

function createMockRecordingsTable(): {
  _store: Map<string, Recording>;
  put: (r: Recording) => Promise<void>;
  count: () => Promise<number>;
  orderBy: (field: string) => {
    limit: (n: number) => {
      primaryKeys: () => Promise<string[]>;
    };
  };
  bulkDelete: (keys: string[]) => Promise<void>;
  get: (id: string) => Promise<Recording | undefined>;
} {
  const store = new Map<string, Recording>();
  return {
    _store: store,
    put: async (r: Recording) => {
      store.set(r.id, r);
    },
    count: async () => store.size,
    orderBy: (_field: string) => ({
      limit: (n: number) => ({
        primaryKeys: async () => {
          const sorted = Array.from(store.values()).sort((a, b) => a.at - b.at);
          return sorted.slice(0, n).map((r) => r.id);
        },
      }),
    }),
    bulkDelete: async (keys: string[]) => {
      for (const k of keys) store.delete(k);
    },
    get: async (id: string) => store.get(id),
  };
}

describe('SpeakDB IndexedDB Schema Suite', () => {
  it('Dexie database instance has all required tables defined', () => {
    expect(db.name).toBe('speak');
    expect(db.cards).toBeDefined();
    expect(db.reviews).toBeDefined();
    expect(db.events).toBeDefined();
    expect(db.days).toBeDefined();
    expect(db.inbox).toBeDefined();
    expect(db.profile).toBeDefined();
    expect(db.outbox).toBeDefined();
    expect(db.labSessions).toBeDefined();
    expect(db.voiceSamples).toBeDefined();
    expect(db.recordings).toBeDefined();
    expect(db.bookmarks).toBeDefined();
    expect(db.notes).toBeDefined();
    expect(db.meta).toBeDefined();
    // v6 — the v5 redesign tables
    expect(db.lessonProgress).toBeDefined();
    expect(db.asks).toBeDefined();
    expect(db.weakSpots).toBeDefined();
    expect(db.chats).toBeDefined();
    expect(db.storyBank).toBeDefined();
    // v7 — Night glass card feedback
    expect(db.feedback).toBeDefined();
    // v8 — v7 steps 4-6
    expect(db.seen).toBeDefined();
    expect(db.savedReviews).toBeDefined();
    expect(db.batches).toBeDefined();
  });

  it('is at version 8 with the v6, v7 and v8 keys and indexes', () => {
    expect(db.verno).toBe(8);
    const schema = (name: string) => db.table(name).schema;
    expect(schema('lessonProgress').primKey.name).toBe('lessonId');
    expect(schema('asks').primKey.name).toBe('id');
    expect(schema('asks').indexes.map((i) => i.name)).toEqual(['createdAt']);
    expect(schema('weakSpots').indexes.map((i) => i.name)).toEqual(['createdAt']);
    expect(schema('chats').indexes.map((i) => i.name)).toEqual(['day']);
    expect(schema('storyBank').indexes.map((i) => i.name)).toEqual(['day']);
    expect(schema('feedback').primKey.name).toBe('id');
    expect(schema('feedback').indexes.map((i) => i.name)).toEqual(['cardId', 'module', 'at']);
    expect(schema('seen').primKey.name).toBe('id');
    expect(schema('seen').indexes.map((i) => i.name)).toEqual(['module', 'at']);
    expect(schema('savedReviews').primKey.name).toBe('cardId');
    expect(schema('savedReviews').indexes.map((i) => i.name)).toEqual(['due']);
    expect(schema('batches').primKey.name).toBe('id');
    expect(schema('batches').indexes.map((i) => i.name)).toEqual(['module', 'at']);
  });

  it('upgrades a version-5 install to the current version without losing anything', async () => {
    const name = 'speak-upgrade-test';
    await Dexie.delete(name);

    // A v5 install exactly as shipped (v1..v5 stores, same index strings).
    const old = new Dexie(name);
    old.version(1).stores({
      cards: 'id, type, lang, status, source, batchId',
      reviews: 'cardId, due, state',
      events: 'id, cardId, at, mode',
      days: 'date',
      inbox: 'id, createdAt, status',
      profile: 'id',
      outbox: '++seq, table, at',
    });
    old.version(2).stores({ labSessions: 'id, date', voiceSamples: 'id, at, date, kind' });
    old.version(3).stores({ recordings: 'id, at, date, sessionId' });
    old.version(4).stores({ bookmarks: 'cardId, createdAt', notes: 'id, createdAt' });
    old.version(5).stores({ meta: 'key' });
    await old.open();
    await old.table('cards').put({ id: 'w-1', type: 'word', lang: 'en', status: 'active', source: 'seed' });
    await old.table('reviews').put({ cardId: 'w-1', due: '2026-10-30', state: 'review', reps: 3 });
    await old.table('days').put({ date: '2026-10-28', cardsCompleted: 7 });
    await old.table('meta').put({ key: 'flag', value: 1, updatedAt: 1 });
    old.close();

    const next = new SpeakDB(name);
    await next.open();
    expect(next.verno).toBe(8);

    // Old rows survive, review state included.
    expect((await next.cards.get('w-1'))?.type).toBe('word');
    expect((await next.reviews.get('w-1'))?.reps).toBe(3);
    expect((await next.days.get('2026-10-28'))?.cardsCompleted).toBe(7);
    expect((await next.meta.get('flag'))?.value).toBe(1);

    // New tables are empty and writable.
    expect(await next.lessonProgress.count()).toBe(0);
    await next.lessonProgress.put({ lessonId: 'ls-smalltalk-1-1', doneAt: 10 });
    await next.asks.put({
      id: 'a1', createdAt: 5, text: 'revert', askKind: 'word', answer: 'reply', cardIds: [], addedToFeed: false,
    });
    await next.weakSpots.put({ id: 'ws1', wrong: 'revert back', right: 'reply', source: 'ask', createdAt: 6 });
    await next.chats.put({ id: 'c1', day: '2026-10-29', turns: [] });
    await next.storyBank.put({ id: 's1', day: '2026-10-29', text: 'The chai story', createdAt: 7 });

    expect((await next.lessonProgress.get('ls-smalltalk-1-1'))?.doneAt).toBe(10);
    expect(await next.asks.orderBy('createdAt').primaryKeys()).toEqual(['a1']);
    expect(await next.weakSpots.count()).toBe(1);
    expect(await next.chats.where('day').equals('2026-10-29').count()).toBe(1);
    expect(await next.storyBank.where('day').equals('2026-10-29').count()).toBe(1);

    // Phone-only: writing to v6 tables queues nothing for Supabase.
    expect(await next.outbox.count()).toBe(0);

    next.close();
    await Dexie.delete(name);
  });

  it('upgrades a version-6 install to the current version with the feedback table', async () => {
    const name = 'speak-upgrade-v7-test';
    await Dexie.delete(name);

    // A v6 install exactly as shipped (v1..v6 stores, same index strings).
    const old = new Dexie(name);
    old.version(1).stores({
      cards: 'id, type, lang, status, source, batchId',
      reviews: 'cardId, due, state',
      events: 'id, cardId, at, mode',
      days: 'date',
      inbox: 'id, createdAt, status',
      profile: 'id',
      outbox: '++seq, table, at',
    });
    old.version(2).stores({ labSessions: 'id, date', voiceSamples: 'id, at, date, kind' });
    old.version(3).stores({ recordings: 'id, at, date, sessionId' });
    old.version(4).stores({ bookmarks: 'cardId, createdAt', notes: 'id, createdAt' });
    old.version(5).stores({ meta: 'key' });
    old.version(6).stores({
      lessonProgress: 'lessonId',
      asks: 'id, createdAt',
      weakSpots: 'id, createdAt',
      chats: 'id, day',
      storyBank: 'id, day',
    });
    await old.open();
    await old.table('cards').put({ id: 'w-1', type: 'word', lang: 'en', status: 'active', source: 'seed' });
    await old.table('asks').put({
      id: 'a1', createdAt: 5, text: 'revert', askKind: 'word', answer: 'reply', cardIds: [], addedToFeed: false,
    });
    await old.table('storyBank').put({ id: 's1', day: '2026-10-29', text: 'The chai story', createdAt: 7 });
    old.close();

    const next = new SpeakDB(name);
    await next.open();
    expect(next.verno).toBe(8);

    // v6 rows survive.
    expect((await next.cards.get('w-1'))?.type).toBe('word');
    expect((await next.asks.get('a1'))?.text).toBe('revert');
    expect((await next.storyBank.get('s1'))?.text).toBe('The chai story');

    // The feedback table is empty, keyed by id, and updated in place per card.
    expect(await next.feedback.count()).toBe(0);
    await next.feedback.put({
      id: 'fb-v7-words-01', cardId: 'v7-words-01', module: 'words',
      thumb: 'down', reasons: ['too_easy'], reply: 'Got it: harder words next.', at: 10,
    });
    await next.feedback.put({
      id: 'fb-v7-words-01', cardId: 'v7-words-01', module: 'words',
      thumb: 'up', reasons: ['loved'], reply: 'Got it: more like this.', at: 11,
    });
    await next.feedback.put({
      id: 'fb-v7-talk-01', cardId: 'v7-talk-01', module: 'smalltalk',
      reasons: ['confusing'], comment: 'Too long', reply: 'Got it: shorter replies.', at: 12,
    });
    expect(await next.feedback.count()).toBe(2);
    expect((await next.feedback.get('fb-v7-words-01'))?.thumb).toBe('up');
    expect(await next.feedback.where('module').equals('smalltalk').count()).toBe(1);
    expect(await next.feedback.where('cardId').equals('v7-words-01').count()).toBe(1);
    expect(await next.feedback.orderBy('at').primaryKeys()).toEqual(['fb-v7-words-01', 'fb-v7-talk-01']);

    // Phone-only: writing feedback queues nothing for Supabase.
    expect(await next.outbox.count()).toBe(0);

    next.close();
    await Dexie.delete(name);
  });

  it('upgrades a version-7 install to version 8: feedback kept, seen / saved reviews / batches added', async () => {
    const name = 'speak-upgrade-v8-test';
    await Dexie.delete(name);

    // A v7 install exactly as shipped (v1..v7 stores, same index strings).
    const old = new Dexie(name);
    old.version(1).stores({
      cards: 'id, type, lang, status, source, batchId',
      reviews: 'cardId, due, state',
      events: 'id, cardId, at, mode',
      days: 'date',
      inbox: 'id, createdAt, status',
      profile: 'id',
      outbox: '++seq, table, at',
    });
    old.version(2).stores({ labSessions: 'id, date', voiceSamples: 'id, at, date, kind' });
    old.version(3).stores({ recordings: 'id, at, date, sessionId' });
    old.version(4).stores({ bookmarks: 'cardId, createdAt', notes: 'id, createdAt' });
    old.version(5).stores({ meta: 'key' });
    old.version(6).stores({
      lessonProgress: 'lessonId',
      asks: 'id, createdAt',
      weakSpots: 'id, createdAt',
      chats: 'id, day',
      storyBank: 'id, day',
    });
    old.version(7).stores({ feedback: 'id, cardId, module, at' });
    await old.open();
    await old.table('cards').put({ id: 'v7-words-01', type: 'module', lang: 'en', status: 'active', source: 'seed' });
    await old.table('bookmarks').put({ cardId: 'v7-words-01', createdAt: 3 });
    await old.table('feedback').put({
      id: 'fb-v7-words-01', cardId: 'v7-words-01', module: 'words', thumb: 'up', reasons: [], reply: 'Got it.', at: 4,
    });
    old.close();

    const next = new SpeakDB(name);
    await next.open();
    expect(next.verno).toBe(8);

    // v7 rows survive.
    expect((await next.cards.get('v7-words-01'))?.type).toBe('module');
    expect((await next.bookmarks.get('v7-words-01'))?.createdAt).toBe(3);
    expect((await next.feedback.get('fb-v7-words-01'))?.thumb).toBe('up');

    // New tables start empty and are writable on their keys and indexes.
    expect(await next.seen.count()).toBe(0);
    expect(await next.savedReviews.count()).toBe(0);
    expect(await next.batches.count()).toBe(0);

    await next.seen.put({ id: 'words:relieved', module: 'words', head: 'relieved', cardId: 'v7-words-03', at: 20 });
    await next.seen.put({ id: 'words:relieved', module: 'words', head: 'Relieved', cardId: 'v7-ai-words-0001', at: 21 });
    await next.seen.put({ id: 'smalltalk:how was your weekend?', module: 'smalltalk', head: 'How was your weekend?', cardId: 'v7-talk-01', at: 22 });
    expect(await next.seen.count()).toBe(2);
    expect(await next.seen.where('module').equals('words').count()).toBe(1);
    expect(await next.seen.orderBy('at').primaryKeys()).toEqual(['words:relieved', 'smalltalk:how was your weekend?']);

    await next.savedReviews.put({ cardId: 'v7-words-01', module: 'words', savedAt: 3, step: 0, due: '2026-11-11', rights: 0 });
    await next.savedReviews.put({ cardId: 'v7-talk-01', module: 'smalltalk', savedAt: 5, step: 1, due: '2026-11-20', rights: 1, lastAnswer: 'knew' });
    expect(await next.savedReviews.where('due').belowOrEqual('2026-11-15').primaryKeys()).toEqual(['v7-words-01']);

    await next.batches.put({
      id: 'batch-words-100', module: 'words', at: 100, level: 2, asked: 30, kept: ['v7-ai-words-0001'], dropped: 29, status: 'done',
    });
    expect(await next.batches.where('module').equals('words').count()).toBe(1);

    // Writing to the tables queues nothing by itself: callers enqueue.
    expect(await next.outbox.count()).toBe(0);

    next.close();
    await Dexie.delete(name);
  });

  it('Enforces the 200-recording cap: inserting 205 recordings retains exactly 200 and prunes the 5 oldest', async () => {
    expect(RECORDING_KEEP_LIMIT).toBe(200);

    const mockTable = createMockRecordingsTable();
    const baseTimestamp = 1700000000000;
    const blob = new Blob(['mock audio data'], { type: 'audio/webm' });

    // Insert 205 recordings sequentially with increasing timestamps
    for (let i = 1; i <= 205; i++) {
      const recording: Recording = {
        id: `rec-cap-test-${i}`,
        sessionId: `session-${i}`,
        attempt: 1,
        missionId: 'rapid-rep',
        missionTitle: 'Rapid Rep',
        date: '2026-08-26',
        at: baseTimestamp + i * 1000,
        durationSec: 30,
        mimeType: 'audio/webm',
        blob,
      };

      await saveRecording(recording, mockTable as any);
    }

    // 1. Total count must be bounded at exactly 200
    const finalCount = await mockTable.count();
    expect(finalCount).toBe(200);

    // 2. The 5 oldest recordings (1 to 5) must have been deleted
    for (let i = 1; i <= 5; i++) {
      const oldest = await mockTable.get(`rec-cap-test-${i}`);
      expect(oldest).toBeUndefined();
    }

    // 3. The 200 newest recordings (6 to 205) must all exist
    for (let i = 6; i <= 205; i++) {
      const retained = await mockTable.get(`rec-cap-test-${i}`);
      expect(retained).toBeDefined();
      expect(retained?.id).toBe(`rec-cap-test-${i}`);
    }
  });
});
