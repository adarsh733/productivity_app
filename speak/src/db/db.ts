import Dexie, { type Table } from 'dexie';
import type {
  Card,
  CardEvent,
  DayRecord,
  InboxItem,
  Profile,
  Review,
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
  }
}

export interface OutboxRow {
  seq?: number;
  table: 'reviews' | 'events' | 'days' | 'inbox' | 'profile' | 'cards';
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
