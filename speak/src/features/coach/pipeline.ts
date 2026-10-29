import type {
  AiFailReason,
  AiResponse,
  Card,
  ClassifyInboxResult,
  CoachKind,
  DraftCardType,
  InboxItem,
  VerifyBatchResult,
} from '../../types/contract';
import { db, enqueue, setMeta } from '../../db/db';
import { refundAiCalls, tryConsumeBackgroundAiCalls } from '../auto/budget';
import { rejectedTerms } from '../auto/reject';

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
 *
 * v5 fixes: the check sends the generator as `exclude`; only the server's
 * reason `no_key` means "needs a second key" (a busy checker is a temporary
 * failure). The notice expires after 24 h (`needsSecondKey()`), and retries
 * skip while it is on. One note = generate + check = 2 background calls,
 * given back when they never reached a model.
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

/** The "needs a second key" notice is trusted for this long, then checked again. */
export const NEEDS_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** The checker said there is no second provider with a key (server reason `no_key`). */
export class CoachNeedsKeyError extends Error {
  constructor() {
    super(COACH_NEEDS_KEY_PLAIN);
    this.name = 'CoachNeedsKeyError';
  }
}

/** Every way an AI call can fail on the phone: the server's reasons plus "no network". */
export type AiCallReason = AiFailReason | 'offline';

/**
 * The check could not run this time (busy, a bad reply, offline, or a reply
 * that did not come from a different provider). Temporary: never the
 * needs-a-second-key state. `reachedModel` false means no model was used, so
 * the call can be given back to the budget.
 */
export class CoachCheckFailedError extends Error {
  readonly reason: AiCallReason;
  readonly reachedModel: boolean;
  constructor(reason: AiCallReason, reachedModel: boolean) {
    super(COACH_FAIL_PLAIN);
    this.name = 'CoachCheckFailedError';
    this.reason = reason;
    this.reachedModel = reachedModel;
  }
}

const SERVER_REASONS: readonly AiFailReason[] = ['no_key', 'bad_reply', 'busy', 'bad_input', 'rate_limited'];

/**
 * One AI call failed. `reason` says why (from the server when it said so);
 * `message` is always a plain sentence safe to show; `serverError` is the
 * server's own plain words, when it sent any.
 */
export class AiCallError extends Error {
  readonly reason: AiCallReason;
  readonly serverError?: string;
  constructor(reason: AiCallReason, message: string, serverError?: string) {
    super(message);
    this.name = 'AiCallError';
    this.reason = reason;
    if (serverError) this.serverError = serverError;
  }
}

/** Plain line when the server refused the request but sent no words of its own. */
export const AI_BAD_INPUT_PLAIN = "The AI couldn't take that request. Try a shorter one.";
export const AI_RATE_LIMITED_PLAIN = 'Too many AI calls this minute. Wait a moment and try again.';

/**
 * True when the failed call never used a model (no network, no key, refused
 * before it ran), so its budget slot can be given back.
 */
export function neverReachedModel(e: unknown): boolean {
  if (e instanceof CoachNeedsKeyError) return true;
  if (e instanceof CoachCheckFailedError) return !e.reachedModel;
  if (e instanceof AiCallError) {
    return e.reason === 'offline' || e.reason === 'no_key' || e.reason === 'bad_input' || e.reason === 'rate_limited';
  }
  return false;
}

// ── The "needs a second key" notice ────────────────────────────────────────
/** Set the notice (the checker said no second provider has a key). */
export async function markNeedsSecondKey(): Promise<void> {
  await setMeta(AI_NEEDS_KEY_META, true);
}

/** Clear the notice: any check that ran on a different provider proves the key is there. */
export async function clearNeedsSecondKey(): Promise<void> {
  await setMeta(AI_NEEDS_KEY_META, false);
}

/**
 * Is the "needs a second key" notice on? It expires 24 hours after it was set,
 * so a key added later is found again without a manual reset. Never throws.
 * Background work (coach retries, top-ups, misses) skips its AI calls while true.
 */
export async function needsSecondKey(now: number = Date.now()): Promise<boolean> {
  try {
    const row = await db.meta.get(AI_NEEDS_KEY_META);
    if (!row || row.value !== true) return false;
    return now - (row.updatedAt ?? 0) < NEEDS_KEY_TTL_MS;
  } catch {
    return false;
  }
}

type Provider = 'gemini' | 'groq' | 'anthropic';

function otherProvider(p?: string): Provider | undefined {
  if (p === 'gemini') return 'groq';
  if (p === 'groq') return 'gemini';
  if (p === 'anthropic') return 'gemini';
  return undefined;
}

function asProvider(p?: string): Provider | undefined {
  return p === 'gemini' || p === 'groq' || p === 'anthropic' ? p : undefined;
}

export type FetchFn = typeof fetch;

export interface AiPostResult<T> {
  data: T;
  provider?: Provider;
}

export interface AiPostOptions {
  /** Providers that must NOT serve this call (verify_batch: the generator). */
  exclude?: Provider[];
}

/**
 * Longest the phone waits for one AI request. The function gives up on its own
 * after 24 s (TOTAL_FUNCTION_DEADLINE_MS in `netlify/functions/ai.ts`), so this
 * only fires when the network itself hangs.
 */
export const AI_CLIENT_TIMEOUT_MS = 30_000;

/**
 * Run a request with a time limit. On time-out the request is aborted (when
 * the fetch supports it) and the promise rejects, so no screen waits forever.
 */
export async function withTimeout<T>(
  run: (signal: AbortSignal | undefined) => Promise<T>,
  ms: number = AI_CLIENT_TIMEOUT_MS,
): Promise<T> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new Error('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([run(ctrl?.signal), late]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function plainServerError(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : undefined;
}

/**
 * Every client AI call. Throws AiCallError on any failure:
 * - no network / time-out → reason `offline`, the plain "unavailable" line;
 * - a reply that is not JSON (an HTML 502 page) → `busy`;
 * - a JSON failure → the server's `reason`; for `bad_input` / `rate_limited`
 *   the message is the server's own plain words ("Keep the question under
 *   1000 characters"), otherwise the plain "unavailable" line.
 */
export async function aiPost<T>(
  task: string,
  payload: unknown,
  fetchFn: FetchFn,
  prefer?: Provider,
  opts: AiPostOptions = {},
): Promise<AiPostResult<T>> {
  const body: Record<string, unknown> = { task, payload };
  if (prefer) body.prefer = prefer;
  if (opts.exclude && opts.exclude.length > 0) body.exclude = opts.exclude;

  let res: Response;
  let parsed: { json: unknown } | null;
  try {
    // One time limit over the request and reading its answer.
    [res, parsed] = await withTimeout(async (signal) => {
      const r = await fetchFn('/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      let json: { json: unknown } | null;
      try {
        json = { json: await r.json() };
      } catch {
        json = null; // not JSON: an HTML error page from the host
      }
      return [r, json] as const;
    });
  } catch {
    throw new AiCallError('offline', COACH_FAIL_PLAIN);
  }

  const data =
    parsed && parsed.json && typeof parsed.json === 'object' ? (parsed.json as AiResponse<T>) : undefined;
  if (res.ok && data && data.ok && data.data !== undefined) {
    return { data: data.data, provider: asProvider(data.provider) };
  }

  if (!data) throw new AiCallError('busy', COACH_FAIL_PLAIN);
  const serverError = plainServerError(data.error);
  let reason: AiFailReason;
  if (data.reason && SERVER_REASONS.includes(data.reason)) reason = data.reason;
  else if (res.status === 400) reason = 'bad_input';
  else if (res.status === 429) reason = 'rate_limited';
  else if (res.ok) reason = 'bad_reply';
  else reason = 'busy';

  const message =
    reason === 'bad_input'
      ? (serverError ?? AI_BAD_INPUT_PLAIN)
      : reason === 'rate_limited'
        ? (serverError ?? AI_RATE_LIMITED_PLAIN)
        : COACH_FAIL_PLAIN;
  throw new AiCallError(reason, message, serverError);
}

// ── The check on a different provider ──────────────────────────────────────
/** One thing for verify_batch to judge: a drafted card, or (Ask) the answer itself. */
export type CheckItem =
  | { key: string; card: unknown }
  | {
      key: string;
      type: 'ask_answer';
      question: string;
      answer: string;
      versions?: { crisp: string; confident: string; polite: string };
      weakSpot?: { wrong: string; right: string };
    };

/**
 * AG-008 §0.2 — run `verify_batch` on a DIFFERENT provider than the generator
 * and return the keys that passed. One call for every item.
 *
 * - The generator is sent as `exclude` (and the other provider as `prefer`), so
 *   a busy checker can never fall back to the model checking itself.
 * - No generator name ⇒ fail closed: nothing passes, no call is made.
 * - Server reason `no_key` ⇒ CoachNeedsKeyError (and the notice is set).
 * - Any other failure, or a reply from the generator itself ⇒
 *   CoachCheckFailedError: a temporary failure, never the needs-key state.
 * - A check that ran on another provider clears the needs-key notice.
 */
export async function checkItems(
  items: readonly CheckItem[],
  generatorProvider: string | undefined,
  fetchFn: FetchFn,
): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const gen = asProvider(generatorProvider);
  if (!gen) return new Set();

  let verified: AiPostResult<VerifyBatchResult>;
  try {
    verified = await aiPost<VerifyBatchResult>('verify_batch', { items }, fetchFn, otherProvider(gen), {
      exclude: [gen],
    });
  } catch (e) {
    if (e instanceof AiCallError && e.reason === 'no_key') {
      await markNeedsSecondKey().catch(() => {});
      throw new CoachNeedsKeyError();
    }
    const reason: AiCallReason = e instanceof AiCallError ? e.reason : 'busy';
    throw new CoachCheckFailedError(reason, !neverReachedModel(e));
  }
  if (!verified.provider || verified.provider === gen) {
    // The server should never let the generator check itself; if it did, or
    // did not say who checked, nothing counts as checked.
    throw new CoachCheckFailedError('bad_reply', true);
  }
  await clearNeedsSecondKey().catch(() => {});
  const results = Array.isArray(verified.data?.results) ? verified.data.results : [];
  return new Set(
    results
      .filter((r) => !!r && r.ok === true && typeof r.key === 'string')
      .map((r) => r.key),
  );
}

/**
 * Every draft through `verify_batch` on a DIFFERENT provider than its
 * generator (see `checkItems`). Returns the drafts that passed. Throws
 * CoachNeedsKeyError only on the server's `no_key`; CoachCheckFailedError on
 * a temporary failure. No generator name ⇒ none pass.
 */
export async function verifyDrafts(
  drafts: readonly Draft[],
  generatorProvider: string | undefined,
  fetchFn: FetchFn,
): Promise<Draft[]> {
  if (drafts.length === 0) return [];
  const passed = await checkItems(
    drafts.map((card, i) => ({ key: `d${i}`, card })),
    generatorProvider,
    fetchFn,
  );
  return drafts.filter((_, i) => passed.has(`d${i}`));
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

/** What one coach note spends: classify_inbox + its check on the other provider. */
export const COACH_CALLS_PER_NOTE = 2;

export async function processInboxItem(id: string, fetchFn: FetchFn = fetch): Promise<ProcessOutcome> {
  const item = await db.inbox.get(id);
  if (!item) return { outcome: 'failed', added: 0 };
  if (item.status === 'processed' || item.status === 'discarded') return { outcome: 'processed', added: 0 };
  const attempts = item.attempts ?? 0;
  if (attempts >= COACH_MAX_ATTEMPTS) {
    await db.inbox.put({ ...item, failReason: COACH_CAPPED });
    return { outcome: 'capped', added: 0 };
  }

  // One shared daily budget: generate + check = 2 background calls, all or
  // nothing, and never into the reserve Ask keeps. Over budget the note
  // simply waits: no attempt burned, no request made.
  if (!(await tryConsumeBackgroundAiCalls(COACH_CALLS_PER_NOTE))) {
    return { outcome: 'failed', added: 0 };
  }
  // Slots not yet used by a model; whatever is left at the end is given back.
  let unspent = COACH_CALLS_PER_NOTE;
  const giveBack = async () => {
    if (unspent > 0) await refundAiCalls(unspent).catch(() => {});
    unspent = 0;
  };

  try {
    const avoid = await rejectedTerms();
    let classified: AiPostResult<ClassifyInboxResult>;
    try {
      classified = await aiPost<ClassifyInboxResult>(
        'classify_inbox',
        { text: item.text, ...(avoid.length > 0 ? { avoid } : {}) },
        fetchFn,
      );
      unspent--;
    } catch (e) {
      if (!neverReachedModel(e)) unspent--;
      throw e;
    }
    const drafts = classified.data.cards ?? [];
    const kind: CoachKind = classified.data.kind ?? 'other';

    // Every draft through verify_batch on a DIFFERENT provider. Drop failures —
    // unverified ⇒ nothing added. No generator name ⇒ nothing passes (§0.2).
    let verifiedDrafts: Draft[];
    try {
      verifiedDrafts = await verifyDrafts(drafts, classified.provider, fetchFn);
      if (drafts.length > 0 && classified.provider) unspent--;
    } catch (e) {
      if (!neverReachedModel(e)) unspent--;
      throw e;
    }
    await giveBack();

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
    await giveBack();
    if (e instanceof CoachNeedsKeyError) {
      // Missing second key is not a failure of this note — don't burn
      // attempts on it. Flag the notice, keep the note raw for later.
      await markNeedsSecondKey().catch(() => {});
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

/**
 * Retry raws on app open. Stops at 3 attempts each. Returns processed count.
 * While the "needs a second key" notice is on (24 h at most), nothing is
 * retried: every retry would spend a generate call only to be refused again.
 */
export async function retryRaws(fetchFn: FetchFn = fetch): Promise<number> {
  if (await needsSecondKey()) return 0;
  const raws = await db.inbox.where('status').equals('raw').toArray();
  let done = 0;
  for (const r of raws) {
    if ((r.attempts ?? 0) >= COACH_MAX_ATTEMPTS) continue;
    const out = await processInboxItem(r.id, fetchFn);
    if (out.outcome === 'processed') done++;
    // The key went missing mid-run: stop spending on the rest.
    else if (await needsSecondKey()) break;
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
