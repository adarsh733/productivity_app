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
  });

  it('is at version 6 with the v6 keys and indexes', () => {
    expect(db.verno).toBe(6);
    const schema = (name: string) => db.table(name).schema;
    expect(schema('lessonProgress').primKey.name).toBe('lessonId');
    expect(schema('asks').primKey.name).toBe('id');
    expect(schema('asks').indexes.map((i) => i.name)).toEqual(['createdAt']);
    expect(schema('weakSpots').indexes.map((i) => i.name)).toEqual(['createdAt']);
    expect(schema('chats').indexes.map((i) => i.name)).toEqual(['day']);
    expect(schema('storyBank').indexes.map((i) => i.name)).toEqual(['day']);
  });

  it('upgrades a version-5 install to version 6 without losing anything', async () => {
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
    expect(next.verno).toBe(6);

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
