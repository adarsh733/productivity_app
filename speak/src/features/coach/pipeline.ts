import type {
  AiResponse,
  Card,
  ClassifyInboxResult,
  CoachKind,
  InboxItem,
  VerifyBatchResult,
} from '../../types/contract';
import { db, enqueue } from '../../db/db';

/**
 * AG-007 stage 3 — "Tell the coach" pipeline.
 *
 * save as `raw` → `classify_inbox` → every draft through `verify_batch` →
 * drop failures → dedupe → store (`source: 'inbox'`, `seedId` = inbox id,
 * `batchId` = `coach-<inboxId>`, tags `['coach', kind]`).
 *
 * Rules: AI unverified ⇒ nothing added. Offline/failure ⇒ keep `raw` with a
 * plain `failReason`, retry on app open, max 3 attempts. The mic never gates
 * (dictation only when SpeechRecognition exists, in CoachBox).
 */

export const COACH_MAX_ATTEMPTS = 3;

/** Plain sentences only — never a raw provider error. */
export const COACH_FAIL_PLAIN =
  "AI is unavailable right now. Saved — I'll try again when you're online.";

export const COACH_CAPPED =
  "Couldn't add cards — tap to try again.";

export type FetchFn = typeof fetch;

async function aiPost<T>(task: string, payload: unknown, fetchFn: FetchFn): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, payload }),
    });
  } catch {
    throw new Error(COACH_FAIL_PLAIN);
  }
  let data: AiResponse<T>;
  try {
    data = (await res.json()) as AiResponse<T>;
  } catch {
    throw new Error(COACH_FAIL_PLAIN);
  }
  if (!res.ok || !data.ok || data.data === undefined) {
    throw new Error(COACH_FAIL_PLAIN);
  }
  return data.data;
}

// ── Local, no-AI mistake check ─────────────────────────────────────────────
// Word boundaries, case-insensitive. "revert back" matches "I revert back
// all the time" but not "revertedback". Runs in PlaybackReview without AI.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface WatchEntry {
  wrong: string;
  right: string;
}

export function findWatchHits(transcript: string, watch: readonly WatchEntry[]): WatchEntry[] {
  if (!transcript || watch.length === 0) return [];
  return watch.filter((w) => {
    const needle = w.wrong.trim();
    if (!needle) return false;
    try {
      return new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(transcript);
    } catch {
      return transcript.toLowerCase().includes(needle.toLowerCase());
    }
  });
}

// ── Dedupe ─────────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s.trim().toLowerCase();
}

type Draft = ClassifyInboxResult['cards'][number];

/** Drop drafts that already exist as cards (same term / weak / topic+angle). */
export function dedupeDrafts(drafts: readonly Draft[], existing: readonly Card[]): Draft[] {
  const words = new Set<string>();
  const weaks = new Set<string>();
  const topics = new Set<string>();
  for (const c of existing) {
    if (c.type === 'word') words.add(norm(c.term));
    if (c.type === 'phrase') weaks.add(norm(c.weak));
    if (c.type === 'explain') topics.add(`${norm(c.topic)}‖${norm(c.angle)}`);
  }
  return drafts.filter((d) => {
    if (d.type === 'word') return !words.has(norm(d.term));
    if (d.type === 'phrase') return !weaks.has(norm(d.weak));
    return !topics.has(`${norm(d.topic)}‖${norm(d.angle)}`);
  });
}

// ── Drafts → cards ─────────────────────────────────────────────────────────
export function draftsToCards(kind: CoachKind, drafts: readonly Draft[], inboxId: string, now: number = Date.now()): Card[] {
  const batchId = `coach-${inboxId}`;
  return drafts.map((d, i) => {
    const base = {
      id: `${batchId}-${i}`,
      lang: 'en' as const,
      tags: ['coach', kind],
      source: 'inbox' as const,
      status: 'active' as const,
      createdAt: now,
      batchId,
      seedId: inboxId,
    };
    if (d.type === 'word') {
      return { ...base, ...d } as Card;
    }
    if (d.type === 'phrase') {
      return { ...base, ...d } as Card;
    }
    return { ...base, ...d } as Card;
  });
}

// ── Queue / speaking helpers (pure; feed wires these in) ───────────────────
/** Coach cards jump the queue: stable, all coach ids first (cap keeps it to the first 10). */
export function coachFirst<T>(items: readonly T[], isCoach: (item: T) => boolean, cap = 10): T[] {
  const coach = items.filter(isCoach).slice(0, cap);
  const rest = items.filter((i) => !isCoach(i));
  return [...coach, ...rest];
}

/** Speaking prompts add up to 2 coach words as "Try to use: …". */
export function getTryWords(words: readonly string[], cap = 2): string[] {
  return words.filter((w) => w.trim()).slice(0, cap);
}

/** Mistakes for `watch` in every review_recording call. Max 10. */
export function getWatchList(items: readonly InboxItem[]): WatchEntry[] {
  const out: WatchEntry[] = [];
  for (const item of items) {
    if (item.status === 'discarded') continue;
    if (item.kind !== 'mistake') continue;
    if (!item.subject || !item.fix) continue;
    out.push({ wrong: item.subject, right: item.fix });
    if (out.length >= 10) break;
  }
  return out;
}

/** Coach words for the queue jump + "Try to use". */
export function getCoachWords(items: readonly InboxItem[]): string[] {
  return items
    .filter((i) => i.status !== 'discarded' && i.kind === 'word' && i.subject)
    .map((i) => i.subject as string);
}

// ── One-time notes → inbox migration ───────────────────────────────────────
/** Idempotent: existing `notes` rows become inbox `raw` rows, id `note-<id>`. */
export async function migrateNotesOnce(): Promise<number> {
  const notes = await db.notes.toArray();
  let copied = 0;
  for (const n of notes) {
    const id = `note-${n.id}`;
    const existing = await db.inbox.get(id);
    if (existing) continue;
    const item: InboxItem = {
      id,
      createdAt: n.createdAt,
      text: n.text,
      status: 'raw',
      attempts: 0,
    };
    await db.inbox.put(item);
    await enqueue('inbox', id).catch(() => {});
    copied++;
  }
  return copied;
}

// ── The pipeline ───────────────────────────────────────────────────────────
export interface ProcessOutcome {
  outcome: 'processed' | 'failed' | 'capped';
  added: number;
}

export async function saveCoachRaw(text: string): Promise<InboxItem> {
  const trimmed = text.trim();
  const item: InboxItem = {
    id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    text: trimmed,
    status: 'raw',
    attempts: 0,
  };
  await db.inbox.put(item);
  await enqueue('inbox', item.id).catch(() => {});
  return item;
}

export async function processInboxItem(id: string, fetchFn: FetchFn = fetch): Promise<ProcessOutcome> {
  const item = await db.inbox.get(id);
  if (!item) return { outcome: 'failed', added: 0 };
  if (item.status === 'processed' || item.status === 'discarded') return { outcome: 'processed', added: 0 };
  const attempts = item.attempts ?? 0;
  if (attempts >= COACH_MAX_ATTEMPTS) {
    await db.inbox.put({ ...item, failReason: COACH_CAPPED });
    return { outcome: 'capped', added: 0 };
  }

  try {
    const classified = await aiPost<ClassifyInboxResult>('classify_inbox', { text: item.text }, fetchFn);
    const drafts = classified.cards ?? [];
    const kind: CoachKind = classified.kind ?? 'other';

    // Every draft through verify_batch. Drop failures — unverified ⇒ nothing added.
    let verifiedKeys = new Set<string>();
    if (drafts.length > 0) {
      const verifyItems = drafts.map((card, i) => ({ key: `d${i}`, card }));
      const verified = await aiPost<VerifyBatchResult>('verify_batch', { items: verifyItems }, fetchFn);
      verifiedKeys = new Set(
        (verified.results ?? []).filter((r) => r.ok).map((r) => r.key),
      );
    }
    const verifiedDrafts = drafts.filter((_, i) => verifiedKeys.has(`d${i}`));

    const existing = await db.cards.toArray();
    const fresh = dedupeDrafts(verifiedDrafts, existing);
    const cards = draftsToCards(kind, fresh, item.id);

    await db.transaction('rw', db.cards, db.inbox, db.outbox, async () => {
      for (const c of cards) {
        await db.cards.put(c);
        await enqueue('cards', c.id);
      }
      const done: InboxItem = {
        ...item,
        status: 'processed',
        kind,
        subject: classified.subject,
        ...(classified.fix ? { fix: classified.fix } : {}),
        processedAt: Date.now(),
        generatedCardIds: cards.map((c) => c.id),
        failReason: undefined,
        attempts: attempts + 1,
      };
      await db.inbox.put(done);
      await enqueue('inbox', item.id);
    });
    return { outcome: 'processed', added: cards.length };
  } catch {
    const next: InboxItem = {
      ...item,
      attempts: attempts + 1,
      failReason: attempts + 1 >= COACH_MAX_ATTEMPTS ? COACH_CAPPED : COACH_FAIL_PLAIN,
    };
    await db.inbox.put(next);
    await enqueue('inbox', item.id).catch(() => {});
    return { outcome: attempts + 1 >= COACH_MAX_ATTEMPTS ? 'capped' : 'failed', added: 0 };
  }
}

/** Retry raws on app open. Stops at 3 attempts each. Returns processed count. */
export async function retryRaws(fetchFn: FetchFn = fetch): Promise<number> {
  const raws = await db.inbox.where('status').equals('raw').toArray();
  let done = 0;
  for (const r of raws) {
    if ((r.attempts ?? 0) >= COACH_MAX_ATTEMPTS) continue;
    const out = await processInboxItem(r.id, fetchFn);
    if (out.outcome === 'processed') done++;
  }
  return done;
}

/** Thumbs-down / "Remove these cards": reject the whole batch. */
export async function removeCoachBatch(inboxId: string): Promise<void> {
  const batchId = `coach-${inboxId}`;
  const batch = await db.cards.where('batchId').equals(batchId).toArray();
  await db.transaction('rw', db.cards, db.outbox, async () => {
    for (const c of batch) {
      await db.cards.put({ ...c, status: 'rejected' });
      await enqueue('cards', c.id);
    }
  });
}

/** "Delete note": discard the note, reject its cards (drops it from `watch`). */
export async function deleteCoachNote(inboxId: string): Promise<void> {
  await removeCoachBatch(inboxId);
  const item = await db.inbox.get(inboxId);
  if (item) {
    await db.inbox.put({ ...item, status: 'discarded' });
    await enqueue('inbox', inboxId).catch(() => {});
  }
}
