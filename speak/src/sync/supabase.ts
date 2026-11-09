import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getProfile, type OutboxRow } from '../db/db';
import type {
  Card,
  CardEvent,
  CardFeedback,
  CardType,
  CardViewedEvent,
  DayRecord,
  FeedbackReason,
  InboxItem,
  LabSession,
  ModuleCard,
  ModuleId,
  ModuleLevel,
  Profile,
  Review,
  SavedReview,
  SeenTerm,
  VoiceGoal,
  VoiceSample,
  WeekPlan,
} from '../types/contract';
import { VOICE_GOALS } from '../features/auto/plan';
import { toDayKey } from '../lib/date';

/**
 * Sync and backup. Never the read path — see src/db/db.ts.
 *
 * The app is fully usable signed out; sync is opt-in and failure is silent by
 * design. Nothing in a session may block on this file.
 *
 * Phase 0 does push plus a one-shot restore-on-sign-in. Two-way live merge
 * lands in Phase 1, when there is actually a second device in play.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;
/** `undefined` = the real client from env; anything else wins (tests only). */
let testClient: SupabaseClient | null | undefined;

/**
 * Tests only: swap in a fake client, or `null` for "not set up". Never real
 * keys in a test. The override stays until the next call.
 */
export function setSupabaseForTests(c: SupabaseClient | null): void {
  testClient = c;
}

export function supabase(): SupabaseClient | null {
  if (testClient !== undefined) return testClient;
  if (!URL || !ANON) return null;
  client ??= createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export function syncConfigured(): boolean {
  return supabase() !== null;
}

export async function currentUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

/** The signed-in email, or null. */
export async function currentEmail(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

/**
 * Step 1 of the 6-digit email code sign-in (answer Q10). No redirect link: the
 * email shows `{{ .Token }}` (docs/SETUP.md step 1) and he types it back in.
 */
export async function sendCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Backup is not switched on yet' };
  const clean = email.trim();
  if (!clean) return { ok: false, error: 'Type your email first' };
  const { error } = await sb.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Step 2: the 6-digit code from the email. */
export async function verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Backup is not switched on yet' };
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return { ok: false, error: 'The code is 6 digits' };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
  if (error) return { ok: false, error: error.message };
  if (!data.user && !data.session) return { ok: false, error: 'That code did not work' };
  return { ok: true };
}

/** Old name, kept for any caller: sends the code. */
export const signIn = sendCode;

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

// ─────────────────────────────────────────────────────────────────────────────

const TABLE_KEY: Record<OutboxRow['table'], string> = {
  reviews: 'card_id',
  events: 'id',
  days: 'date',
  inbox: 'id',
  profile: 'user_id',
  cards: 'id',
  labSessions: 'id',
  voiceSamples: 'id',
  feedback: 'id',
  seen: 'id',
  savedReviews: 'card_id',
};

/** Dexie table name → Postgres table name. They differ only in case style. */
const REMOTE_TABLE: Record<OutboxRow['table'], string> = {
  reviews: 'reviews',
  events: 'events',
  days: 'days',
  inbox: 'inbox',
  profile: 'profile',
  cards: 'cards',
  labSessions: 'lab_sessions',
  voiceSamples: 'voice_samples',
  feedback: 'card_feedback',
  seen: 'seen_terms',
  savedReviews: 'saved_reviews',
};

/**
 * Drain the outbox. Returns how many rows went up. Safe to call whenever —
 * it no-ops when signed out, offline, or unconfigured.
 */
export async function push(): Promise<number> {
  const sb = supabase();
  if (!sb) return 0;
  const userId = await currentUserId();
  if (!userId) return 0;

  const rows = await db.outbox.orderBy('seq').limit(500).toArray();
  if (rows.length === 0) {
    // Nothing waiting = everything is backed up as of now.
    await stampSync(userId);
    return 0;
  }

  // Collapse repeats — only the latest state of each row matters.
  const latest = new Map<string, OutboxRow>();
  for (const r of rows) latest.set(`${r.table}:${r.key}`, r);

  let sent = 0;
  const doneSeqs: number[] = [];

  for (const [, row] of latest) {
    const payload = await materialise(row, userId);
    if (payload === null && (row.op === 'delete' || DELETE_WHEN_GONE.has(row.table))) {
      // Gone on the phone (an un-♡'d card, say) → gone in the backup too, or a
      // restore would bring it back on the next phone.
      const { error } = await sb
        .from(REMOTE_TABLE[row.table])
        .delete()
        .eq('user_id', userId)
        .eq(TABLE_KEY[row.table], row.key);
      if (error) {
        console.warn('[sync] delete failed', row.table, error.message);
        continue;
      }
      sent++;
      doneSeqs.push(...rows.filter((r) => r.table === row.table && r.key === row.key).map((r) => r.seq!));
      continue;
    }
    if (payload === null) {
      doneSeqs.push(...rows.filter((r) => r.table === row.table && r.key === row.key).map((r) => r.seq!));
      continue;
    }

    const { error } = await sb
      .from(REMOTE_TABLE[row.table])
      .upsert(payload, { onConflict: `user_id,${TABLE_KEY[row.table]}` });

    if (error) {
      console.warn('[sync] push failed', row.table, error.message);
      continue; // leave it in the outbox and try again next time
    }

    sent++;
    doneSeqs.push(...rows.filter((r) => r.table === row.table && r.key === row.key).map((r) => r.seq!));
  }

  if (doneSeqs.length) await db.outbox.bulkDelete(doneSeqs);

  await stampSync(userId);

  return sent;
}

async function stampSync(userId: string): Promise<void> {
  const profile = await getProfile();
  await db.profile.put({ ...profile, userId, lastSyncAt: Date.now() });
}

/** v7 tables where a row missing on the phone means "removed": delete it remotely. */
const DELETE_WHEN_GONE = new Set<OutboxRow['table']>(['feedback', 'seen', 'savedReviews']);

async function materialise(row: OutboxRow, userId: string): Promise<Record<string, unknown> | null> {
  switch (row.table) {
    case 'reviews': {
      const r = await db.reviews.get(row.key);
      return r ? reviewRow(r, userId) : null;
    }
    case 'events': {
      const e = await db.events.get(row.key);
      return e ? eventRow(e, userId) : null;
    }
    case 'days': {
      const d = await db.days.get(row.key);
      return d ? dayRow(d, userId) : null;
    }
    case 'inbox': {
      const i = await db.inbox.get(row.key);
      return i ? inboxRow(i, userId) : null;
    }
    case 'profile': {
      const p = await getProfile();
      return {
        user_id: userId,
        baseline_wpm: p.baselineWpm ?? null,
        target_wpm: p.targetWpm ?? null,
        baseline_db: p.baselineDb ?? null,
        calibration_samples: p.calibrationSamples ?? 0,
        target_band_min_db: p.targetBandDb?.minDb ?? null,
        target_band_max_db: p.targetBandDb?.maxDb ?? null,
        calibrated_at: p.calibratedAt ? new Date(p.calibratedAt).toISOString() : null,
        week_plan: weekPlanToRemote(p.weekPlan),
        module_levels: moduleLevelsToRemote(p.moduleLevels),
      };
    }
    case 'labSessions': {
      const s = await db.labSessions.get(row.key);
      return s ? labSessionRow(s, userId) : null;
    }
    case 'voiceSamples': {
      const v = await db.voiceSamples.get(row.key);
      return v ? voiceSampleRow(v, userId) : null;
    }
    case 'cards': {
      const c = await db.cards.get(row.key);
      if (!c) return null;
      const { id, type, lang, tags, source, status, batchId, seedId, createdAt, ...payload } = c;
      return {
        user_id: userId,
        id,
        type,
        lang,
        tags,
        source,
        status,
        payload,
        batch_id: batchId ?? null,
        seed_id: seedId ?? null,
        created_at: new Date(createdAt).toISOString(),
      };
    }
    case 'feedback': {
      const f = await db.feedback.get(row.key);
      return f ? feedbackRow(f, userId) : null;
    }
    case 'seen': {
      const t = await db.seen.get(row.key);
      return t ? seenRow(t, userId) : null;
    }
    case 'savedReviews': {
      const r = await db.savedReviews.get(row.key);
      return r ? savedReviewRow(r, userId) : null;
    }
  }
}

export const reviewRow = (r: Review, userId: string) => ({
  user_id: userId,
  card_id: r.cardId,
  state: r.state,
  due: r.due,
  interval_days: r.intervalDays,
  ease: r.ease,
  reps: r.reps,
  lapses: r.lapses,
  last_grade: r.lastGrade ?? null,
  last_seen_at: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
  skipped_at: r.skippedAt ? new Date(r.skippedAt).toISOString() : null,
});

export type ReviewRow = ReturnType<typeof reviewRow>;

/** Remote row → local. The one place restore() maps reviews, tested for round-trip. */
export const reviewFromRow = (r: ReviewRow): Review => ({
  cardId: r.card_id,
  state: r.state,
  due: r.due,
  intervalDays: r.interval_days,
  ease: Number(r.ease),
  reps: r.reps,
  lapses: r.lapses,
  lastGrade: r.last_grade ?? undefined,
  lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : undefined,
  skippedAt: r.skipped_at ? Date.parse(r.skipped_at) : undefined,
});

/**
 * `type` is new in v7. `grade`, `card_id`, `card_type` and `mode` are nullable
 * remotely from the v7 block of schema.sql — a `card_viewed` event has no grade.
 */
export const eventRow = (e: CardEvent, userId: string) => ({
  user_id: userId,
  id: e.id,
  type: e.type as string,
  card_id: (e.cardId ?? null) as string | null,
  card_type: (e.cardType ?? null) as string | null,
  at: new Date(e.at).toISOString(),
  grade: (e.grade ?? null) as string | null,
  ms_spent: e.msSpent ?? 0,
  mode: (e.mode ?? null) as string | null,
  measure: e.measure ?? null,
});

export type EventRow = ReturnType<typeof eventRow>;

/**
 * Remote row → local, `card_viewed` only: the one kind restore brings back
 * (the feed's view history). Anything else, or a row with no card, is null.
 */
export function viewEventFromRow(r: EventRow): CardEvent | null {
  if (r.type !== 'card_viewed' || !r.card_id || !r.card_type) return null;
  const at = Date.parse(r.at);
  if (!Number.isFinite(at)) return null;
  const e: CardViewedEvent = {
    id: r.id,
    type: 'card_viewed',
    at,
    date: toDayKey(new Date(at)),
    cardId: r.card_id,
    cardType: r.card_type as CardType,
    ...(r.ms_spent ? { msSpent: Number(r.ms_spent) } : {}),
    ...(r.mode === 'endless' ? { mode: 'endless' as const } : {}),
  };
  return e;
}

// ── v7 (2026-11-08): feedback, seen list, ♡ Sunday review, AI cards ────────

const MODULE_IDS: readonly string[] = ['words', 'smalltalk', 'better', 'phrases', 'stories'];
const isModule = (v: unknown): v is ModuleId => typeof v === 'string' && MODULE_IDS.includes(v);

export const feedbackRow = (f: CardFeedback, userId: string) => ({
  user_id: userId,
  id: f.id,
  card_id: f.cardId,
  module: f.module,
  thumb: (f.thumb ?? null) as string | null,
  reasons: [...f.reasons] as string[],
  comment: f.comment ?? null,
  reply: f.reply,
  at: new Date(f.at).toISOString(),
  hidden: f.hidden ?? false,
});

export type FeedbackRow = ReturnType<typeof feedbackRow>;

const REASONS: readonly FeedbackReason[] = ['too_easy', 'too_hard', 'confusing', 'wrong_english', 'loved'];

/** Remote row → local. Absent optionals come back as absent, unknown reasons are dropped. */
export const feedbackFromRow = (r: FeedbackRow): CardFeedback => ({
  id: r.id,
  cardId: r.card_id,
  module: r.module,
  ...(r.thumb === 'up' || r.thumb === 'down' ? { thumb: r.thumb } : {}),
  reasons: (r.reasons ?? []).filter((x): x is FeedbackReason => (REASONS as readonly string[]).includes(x)),
  ...(r.comment != null ? { comment: r.comment } : {}),
  reply: r.reply ?? '',
  at: Date.parse(r.at),
  ...(r.hidden ? { hidden: true } : {}),
});

export const seenRow = (t: SeenTerm, userId: string) => ({
  user_id: userId,
  id: t.id,
  module: t.module,
  head: t.head,
  card_id: t.cardId,
  at: new Date(t.at).toISOString(),
});

export type SeenRow = ReturnType<typeof seenRow>;

export const seenFromRow = (r: SeenRow): SeenTerm => ({
  id: r.id,
  module: r.module,
  head: r.head,
  cardId: r.card_id,
  at: Date.parse(r.at),
});

export const savedReviewRow = (r: SavedReview, userId: string) => ({
  user_id: userId,
  card_id: r.cardId,
  module: r.module,
  saved_at: new Date(r.savedAt).toISOString(),
  step: r.step as number,
  due: r.due,
  rights: r.rights,
  retired_at: r.retiredAt ? new Date(r.retiredAt).toISOString() : null,
  last_answer: (r.lastAnswer ?? null) as string | null,
});

export type SavedReviewRow = ReturnType<typeof savedReviewRow>;

export const savedReviewFromRow = (r: SavedReviewRow): SavedReview => ({
  cardId: r.card_id,
  module: r.module,
  savedAt: Date.parse(r.saved_at),
  step: r.step === 1 || r.step === 2 ? r.step : 0,
  due: r.due,
  rights: Number(r.rights ?? 0),
  ...(r.retired_at ? { retiredAt: Date.parse(r.retired_at) } : {}),
  ...(r.last_answer === 'knew' || r.last_answer === 'not_yet' ? { lastAnswer: r.last_answer } : {}),
});

/** Remote `cards` row → local module card. Only AI-written v7 cards come back (seed cards ship with the app). */
export function aiModuleCardFromRow(r: Record<string, unknown>): ModuleCard | null {
  if (r.type !== 'module' || r.source !== 'ai' || typeof r.id !== 'string') return null;
  const payload = r.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const card: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
    id: r.id,
    type: 'module',
    lang: typeof r.lang === 'string' ? r.lang : 'en',
    tags: Array.isArray(r.tags) ? r.tags : [],
    source: 'ai',
    status: typeof r.status === 'string' ? r.status : 'active',
    createdAt: typeof r.created_at === 'string' ? Date.parse(r.created_at) : Date.now(),
    ...(typeof r.batch_id === 'string' ? { batchId: r.batch_id } : {}),
    ...(typeof r.seed_id === 'string' ? { seedId: r.seed_id } : {}),
  };
  if (!isModule(card.module)) return null;
  return card as unknown as ModuleCard;
}

/** `Profile.moduleLevels` → `profile.module_levels` (jsonb). Null when never moved. */
export const moduleLevelsToRemote = (
  m: Profile['moduleLevels'],
): Partial<Record<ModuleId, ModuleLevel>> | null => (m && Object.keys(m).length > 0 ? { ...m } : null);

/** Remote `module_levels` → `Profile.moduleLevels`. Unknown modules and levels outside 1-5 are dropped. */
export function moduleLevelsFromRemote(v: unknown): Partial<Record<ModuleId, ModuleLevel>> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Partial<Record<ModuleId, ModuleLevel>> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (isModule(k) && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5) {
      out[k] = n as ModuleLevel;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const dayRow = (d: DayRecord, userId: string) => ({
  user_id: userId,
  date: d.date,
  core_three_done: d.coreThreeDone,
  cards_completed: d.cardsCompleted,
  seconds_active: d.secondsActive,
  urges_redirected: d.urgesRedirected,
  best_mpt_sec: d.bestMptSec ?? null,
  lab_session_done: d.labSessionDone ?? false,
  lab_seconds: d.labSeconds ?? 0,
  xp: d.xp ?? 0,
  spoken_reps: d.spokenReps ?? 0,
  challenge: d.challenge ?? null,
  challenge_result: d.challengeResult ?? null,
});

export type DayRow = ReturnType<typeof dayRow>;

/** Remote row → local. The one place restore() maps days, tested for round-trip. */
export const dayFromRow = (d: DayRow): DayRecord => ({
  date: d.date,
  coreThreeDone: d.core_three_done,
  cardsCompleted: d.cards_completed,
  secondsActive: d.seconds_active,
  urgesRedirected: d.urges_redirected,
  bestMptSec: d.best_mpt_sec ?? undefined,
  labSessionDone: d.lab_session_done ?? undefined,
  labSeconds: d.lab_seconds ?? undefined,
  xp: d.xp ?? undefined,
  spokenReps: d.spoken_reps ?? undefined,
  challenge: d.challenge ?? undefined,
  challengeResult: d.challenge_result ?? undefined,
});

const labSessionRow = (s: LabSession, userId: string) => ({
  user_id: userId,
  id: s.id,
  date: s.date,
  started_at: new Date(s.startedAt).toISOString(),
  ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
  completed_step_ids: s.completedStepIds,
  transfer_reps: s.transferReps,
  avg_db: s.avgDb ?? null,
  aborted: s.aborted,
});

const voiceSampleRow = (v: VoiceSample, userId: string) => ({
  user_id: userId,
  id: v.id,
  at: new Date(v.at).toISOString(),
  date: v.date,
  kind: v.kind,
  value: v.value,
  session_id: v.sessionId ?? null,
});

export const inboxRow = (i: InboxItem, userId: string) => ({
  user_id: userId,
  id: i.id,
  created_at: new Date(i.createdAt).toISOString(),
  text: i.text,
  status: i.status,
  processed_at: i.processedAt ? new Date(i.processedAt).toISOString() : null,
  generated_card_ids: i.generatedCardIds ?? null,
  kind: i.kind ?? null,
  subject: i.subject ?? null,
  fix: i.fix ?? null,
  fail_reason: i.failReason ?? null,
  attempts: i.attempts ?? null,
  origin: i.origin ?? null,
});

export type InboxRow = ReturnType<typeof inboxRow>;

/** Remote row → local. The one place restore() maps inbox items, tested for round-trip. */
export const inboxFromRow = (i: InboxRow): InboxItem => ({
  id: i.id,
  createdAt: Date.parse(i.created_at),
  text: i.text,
  status: i.status,
  processedAt: i.processed_at ? Date.parse(i.processed_at) : undefined,
  generatedCardIds: i.generated_card_ids ?? undefined,
  kind: i.kind ?? undefined,
  subject: i.subject ?? undefined,
  fix: i.fix ?? undefined,
  failReason: i.fail_reason ?? undefined,
  attempts: i.attempts ?? undefined,
  origin: (i.origin as InboxItem['origin']) ?? undefined,
});

/** `Profile.weekPlan` → `profile.week_plan` (jsonb). Null when there is no plan. */
export const weekPlanToRemote = (p: WeekPlan | undefined): WeekPlan | null =>
  p ? { ...p } : null;

/**
 * Remote `week_plan` jsonb → `Profile.weekPlan`. Structural only — a shape
 * this backup never wrote is dropped whole rather than half-restored.
 */
export function weekPlanFromRemote(v: unknown): WeekPlan | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const c = v as Record<string, unknown>;
  if (typeof c.createdAt !== 'number' || !Number.isFinite(c.createdAt)) return undefined;
  if (typeof c.note !== 'string' || !c.note.trim()) return undefined;

  // `{}` is legitimate — `applyPlanToProfile` snapshots an empty
  // `previousTypeWeights` when the profile had none. Presence = plain object.
  const weights = (raw: unknown): Record<string, number> | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
    );
    return Object.fromEntries(entries);
  };
  const typeWeights = weights(c.typeWeights);
  const previousTypeWeights = weights(c.previousTypeWeights);
  if (!typeWeights || !previousTypeWeights) return undefined;

  const challengeFocus =
    typeof c.challengeFocus === 'string' &&
    (VOICE_GOALS as readonly string[]).includes(c.challengeFocus)
      ? (c.challengeFocus as VoiceGoal)
      : undefined;

  let focusWords: string[] | undefined;
  if (Array.isArray(c.focusWords)) {
    const words = c.focusWords
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim())
      .slice(0, 5);
    if (words.length > 0) focusWords = words;
  }

  return {
    createdAt: c.createdAt,
    typeWeights,
    previousTypeWeights,
    ...(challengeFocus ? { challengeFocus } : {}),
    ...(focusWords ? { focusWords } : {}),
    note: c.note.trim(),
  };
}

/**
 * One-shot restore after signing in on a fresh device. Local rows win on
 * conflict, because the local copy is the one he has actually been using.
 */
export interface RestoreCounts {
  reviews: number;
  days: number;
  inbox: number;
  labSessions: number;
  voiceSamples: number;
  // v7 (2026-11-08)
  feedback: number;
  seen: number;
  savedReviews: number;
  events: number;
  cards: number;
}

export async function restore(): Promise<RestoreCounts> {
  const empty: RestoreCounts = {
    reviews: 0,
    days: 0,
    inbox: 0,
    labSessions: 0,
    voiceSamples: 0,
    feedback: 0,
    seen: 0,
    savedReviews: 0,
    events: 0,
    cards: 0,
  };
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return empty;

  const [rv, dy, ib, ls, vs, pf, fb, sn, sr, ev, cd] = await Promise.all([
    sb.from('reviews').select('*'),
    sb.from('days').select('*'),
    sb.from('inbox').select('*'),
    sb.from('lab_sessions').select('*'),
    sb.from('voice_samples').select('*'),
    sb.from('profile').select('*').maybeSingle(),
    sb.from('card_feedback').select('*'),
    sb.from('seen_terms').select('*'),
    sb.from('saved_reviews').select('*'),
    sb.from('events').select('*').eq('type', 'card_viewed'),
    sb.from('cards').select('*').eq('source', 'ai').eq('type', 'module'),
  ]);

  // ── v7: the seen list, ♡ reviews, feedback, view history and AI cards. Without
  // these a new phone re-shows every card he has already seen and loses the
  // cards the AI wrote for him. Local wins, row by row.
  let feedback = 0;
  for (const r of (fb.data ?? []) as FeedbackRow[]) {
    if (await db.feedback.get(r.id)) continue;
    await db.feedback.put(feedbackFromRow(r));
    feedback++;
  }

  let seen = 0;
  for (const r of (sn.data ?? []) as SeenRow[]) {
    if (await db.seen.get(r.id)) continue;
    await db.seen.put(seenFromRow(r));
    seen++;
  }

  let savedReviews = 0;
  for (const r of (sr.data ?? []) as SavedReviewRow[]) {
    if (await db.savedReviews.get(r.card_id)) continue;
    await db.savedReviews.put(savedReviewFromRow(r));
    savedReviews++;
  }

  let events = 0;
  for (const r of (ev.data ?? []) as EventRow[]) {
    const e = viewEventFromRow(r);
    if (!e || (await db.events.get(e.id))) continue;
    await db.events.put(e);
    events++;
  }

  let cards = 0;
  for (const r of (cd.data ?? []) as Record<string, unknown>[]) {
    const c = aiModuleCardFromRow(r);
    if (!c || (await db.cards.get(c.id))) continue;
    await db.cards.put(c as unknown as Card);
    cards++;
  }

  let reviews = 0;
  for (const r of (rv.data ?? []) as ReviewRow[]) {
    if (await db.reviews.get(r.card_id)) continue;
    await db.reviews.put(reviewFromRow(r));
    reviews++;
  }

  let days = 0;
  for (const d of (dy.data ?? []) as DayRow[]) {
    if (await db.days.get(d.date)) continue;
    await db.days.put(dayFromRow(d));
    days++;
  }

  let inbox = 0;
  for (const i of (ib.data ?? []) as InboxRow[]) {
    if (await db.inbox.get(i.id)) continue;
    await db.inbox.put(inboxFromRow(i));
    inbox++;
  }

  let labSessions = 0;
  for (const s of ls.data ?? []) {
    if (await db.labSessions.get(s.id)) continue;
    await db.labSessions.put({
      id: s.id,
      date: s.date,
      startedAt: Date.parse(s.started_at),
      endedAt: s.ended_at ? Date.parse(s.ended_at) : undefined,
      completedStepIds: s.completed_step_ids ?? [],
      transferReps: s.transfer_reps ?? 0,
      avgDb: s.avg_db ?? undefined,
      aborted: s.aborted ?? false,
    });
    labSessions++;
  }

  // The twelve-week trend lines. Without these a fresh device shows a flat
  // chart and re-runs week-1 calibration, which is the one thing that must not
  // silently happen — the whole retention hook is day 1 against day 56.
  let voiceSamples = 0;
  for (const v of vs.data ?? []) {
    if (await db.voiceSamples.get(v.id)) continue;
    await db.voiceSamples.put({
      id: v.id,
      at: Date.parse(v.at),
      date: v.date,
      kind: v.kind,
      value: Number(v.value),
      sessionId: v.session_id ?? undefined,
    });
    voiceSamples++;
  }

  // Calibration and the weekly plan follow the samples. Local wins if this
  // device already has them.
  const local = await getProfile();
  const remote = pf.data as Record<string, unknown> | null;
  if (remote) {
    const next: Profile = { ...local };
    let changed = false;
    if (local.baselineDb === undefined && remote.baseline_db != null) {
      next.baselineDb = Number(remote.baseline_db);
      next.calibrationSamples = Number(remote.calibration_samples ?? 0);
      next.targetBandDb =
        remote.target_band_min_db != null && remote.target_band_max_db != null
          ? {
              minDb: Number(remote.target_band_min_db),
              maxDb: Number(remote.target_band_max_db),
            }
          : undefined;
      next.calibratedAt = remote.calibrated_at ? Date.parse(String(remote.calibrated_at)) : undefined;
      changed = true;
    }
    if (local.weekPlan === undefined && remote.week_plan != null) {
      const plan = weekPlanFromRemote(remote.week_plan);
      if (plan) {
        next.weekPlan = plan;
        changed = true;
      }
    }
    if (local.moduleLevels === undefined && remote.module_levels != null) {
      const levels = moduleLevelsFromRemote(remote.module_levels);
      if (levels) {
        next.moduleLevels = levels;
        changed = true;
      }
    }
    if (changed) await db.profile.put(next);
  }

  return { reviews, days, inbox, labSessions, voiceSamples, feedback, seen, savedReviews, events, cards };
}
