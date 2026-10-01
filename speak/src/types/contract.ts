/**
 * SPEAK — THE CONTRACT
 *
 * Every module and every agent builds against this file. Nothing here changes
 * without an explicit decision recorded in `docs/PLAN.md`.
 *
 * Phase 0 scope: no microphone, no live AI. Cards that involve speaking are
 * still spoken — they are just self-graded rather than measured.
 *
 * Phase 1 (2026-08-13) added the Speaking Lab section at the bottom and three
 * optional fields to `Profile` and `DayRecord`. Nothing above those was
 * changed — the Phase 0 shapes held, as they were required to.
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
  | 'breath' // breath-support drill, stopwatch-driven in Phase 0
  | 'phrase' // "say this instead of that" — phrasing, not vocabulary
  | 'feeling' // precise words for emotional states
  | 'story_move' // a storytelling technique: hook, turn, landing
  | 'describe' // an image or scene to describe out loud
  | 'explain' // a topic to explain in 60s (news, history, philosophy)
  | 'teach_back' // something you learned, explained back
  | 'situation'; // a real-life speaking prompt: incident, office call, feeling, opinion, life story

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
  /** When he flagged this card wrong (AG-008 stage 4). */
  rejectedAt?: Millis;
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

export interface PhraseCard extends CardBase {
  type: 'phrase';
  weak: string; // what people usually say
  strong: string; // the version that lands
  why: string; // one sentence on why it lands. Never more.
  register: 'office' | 'friends' | 'presenting';
}

export interface FeelingCard extends CardBase {
  type: 'feeling';
  term: string;
  meaning: string;
  /** How it differs from the nearest word people reach for instead. */
  contrast: string;
  example: string;
}

export interface StoryMoveCard extends CardBase {
  type: 'story_move';
  move: string; // "Land the ending on a short sentence."
  why: string;
  example: string;
  heardIn?: string; // "Radio hosts closing a segment."
}

export interface DescribeCard extends CardBase {
  type: 'describe';
  imagePath?: string;   // was required; text-only scenes ship without images
  title?: string;       // ≤ 40 chars
  scene?: string;       // 1–3 sentences painting the scene when there is no image
  alt: string;
  prompt: string; // "Tell me what's happening — and how it feels."
  beats: [string, string, string];
  targetVocab: string[]; // 3–5 words
  targetSec: number;
}

export interface ExplainCard extends CardBase {
  type: 'explain';
  topic: string;
  angle: string; // the specific question, not the broad subject
  beats: [string, string, string];
  targetVocab: string[];
  targetSec: number;
  /** 2–3 plain sentences of stable, well-established background. Read before explaining. */
  primer?: string;
}

export interface TeachBackCard extends CardBase {
  type: 'teach_back';
  prompt: string;
  beats: [string, string, string];
  targetSec: number;
}

export type SituationKind = 'incident' | 'office_call' | 'feeling' | 'opinion' | 'life_story';

export interface SituationCard extends CardBase {
  type: 'situation';
  kind: SituationKind;
  title: string;                    // ≤ 40 chars, e.g. "The missed flight"
  prompt: string;                   // second person, ≤ 200 chars: what to talk about
  beats: [string, string, string];  // the three-part structure to follow
  targetVocab: string[];            // 0–4 words or phrases worth using
  targetSec: 30 | 45 | 60 | 90;
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
  | BreathCard
  | PhraseCard
  | FeelingCard
  | StoryMoveCard
  | DescribeCard
  | ExplainCard
  | TeachBackCard
  | SituationCard;

/**
 * Spoken card types. In V3, the microphone is optional and never a feed gate;
 * these are card types that support optional spoken attempts.
 * (Obsolete ≥70% spoken-feed rule removed).
 */
export const SPOKEN_TYPES: readonly CardType[] = [
  'word',
  'swap',
  'action_verb',
  'pronounce',
  'say_it',
  'describe',
  'explain',
  'teach_back',
] as const;

/** User's chosen daily target. Nothing is lost by missing it. */
export type DailyGoal = 'casual' | 'regular' | 'serious';

export const GAMIFICATION = {
  XP: { cardSeen: 1, cardSaved: 3, spokenRep: 10, describeRep: 25 },
  GOAL_XP: { casual: 10, regular: 30, serious: 60 },
  /** Streak holds on 5 cards OR 1 spoken rep. A 30-second day must count. */
  STREAK_CARDS: 5,
  FREEZES_PER_MONTH: 2,
  /** How long a "less of this" swipe suppresses a card type. */
  DOWNWEIGHT_DAYS: 7,
} as const;


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
  /** Set when he scrolled past a new card without engaging. Not "learned". */
  skippedAt?: Millis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging & Production Events
// ─────────────────────────────────────────────────────────────────────────────

export type FeedMode = 'endless';

export type ProductionEventType =
  | 'card_viewed'
  | 'card_saved'
  | 'card_unsaved'
  | 'card_downweighted'
  | 'spoken_rep_completed'
  | 'describe_rep_completed'
  | 'recall_graded';

export interface BaseProductionEvent {
  id: string;
  type: ProductionEventType;
  at: Millis;
  date?: DayKey;
}

export interface CardViewedEvent extends BaseProductionEvent {
  type: 'card_viewed';
  cardId: string;
  cardType: CardType;
  msSpent?: number;
  mode?: FeedMode;
}

export interface CardSavedEvent extends BaseProductionEvent {
  type: 'card_saved';
  cardId: string;
  cardType?: CardType;
}

export interface CardUnsavedEvent extends BaseProductionEvent {
  type: 'card_unsaved';
  cardId: string;
  cardType?: CardType;
}

export interface CardDownweightedEvent extends BaseProductionEvent {
  type: 'card_downweighted';
  cardId?: string;
  cardType?: CardType;
  target: string;
  multiplier: number;
  expiresAt: Millis;
}

export interface SpokenRepCompletedEvent extends BaseProductionEvent {
  type: 'spoken_rep_completed';
  recordingId: string;
  drillTitle: string;
  durationSec: number;
  xpEarned: number;
  transcript?: string;
}

export interface DescribeRepCompletedEvent extends BaseProductionEvent {
  type: 'describe_rep_completed';
  recordingId: string;
  drillTitle: string;
  durationSec: number;
  xpEarned: number;
  transcript?: string;
}

export interface RecallGradedEvent extends BaseProductionEvent {
  type: 'recall_graded';
  cardId: string;
  cardType: CardType;
  grade: Grade;
  msSpent?: number;
}

export type ProductionEvent =
  | CardViewedEvent
  | CardSavedEvent
  | CardUnsavedEvent
  | CardDownweightedEvent
  | SpokenRepCompletedEvent
  | DescribeRepCompletedEvent
  | RecallGradedEvent;

/**
 * Standard ProductionEvent stored in `db.events`.
 * Preserves optional legacy fields for index and Supabase sync compatibility.
 */
export type CardEvent = ProductionEvent & {
  cardId?: string;
  cardType?: CardType;
  grade?: Grade;
  msSpent?: number;
  mode?: FeedMode;
  measure?: number;
};

/**
 * One row per calendar day. Day completion (`isDayComplete`) requires
 * 5 cards viewed OR 1 valid spoken rep.
 * `coreThreeDone` is preserved as a boolean for backwards compatibility with
 * existing stored data, reflecting whether the day is complete.
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
  /** Phase 1: a Lab session was run to the last step. Does NOT feed the streak. */
  labSessionDone?: boolean;
  /** Phase 1: seconds spent in the Lab today, partial sessions included. */
  labSeconds?: number;
  /** XP earned today. */
  xp?: number;
  /** Spoken reps completed today across feed, gym and drills. */
  spokenReps?: number;
  challenge?: DailyChallenge;
  challengeResult?: ChallengeResult;
}

// ── Daily challenge ──
export type VoiceGoal = 'softer' | 'slower' | 'pause_first';
export interface DailyChallenge {
  date: DayKey;
  title: string;                 // plain words, ≤ 70 chars
  situationCardId?: string;      // what to talk about
  useWord?: string;              // one of his coach words, else a word card he engaged with
  avoidPhrase?: string;          // one of his coach mistakes (the "wrong" side)
  voiceGoal: VoiceGoal;
  targetSec: 30 | 45 | 60;
}
export interface ChallengeResult {
  recordingId: string;
  longEnough: boolean;
  /** null = could not check (no speech recognition) — show "—", never guess. */
  usedWord: boolean | null;
  avoidedPhrase: boolean | null;
  voiceGoalMet: boolean | null;
  done: boolean;                 // longEnough && voiceGoalMet !== false && usedWord !== false && avoidedPhrase !== false
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox — the 3AM box
// ─────────────────────────────────────────────────────────────────────────────

export type InboxStatus = 'raw' | 'queued' | 'processed' | 'discarded';

export type CoachKind = 'word' | 'mistake' | 'topic' | 'other';

export interface InboxItem {
  id: string;
  createdAt: Millis;
  text: string;
  status: InboxStatus;
  /** Phase 2: set when the classifier has run. */
  processedAt?: Millis;
  /** Phase 2: cards this dump produced. */
  generatedCardIds?: string[];
  kind?: CoachKind;
  /** word: the word/phrase he liked. mistake: what he says wrong. topic: the topic. */
  subject?: string;
  /** mistake only: the better version. */
  fix?: string;
  /** Plain-language reason the last processing attempt added nothing. */
  failReason?: string;
  /** Processing attempts so far; stop auto-retrying at 3. */
  attempts?: number;
  /** `recording`: learned from an AI-checked recording mistake (AG-008 stage 2). */
  origin?: 'recording';
}

// ── Coach box: AI payloads ─────────────────────────────────────────────────
export interface ClassifyInboxPayload {
  text: string;
  /** Optional "do not produce" terms (his rejected vocabulary). */
  avoid?: string[];
}
export interface ClassifyInboxResult {
  kind: CoachKind;
  subject: string;
  fix?: string;
  /** Drafts only — never stored before verify_batch passes. Every card shape
   *  minus CardBase fields (id, tags, source, status, createdAt). AI may never
   *  draft `pronounce`, `say_it`, `breath` or `action_verb`. Hindi only as
   *  `word` with `lang: 'hi'` — those cards ride the normal Hindi slots. */
  cards: Array<
    | (Omit<WordCard, keyof CardBase> & { type: 'word'; lang?: 'hi' })
    | (Omit<SwapCard, keyof CardBase> & { type: 'swap' })
    | (Omit<IdiomCard, keyof CardBase> & { type: 'idiom' })
    | (Omit<PhraseCard, keyof CardBase> & { type: 'phrase' })
    | (Omit<FeelingCard, keyof CardBase> & { type: 'feeling' })
    | (Omit<StoryMoveCard, keyof CardBase> & { type: 'story_move' })
    | (Omit<DescribeCard, keyof CardBase> & { type: 'describe' })
    | (Omit<ExplainCard, keyof CardBase> & { type: 'explain' })
    | (Omit<TeachBackCard, keyof CardBase> & { type: 'teach_back' })
    | (Omit<SituationCard, keyof CardBase> & { type: 'situation' })
  >;
}
export interface VerifyBatchPayload {
  items: Array<{ key: string; card: unknown }>;
}
export interface VerifyBatchResult {
  results: Array<{ key: string; ok: boolean; reason: string }>;
}

/** The card types AI may ever draft (AG-008 §0.3). */
export type DraftCardType = ClassifyInboxResult['cards'][number]['type'];

export interface ExpandSeedPayload {
  /** Card type to produce siblings of — siblings must be this same type. */
  type: DraftCardType;
  /** How many siblings (1–10; misses ask for 2). */
  count: number;
  /** The seed card minus CardBase fields (validated with the classify draft rules). */
  seed?: unknown;
  /** Optional topic hints (top-up uses profile interests + coach subjects). */
  topics?: string[];
  /** Optional "do not produce" terms (his rejected vocabulary). */
  avoid?: string[];
}
export interface ExpandSeedResult {
  cards: ClassifyInboxResult['cards'];
}

/** review_recording payload. `watch` = his known mistakes; feedback must check these first. Max 10. */
export interface ReviewRecordingPayload {
  transcript: string;
  promptText?: string;
  drillTitle?: string;
  elapsedSec?: number;
  targetVocab?: string[];
  /** His known mistakes. Feedback must check for these first. Max 10. */
  watch?: Array<{ wrong: string; right: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile & Preferences
// ─────────────────────────────────────────────────────────────────────────────

export interface DownweightRecord {
  target: string;
  type?: CardType;
  multiplier: number;
  expiresAt: Millis;
  createdAt: Millis;
}

export interface FreezeRecord {
  month: string; // "YYYY-MM"
  usedDates: DayKey[];
  remaining: number;
}

export interface Profile {
  /** Always the string `me`. Single-row table. */
  id: 'me';
  createdAt: Millis;
  /** User's chosen daily target. */
  dailyGoal?: DailyGoal;
  /** Selected interests from onboarding / settings. */
  interests?: string[];
  /** Relative weights per card type based on preferences and left-swipes. */
  typeWeights?: Record<string, number>;
  /** Tag/category-based downweights with expiration timestamps. */
  downweights?: Record<string, DownweightRecord>;
  /** Card IDs that have already been awarded bookmark XP to prevent toggle farming. */
  bookmarkXpAwarded?: string[];
  /** Measured in Phase 1. Until then `say_it` cards use their authored default. */
  baselineWpm?: number;
  /** Stepped down ~10% at a time from the baseline — never a fixed 140. */
  targetWpm?: number;
  /** Supabase user id once he signs in. Null while local-only. */
  userId?: string | null;
  lastSyncAt?: Millis;

  // ── Phase 1: personal audio calibration ────────────────────────────────────
  /**
   * Mean dBFS of his *habitual* speech, measured on his own device over the
   * first `LAB_RULES.CALIBRATION_SESSIONS` Lab sessions.
   *
   * Absolute dB off a phone mic is meaningless (PLAN.md §3). Every band, nudge
   * and trend in the app is expressed relative to this number and nothing else.
   */
  baselineDb?: number;
  /** How many habitual samples `baselineDb` is the mean of. */
  calibrationSamples?: number;
  /** Derived from `baselineDb` — never authored, never absolute. */
  targetBandDb?: TargetBandDb;
  /** When the band last opened or moved. */
  calibratedAt?: Millis;
  /** Result of the in-app device test. Written on first successful mic use. */
  micProfile?: MicProfile;
}

/**
 * A dBFS window. `min`/`max` are both negative and `min < max`; -60 is the
 * practical floor of the meter and 0 is full scale.
 */
export interface TargetBandDb {
  minDb: number;
  maxDb: number;
}

/**
 * What the microphone on *this* device actually does. Written once, so a bad
 * reading later can be told apart from a bad device.
 *
 * This is the "real-device mic test" PLAN.md §7 requires before Phase 1 is
 * trusted — run by the app on his phone rather than by hand off a checklist.
 */
export interface MicProfile {
  at: Millis;
  sampleRate: number;
  /**
   * Whether the browser honoured `autoGainControl: false`. If it did not, the
   * hardware is normalising loudness and every dB reading is compressed —
   * the meter still works as a relative signal but the band will be narrow.
   */
  agcDisabled: boolean;
  /** Room noise floor in dBFS, measured over ~1 s before he speaks. */
  noiseFloorDb: number;
  /** False when permission was denied or no audio input exists. */
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue — what the feed consumes
// ─────────────────────────────────────────────────────────────────────────────

/** Why this card was chosen. Shown in the debug overlay, not to the user. */
export type QueueReason = 'due' | 'new' | 'filler';

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
  mode?: FeedMode;
  /** Biases which card types are served. */
  interests?: string[];
  /** Relative multiplier per card type. */
  typeWeights?: Record<string, number>;
  /** Expiring tag/type suppressions from "less of this" swipes. */
  downweights?: Record<string, DownweightRecord>;
}

/** Hard caps the queue must respect. */
export const QUEUE_RULES = {
  /** Breath drills are rationed — they are work, not filler. */
  MAX_BREATH_PER_DAY: 3,
  /** Never two cards of the same type back to back in endless mode. */
  MAX_CONSECUTIVE_SAME_TYPE: 1,
  /** Ceiling on brand-new cards per day, so reviews don't get buried. */
  MAX_NEW_PER_DAY: 20,
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
  prefer?: 'gemini' | 'groq' | 'anthropic';
}

export interface AiResponse<T = unknown> {
  ok: boolean;
  task: AiTask;
  /** Which provider actually served it — recorded so quota use is visible. */
  provider?: 'gemini' | 'groq' | 'anthropic';
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaking Lab — Phase 1 (M8 · M9 · M10 · M11)
//
// The 12-minute daily routine from VOICE-PROFILE.md §6, expressed as data.
// The routine is *ordered on purpose*: release before production, and every
// block ends where the learning actually happens. Reordering the blocks or
// dropping a `transfer` step changes what the session trains — do neither
// without a decision recorded in PLAN.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Blocks A–E of the daily routine. Fixed set, fixed order. */
export type LabBlockId = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * How a step is run. Only `meter`, `mpt`, `transfer` and `calibrate` open the
 * microphone; `guided` is a timer and a cue and works with the mic denied.
 *
 * - `guided`    — timed cue, nothing measured. Blocks C/D/E in Phase 1.
 * - `meter`     — live dB meter on; the reading feeds the session average.
 * - `calibrate` — habitual speech captured to build `Profile.baselineDb`.
 *                 Drops out of the routine once calibration completes.
 * - `mpt`       — sustained phonation, mic auto-stop, writes a `VoiceSample`.
 * - `transfer`  — **the transfer rep.** Speak one ordinary sentence carrying
 *                 the feeling of the drill just done. PLAN.md §1 design
 *                 consequence 4: the app must *enforce* this, because it is the
 *                 step most likely to be skipped and the one that transfers.
 *
 * Kind says what the step *is*; `LabStep.metered` says whether the microphone
 * opens for it. They are kept separate on purpose — Blocks C/D/E have transfer
 * reps that are mandatory from day one but are not measured until M12 and M16
 * land in Phases 2 and 5.
 */
export type LabStepKind = 'guided' | 'meter' | 'calibrate' | 'mpt' | 'transfer';

export interface LabStep {
  id: string;
  block: LabBlockId;
  title: string;
  /**
   * One line, and short enough to read *while doing the drill*. Never a list.
   * A five-step instruction you have to scroll is unreadable while holding a
   * breath — see `docs/known-issues.md`.
   */
  cue: string;
  /** What "correct" feels like. Secondary text, may be omitted. */
  feel?: string;
  durationSec: number;
  kind: LabStepKind;
  /**
   * A mandatory step cannot be skipped forward past — the runner refuses.
   * Every `transfer` step is mandatory. Nothing else is.
   */
  mandatory: boolean;
  /**
   * The microphone opens for this step and the reading feeds the session
   * average. False for every step whose measuring module has not shipped yet.
   */
  metered: boolean;
  /** `mpt` steps only: which sample the measured duration is written as. */
  sampleKind?: VoiceSampleKind;
}

export interface LabBlock {
  id: LabBlockId;
  title: string;
  /** Why the block exists, in one line. Shown when the block opens. */
  purpose: string;
  /** The module that owns it. C/D/E stay `guided` until their own phase. */
  module: 'M8' | 'M9' | 'M12' | 'M16' | 'M13';
  steps: LabStep[];
}

/**
 * A single measured number about the voice. Kept separate from `CardEvent`
 * because these are the numbers that get charted over 12 weeks — they must not
 * be reconstructed by filtering a general event log.
 */
export type VoiceSampleKind =
  | 'mpt_habitual' // THE headline number. Baseline 15–16 s → target 24–25 s
  | 'mpt_soft' // the ceiling the habitual number is chasing. ~25 s already
  | 'session_db' // mean dBFS across a Lab session's metered steps
  | 'baseline_db' // one habitual-speech sample during week-1 calibration
  | 'level1_hold'; // Phase 2 (M12). Declared here so the table never migrates

export interface VoiceSample {
  id: string;
  at: Millis;
  date: DayKey;
  kind: VoiceSampleKind;
  /** Seconds for `mpt_*` and `level1_hold`; dBFS (negative) for the `*_db` kinds. */
  value: number;
  /** The Lab session it came from, when it came from one. */
  sessionId?: string;
}

export interface LabSession {
  id: string;
  date: DayKey;
  startedAt: Millis;
  endedAt?: Millis;
  /** Step ids completed, in order. */
  completedStepIds: string[];
  /**
   * Transfer reps actually done. This is the number that says whether the
   * session was real — a session with zero transfer reps trained nothing.
   */
  transferReps: number;
  /** Mean dBFS across the metered steps. Undefined when the mic never ran. */
  avgDb?: number;
  /** He left before the last step. Logged anyway — a partial session is data. */
  aborted: boolean;
}

/**
 * One saved spoken attempt, audio included.
 *
 * The product promise is "hear the second attempt improve", and a promise you
 * cannot replay is a claim. The blob lives in IndexedDB and **never** goes into
 * the outbox: audio is local until an upload path exists that says so on screen
 * (PRODUCT-RESET-PLAN §8.4).
 */
export interface Recording {
  /** `${sessionId}-a${attempt}` — a redo overwrites its own attempt, not the pair. */
  id: string;
  sessionId: string;
  attempt: 1 | 2;
  missionId: string;
  /** Shown in the archive so a recording from six weeks ago still means something. */
  missionTitle: string;
  date: DayKey;
  at: Millis;
  durationSec: number;
  /** Whatever the browser gave us — `audio/mp4` on iOS, `audio/webm` elsewhere. */
  mimeType: string;
  blob: Blob;
  /** Mean dBFS over the attempt. Undefined when the mic was denied. */
  avgDb?: number;
  /** Optional speech recognition transcript captured during the attempt. */
  transcript?: string;
}

/**
 * The verdict on a loud-to-soft MPT pair.
 *
 * **The gap is a deficit — smaller is better.** Baseline ~10 s, 12-week target
 * < 3 s. Getting this backwards congratulates the exact habit the app exists to
 * remove, so the interpretation lives in `features/lab/calibration.ts` and no
 * component is allowed to compute it.
 */
export type MptVerdict = 'target' | 'improving' | 'baseline';

/**
 * Constants the Lab must respect. Same role as `QUEUE_RULES` — changing a
 * number here changes what the training means.
 */
export const LAB_RULES = {
  /** Habitual-speech samples needed before a personal band is trusted. */
  CALIBRATION_SESSIONS: 7,
  /**
   * Where the *session average* should land, relative to his own baseline.
   * VOICE-PROFILE.md §7: "session dB average −6 to −8 dB from baseline".
   */
  TARGET_OFFSET_DB: { quietest: -8, loudest: -6 },
  /**
   * Half-width of the **live meter** band around that target.
   *
   * The target above is a 2 dB window, which is right for an average and wrong
   * for a live meter — ordinary speech swings ~20 dB inside a sentence, so a
   * 2 dB bar would sit outside the band permanently and be ignored within a
   * day. The live band is centred on the target and wide enough to be
   * achievable; the average is what actually gets scored.
   */
  LIVE_BAND_HALF_WIDTH_DB: 5,
  /**
   * How long the smoothed level must sit outside the band before the meter
   * says anything. A nudge that fires on one loud syllable is noise.
   */
  DRIFT_HOLD_MS: 1500,
  /** Window the drift detector averages over. */
  DRIFT_WINDOW_MS: 2000,
  /** Loud-to-soft MPT gap in seconds. Deficit — smaller is better. */
  MPT_GAP_TARGET_SEC: 3,
  MPT_GAP_BASELINE_SEC: 10,
  /** The full routine, for the progress read-out. Blocks A–E sum to this. */
  ROUTINE_SEC: 720,
  /** MPT is a *weekly* measure, not a daily one. VOICE-PROFILE.md §7. */
  MPT_INTERVAL_DAYS: 7,
  /** Below this dBFS the meter treats the input as silence, not quiet speech. */
  SILENCE_FLOOR_DB: -55,
} as const;
