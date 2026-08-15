import Dexie, { type Table } from 'dexie';
import type {
  Card,
  CardEvent,
  DayRecord,
  InboxItem,
  LabSession,
  Profile,
  Recording,
  Review,
  VoiceSample,
} from '../types/contract';

/**
 * IndexedDB is the read path. Every screen reads from here and nothing waits on
 * the network — the app has to open and be usable in a lift with no signal.
 * Supabase (src/sync) mirrors this in the background; it is never read from
 * during a session.
 */
export class SpeakDB extends Dexie {
  cards!: Table<Card, string>;
  reviews!: Table<Review, string>;
  events!: Table<CardEvent, string>;
  days!: Table<DayRecord, string>;
  inbox!: Table<InboxItem, string>;
  profile!: Table<Profile, string>;
  /** Rows waiting to be pushed to Supabase. Survives being offline for weeks. */
  outbox!: Table<OutboxRow, number>;
  /** Phase 1: one row per Speaking Lab session, partials included. */
  labSessions!: Table<LabSession, string>;
  /** Phase 1: the charted voice numbers. Never reconstructed from `events`. */
  voiceSamples!: Table<VoiceSample, string>;
  /** Saved attempt audio. Local only — blobs are never enqueued for sync. */
  recordings!: Table<Recording, string>;

  constructor() {
    super('speak');
    this.version(1).stores({
      cards: 'id, type, lang, status, source, batchId',
      reviews: 'cardId, due, state',
      events: 'id, cardId, at, mode',
      days: 'date',
      inbox: 'id, createdAt, status',
      profile: 'id',
      outbox: '++seq, table, at',
    });

    // v2 — the Speaking Lab. Additive only: Dexie carries every v1 store
    // forward untouched, so an existing install keeps its cards, reviews,
    // streak and day history. Do not restate the v1 tables here; restating one
    // with a different index string would rebuild it.
    this.version(2).stores({
      labSessions: 'id, date',
      voiceSamples: 'id, at, date, kind',
    });

    // v3 — attempt audio. Additive, same rule as v2: do not restate v1/v2
    // stores here.
    this.version(3).stores({
      recordings: 'id, at, date, sessionId',
    });
  }
}

/**
 * How many attempts the archive keeps.
 *
 * A minute of compressed speech is roughly 500 kB, so an unbounded archive
 * fills a phone's storage quota inside a few months and then *every* write
 * starts failing — including the day record. Two attempts a day for a full
 * twelve-week horizon is ~170; 200 keeps the whole measurement horizon and
 * still bounds the growth.
 */
export const RECORDING_KEEP_LIMIT = 200;

/** Save an attempt, then drop the oldest beyond the cap. */
export async function saveRecording(recording: Recording): Promise<void> {
  await db.recordings.put(recording);
  const count = await db.recordings.count();
  if (count <= RECORDING_KEEP_LIMIT) return;
  const stale = await db.recordings
    .orderBy('at')
    .limit(count - RECORDING_KEEP_LIMIT)
    .primaryKeys();
  await db.recordings.bulkDelete(stale);
}

export interface OutboxRow {
  seq?: number;
  table:
    | 'reviews'
    | 'events'
    | 'days'
    | 'inbox'
    | 'profile'
    | 'cards'
    | 'labSessions'
    | 'voiceSamples';
  /** Primary key of the row in its own table. */
  key: string;
  op: 'put' | 'delete';
  at: number;
}

export const db = new SpeakDB();

/** Queue a change for the next sync. Called by every write helper below. */
export async function enqueue(table: OutboxRow['table'], key: string, op: OutboxRow['op'] = 'put') {
  await db.outbox.add({ table, key, op, at: Date.now() });
}

export async function getProfile(): Promise<Profile> {
  const existing = await db.profile.get('me');
  if (existing) return existing;
  const fresh: Profile = { id: 'me', createdAt: Date.now(), userId: null };
  await db.profile.put(fresh);
  return fresh;
}
