/**
 * SPEAK — THE CONTRACT
 *
 * Every module and every agent builds against this file. Nothing here changes
 * without an explicit decision recorded in `docs/PLAN.md`.
 *
 * Phase 0 scope: no microphone, no live AI. Cards that involve speaking are
 * still spoken — they are just self-graded rather than measured. The measuring
 * lands in Phase 1 and must not require a change to these shapes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` in the user's local timezone. Never a UTC date. */
export type DayKey = string;

/** Milliseconds since epoch. Every timestamp in the app is this. */
export type Millis = number;

export type Lang = 'en' | 'hi';

/**
 * How the user graded their own rep. Maps to SM-2 quality internally
 * (see `src/srs/scheduler.ts`) — do not assume the numbers line up.
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** Where a card came from. Drives the purge path — see PLAN.md §6b. */
export type CardSource = 'seed' | 'ai' | 'inbox';

export type CardStatus = 'active' | 'buried' | 'rejected';

// ─────────────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────────────

export type CardType =
  | 'word' // learn a word, then produce a sentence with it
  | 'swap' // replace a weak phrase with one precise word, under a timer
  | 'idiom' // corporate / idiomatic phrase in a real scenario
  | 'action_verb' // concrete physical verbs: tripped, stumbled, lurched
  | 'pronounce' // hear it, say it, check the stress
  | 'say_it' // read a line aloud at a controlled pace
  | 'breath'; // breath-support drill, stopwatch-driven in Phase 0

interface CardBase {
  id: string;
  type: CardType;
  lang: Lang;
  /** Free-form tags: topic, register, difficulty band. Used by the queue. */
  tags: string[];
  source: CardSource;
  status: CardStatus;
  createdAt: Millis;
  /** Set only when `source !== 'seed'`. Lets a bad AI batch be purged wholesale. */
  batchId?: string;
  /** The inbox item or card that seeded this one. */
  seedId?: string;
}

export interface WordCard extends CardBase {
  type: 'word';
  term: string;
  /** part of speech, e.g. "verb", "adj." */
  pos: string;
  meaning: string;
  /** Exactly two. First is neutral, second is in his register (work / everyday). */
  examples: [string, string];
  /** The production prompt. This is the point of the card. */
  say: string;
}

export interface SwapCard extends CardBase {
  type: 'swap';
  /** The flabby phrase, e.g. "very tired". */
  weak: string;
  /** Accepted one-word answers, best first. */
  answers: string[];
  /** Seconds on the clock. Short on purpose — this drills retrieval speed. */
  timerSec: number;
}

export interface IdiomCard extends CardBase {
  type: 'idiom';
  phrase: string;
  meaning: string;
  /** A concrete situation to use it in, phrased as an instruction. */
  scenario: string;
  example: string;
  /** True for office/business register — lets the Hindi + general tracks split. */
  corporate: boolean;
}

export interface ActionVerbCard extends CardBase {
  type: 'action_verb';
  verb: string;
  meaning: string;
  /** How it differs from the verbs people confuse it with. */
  contrast: string;
  examples: [string, string];
}

export interface PronounceCard extends CardBase {
  type: 'pronounce';
  term: string;
  /** Syllables split with `·`, e.g. "com·FOR·ta·ble". Caps marks the stress. */
  syllables: string;
  /** 0-based index of the stressed syllable in `syllables`. */
  stressIndex: number;
  /** The mistake to call out, if there is a common one. */
  commonError?: string;
}

export interface SayItCard extends CardBase {
  type: 'say_it';
  line: string;
  /**
   * The same line with pause marks: `/` short, `//` long.
   * Phase 1 checks whether he actually paused there.
   */
  marked: string;
  /** Words per minute this line should be read at. Set from his baseline later. */
  targetWpm: number;
}

export type BreathDrill = 'mpt' | 'ladder' | 'box' | 'straw';

export interface BreathCard extends CardBase {
  type: 'breath';
  drill: BreathDrill;
  title: string;
  /** Step-by-step, one instruction per array entry. */
  instructions: string[];
  /**
   * `seconds` → he runs a stopwatch and the result is logged as a number.
   * `count`   → he counts reps/numbers and logs how far he got.
   * `none`    → timed drill, nothing to log.
   */
  logUnit: 'seconds' | 'count' | 'none';
  /** For `none` drills: how long the timer runs. */
  durationSec?: number;
}

export type Card =
  | WordCard
  | SwapCard
  | IdiomCard
  | ActionVerbCard
  | PronounceCard
  | SayItCard
  | BreathCard;

/** Card types that require speaking out loud. Must stay ≥70% of the feed. */
export const SPOKEN_TYPES: readonly CardType[] = [
  'word',
  'swap',
  'action_verb',
  'pronounce',
  'say_it',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling (SM-2 state)
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewState = 'new' | 'learning' | 'review';

export interface Review {
  cardId: string;
  state: ReviewState;
  /** Day this card is next due. A card is due when `due <= todayKey()`. */
  due: DayKey;
  /** Current interval in days. 0 for new/learning. */
  intervalDays: number;
  /** SM-2 ease factor. Floor 1.3. */
  ease: number;
  /** Successful reps in a row. Resets to 0 on `again`. */
  reps: number;
  /** Lifetime count of `again` grades. Used by the weakness profile in Phase 5. */
  lapses: number;
  lastGrade?: Grade;
  lastSeenAt?: Millis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

export type FeedMode = 'core' | 'endless';

export interface CardEvent {
  id: string;
  cardId: string;
  cardType: CardType;
  at: Millis;
  grade: Grade;
  msSpent: number;
  mode: FeedMode;
  /** Breath drills only: seconds held, or how far he counted. */
  measure?: number;
}

/**
 * One row per calendar day. The streak reads `coreThreeDone` and nothing else —
 * a three-minute day must never break it.
 */
export interface DayRecord {
  date: DayKey;
  coreThreeDone: boolean;
  cardsCompleted: number;
  secondsActive: number;
  /** "I felt the pull and opened this instead." The real product metric. */
  urgesRedirected: number;
  /** Best max-phonation-time logged that day, in seconds. */
  bestMptSec?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox — the 3AM box
// ─────────────────────────────────────────────────────────────────────────────

export type InboxStatus = 'raw' | 'queued' | 'processed' | 'discarded';

export interface InboxItem {
  id: string;
  createdAt: Millis;
  text: string;
  status: InboxStatus;
  /** Phase 2: set when the classifier has run. */
  processedAt?: Millis;
  /** Phase 2: cards this dump produced. */
  generatedCardIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

export interface Profile {
  /** Always the string `me`. Single-row table. */
  id: 'me';
  createdAt: Millis;
  /** Measured in Phase 1. Until then `say_it` cards use their authored default. */
  baselineWpm?: number;
  /** Stepped down ~10% at a time from the baseline — never a fixed 140. */
  targetWpm?: number;
  /** Supabase user id once he signs in. Null while local-only. */
  userId?: string | null;
  lastSyncAt?: Millis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue — what the feed consumes
// ─────────────────────────────────────────────────────────────────────────────

/** Why this card was chosen. Shown in the debug overlay, not to the user. */
export type QueueReason = 'core' | 'due' | 'new' | 'filler';

export interface QueueItem {
  card: Card;
  reason: QueueReason;
}

export interface QueueOptions {
  /** Local day being built for. */
  today: DayKey;
  /**
   * Cards *passed* today (hard / good / easy). A card graded `again` must NOT
   * be in here — the whole point of `again` is that it comes back this session.
   */
  seenCardIds: ReadonlySet<string>;
  /** Breath cards already served today. Hard cap applies. */
  breathServedToday: number;
  /** Brand-new cards already introduced today. Hard cap applies. */
  newServedToday: number;
  /** How many items to return. */
  limit: number;
  /** `core` returns exactly the Core 3, in order. `endless` returns a mixed run. */
  mode: FeedMode;
}

/** Hard caps the queue must respect. */
export const QUEUE_RULES = {
  /** Breath drills are rationed — they are work, not filler. */
  MAX_BREATH_PER_DAY: 3,
  /** Never two cards of the same type back to back in endless mode. */
  MAX_CONSECUTIVE_SAME_TYPE: 1,
  /** Ceiling on brand-new cards per day, so reviews don't get buried. */
  MAX_NEW_PER_DAY: 20,
  /** Core 3, in this order. Changing this changes what the streak means. */
  CORE_SEQUENCE: ['breath', 'say_it', 'word'] as readonly CardType[],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AI proxy — the Netlify Function contract (Phase 1+, shipped dark in Phase 0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The browser may only ask for these. The function refuses anything else, so a
 * compromised client cannot turn the proxy into a general-purpose LLM endpoint.
 */
export type AiTask =
  | 'expand_seed' // one input → high-temperature variant cards
  | 'verify_batch' // temp 0: is each generated item real and natural?
  | 'classify_inbox' // raw dump → typed card stubs
  | 'review_recording'; // Phase 2: judgment over a recording's transcript

export interface AiRequest {
  task: AiTask;
  /** Task-specific payload. Validated server-side per task. */
  payload: unknown;
  /** Provider hint. The function may override on quota failure. */
  prefer?: 'gemini' | 'groq';
}

export interface AiResponse<T = unknown> {
  ok: boolean;
  task: AiTask;
  /** Which provider actually served it — recorded so quota use is visible. */
  provider?: 'gemini' | 'groq';
  data?: T;
  error?: string;
}
