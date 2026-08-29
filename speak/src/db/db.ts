import Dexie, { type Table } from 'dexie';
import type {
  Card,
  CardEvent,
  CardType,
  DayRecord,
  InboxItem,
  LabSession,
  Profile,
  ProductionEvent,
  Recording,
  Review,
  VoiceSample,
} from '../types/contract';
import { GAMIFICATION } from '../types/contract';
import { todayKey } from '../lib/date';

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
  /** Bookmarked cards. */
  bookmarks!: Table<BookmarkRecord, string>;
  /** Personal notes and captured phrases. */
  notes!: Table<NoteRecord, string>;

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

    // v4 — bookmarks & personal toolkit notes
    this.version(4).stores({
      bookmarks: 'cardId, createdAt',
      notes: 'id, createdAt',
    });
  }
}

export interface BookmarkRecord {
  cardId: string;
  createdAt: number;
}

export interface NoteRecord {
  id: string;
  text: string;
  createdAt: number;
  tags?: string[];
}

export interface SpeakDBExtended extends SpeakDB {
  bookmarks: Table<BookmarkRecord, string>;
  notes: Table<NoteRecord, string>;
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
export async function saveRecording(
  recording: Recording,
  table: Table<Recording, string> = db.recordings,
): Promise<void> {
  await table.put(recording);
  if (typeof table.count === 'function' && typeof table.orderBy === 'function') {
    const count = await table.count();
    if (count <= RECORDING_KEEP_LIMIT) return;
    const stale = await table
      .orderBy('at')
      .limit(count - RECORDING_KEEP_LIMIT)
      .primaryKeys();
    if (stale && stale.length > 0 && typeof table.bulkDelete === 'function') {
      await table.bulkDelete(stale);
    }
  }
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

export async function toggleBookmarkWithXp(
  cardId: string,
  cardType?: CardType,
): Promise<{ isBookmarked: boolean; xpEarned: number }> {
  const today = todayKey();
  return await db.transaction('rw', db.bookmarks, db.profile, db.days, db.events, db.outbox, async () => {
    const exists = await db.bookmarks.get(cardId);
    const profile = (await db.profile.get('me')) ?? { id: 'me' as const, createdAt: Date.now() };
    const awarded = new Set(profile.bookmarkXpAwarded ?? []);
    const day = (await db.days.get(today)) ?? {
      date: today,
      coreThreeDone: false,
      cardsCompleted: 0,
      secondsActive: 0,
      urgesRedirected: 0,
      xp: 0,
      spokenReps: 0,
    };

    const now = Date.now();
    if (exists) {
      // Unsaving
      await db.bookmarks.delete(cardId);
      const unsaveEvent: ProductionEvent = {
        id: `evt-unsave-${cardId}-${now}`,
        type: 'card_unsaved',
        cardId,
        cardType,
        at: now,
        date: today,
      };
      await db.events.put(unsaveEvent as any);
      await enqueue('events', unsaveEvent.id);
      return { isBookmarked: false, xpEarned: 0 };
    } else {
      // Saving
      await db.bookmarks.put({ cardId, createdAt: now });
      const saveEvent: ProductionEvent = {
        id: `evt-save-${cardId}-${now}`,
        type: 'card_saved',
        cardId,
        cardType,
        at: now,
        date: today,
      };
      await db.events.put(saveEvent as any);
      await enqueue('events', saveEvent.id);

      let xpEarned = 0;
      if (!awarded.has(cardId)) {
        // First time ever bookmarked -> 3 XP
        xpEarned = GAMIFICATION.XP.cardSaved;
        awarded.add(cardId);
        const updatedProfile: Profile = {
          ...profile,
          bookmarkXpAwarded: Array.from(awarded),
        };
        await db.profile.put(updatedProfile);
        await enqueue('profile', 'me');

        const updatedDay: DayRecord = {
          ...day,
          xp: (day.xp ?? 0) + xpEarned,
        };
        await db.days.put(updatedDay);
        await enqueue('days', today);
      }

      return { isBookmarked: true, xpEarned };
    }
  });
}

export async function toggleBookmark(cardId: string): Promise<boolean> {
  const res = await toggleBookmarkWithXp(cardId);
  return res.isBookmarked;
}

export async function isCardBookmarked(cardId: string): Promise<boolean> {
  const item = await db.bookmarks.get(cardId);
  return Boolean(item);
}

export async function getAllBookmarks(): Promise<string[]> {
  const items = await db.bookmarks.toArray();
  return items.map((i) => i.cardId);
}

export async function saveNote(text: string, tags?: string[]): Promise<NoteRecord> {
  const note: NoteRecord = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    createdAt: Date.now(),
    tags,
  };
  await db.notes.put(note);
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

