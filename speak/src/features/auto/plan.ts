import type {
  Card,
  CardEvent,
  InboxItem,
  Millis,
  PlanWeekPayload,
  PlanWeekResult,
  Profile,
  Review,
  VoiceGoal,
  VoiceSample,
  VoiceSampleKind,
  WeekPlan,
} from '../../types/contract';
import { LAB_RULES } from '../../types/contract';
import { db, enqueue, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import { AI_DRAFT_TYPES, aiPost, type FetchFn } from '../coach/pipeline';
import { tryConsumeAiCall } from './budget';
import { identityTerm } from './reject';
import { readMpt } from '../lab/calibration';
import { loadPaceSamples, median, paceBaseline, paceTarget, type PaceAttempt } from '../speak/pace';

/**
 * AG-008 stage 5 — the weekly coach plan.
 *
 * Runs on the first app open at least 7 days after the last plan (or after
 * profile creation). One `plan_week` call summarises last week — per-type
 * views / again-rate / skips, voice numbers, recent coach subjects — and the
 * answer is clamped **in this file** into `Profile.weekPlan`. The plan stores
 * no cards, so it needs no `verify_batch`: the clamp is the safety, and a
 * provider that ignores every instruction still cannot push a value outside
 * [0.5, 1.5], invent a type, invent a voice branch, or smuggle in a word that
 * is not already a card.
 *
 * Local-only gate `ai.weekPlanAt` (db.meta, never synced) records the last
 * ATTEMPT: claimed before the network call, released again when the call
 * fails so the next app open retries. Undo clears `weekPlan` and restores
 * `previousTypeWeights`; it does not touch the gate — undoing is not a reason
 * to buy another plan.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const PLAN_GAP_MS = 7 * DAY_MS;
export const PLAN_MIN_WEIGHT = 0.5;
export const PLAN_MAX_WEIGHT = 1.5;
export const PLAN_MAX_FOCUS_WORDS = 5;
export const PLAN_MAX_NOTE = 90;

const PLAN_MAX_SUBJECTS = 10;

/** Local-only last-attempt timestamp (db.meta). Never synced. */
export const PLAN_META = 'ai.weekPlanAt';

/** The voice-goal branches `buildDailyChallenge.pickVoiceGoal` can produce. */
export const VOICE_GOALS: readonly VoiceGoal[] = ['softer', 'slower', 'pause_first'];

/** What survives the clamp. `note` is required — a plan must be visible + undoable. */
export interface ClampedPlan {
  typeWeights: Record<string, number>;
  challengeFocus?: VoiceGoal;
  focusWords?: string[];
  note: string;
}

function cleanNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, PLAN_MAX_NOTE);
}

function clampWeight(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(Math.min(PLAN_MAX_WEIGHT, Math.max(PLAN_MIN_WEIGHT, v)) * 100) / 100;
}

/**
 * The whole safety layer, pure. Every rule from the brief: weights in
 * [0.5, 1.5] for allowed types only, one of the existing voice branches,
 * ≤ 5 focus words that already exist as cards, note ≤ 90 chars.
 * null when there is no usable note (see `ClampedPlan`).
 */
export function clampPlan(
  raw: PlanWeekResult,
  knownWords: ReadonlyMap<string, string>,
): ClampedPlan | null {
  const note = cleanNote(raw.note);
  if (!note) return null;

  const typeWeights: Record<string, number> = {};
  if (raw.typeWeights && typeof raw.typeWeights === 'object') {
    for (const type of AI_DRAFT_TYPES) {
      const weight = clampWeight((raw.typeWeights as Record<string, unknown>)[type]);
      if (weight !== null) typeWeights[type] = weight;
    }
  }

  const challengeFocus =
    typeof raw.challengeFocus === 'string' &&
    (VOICE_GOALS as readonly string[]).includes(raw.challengeFocus)
      ? (raw.challengeFocus as VoiceGoal)
      : undefined;

  let focusWords: string[] | undefined;
  if (Array.isArray(raw.focusWords)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const w of raw.focusWords) {
      if (typeof w !== 'string') continue;
      const canonical = knownWords.get(w.trim().toLowerCase());
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(canonical);
      if (out.length >= PLAN_MAX_FOCUS_WORDS) break;
    }
    if (out.length > 0) focusWords = out;
  }

  return {
    typeWeights,
    ...(challengeFocus ? { challengeFocus } : {}),
    ...(focusWords ? { focusWords } : {}),
    note,
  };
}

/** Active-card headlines by lowercase identity term → canonical casing. */
export function knownWordMap(cards: readonly Card[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cards) {
    if (c.status !== 'active') continue;
    const term = (identityTerm(c) ?? '').trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (!map.has(key)) map.set(key, term);
  }
  return map;
}

/** Store the plan on the profile; snapshot the old weights for Undo. */
export function applyPlanToProfile(profile: Profile, plan: ClampedPlan, now: Millis): Profile {
  const previousTypeWeights = { ...(profile.typeWeights ?? {}) };
  const merged = { ...previousTypeWeights, ...plan.typeWeights };
  const weekPlan: WeekPlan = {
    createdAt: now,
    typeWeights: { ...plan.typeWeights },
    ...(plan.challengeFocus ? { challengeFocus: plan.challengeFocus } : {}),
    ...(plan.focusWords ? { focusWords: [...plan.focusWords] } : {}),
    note: plan.note,
    previousTypeWeights,
  };
  return {
    ...profile,
    ...(Object.keys(merged).length > 0 ? { typeWeights: merged } : {}),
    weekPlan,
  };
}

/** Inverse of `applyPlanToProfile`. No plan ⇒ same profile, untouched. */
export function undoWeekPlan(profile: Profile): Profile {
  const plan = profile.weekPlan;
  if (!plan) return profile;
  const next: Profile = { ...profile };
  delete next.weekPlan;
  const previous = plan.previousTypeWeights;
  if (previous && Object.keys(previous).length > 0) next.typeWeights = { ...previous };
  else delete next.typeWeights;
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload — built locally from the last 7 days. Never raw audio.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanStats {
  events: readonly CardEvent[];
  cards: readonly Card[];
  reviews: readonly Review[];
  inbox: readonly InboxItem[];
  voiceSamples: readonly VoiceSample[];
  paceAttempts: readonly PaceAttempt[];
  profile: Profile | undefined;
  now: Millis;
}

export function buildPlanPayload(stats: PlanStats): PlanWeekPayload {
  const since = stats.now - PLAN_GAP_MS;
  const typeOf = new Map(stats.cards.map((c) => [c.id, c.type] as const));

  const views = new Map<string, number>();
  const agains = new Map<string, number>();
  const graded = new Map<string, number>();
  for (const e of stats.events) {
    if (e.at < since) continue;
    const type = e.cardType ?? (e.cardId ? typeOf.get(e.cardId) : undefined);
    if (!type) continue;
    if (e.type === 'card_viewed') {
      views.set(type, (views.get(type) ?? 0) + 1);
    } else if (e.type === 'recall_graded') {
      graded.set(type, (graded.get(type) ?? 0) + 1);
      if (e.grade === 'again') agains.set(type, (agains.get(type) ?? 0) + 1);
    }
  }

  const skips = new Map<string, number>();
  for (const r of stats.reviews) {
    if (!r.skippedAt || r.skippedAt < since) continue;
    const type = typeOf.get(r.cardId);
    if (!type) continue;
    skips.set(type, (skips.get(type) ?? 0) + 1);
  }

  const types = AI_DRAFT_TYPES.map((type) => {
    const g = graded.get(type) ?? 0;
    return {
      type,
      views: views.get(type) ?? 0,
      againRate: g > 0 ? Math.round(((agains.get(type) ?? 0) / g) * 100) / 100 : 0,
      skips: skips.get(type) ?? 0,
    };
  });

  const subjects: string[] = [];
  const seenSubjects = new Set<string>();
  for (const item of [...stats.inbox].sort((a, b) => b.createdAt - a.createdAt)) {
    if (item.status === 'discarded') continue;
    const text = (item.subject ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seenSubjects.has(key)) continue;
    seenSubjects.add(key);
    subjects.push(text);
    if (subjects.length >= PLAN_MAX_SUBJECTS) break;
  }

  const voice: NonNullable<PlanWeekPayload['voice']> = {};
  const p = stats.profile;
  if (p) {
    if ((p.calibrationSamples ?? 0) >= LAB_RULES.CALIBRATION_SESSIONS) voice.calibrated = true;
    if (typeof p.baselineDb === 'number' && Number.isFinite(p.baselineDb)) {
      voice.baselineDb = p.baselineDb;
    }
  }
  const sessionDb = stats.voiceSamples.filter((s) => s.kind === 'session_db' && s.at >= since);
  if (sessionDb.length > 0) {
    const mean = sessionDb.reduce((sum, s) => sum + s.value, 0) / sessionDb.length;
    voice.recentAvgDb = Math.round(mean * 10) / 10;
  }
  const baseline = paceBaseline(stats.paceAttempts);
  const { target, starter } = paceTarget(baseline);
  if (!starter && typeof baseline === 'number') {
    voice.paceBaseline = baseline;
    voice.paceTarget = target;
  }
  const recentWpm = median(
    stats.paceAttempts.filter((a) => a.at >= since).map((a) => a.wpm),
  );
  if (typeof recentWpm === 'number' && recentWpm > 0) voice.recentWpm = recentWpm;

  const latestOf = (kind: VoiceSampleKind): VoiceSample | undefined =>
    [...stats.voiceSamples].filter((s) => s.kind === kind).sort((a, b) => b.at - a.at)[0];
  const habitual = latestOf('mpt_habitual');
  const soft = latestOf('mpt_soft');
  if (habitual && soft && habitual.value > 0 && soft.value > 0) {
    voice.mptGapSec = readMpt(habitual.value, soft.value).gapSec;
  }

  const payload: PlanWeekPayload = { types };
  if (Object.keys(voice).length > 0) payload.voice = voice;
  if (subjects.length > 0) payload.coachSubjects = subjects;
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate + run
// ─────────────────────────────────────────────────────────────────────────────

/** True when the first plan is due. Anchored to the last attempt, else profile birth. */
export function planDue(
  profile: Profile | undefined,
  lastAt: Millis | undefined,
  now: Millis,
): boolean {
  const anchor = lastAt ?? profile?.createdAt ?? now;
  return now - anchor >= PLAN_GAP_MS;
}

/**
 * One atomic claim: 7-day gate + shared AI budget, in a single Dexie
 * transaction so two simultaneous app opens can never both plan. Claimed
 * BEFORE the network call — a failed ask still cost a request.
 */
async function claimPlanAttempt(now: Millis): Promise<{ claimed: boolean; prev?: Millis }> {
  return db.transaction('rw', db.meta, db.profile, async () => {
    const prev = await getMeta<Millis>(PLAN_META);
    const profile = await db.profile.get('me');
    if (!planDue(profile, prev, now)) return { claimed: false };
    // Nested on the same scope — Dexie joins it into this transaction.
    if (!(await tryConsumeAiCall(todayKey()))) return { claimed: false };
    await setMeta(PLAN_META, now);
    return prev === undefined ? { claimed: true } : { claimed: true, prev };
  });
}

/** Put the gate back so the next app open retries (the budget slot stays spent). */
async function releasePlanAttempt(prev: Millis | undefined): Promise<void> {
  try {
    if (prev === undefined) await db.meta.delete(PLAN_META);
    else await setMeta(PLAN_META, prev);
  } catch {
    // Nothing to do — the meta row is local bookkeeping.
  }
}

/**
 * Fire-and-forget from app open. Returns true when a plan was stored. Every
 * skip and failure is silent: a missed week never blocks the app.
 */
export async function maybePlanWeek(fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    const now = Date.now();
    const [lastAt, events, cards, reviews, profile, inbox, voiceSamples] = await Promise.all([
      getMeta<Millis>(PLAN_META),
      db.events.toArray(),
      db.cards.toArray(),
      db.reviews.toArray(),
      db.profile.get('me'),
      db.inbox.toArray(),
      db.voiceSamples.toArray(),
    ]);

    if (!planDue(profile, lastAt, now)) return false;

    const payload = buildPlanPayload({
      events,
      cards,
      reviews,
      inbox,
      voiceSamples,
      paceAttempts: loadPaceSamples(),
      profile,
      now,
    });

    // A week with nothing to learn from never costs a request or a slot.
    const active =
      payload.types.some((t) => t.views > 0) || (payload.coachSubjects?.length ?? 0) > 0;
    if (!active) return false;

    const claim = await claimPlanAttempt(now);
    if (!claim.claimed) return false;

    try {
      const res = await aiPost<PlanWeekResult>('plan_week', payload, fetchFn);
      const plan = clampPlan(res.data, knownWordMap(cards));
      if (!plan) {
        await releasePlanAttempt(claim.prev);
        return false;
      }

      let stored = false;
      await db.transaction('rw', db.profile, db.outbox, async () => {
        const fresh = (await db.profile.get('me')) ?? profile;
        if (!fresh) return;
        await db.profile.put(applyPlanToProfile(fresh, plan, Date.now()));
        await enqueue('profile', 'me');
        stored = true;
      });
      return stored;
    } catch {
      await releasePlanAttempt(claim.prev);
      return false;
    }
  } catch {
    return false;
  }
}
