import { describe, expect, it } from 'vitest';
import { db, saveRecording, RECORDING_KEEP_LIMIT } from './db';
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
