import type {
  AiFailReason,
  AiResponse,
  Card,
  ClassifyInboxResult,
  DraftCardType,
  InboxItem,
  VerifyBatchResult,
} from '../../types/contract';
import { db, setMeta } from '../../db/db';

/**
 * The client side of every AI call: `aiPost` (the one path to the function)
 * and `verifyDrafts` / `checkItems` (the check on a DIFFERENT provider).
 *
 * AG-008 §0.2 — the verifier must run on a DIFFERENT provider than the
 * draft generator. One key only ⇒ nothing passes, and the local notice
 * flag is set. No same-provider fallback ever.
 *
 * v5 fixes: the check sends the generator as `exclude`; only the server's
 * reason `no_key` means "needs a second key" (a busy checker is a temporary
 * failure). The notice expires after 24 h (`needsSecondKey()`).
 *
 * 2026-11-10 (v7 trim): the "Tell the coach" note pipeline (`processInboxItem`
 * over `classify_inbox`, and `retryRaws`) left with the coach box.
 */

/** Plain sentences only — never a raw provider error. */
export const COACH_FAIL_PLAIN =
  "AI is unavailable right now. Saved — I'll try again when you're online.";

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

// ── Watch entries (his known mistakes) ─────────────────────────────────────
export interface WatchEntry {
  wrong: string;
  right: string;
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

// ── Watch list (learner memory; read by features/learn/profile.ts) ──────────
/** His known mistakes for a `watch` list (learner memory). Max 10. */
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
