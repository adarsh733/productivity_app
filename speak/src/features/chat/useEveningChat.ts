import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatSession,
  ChatTurn,
  CoachChatPayload,
  CoachChatResult,
  DayKey,
  StoryBankEntry,
  Track,
  TranscribeResult,
  WeakSpot,
} from '../../types/contract';
import { LAB_RULES } from '../../types/contract';
import { db, getProfile } from '../../db/db';
import { todayKey } from '../../lib/date';
import {
  AudioMeterController,
  calculateWpm,
  computeVoicedSec,
} from '../../lib/audioMeter';
import { isCalibrated } from '../lab/calibration';
import { pickMimeType } from '../reset/useMissionAudio';
import { todaysTrack } from '../lessons/rotation';
import { aiPost, withTimeout, type FetchFn } from '../coach/pipeline';
import { aiCallsLeft, refundAiCalls, tryConsumeAiCalls } from '../auto/budget';
import { isSavableWeakSpot } from '../ask/askPipeline';
import { noteTopics, watchList } from '../learn/profile';
import { saveBestMoment } from './storyBank';

/**
 * v5 evening chat — three questions, spoken or typed.
 *
 *   record (the meter's own stream, MediaRecorder)  →  upload to transcribe
 *   (words with times)  →  pace from those times, loudness against his normal
 *   →  coach_chat (Haiku)  →  good / 1-2 fixes / a better version / Say it again
 *
 * The phone's built-in speech recogniser is never used (it is not reliable in a
 * home-screen app). Every way this can go wrong ends the same way: ONE plain
 * line, and he can type his answer or skip. Nothing here throws to the screen.
 */

export const CHAT_QUESTION_COUNT = 3;

/** An answer longer than this stops itself. */
export const MAX_ANSWER_SEC = 120;

/** Loudness is "normal" within this many dB of his own baseline. */
export const LOUDNESS_WINDOW_DB = 3;

// ── The one plain line for each way it can fail ────────────────────────────
export type ChatFailure =
  | 'mic'
  | 'offline'
  | 'budget'
  | 'upload'
  | 'busy'
  | 'transcribe'
  | 'empty'
  | 'coach'
  | 'bad_coach';

export const CHAT_LINES: Record<ChatFailure, string> = {
  mic: "I can't use the microphone. Type your answer instead, or skip this one.",
  offline: "You're offline, so I can't hear or coach right now. Type your answer, or skip.",
  budget: "You've used today's AI coaching. Type your answer to keep it, or skip. More tomorrow.",
  upload: "The recording didn't reach the AI. Type your answer instead, or skip.",
  busy: 'The speech service is busy — try again in a minute.',
  transcribe: "I couldn't turn that into words. Type your answer instead, or skip.",
  empty: "I didn't hear any words. Say it again, or type your answer.",
  coach: "The coach couldn't answer this time. Your answer is saved.",
  bad_coach: "The coach's answer didn't look right, so I left it out. Your answer is saved.",
};

export class ChatError extends Error {
  constructor(public readonly code: ChatFailure) {
    super(CHAT_LINES[code]);
  }
}

// ── The three questions ────────────────────────────────────────────────────
export const MOMENT_QUESTION = 'How was your day? Tell me one moment from it.';

export const CHAT_QUESTIONS: Record<Track, readonly string[]> = {
  smalltalk: [
    'A colleague asks what you did over the weekend. What do you say?',
    'Someone says "Busy week?" while you wait for a meeting. Reply, and keep the chat going.',
    'A new person joins your team. Say hello and ask them something.',
    'Your manager asks "How is it going?" in the corridor. Answer with a real detail.',
    'A client says "Hot today, isn\'t it?" Reply, and add a small detail of your own.',
  ],
  stories: [
    'Tell me about a small problem you fixed this week. Use "but" and "so".',
    'Tell me about a time something went differently from your plan.',
    'Describe one person you talked to today, with one detail that stuck.',
    'Tell me about the best meal you had this week, as a short story.',
    'Tell me about a moment at work you were proud of.',
  ],
  clearly: [
    'Your manager asks "Where is the report?" Answer in one sentence first, then add a detail.',
    'Explain what you are working on right now. Put the main point first.',
    'Someone asks if you can take another task. Give your answer, then your reason.',
    'Give me a status update on your week in three sentences.',
    'Recommend one thing to a colleague, and say why in one sentence.',
  ],
  words: [
    'Describe your morning in your own words. Try one new word you learned this week.',
    'Explain something you did today without saying "very" or "good".',
    'Tell me how a meeting went, using one new phrase from your feed.',
    'Describe your work this week with a phrase you picked up lately.',
    'How would you describe your mood right now, in more than one word?',
  ],
};

function dayNumber(day: DayKey): number {
  let n = 0;
  for (const ch of day) n = (n * 31 + ch.charCodeAt(0)) % 100003;
  return n;
}

/** Tonight's three questions: one moment from his day, then two for today's skill. */
export function questionsFor(day: DayKey, track: Track = todaysTrack(day)): string[] {
  const bank = CHAT_QUESTIONS[track];
  const start = dayNumber(day) % bank.length;
  return [MOMENT_QUESTION, bank[start]!, bank[(start + 1) % bank.length]!];
}

// ── Recording ──────────────────────────────────────────────────────────────
export interface CaptureResult {
  blob: Blob;
  samples: Array<{ db: number; atMs: number }>;
  durationSec: number;
}

export interface CaptureHandle {
  stop(): Promise<CaptureResult | null>;
  cancel(): void;
}

/** Null means the microphone could not be used (blocked, missing, or no recorder). */
export type StartCapture = (onLevel: (percent: number) => void) => Promise<CaptureHandle | null>;

/**
 * The real recorder: the meter's own stream feeds MediaRecorder, so the dB
 * readings and the audio are the same voice.
 */
export const startMicCapture: StartCapture = async (onLevel) => {
  const meter = new AudioMeterController();
  const samples: Array<{ db: number; atMs: number }> = [];
  let started = false;
  try {
    started = await meter.start((m) => {
      samples.push({ db: m.db, atMs: performance.now() });
      onLevel(m.percent);
    });
  } catch {
    started = false;
  }
  const stream = meter.mediaStream;
  if (!started || !stream || typeof MediaRecorder === 'undefined') {
    meter.stop();
    return null;
  }

  let recorder: MediaRecorder;
  try {
    const mime = pickMimeType();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    meter.stop();
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  try {
    recorder.start(1000);
  } catch {
    meter.stop();
    return null;
  }
  const startedAt = performance.now();

  return {
    async stop() {
      const type = recorder.mimeType || pickMimeType() || 'audio/webm';
      try {
        if (recorder.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
            try {
              recorder.stop();
            } catch {
              resolve();
            }
          });
        }
      } finally {
        meter.stop();
      }
      if (chunks.length === 0) return null;
      return {
        blob: new Blob(chunks, { type }),
        samples,
        durationSec: Math.max(0, (performance.now() - startedAt) / 1000),
      };
    },
    cancel() {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* nothing to stop */
      }
      meter.stop();
    },
  };
};

// ── Upload and transcribe ──────────────────────────────────────────────────
export const TRANSCRIBE_URL = '/.netlify/functions/transcribe';

function isTranscribeShape(v: unknown): v is TranscribeResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<TranscribeResult>;
  return typeof r.text === 'string' && Array.isArray(r.words);
}

/**
 * Send the recording and get words with times back. Throws a ChatError (one
 * plain line) on every failure. Accepts the bare result or `{ ok, data }`.
 */
export async function transcribeAudio(blob: Blob, fetchFn: FetchFn): Promise<TranscribeResult> {
  let res: Response;
  let body: unknown;
  try {
    // One time limit over the upload and reading the answer (the server stops Groq at 20 s).
    res = await withTimeout((signal) =>
      fetchFn(TRANSCRIBE_URL, {
        method: 'POST',
        headers: { 'content-type': blob.type || 'audio/webm' },
        body: blob,
        ...(signal ? { signal } : {}),
      }),
    );
  } catch {
    throw new ChatError('upload');
  }
  if (res.status === 413) throw new ChatError('upload');
  // Too many uploads (429) or the speech service itself busy (503).
  if (res.status === 429 || res.status === 503) throw new ChatError('busy');
  // 422 is the server's "no words in that clip" — say so, not "couldn't turn it into words".
  if (res.status === 422) throw new ChatError('empty');
  try {
    body = await withTimeout(() => res.json());
  } catch {
    throw new ChatError('transcribe');
  }
  if (!res.ok) throw new ChatError('transcribe');

  const inner = (body as { data?: unknown } | null)?.data;
  const result = isTranscribeShape(body) ? body : isTranscribeShape(inner) ? inner : null;
  if (!result) throw new ChatError('transcribe');

  const words = result.words.filter(
    (w) =>
      w && typeof w.word === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end),
  );
  const text = result.text.trim();
  if (!text) throw new ChatError('empty');
  return {
    text,
    words,
    durationSec: Number.isFinite(result.durationSec) ? result.durationSec : 0,
  };
}

// ── Numbers measured on the phone ──────────────────────────────────────────
/** Fewer words than this and a pace number would be noise. */
export const MIN_WPM_WORDS = 5;
/** A shorter speaking span than this and a pace number would be noise. */
export const MIN_WPM_SPAN_SEC = 3;

/**
 * Words per minute from the word times: words divided by the time from the
 * first word's start to the last word's end. Undefined when there is too little
 * to measure — never an estimate.
 */
export function wpmFromWords(words: TranscribeResult['words']): number | undefined {
  if (words.length < MIN_WPM_WORDS) return undefined;
  const first = words[0]!;
  const last = words[words.length - 1]!;
  const span = last.end - first.start;
  if (!(span >= MIN_WPM_SPAN_SEC)) return undefined;
  return calculateWpm(words.length, span);
}

/**
 * Loudness against HIS normal: the mean of the voiced readings against his
 * measured baseline. Undefined until the baseline is trusted (calibrated) or
 * when there is too little voice to average.
 */
export function loudnessVsNormal(
  samples: ReadonlyArray<{ db: number }>,
  baselineDb: number | undefined,
): ChatTurn['loudness'] | undefined {
  if (baselineDb === undefined) return undefined;
  const voiced = samples.filter((s) => s.db > LAB_RULES.SILENCE_FLOOR_DB);
  if (voiced.length < 10) return undefined;
  const mean = voiced.reduce((a, s) => a + s.db, 0) / voiced.length;
  const delta = mean - baselineDb;
  if (delta < -LOUDNESS_WINDOW_DB) return 'below';
  if (delta > LOUDNESS_WINDOW_DB) return 'above';
  return 'normal';
}

// ── Checking what the coach says ───────────────────────────────────────────
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every "quoted" phrase in a line. */
function quotedPhrases(text: string): string[] {
  const out: string[] = [];
  const re = /["“]([^"”]{2,})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]!);
  return out;
}

const PACE_TALK = /\b(wpm|words per minute|too fast|too slow|speak (faster|slower)|speaking (faster|slower)|your pace|your speed|slow down|speed up)\b/i;
const LOUD_TALK = /\b(too loud|too quiet|too soft|louder|quieter|project more|your volume|your loudness)\b/i;

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export interface CoachGuards {
  hasWpm: boolean;
  hasLoudness: boolean;
}

/**
 * Rulebook 5.3: the app discards feedback that quotes words he did not say, or
 * talks about pace or loudness when no number was measured. Returns the cleaned
 * feedback, or null when it cannot be trusted.
 */
export function validateFeedback(
  raw: unknown,
  transcript: string,
  guards: CoachGuards,
): CoachChatResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CoachChatResult>;
  if (!str(r.good) || !str(r.better)) return null;
  const fixes = (Array.isArray(r.fixes) ? r.fixes : [])
    .filter((f) => f && typeof f === 'object' && str((f as { text?: unknown }).text))
    .slice(0, 2)
    .map((f) => ({
      text: f.text.trim(),
      ...(str(f.lesson) ? { lesson: f.lesson.trim() } : {}),
    }));

  const said = norm(transcript);
  for (const q of quotedPhrases(r.good)) {
    if (!said.includes(norm(q))) return null;
  }

  const spoken = [r.good, ...fixes.map((f) => f.text)].join(' ');
  if (!guards.hasWpm && PACE_TALK.test(spoken)) return null;
  if (!guards.hasLoudness && LOUD_TALK.test(spoken)) return null;

  const slipRaw = r.slip;
  const slip =
    slipRaw &&
    isSavableWeakSpot(slipRaw) &&
    norm(transcript).includes(norm(slipRaw.wrong))
      ? { wrong: slipRaw.wrong.trim(), right: slipRaw.right.trim() }
      : null;

  // Subjects he talked about, for future cards (never shown). Max 3.
  const topics = (Array.isArray(r.topics) ? r.topics : [])
    .filter(str)
    .map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 60))
    .slice(0, 3);

  return {
    good: r.good.trim(),
    fixes,
    better: r.better.trim(),
    slip,
    ...(topics.length > 0 ? { topics } : {}),
  };
}

export interface CoachTurnInput {
  question: string;
  transcript: string;
  track: Track;
  wpm?: number;
  loudness?: ChatTurn['loudness'];
  voicedSec?: number;
  watch?: Array<{ wrong: string; right: string }>;
  fetchFn: FetchFn;
  /** Defaults to `navigator.onLine`. */
  online?: boolean;
}

/**
 * Ask the coach about one answer. Takes one call from today's budget and gives
 * it back when the call never reached a model. Throws a ChatError.
 */
export async function coachTurn(input: CoachTurnInput): Promise<CoachChatResult> {
  const online =
    input.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) throw new ChatError('offline');

  let taken = false;
  try {
    if (!(await tryConsumeAiCalls(1))) throw new ChatError('budget');
    taken = true;

    const payload: CoachChatPayload = {
      question: input.question,
      transcript: input.transcript,
      track: input.track,
      ...(input.wpm !== undefined ? { wpm: input.wpm } : {}),
      ...(input.loudness ? { loudness: input.loudness } : {}),
      ...(input.voicedSec !== undefined ? { voicedSec: input.voicedSec } : {}),
      ...(input.watch && input.watch.length > 0 ? { watch: input.watch.slice(0, 10) } : {}),
    };

    let answered;
    try {
      answered = await aiPost<CoachChatResult>('coach_chat', payload, input.fetchFn, 'anthropic');
    } catch {
      await refundAiCalls(1).catch(() => {});
      taken = false;
      throw new ChatError('coach');
    }
    const clean = validateFeedback(answered.data, input.transcript, {
      hasWpm: input.wpm !== undefined,
      hasLoudness: input.loudness !== undefined,
    });
    if (!clean) throw new ChatError('bad_coach');
    return clean;
  } catch (e) {
    if (e instanceof ChatError) throw e;
    if (taken) await refundAiCalls(1).catch(() => {});
    throw new ChatError('coach');
  }
}

/** Keep the slip he made as a weak spot (phone-only). Never throws. */
export async function saveChatWeakSpot(
  slip: { wrong: string; right: string },
  sessionId: string,
  now: number = Date.now(),
): Promise<WeakSpot | null> {
  try {
    if (!isSavableWeakSpot(slip)) return null;
    const wrong = slip.wrong.trim();
    const open = await db.weakSpots.toArray();
    if (open.some((w) => w.fixedAt === undefined && norm(w.wrong) === norm(wrong))) return null;
    const row: WeakSpot = {
      id: `ws-${sessionId}-${now}`,
      wrong,
      right: slip.right.trim(),
      source: 'chat',
      createdAt: now,
    };
    await db.weakSpots.put(row);
    return row;
  } catch {
    return null;
  }
}

/** True when `phrase` appears in `text` as whole words (case and punctuation ignored). */
function saysPhrase(text: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length > 0 && ` ${norm(text)} `.includes(` ${p} `);
}

/**
 * He said the right form of a watched weak spot and not the wrong one: mark it
 * fixed (`fixedAt`). Only weak spots in `watch` count. Returns how many were
 * marked. Never throws.
 */
export async function markFixedWeakSpots(
  transcript: string,
  watch: ReadonlyArray<{ wrong: string; right: string }>,
  now: number = Date.now(),
): Promise<number> {
  try {
    if (!transcript.trim() || watch.length === 0) return 0;
    const watched = new Set(watch.map((w) => norm(w.wrong)));
    const open = (await db.weakSpots.toArray()).filter(
      (w) => w.fixedAt === undefined && watched.has(norm(w.wrong)),
    );
    const fixed = open.filter((w) => saysPhrase(transcript, w.right) && !saysPhrase(transcript, w.wrong));
    if (fixed.length === 0) return 0;
    await db.weakSpots.bulkPut(fixed.map((w) => ({ ...w, fixedAt: now })));
    return fixed.length;
  } catch {
    return 0;
  }
}

/**
 * Everything that follows one coached answer, kept even if he has already
 * closed the chat: the subjects he talked about, a new slip, and weak spots
 * he has now fixed.
 */
export async function learnFromTurn(
  transcript: string,
  feedback: CoachChatResult,
  watch: ReadonlyArray<{ wrong: string; right: string }>,
  sessionId: string,
): Promise<void> {
  await noteTopics(feedback.topics, 'chat').catch(() => {});
  await markFixedWeakSpots(transcript, watch);
  if (feedback.slip) await saveChatWeakSpot(feedback.slip, sessionId);
}

// ── The hook ───────────────────────────────────────────────────────────────
export type ChatPhase = 'ask' | 'recording' | 'working' | 'typing' | 'review' | 'done';
export type ChatStage = 'transcribing' | 'coaching';

export interface UseEveningChatOptions {
  day?: DayKey;
  fetchFn?: FetchFn;
  /** Test hook. Defaults to the real microphone. */
  startCapture?: StartCapture;
  /** Test hook. Defaults to `navigator.onLine`. */
  online?: boolean;
}

export interface UseEveningChatReturn {
  phase: ChatPhase;
  stage: ChatStage | null;
  index: number;
  total: number;
  question: string;
  track: Track;
  /** Live loudness bar, 0..100. */
  level: number;
  elapsedSec: number;
  typed: string;
  setTyped(next: string): void;
  /** The one plain line, or null when all is well. */
  line: string | null;
  failure: ChatFailure | null;
  /** The answer on screen (with feedback once the coach has answered). */
  turn: ChatTurn | null;
  turns: ChatTurn[];
  /** The moment kept for the story bank once the chat is done. */
  saved: StoryBankEntry | null;
  start(): Promise<void>;
  stop(): Promise<void>;
  typeInstead(): void;
  submitTyped(): Promise<void>;
  skip(): void;
  sayAgain(): Promise<void>;
  retryCoach(): Promise<void>;
  next(): void;
}

export function useEveningChat(opts: UseEveningChatOptions = {}): UseEveningChatReturn {
  const day = useMemo(() => opts.day ?? todayKey(), [opts.day]);
  const track = useMemo(() => todaysTrack(day), [day]);
  const questions = useMemo(() => questionsFor(day, track), [day, track]);
  const sessionId = useRef(`chat-${day}-${Date.now()}`);

  const [phase, setPhase] = useState<ChatPhase>('ask');
  const [stage, setStage] = useState<ChatStage | null>(null);
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [saved, setSaved] = useState<StoryBankEntry | null>(null);

  const alive = useRef(true);
  const capture = useRef<CaptureHandle | null>(null);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; cap?: ReturnType<typeof setTimeout> }>({});
  const lastLevelAt = useRef(0);
  const turnsRef = useRef<ChatTurn[]>([]);
  const indexRef = useRef(0);
  const phaseRef = useRef<ChatPhase>('ask');
  const busy = useRef(false);

  const fetchFn: FetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  const startCapture = opts.startCapture ?? startMicCapture;

  const go = useCallback((p: ChatPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearTimers = useCallback(() => {
    if (timers.current.tick) clearInterval(timers.current.tick);
    if (timers.current.cap) clearTimeout(timers.current.cap);
    timers.current = {};
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimers();
      capture.current?.cancel();
      capture.current = null;
    };
  }, [clearTimers]);

  const question = questions[Math.min(index, questions.length - 1)] ?? MOMENT_QUESTION;
  const turn = turns[index] ?? null;

  const setTurnAt = useCallback((i: number, t: ChatTurn) => {
    const copy = turnsRef.current.slice();
    copy[i] = t;
    turnsRef.current = copy;
    if (alive.current) setTurns(copy);
    // Keep the chat on the phone after every answer. A failed write is not his problem.
    const done = copy.filter((x): x is ChatTurn => !!x);
    const session: ChatSession = { id: sessionId.current, day, turns: done };
    void db.chats.put(session).catch(() => {});
  }, [day]);

  const fail = useCallback(
    (code: ChatFailure, nextPhase: ChatPhase) => {
      if (!alive.current) return;
      setFailure(code);
      setStage(null);
      go(nextPhase);
    },
    [go],
  );

  /** Coach one answer and show the result. Always ends in the review phase. */
  const coachAndShow = useCallback(
    async (i: number, base: ChatTurn, voicedSec?: number) => {
      setFailure(null);
      setStage('coaching');
      go('working');
      setTurnAt(i, base);
      try {
        // His known mistakes, newest first (weak spots + coach-box mistakes).
        const watch = await watchList().catch(() => [] as Array<{ wrong: string; right: string }>);
        const feedback = await coachTurn({
          question: base.question,
          transcript: base.transcript,
          track,
          wpm: base.wpm,
          loudness: base.loudness,
          voicedSec,
          watch,
          fetchFn,
          online: opts.online,
        });
        // Kept even when he closed the chat while the coach was answering:
        // the call was spent, so the answer is saved to the turn.
        setTurnAt(i, { ...base, feedback });
        void learnFromTurn(base.transcript, feedback, watch, sessionId.current);
        if (!alive.current) return;
      } catch (e) {
        if (!alive.current) return;
        setFailure(e instanceof ChatError ? e.code : 'coach');
      }
      if (!alive.current) return;
      setStage(null);
      go('review');
    },
    [fetchFn, go, opts.online, setTurnAt, track],
  );

  const finish = useCallback(() => {
    go('done');
    void saveBestMoment(day, turnsRef.current.filter(Boolean)).then((entry) => {
      if (alive.current) setSaved(entry);
    });
  }, [day, go]);

  const advance = useCallback(() => {
    clearTimers();
    setFailure(null);
    setTyped('');
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= CHAT_QUESTION_COUNT) {
      finish();
      return;
    }
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    go('ask');
  }, [clearTimers, finish, go]);

  const start = useCallback(async () => {
    if (busy.current) return;
    const p = phaseRef.current;
    if (p !== 'ask' && p !== 'typing' && p !== 'review') return;
    busy.current = true;
    try {
      setFailure(null);
      const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
      if (!online) return fail('offline', 'typing');
      let left = 1;
      try {
        left = await aiCallsLeft();
      } catch {
        left = 1;
      }
      if (left < 1) return fail('budget', 'typing');

      let handle: CaptureHandle | null = null;
      try {
        handle = await startCapture((percent) => {
          const now = performance.now();
          if (now - lastLevelAt.current < 80) return;
          lastLevelAt.current = now;
          if (alive.current) setLevel(percent);
        });
      } catch {
        handle = null;
      }
      if (!alive.current) {
        handle?.cancel();
        return;
      }
      if (!handle) return fail('mic', 'typing');

      capture.current = handle;
      setLevel(0);
      setElapsedSec(0);
      go('recording');
      timers.current.tick = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      timers.current.cap = setTimeout(() => {
        void stopRef.current();
      }, MAX_ANSWER_SEC * 1000);
    } finally {
      busy.current = false;
    }
  }, [fail, go, opts.online, startCapture]);

  const stop = useCallback(async () => {
    if (phaseRef.current !== 'recording' || busy.current) return;
    busy.current = true;
    const i = indexRef.current;
    const q = questions[i] ?? MOMENT_QUESTION;
    try {
      clearTimers();
      const handle = capture.current;
      capture.current = null;
      setStage('transcribing');
      go('working');
      setLevel(0);

      let captured: CaptureResult | null = null;
      try {
        captured = handle ? await handle.stop() : null;
      } catch {
        captured = null;
      }
      if (!alive.current) return;
      if (!captured || captured.blob.size === 0) return fail('empty', 'typing');

      let heard: TranscribeResult;
      try {
        heard = await transcribeAudio(captured.blob, fetchFn);
      } catch (e) {
        return fail(e instanceof ChatError ? e.code : 'transcribe', 'typing');
      }
      if (!alive.current) return;

      let baseline: number | undefined;
      try {
        const profile = await getProfile();
        baseline = isCalibrated(profile) ? profile.baselineDb : undefined;
      } catch {
        baseline = undefined;
      }
      const wpm = wpmFromWords(heard.words);
      const loudness = loudnessVsNormal(captured.samples, baseline);
      const voicedSec = computeVoicedSec(captured.samples);
      const base: ChatTurn = {
        question: q,
        transcript: heard.text,
        ...(wpm !== undefined ? { wpm } : {}),
        ...(loudness ? { loudness } : {}),
      };
      await coachAndShow(i, base, voicedSec > 0 ? voicedSec : undefined);
    } finally {
      busy.current = false;
    }
  }, [clearTimers, coachAndShow, fail, fetchFn, go, questions]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const typeInstead = useCallback(() => {
    if (phaseRef.current !== 'ask' && phaseRef.current !== 'review') return;
    setFailure(null);
    go('typing');
  }, [go]);

  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (text.length < 2 || phaseRef.current !== 'typing' || busy.current) return;
    busy.current = true;
    try {
      const i = indexRef.current;
      setTyped('');
      await coachAndShow(i, { question: questions[i] ?? MOMENT_QUESTION, transcript: text });
    } finally {
      busy.current = false;
    }
  }, [coachAndShow, questions, typed]);

  const retryCoach = useCallback(async () => {
    const i = indexRef.current;
    const base = turnsRef.current[i];
    if (!base || phaseRef.current !== 'review' || busy.current) return;
    // This answer is already coached: never spend another call on it.
    if (base.feedback) {
      setFailure(null);
      return;
    }
    busy.current = true;
    try {
      await coachAndShow(i, { question: base.question, transcript: base.transcript, wpm: base.wpm, loudness: base.loudness });
    } finally {
      busy.current = false;
    }
  }, [coachAndShow]);

  const sayAgain = useCallback(async () => {
    await start();
  }, [start]);

  const skip = useCallback(() => {
    const p = phaseRef.current;
    if (p !== 'ask' && p !== 'typing') return;
    advance();
  }, [advance]);

  const next = useCallback(() => {
    if (phaseRef.current !== 'review') return;
    advance();
  }, [advance]);

  return {
    phase,
    stage,
    index,
    total: CHAT_QUESTION_COUNT,
    question,
    track,
    level,
    elapsedSec,
    typed,
    setTyped,
    line: failure ? CHAT_LINES[failure] : null,
    failure,
    turn,
    turns: turns.filter(Boolean),
    saved,
    start,
    stop,
    typeInstead,
    submitTyped,
    skip,
    sayAgain,
    retryCoach,
    next,
  };
}
