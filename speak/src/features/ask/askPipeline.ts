import type {
  AnswerAskPayload,
  AnswerAskResult,
  AnyCard,
  AskKind,
  AskPreference,
  AskRecord,
  Card,
  CardKind,
  Track,
  TeachDraft,
  WeakSpot,
} from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { newReview } from '../../srs/scheduler';
import {
  AiCallError,
  CoachNeedsKeyError,
  aiPost,
  checkItems,
  neverReachedModel,
  type CheckItem,
  type FetchFn,
} from '../coach/pipeline';
import { ASK_CALLS_PER_QUESTION, refundAiCalls, tryConsumeAiCalls } from '../auto/budget';
import { applyPreference, learnerContext, noteTopics } from '../learn/profile';
import { searchLibrary, type LibraryHit, type LibraryIndex } from './librarySearch';

/**
 * v5 Ask — the pipeline behind the Ask tab.
 *
 *   library search (always, local)
 *   → budget (2 calls) → answer_ask (with what the app knows about him)
 *   → ONE verify_batch on the OTHER provider: the drafts + the answer itself
 *   → drop failures → dedupe
 *   → the rule line + "from library" + "New · checked" cards.
 *
 * When the answer call fails there is ONE plain line and the library results.
 * When only the check fails the answer stays: zero cards, one plain line and
 * a retry that re-runs just the check (1 call). Nothing here ever throws to
 * the screen.
 *
 * "Add N cards to my feed" (rulebook 8.1) stores the checked cards with
 * `source: 'ai'` and tag `ask`, and plans their return as Use now, Fix a few
 * days later, Try a week later. The queue serves asked cards first until a Try
 * has been answered "Got it" twice (see `srs/queue.ts`).
 */

// ── The one plain line for each way it can fail ────────────────────────────
export type AskFailure = 'offline' | 'no_key' | 'bad_answer' | 'budget' | 'refused';

export const ASK_LINES: Record<AskFailure, string> = {
  offline: "I can't reach the AI right now. Here's what's already in your library.",
  no_key: 'Checking new cards needs a second AI key (a free Groq key — see SETUP). Here is your library.',
  bad_answer: "The AI's answer didn't look right, so I left it out. Here's your library.",
  budget: "You've used today's AI questions. Here's your library. More tomorrow.",
  /** Shown only when the server refused without plain words of its own. */
  refused: "The AI couldn't take that question. Try a shorter one.",
};

/** Lines under a kept answer when its check did not run. */
export const ASK_CHECK_LINES = {
  retryCards: "Cards couldn't be checked right now — tap to try again",
  retryAnswer: "The answer couldn't be checked right now — tap to try again",
  noKey: 'Checking new cards needs a second AI key (a free Groq key — see SETUP).',
  budget: "No AI calls left today — the check can run tomorrow.",
} as const;

/** Under an answer the second check rejected (or did not judge). */
export const ASK_ANSWER_UNSURE = "The second check wasn't sure about this answer — double-check it";

/** Longest question he can send (the server refuses longer ones). */
export const ASK_MAX_CHARS = 1000;

/** Shown instead of sending when the text has no letter at all (emoji only). */
export const ASK_NEED_LETTER = 'Type a word or a question';

/** At least one letter, in any script. */
export function hasLetter(text: string): boolean {
  return /\p{L}/u.test(text);
}

/** Most cards one answer may add (rulebook 4.2: 3 to 8). */
export const ASK_MAX_CARDS = 8;

/** A wish ("more cricket") or an off-topic question carries 0-2 cards. */
export const ASK_MAX_CARDS_LIGHT = 2;

/** Weak-spot text limit (rulebook 4.3). */
export const WEAK_SPOT_MAX_CHARS = 60;

/** Days until each form of an asked item comes back: Use now, Fix, then Try. */
export const ASK_RETURN_DAYS: Record<'use' | 'fix' | 'try', number> = { use: 0, fix: 3, try: 7 };

const TRACKS: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];
const KINDS: readonly CardKind[] = ['learn', 'use', 'fix', 'try', 'ask_them'];
const ASK_KINDS: readonly AskKind[] = [
  'word', 'phrase_idiom', 'mistake', 'fix_sentence', 'topic', 'how_say', 'difference', 'preference', 'other',
];

const TRACK_NAMES: Record<Track, string> = {
  smalltalk: 'Small talk',
  stories: 'Stories',
  clearly: 'Speak clearly',
  words: 'Words',
};

/** How the second check judged the answer itself. */
export type AnswerCheck = 'passed' | 'rejected' | 'unchecked';

/** What the Ask screen shows for one question. */
export interface AskView {
  text: string;
  /** Cards he already has that match. Always filled in when there are any. */
  library: LibraryHit[];
  /** The one plain line shown when the answer failed; null when all is well. */
  line: string | null;
  failure: AskFailure | null;
  /** The short plain answer (the rule line). Null on every failure. */
  answer: string | null;
  askKind: AskKind | null;
  versions?: { crisp: string; confident: string; polite: string };
  chunks?: string[];
  weakSpot?: { wrong: string; right: string };
  /** "New · checked": verified on the other provider, not already on the phone. */
  fresh: TeachDraft[];
  /** Drafts that did not pass the check (or were malformed). */
  droppedCount: number;
  /** The second check's view of the answer. Only `passed` lets a weak spot be saved. */
  answerCheck?: AnswerCheck;
  /** Plain line under the answer when the check did not run. */
  checkLine?: string | null;
  /** The check failed for now: tapping `checkLine` re-runs only the check (1 call). */
  canRetryCheck?: boolean;
  /** What the retry needs: the drafts that are waiting and who wrote them. */
  pending?: { drafts: TeachDraft[]; provider: string };
  /** His wish, when askKind is "preference". */
  preference?: AskPreference;
  /** "What I'll change" for a wish, built from `preference`. */
  changes?: string | null;
  /** Subjects the question was about. */
  topics?: string[];
  /** Set once saved: whether the weak spot went in, or was already there. */
  weakSpotSaved?: 'saved' | 'duplicate';
}

export interface RunAskInput {
  text: string;
  index: LibraryIndex;
  /** Defaults to the browser's fetch. */
  fetchFn?: FetchFn;
  /** Cards already on the phone, to skip duplicates. */
  existing?: readonly AnyCard[];
  levels?: AnswerAskPayload['levels'];
  /** Defaults to `navigator.onLine`. */
  online?: boolean;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** True when an AI draft has every part a teaching card needs. */
export function isUsableDraft(d: unknown): d is TeachDraft {
  if (!d || typeof d !== 'object') return false;
  const c = d as Partial<TeachDraft>;
  return (
    c.type === 'teach' &&
    TRACKS.includes(c.track as Track) &&
    KINDS.includes(c.kind as CardKind) &&
    typeof c.level === 'number' &&
    c.level >= 1 &&
    c.level <= 5 &&
    str(c.title) &&
    str(c.rule) &&
    str(c.analogy) &&
    str(c.tryPrompt) &&
    !!c.examples &&
    str(c.examples.work) &&
    str(c.examples.everyday) &&
    (c.register === 'casual' || c.register === 'office' || c.register === 'both')
  );
}

function failed(text: string, library: LibraryHit[], failure: AskFailure, line?: string): AskView {
  return {
    text,
    library,
    line: line ?? ASK_LINES[failure],
    failure,
    answer: null,
    askKind: null,
    fresh: [],
    droppedCount: 0,
  };
}

function draftKey(d: { track: Track; title: string }): string {
  return `teach‖${d.track}‖${norm(d.title)}`;
}

function isOnline(online?: boolean): boolean {
  if (online !== undefined) return online;
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter(str).map((s) => s.trim()).slice(0, max) : [];
}

function tracks(v: unknown): Track[] {
  return Array.isArray(v) ? v.filter((t): t is Track => TRACKS.includes(t as Track)) : [];
}

/** A wish from the AI, cleaned: unknown tracks and empty strings dropped. Null when there is no wish. */
export function cleanPreference(v: unknown): AskPreference | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const out: AskPreference = { note: typeof p.note === 'string' ? p.note.trim().slice(0, 160) : '' };
  const topics = strings(p.topics, 5);
  const avoid = strings(p.avoid, 10);
  if (topics.length) out.topics = topics;
  if (avoid.length) out.avoid = avoid;
  for (const k of ['moreOf', 'lessOf', 'harder', 'easier'] as const) {
    const t = tracks(p[k]);
    if (t.length) out[k] = t;
  }
  return out;
}

/**
 * "What I'll change", in his words: "More: Small talk · Topics: cricket ·
 * Never show: 'revert back'". Null when the wish names nothing to change.
 */
export function describePreference(pref: AskPreference | null | undefined): string | null {
  if (!pref) return null;
  const names = (t?: Track[]) => (t ?? []).map((x) => TRACK_NAMES[x]).join(', ');
  const parts: string[] = [];
  if (pref.moreOf?.length) parts.push(`More: ${names(pref.moreOf)}`);
  if (pref.lessOf?.length) parts.push(`Less: ${names(pref.lessOf)}`);
  if (pref.harder?.length) parts.push(`Harder: ${names(pref.harder)}`);
  if (pref.easier?.length) parts.push(`Easier: ${names(pref.easier)}`);
  if (pref.topics?.length) parts.push(`Topics: ${pref.topics.join(', ')}`);
  if (pref.avoid?.length) parts.push(`Never show: ${pref.avoid.map((a) => `'${a}'`).join(', ')}`);
  if (parts.length === 0) return pref.note ? `I'll remember: ${pref.note}` : null;
  return parts.join(' · ');
}

/** The answer as one verify_batch item, judged with the cards in the same call. */
function answerItem(view: Pick<AskView, 'text' | 'answer' | 'versions' | 'weakSpot'>): CheckItem {
  return {
    key: 'answer',
    type: 'ask_answer',
    question: view.text,
    answer: view.answer ?? '',
    ...(view.versions ? { versions: view.versions } : {}),
    ...(view.weakSpot ? { weakSpot: view.weakSpot } : {}),
  };
}

interface CheckOutcome {
  fresh: TeachDraft[];
  answerCheck: AnswerCheck;
  checkLine: string | null;
  canRetryCheck: boolean;
  pending?: { drafts: TeachDraft[]; provider: string };
  /** How many drafts the check passed (before dropping ones he already has). */
  passedDrafts: number;
  /** False when no model was used, so the check's slot can be given back. */
  spent: boolean;
}

/**
 * The one check call: every usable draft plus the answer itself. Never throws.
 * A failure keeps nothing as checked; only CoachNeedsKeyError says "needs a
 * second key", every other failure offers a retry.
 */
async function runCheck(
  base: Pick<AskView, 'text' | 'answer' | 'versions' | 'weakSpot'>,
  drafts: readonly TeachDraft[],
  provider: string | undefined,
  fetchFn: FetchFn,
  existing: readonly AnyCard[],
): Promise<CheckOutcome> {
  if (!provider) {
    // Fail closed: no name for the writer means no way to check it elsewhere.
    return { fresh: [], answerCheck: 'unchecked', checkLine: null, canRetryCheck: false, passedDrafts: 0, spent: false };
  }
  const items: CheckItem[] = [...drafts.map((card, i) => ({ key: `d${i}`, card })), answerItem(base)];
  let passed: Set<string>;
  try {
    passed = await checkItems(items, provider, fetchFn);
  } catch (e) {
    if (e instanceof CoachNeedsKeyError) {
      return {
        fresh: [],
        answerCheck: 'unchecked',
        checkLine: ASK_CHECK_LINES.noKey,
        canRetryCheck: false,
        passedDrafts: 0,
        spent: false,
      };
    }
    return {
      fresh: [],
      answerCheck: 'unchecked',
      checkLine: drafts.length > 0 ? ASK_CHECK_LINES.retryCards : ASK_CHECK_LINES.retryAnswer,
      canRetryCheck: true,
      pending: { drafts: [...drafts], provider },
      passedDrafts: 0,
      spent: !neverReachedModel(e),
    };
  }

  const known = new Set<string>();
  for (const c of existing) {
    if (c.type === 'teach') known.add(draftKey(c));
  }
  const fresh: TeachDraft[] = [];
  let passedDrafts = 0;
  drafts.forEach((d, i) => {
    if (!passed.has(`d${i}`)) return;
    passedDrafts++;
    const k = draftKey(d);
    if (known.has(k)) return;
    known.add(k);
    fresh.push(d);
  });
  return {
    fresh,
    // A missing verdict counts as a rejection: the answer was not cleared.
    answerCheck: passed.has('answer') ? 'passed' : 'rejected',
    checkLine: null,
    canRetryCheck: false,
    passedDrafts,
    spent: true,
  };
}

function withCheck(view: AskView, out: CheckOutcome, totalDrafts: number): AskView {
  const next: AskView = {
    ...view,
    fresh: out.fresh,
    // Malformed drafts and ones the check did not pass (not ones he already has).
    droppedCount: out.canRetryCheck ? 0 : Math.max(0, totalDrafts - out.passedDrafts),
    answerCheck: out.answerCheck,
    checkLine: out.checkLine,
    canRetryCheck: out.canRetryCheck,
  };
  if (out.pending) next.pending = out.pending;
  else delete next.pending;
  return next;
}

/**
 * Ask one question. Always resolves; never throws.
 * Order matters: the budget is taken before the call and given back for every
 * call that never reached a model.
 */
export async function runAsk(input: RunAskInput): Promise<AskView> {
  const text = input.text.trim().slice(0, ASK_MAX_CHARS);
  const library = searchLibrary(text, input.index);
  const fetchFn: FetchFn = input.fetchFn ?? ((...a) => fetch(...a));

  if (!isOnline(input.online)) return failed(text, library, 'offline');

  // Slots taken but not yet used by a model; given back on the way out.
  let unspent = 0;
  try {
    if (!(await tryConsumeAiCalls(ASK_CALLS_PER_QUESTION))) {
      return failed(text, library, 'budget');
    }
    unspent = ASK_CALLS_PER_QUESTION;

    const learner = await learnerContext().catch(() => null);
    const avoid = learner?.avoid ?? [];
    const payload: AnswerAskPayload = {
      text,
      ...(avoid.length > 0 ? { avoid } : {}),
      ...(input.levels ? { levels: input.levels } : {}),
      ...(learner
        ? { learner: { topics: learner.topics, notes: learner.notes, watch: learner.watch } }
        : {}),
    };

    let answered;
    try {
      answered = await aiPost<AnswerAskResult>('answer_ask', payload, fetchFn);
      unspent--;
    } catch (e) {
      if (!neverReachedModel(e)) unspent--;
      if (e instanceof AiCallError && (e.reason === 'bad_input' || e.reason === 'rate_limited')) {
        return failed(text, library, 'refused', e.message);
      }
      return failed(text, library, 'offline');
    }

    const data = answered.data;
    if (!data || !str(data.answer) || !ASK_KINDS.includes(data.askKind)) {
      return failed(text, library, 'bad_answer');
    }

    const topics = strings(data.topics, 3);
    await noteTopics(topics, 'ask').catch(() => {});

    const light = data.askKind === 'preference' || data.askKind === 'other';
    const rawDrafts = Array.isArray(data.cards) ? data.cards : [];
    const usable = rawDrafts
      .filter(isUsableDraft)
      .slice(0, light ? ASK_MAX_CARDS_LIGHT : ASK_MAX_CARDS);
    const preference = data.askKind === 'preference' ? cleanPreference(data.preference) : null;

    const view: AskView = {
      text,
      library,
      line: null,
      failure: null,
      answer: data.answer.trim(),
      askKind: data.askKind,
      ...(data.versions ? { versions: data.versions } : {}),
      ...(Array.isArray(data.chunks) ? { chunks: data.chunks.filter(str) } : {}),
      ...(data.weakSpot ? { weakSpot: data.weakSpot } : {}),
      ...(preference ? { preference, changes: describePreference(preference) } : {}),
      ...(topics.length ? { topics } : {}),
      fresh: [],
      droppedCount: 0,
    };

    // The check: a DIFFERENT provider than the one that wrote the answer and
    // the cards, in one call. A failed check keeps the answer.
    const out = await runCheck(view, usable, answered.provider, fetchFn, input.existing ?? []);
    if (out.spent) unspent--;
    return withCheck(view, out, rawDrafts.length);
  } catch {
    return failed(text, library, 'offline');
  } finally {
    if (unspent > 0) await refundAiCalls(unspent).catch(() => {});
  }
}

/**
 * "Cards couldn't be checked — tap to try again": re-run only the check, for
 * 1 call (given back when it never reached a model). Never throws.
 */
export async function retryAskCheck(
  view: AskView,
  opts: { fetchFn?: FetchFn; existing?: readonly AnyCard[] } = {},
): Promise<AskView> {
  if (!view.canRetryCheck || !view.pending || !view.answer) return view;
  const fetchFn: FetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  let unspent = 0;
  try {
    if (!(await tryConsumeAiCalls(1))) {
      return { ...view, checkLine: ASK_CHECK_LINES.budget, canRetryCheck: false };
    }
    unspent = 1;
    const { drafts, provider } = view.pending;
    const out = await runCheck(view, drafts, provider, fetchFn, opts.existing ?? []);
    if (out.spent) unspent = 0;
    return withCheck(view, out, drafts.length);
  } catch {
    return view;
  } finally {
    if (unspent > 0) await refundAiCalls(unspent).catch(() => {});
  }
}

// ── Remembering the question ───────────────────────────────────────────────
function askBatchId(askId: string): string {
  return `ask-${askId}`;
}

export interface SavedAsk {
  id: string | null;
  /** What happened to the weak spot: saved, already on his list, or not saved. */
  weakSpot: 'saved' | 'duplicate' | null;
}

/**
 * Store the question and its answer (phone-only). A wish goes into the
 * learner memory. The weak spot is saved only when the second check passed
 * the answer.
 */
export async function saveAskResult(view: AskView, now: number = Date.now()): Promise<SavedAsk> {
  if (view.failure || !view.answer || !view.askKind) return { id: null, weakSpot: null };
  const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
  const record: AskRecord = {
    id,
    createdAt: now,
    text: view.text,
    askKind: view.askKind,
    answer: view.answer,
    cardIds: [],
    addedToFeed: false,
  };
  await db.asks.put(record);
  if (view.askKind === 'preference' && view.preference) {
    await applyPreference(view.preference, view.text, now).catch(() => {});
  }
  let weakSpot: SavedAsk['weakSpot'] = null;
  if (view.weakSpot && view.answerCheck === 'passed') {
    const status = await saveWeakSpotStatus(view.weakSpot, id, now);
    weakSpot = status === 'invalid' ? null : status;
  }
  return { id, weakSpot };
}

/** Store the question and its answer. Returns the ask id (see `saveAskResult`). */
export async function saveAsk(view: AskView, now: number = Date.now()): Promise<string | null> {
  return (await saveAskResult(view, now)).id;
}

/**
 * Rulebook 4.3: his exact wrong phrase and the global form, each 60
 * characters or fewer. A phrase already on his list is not added twice.
 */
export function isSavableWeakSpot(spot: { wrong?: string; right?: string } | undefined): boolean {
  const wrong = (spot?.wrong ?? '').trim();
  const right = (spot?.right ?? '').trim();
  return (
    wrong.length > 0 &&
    right.length > 0 &&
    norm(wrong) !== norm(right) &&
    wrong.length <= WEAK_SPOT_MAX_CHARS &&
    right.length <= WEAK_SPOT_MAX_CHARS
  );
}

/** Save a weak spot and say what happened: saved, already open on his list, or not savable. */
export async function saveWeakSpotStatus(
  spot: { wrong: string; right: string },
  askId: string,
  now: number = Date.now(),
): Promise<'saved' | 'duplicate' | 'invalid'> {
  if (!isSavableWeakSpot(spot)) return 'invalid';
  const wrong = spot.wrong.trim();
  const right = spot.right.trim();
  const open = await db.weakSpots.toArray();
  if (open.some((w) => w.fixedAt === undefined && norm(w.wrong) === norm(wrong))) return 'duplicate';
  const row: WeakSpot = { id: `ws-${askId}`, wrong, right, source: 'ask', createdAt: now };
  await db.weakSpots.put(row);
  return 'saved';
}

export async function saveWeakSpot(
  spot: { wrong: string; right: string },
  askId: string,
  now: number = Date.now(),
): Promise<WeakSpot | null> {
  const status = await saveWeakSpotStatus(spot, askId, now);
  if (status !== 'saved') return null;
  return (await db.weakSpots.get(`ws-${askId}`)) ?? null;
}

// ── "Add N cards to my feed" ───────────────────────────────────────────────
/** When each form of an asked item returns: Use now, Fix soon, Try about a week on. */
export function returnOffsetDays(kind: CardKind): number {
  if (kind === 'fix') return ASK_RETURN_DAYS.fix;
  if (kind === 'try') return ASK_RETURN_DAYS.try;
  return ASK_RETURN_DAYS.use;
}

const PLAN_ORDER: Record<CardKind, number> = { learn: 0, use: 1, ask_them: 2, fix: 3, try: 4 };

/**
 * Store the checked cards and plan their return. Cards that return later get a
 * review row already scheduled for their day (state `learning`), so the feed
 * serves them then and not before. Safe to call twice: the second call adds 0.
 */
export async function addAskCardsToFeed(
  askId: string,
  fresh: readonly TeachDraft[],
  now: number = Date.now(),
): Promise<number> {
  const record = await db.asks.get(askId);
  if (!record || record.addedToFeed || fresh.length === 0) return 0;

  const batchId = askBatchId(askId);
  const today = todayKey(new Date(now));
  const ordered = [...fresh].sort((a, b) => PLAN_ORDER[a.kind] - PLAN_ORDER[b.kind]);
  const cards: Card[] = ordered.map(
    (d, i) =>
      ({
        ...d,
        id: `${batchId}-${i}`,
        lang: 'en',
        tags: ['ask'],
        source: 'ai',
        status: 'active',
        createdAt: now,
        batchId,
        seedId: askId,
      }) as unknown as Card,
  );

  await db.transaction('rw', db.cards, db.reviews, db.asks, db.outbox, async () => {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      await db.cards.put(card);
      await enqueue('cards', card.id);
      const offset = returnOffsetDays(ordered[i]!.kind);
      if (offset > 0) {
        const due = addDays(today, offset);
        await db.reviews.put({ ...newReview(card.id, due), state: 'learning' });
        await enqueue('reviews', card.id);
      }
    }
    await db.asks.put({ ...record, cardIds: cards.map((c) => c.id), addedToFeed: true });
  });
  return cards.length;
}
