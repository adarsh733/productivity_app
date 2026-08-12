import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getProfile, type OutboxRow } from '../db/db';
import type { CardEvent, DayRecord, InboxItem, Review } from '../types/contract';

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
      .from(row.table)
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
      return { user_id: userId, baseline_wpm: p.baselineWpm ?? null, target_wpm: p.targetWpm ?? null };
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
export async function restore(): Promise<{ reviews: number; days: number; inbox: number }> {
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return { reviews: 0, days: 0, inbox: 0 };

  const [rv, dy, ib] = await Promise.all([
    sb.from('reviews').select('*'),
    sb.from('days').select('*'),
    sb.from('inbox').select('*'),
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

  return { reviews, days, inbox };
}
