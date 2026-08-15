import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getProfile, type OutboxRow } from '../db/db';
import type {
  CardEvent,
  DayRecord,
  InboxItem,
  LabSession,
  Review,
  VoiceSample,
} from '../types/contract';

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

export function supabase(): SupabaseClient | null {
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

/** Magic-link sign-in. One account, his own. */
export async function signIn(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'sync not configured' };
  const { error } = await sb.auth.signInWithOtp({ email });
  return error ? { ok: false, error: error.message } : { ok: true };
}

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
  if (rows.length === 0) return 0;

  // Collapse repeats — only the latest state of each row matters.
  const latest = new Map<string, OutboxRow>();
  for (const r of rows) latest.set(`${r.table}:${r.key}`, r);

  let sent = 0;
  const doneSeqs: number[] = [];

  for (const [, row] of latest) {
    const payload = await materialise(row, userId);
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

  const profile = await getProfile();
  await db.profile.put({ ...profile, userId, lastSyncAt: Date.now() });

  return sent;
}

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
  }
}

const reviewRow = (r: Review, userId: string) => ({
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
});

const eventRow = (e: CardEvent, userId: string) => ({
  user_id: userId,
  id: e.id,
  card_id: e.cardId,
  card_type: e.cardType,
  at: new Date(e.at).toISOString(),
  grade: e.grade,
  ms_spent: e.msSpent,
  mode: e.mode,
  measure: e.measure ?? null,
});

const dayRow = (d: DayRecord, userId: string) => ({
  user_id: userId,
  date: d.date,
  core_three_done: d.coreThreeDone,
  cards_completed: d.cardsCompleted,
  seconds_active: d.secondsActive,
  urges_redirected: d.urgesRedirected,
  best_mpt_sec: d.bestMptSec ?? null,
  lab_session_done: d.labSessionDone ?? false,
  lab_seconds: d.labSeconds ?? 0,
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

const inboxRow = (i: InboxItem, userId: string) => ({
  user_id: userId,
  id: i.id,
  created_at: new Date(i.createdAt).toISOString(),
  text: i.text,
  status: i.status,
  processed_at: i.processedAt ? new Date(i.processedAt).toISOString() : null,
  generated_card_ids: i.generatedCardIds ?? null,
});

/**
 * One-shot restore after signing in on a fresh device. Local rows win on
 * conflict, because the local copy is the one he has actually been using.
 */
export async function restore(): Promise<{
  reviews: number;
  days: number;
  inbox: number;
  labSessions: number;
  voiceSamples: number;
}> {
  const empty = { reviews: 0, days: 0, inbox: 0, labSessions: 0, voiceSamples: 0 };
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return empty;

  const [rv, dy, ib, ls, vs, pf] = await Promise.all([
    sb.from('reviews').select('*'),
    sb.from('days').select('*'),
    sb.from('inbox').select('*'),
    sb.from('lab_sessions').select('*'),
    sb.from('voice_samples').select('*'),
    sb.from('profile').select('*').maybeSingle(),
  ]);

  let reviews = 0;
  for (const r of rv.data ?? []) {
    if (await db.reviews.get(r.card_id)) continue;
    await db.reviews.put({
      cardId: r.card_id,
      state: r.state,
      due: r.due,
      intervalDays: r.interval_days,
      ease: Number(r.ease),
      reps: r.reps,
      lapses: r.lapses,
      lastGrade: r.last_grade ?? undefined,
      lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : undefined,
    });
    reviews++;
  }

  let days = 0;
  for (const d of dy.data ?? []) {
    if (await db.days.get(d.date)) continue;
    await db.days.put({
      date: d.date,
      coreThreeDone: d.core_three_done,
      cardsCompleted: d.cards_completed,
      secondsActive: d.seconds_active,
      urgesRedirected: d.urges_redirected,
      bestMptSec: d.best_mpt_sec ?? undefined,
      labSessionDone: d.lab_session_done ?? undefined,
      labSeconds: d.lab_seconds ?? undefined,
    });
    days++;
  }

  let inbox = 0;
  for (const i of ib.data ?? []) {
    if (await db.inbox.get(i.id)) continue;
    await db.inbox.put({
      id: i.id,
      createdAt: Date.parse(i.created_at),
      text: i.text,
      status: i.status,
      processedAt: i.processed_at ? Date.parse(i.processed_at) : undefined,
      generatedCardIds: i.generated_card_ids ?? undefined,
    });
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

  // Calibration follows the samples. Local wins if this device already has it.
  const local = await getProfile();
  const remote = pf.data as Record<string, unknown> | null;
  if (remote && local.baselineDb === undefined && remote.baseline_db != null) {
    await db.profile.put({
      ...local,
      baselineDb: Number(remote.baseline_db),
      calibrationSamples: Number(remote.calibration_samples ?? 0),
      targetBandDb:
        remote.target_band_min_db != null && remote.target_band_max_db != null
          ? {
              minDb: Number(remote.target_band_min_db),
              maxDb: Number(remote.target_band_max_db),
            }
          : undefined,
      calibratedAt: remote.calibrated_at ? Date.parse(String(remote.calibrated_at)) : undefined,
    });
  }

  return { reviews, days, inbox, labSessions, voiceSamples };
}
