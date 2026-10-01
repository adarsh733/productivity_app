import type {
  AiResponse,
  Card,
  ClassifyInboxResult,
  CoachKind,
  DraftCardType,
  InboxItem,
  VerifyBatchResult,
} from '../../types/contract';
import { db, enqueue, setMeta } from '../../db/db';
import { tryConsumeAiCall } from '../auto/budget';

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
 *
 * AG-008 §0.2 — the verifier must run on a DIFFERENT provider than the
 * draft generator. One key only ⇒ generate nothing, set the local notice
 * flag, keep the note raw. No same-provider fallback ever.
 */

export const COACH_MAX_ATTEMPTS = 3;

/** Plain sentences only — never a raw provider error. */
export const COACH_FAIL_PLAIN =
  "AI is unavailable right now. Saved — I'll try again when you're online.";

export const COACH_CAPPED =
  "Couldn't add cards — tap to try again.";

/** AG-008 §0.2 — verifier ≠ generator, so auto-cards need two providers. */
export const COACH_NEEDS_KEY_PLAIN =
  'Auto-cards need a second AI key (free Groq key — see SETUP).';

/** Local-only flag (db.meta). Never synced to Supabase. */
export const AI_NEEDS_KEY_META = 'ai.needsSecondKey';

export class CoachNeedsKeyError extends Error {}

function otherProvider(p?: string): 'gemini' | 'groq' | 'anthropic' | undefined {
  if (p === 'gemini') return 'groq';
  if (p === 'groq') return 'gemini';
  if (p === 'anthropic') return 'gemini';
  return undefined;
}

export type FetchFn = typeof fetch;

export interface AiPostResult<T> {
  data: T;
  provider?: 'gemini' | 'groq' | 'anthropic';
}

export async function aiPost<T>(
  task: string,
  payload: unknown,
  fetchFn: FetchFn,
  prefer?: 'gemini' | 'groq' | 'anthropic',
): Promise<AiPostResult<T>> {
  let res: Response;
  try {
    res = await fetchFn('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prefer ? { task, payload, prefer } : { task, payload }),
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
  return { data: data.data, provider: data.provider };
}

/**
 * AG-008 §0.2 — every draft goes through `verify_batch` on a DIFFERENT
 * provider than its generator. Same provider ⇒ throw CoachNeedsKeyError:
 * one key only means generate nothing, no same-provider fallback ever.
 * Cross-provider success clears the needs-key notice.
 */
export async function verifyDrafts(
  drafts: readonly Draft[],
  generatorProvider: string | undefined,
  fetchFn: FetchFn,
): Promise<Draft[]> {
  if (drafts.length === 0) return [];
  const verifyItems = drafts.map((card, i) => ({ key: `d${i}`, card }));
  const verified = await aiPost<VerifyBatchResult>(
    'verify_batch',
    { items: verifyItems },
    fetchFn,
    otherProvider(generatorProvider),
  );
  if (generatorProvider && verified.provider && generatorProvider === verified.provider) {
    throw new CoachNeedsKeyError();
  }
  if (generatorProvider && verified.provider) {
    await setMeta(AI_NEEDS_KEY_META, false);
  }
  const verifiedKeys = new Set(
    (verified.data.results ?? []).filter((r) => r.ok).map((r) => r.key),
  );
  return drafts.filter((_, i) => verifiedKeys.has(`d${i}`));
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

/** Every card type the AI may ever draft (AG-008 §0.3) — mirrors `DraftCardType`. */
export const AI_DRAFT_TYPES: readonly DraftCardType[] = [
  'word',
  'swap',
  'idiom',
  'phrase',
  'feeling',
  'story_move',
  'describe',
  'explain',
  'teach_back',
  'situation',
];

/**
 * One identity key per card type, prefix-namespaced so a word "close" never
 * collides with a phrase "close". null = type the pipeline never creates.
 */
function dedupeKey(c: Draft | Card): string | null {
  switch (c.type) {
    case 'word':
      return `word‖${norm(c.term)}`;
    case 'swap':
      return `swap‖${norm(c.weak)}`;
    case 'idiom':
      return `idiom‖${norm(c.phrase)}`;
    case 'phrase':
      return `phrase‖${norm(c.weak)}`;
    case 'feeling':
      return `feeling‖${norm(c.term)}`;
    case 'story_move':
      return `story_move‖${norm(c.move)}`;
    case 'describe':
      return `describe‖${norm(c.title ?? c.alt)}`;
    case 'explain':
      return `explain‖${norm(c.topic)}‖${norm(c.angle)}`;
    case 'teach_back':
      return `teach_back‖${norm(c.prompt)}`;
    case 'situation':
      return `situation‖${norm(c.title)}`;
    default:
      return null;
  }
}

/** Drop drafts that already exist as cards (one identity key per type). */
export function dedupeDrafts(drafts: readonly Draft[], existing: readonly Card[]): Draft[] {
  const known = new Set<string>();
  for (const c of existing) {
    const k = dedupeKey(c);
    if (k) known.add(k);
  }
  return drafts.filter((d) => {
    const k = dedupeKey(d);
    return k === null || !known.has(k);
  });
}

// ── Drafts → cards ─────────────────────────────────────────────────────────
export interface BatchShape {
  batchId: string;
  source: 'ai' | 'inbox';
  /** The inbox item or seed card this batch grew from; top-up batches have none. */
  seedId?: string;
  tags: string[];
}

/** Verified, deduped drafts → storable cards. Same base for coach and AI batches. */
export function draftsToBatchCards(
  drafts: readonly Draft[],
  shape: BatchShape,
  now: number = Date.now(),
): Card[] {
  return drafts.map((d, i) => {
    const base = {
      id: `${shape.batchId}-${i}`,
      lang: (d.type === 'word' && d.lang === 'hi' ? 'hi' : 'en') as 'en' | 'hi',
      tags: [...shape.tags],
      source: shape.source,
      status: 'active' as const,
      createdAt: now,
      batchId: shape.batchId,
      ...(shape.seedId ? { seedId: shape.seedId } : {}),
    };
    return { ...base, ...d } as Card;
  });
}

export function draftsToCards(kind: CoachKind, drafts: readonly Draft[], inboxId: string, now: number = Date.now()): Card[] {
  return draftsToBatchCards(
    drafts,
    { batchId: `coach-${inboxId}`, source: 'inbox', seedId: inboxId, tags: ['coach', kind] },
    now,
  );
}

// ── Recording mistakes (AG-008 stage 2) ────────────────────────────────────
/**
 * The AI found a clear mistake in a recording → one inbox note on the watch
 * list. Idempotent per recording (`rec-<id>`), and skipped when the same
 * `wrong` is already watched. Never an AI call, never a card.
 */
export async function saveRecordingMistake(
  recordingId: string,
  mistake: { wrong: string; right: string },
): Promise<InboxItem | null> {
  const wrong = mistake.wrong.trim();
  const right = mistake.right.trim();
  if (!wrong || !right || norm(wrong) === norm(right)) return null;

  const id = `rec-${recordingId}`;
  const existing = await db.inbox.toArray();
  if (existing.some((i) => i.id === id)) return null;
  if (
    existing.some(
      (i) =>
        i.status !== 'discarded' &&
        i.kind === 'mistake' &&
        i.subject &&
        norm(i.subject) === norm(wrong),
    )
  ) {
    return null;
  }

  const now = Date.now();
  const item: InboxItem = {
    id,
    createdAt: now,
    text: `Recording mistake: "${wrong}" — say "${right}".`,
    status: 'processed',
    processedAt: now,
    kind: 'mistake',
    subject: wrong,
    fix: right,
    origin: 'recording',
  };
  await db.inbox.put(item);
  await enqueue('inbox', id).catch(() => {});
  return item;
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

  // AG-008 stage 3 — one shared daily budget for every generation path. Over
  // budget the note simply waits: no attempt burned, no request made.
  if (!(await tryConsumeAiCall())) {
    return { outcome: 'failed', added: 0 };
  }

  try {
    const classified = await aiPost<ClassifyInboxResult>('classify_inbox', { text: item.text }, fetchFn);
    const drafts = classified.data.cards ?? [];
    const kind: CoachKind = classified.data.kind ?? 'other';

    // Every draft through verify_batch on a DIFFERENT provider. Drop failures —
    // unverified ⇒ nothing added. Same provider ⇒ discard everything (§0.2).
    const verifiedDrafts = await verifyDrafts(drafts, classified.provider, fetchFn);

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
        subject: classified.data.subject,
        ...(classified.data.fix ? { fix: classified.data.fix } : {}),
        processedAt: Date.now(),
        generatedCardIds: cards.map((c) => c.id),
        failReason: undefined,
        attempts: attempts + 1,
      };
      await db.inbox.put(done);
      await enqueue('inbox', item.id);
    });
    return { outcome: 'processed', added: cards.length };
  } catch (e) {
    if (e instanceof CoachNeedsKeyError) {
      // Missing second key is not a failure of this note — don't burn
      // attempts on it. Flag the notice, keep the note raw for later.
      await setMeta(AI_NEEDS_KEY_META, true);
      await db.inbox.put({ ...item, failReason: COACH_NEEDS_KEY_PLAIN });
      await enqueue('inbox', item.id).catch(() => {});
      return { outcome: 'failed', added: 0 };
    }
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
