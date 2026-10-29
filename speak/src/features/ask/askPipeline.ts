import type {
  AnswerAskPayload,
  AnswerAskResult,
  AnyCard,
  AskKind,
  AskRecord,
  Card,
  CardKind,
  Track,
  TeachDraft,
  WeakSpot,
} from '../../types/contract';
import { db, enqueue, setMeta } from '../../db/db';
import { addDays, todayKey } from '../../lib/date';
import { newReview } from '../../srs/scheduler';
import {
  AI_NEEDS_KEY_META,
  CoachNeedsKeyError,
  aiPost,
  verifyDrafts,
  type FetchFn,
} from '../coach/pipeline';
import { ASK_CALLS_PER_QUESTION, refundAiCalls, tryConsumeAiCalls } from '../auto/budget';
import { rejectedTerms } from '../auto/reject';
import { searchLibrary, type LibraryHit, type LibraryIndex } from './librarySearch';

/**
 * v5 Ask — the pipeline behind the Ask tab.
 *
 *   library search (always, local)
 *   → budget (2 calls) → answer_ask → drafts that look right
 *   → verifyDrafts on the OTHER provider → drop failures → dedupe
 *   → the rule line + "from library" + "New · checked" cards.
 *
 * Every way it can go wrong ends the same way: ONE plain line and the library
 * results. Nothing here ever throws to the screen.
 *
 * "Add N cards to my feed" (rulebook 8.1) stores the checked cards with
 * `source: 'ai'` and tag `ask`, and plans their return as Use now, Fix a few
 * days later, Try a week later. The queue serves asked cards first until a Try
 * has been answered "Got it" twice (see `srs/queue.ts`).
 */

// ── The one plain line for each way it can fail ────────────────────────────
export type AskFailure = 'offline' | 'no_key' | 'bad_answer' | 'budget';

export const ASK_LINES: Record<AskFailure, string> = {
  offline: "I can't reach the AI right now. Here's what's already in your library.",
  no_key: 'Checking new cards needs a second AI key (a free Groq key — see SETUP). Here is your library.',
  bad_answer: "The AI's answer didn't look right, so I left it out. Here's your library.",
  budget: "You've used today's AI questions. Here's your library. More tomorrow.",
};

/** Most cards one answer may add (rulebook 4.2: 3 to 8). */
export const ASK_MAX_CARDS = 8;

/** Weak-spot text limit (rulebook 4.3). */
export const WEAK_SPOT_MAX_CHARS = 60;

/** Days until each form of an asked item comes back: Use now, Fix, then Try. */
export const ASK_RETURN_DAYS: Record<'use' | 'fix' | 'try', number> = { use: 0, fix: 3, try: 7 };

const TRACKS: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];
const KINDS: readonly CardKind[] = ['learn', 'use', 'fix', 'try', 'ask_them'];
const ASK_KINDS: readonly AskKind[] = [
  'word', 'phrase_idiom', 'mistake', 'fix_sentence', 'topic', 'how_say', 'difference', 'other',
];

/** What the Ask screen shows for one question. */
export interface AskView {
  text: string;
  /** Cards he already has that match. Always filled in when there are any. */
  library: LibraryHit[];
  /** The one plain line shown when something went wrong; null when all is well. */
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

function failed(text: string, library: LibraryHit[], failure: AskFailure): AskView {
  return {
    text,
    library,
    line: ASK_LINES[failure],
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

/**
 * Ask one question. Always resolves; never throws.
 * Order matters: the budget is taken before the call and given back if the
 * call never reached a model.
 */
export async function runAsk(input: RunAskInput): Promise<AskView> {
  const text = input.text.trim();
  const library = searchLibrary(text, input.index);
  const fetchFn: FetchFn = input.fetchFn ?? ((...a) => fetch(...a));

  if (!isOnline(input.online)) return failed(text, library, 'offline');

  let taken = false;
  try {
    if (!(await tryConsumeAiCalls(ASK_CALLS_PER_QUESTION))) {
      return failed(text, library, 'budget');
    }
    taken = true;

    const avoid = await rejectedTerms().catch(() => [] as string[]);
    const payload: AnswerAskPayload = {
      text,
      ...(avoid.length > 0 ? { avoid } : {}),
      ...(input.levels ? { levels: input.levels } : {}),
    };

    let answered;
    try {
      answered = await aiPost<AnswerAskResult>('answer_ask', payload, fetchFn);
    } catch {
      // The call never produced an answer: give the budget back.
      await refundAiCalls(ASK_CALLS_PER_QUESTION).catch(() => {});
      taken = false;
      return failed(text, library, 'offline');
    }

    const data = answered.data;
    if (!data || !str(data.answer) || !ASK_KINDS.includes(data.askKind)) {
      return failed(text, library, 'bad_answer');
    }

    const rawDrafts = Array.isArray(data.cards) ? data.cards : [];
    const usable = rawDrafts.filter(isUsableDraft).slice(0, ASK_MAX_CARDS);

    // The check: a DIFFERENT provider than the one that wrote the cards.
    let checked: TeachDraft[];
    try {
      checked = (await verifyDrafts(
        usable as unknown as Parameters<typeof verifyDrafts>[0],
        answered.provider,
        fetchFn,
      )) as unknown as TeachDraft[];
    } catch (e) {
      if (e instanceof CoachNeedsKeyError) {
        await setMeta(AI_NEEDS_KEY_META, true).catch(() => {});
        return failed(text, library, 'no_key');
      }
      return failed(text, library, 'offline');
    }

    const known = new Set<string>();
    for (const c of input.existing ?? []) {
      if (c.type === 'teach') known.add(draftKey(c));
    }
    const fresh: TeachDraft[] = [];
    for (const d of checked) {
      const k = draftKey(d);
      if (known.has(k)) continue;
      known.add(k);
      fresh.push(d);
    }

    return {
      text,
      library,
      line: null,
      failure: null,
      answer: data.answer.trim(),
      askKind: data.askKind,
      ...(data.versions ? { versions: data.versions } : {}),
      ...(Array.isArray(data.chunks) ? { chunks: data.chunks.filter(str) } : {}),
      ...(data.weakSpot ? { weakSpot: data.weakSpot } : {}),
      fresh,
      droppedCount: rawDrafts.length - checked.length,
    };
  } catch {
    if (taken) await refundAiCalls(ASK_CALLS_PER_QUESTION).catch(() => {});
    return failed(text, library, 'offline');
  }
}

// ── Remembering the question ───────────────────────────────────────────────
function askBatchId(askId: string): string {
  return `ask-${askId}`;
}

/** Store the question and its answer (phone-only), and any weak spot it found. Returns the ask id. */
export async function saveAsk(view: AskView, now: number = Date.now()): Promise<string | null> {
  if (view.failure || !view.answer || !view.askKind) return null;
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
  if (view.weakSpot) await saveWeakSpot(view.weakSpot, id, now);
  return id;
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

export async function saveWeakSpot(
  spot: { wrong: string; right: string },
  askId: string,
  now: number = Date.now(),
): Promise<WeakSpot | null> {
  if (!isSavableWeakSpot(spot)) return null;
  const wrong = spot.wrong.trim();
  const right = spot.right.trim();
  const open = await db.weakSpots.toArray();
  if (open.some((w) => w.fixedAt === undefined && norm(w.wrong) === norm(wrong))) return null;
  const row: WeakSpot = { id: `ws-${askId}`, wrong, right, source: 'ask', createdAt: now };
  await db.weakSpots.put(row);
  return row;
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
