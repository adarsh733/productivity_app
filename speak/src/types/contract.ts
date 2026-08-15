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
  /** Phase 1: a Lab session was run to the last step. Does NOT feed the streak. */
  labSessionDone?: boolean;
  /** Phase 1: seconds spent in the Lab today, partial sessions included. */
  labSeconds?: number;
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
