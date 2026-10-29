import type { AskPreference, LearnerContext, Track } from '../../types/contract';
import { db, getMeta, setMeta } from '../../db/db';
import { rejectedTerms } from '../auto/reject';
import { getWatchList } from '../coach/pipeline';

/**
 * The learner memory: everything the app has learned about him, in one place.
 *
 * Fed by: his Ask wishes ("more cricket small talk", "too easy", "never show
 * 'revert back'"), the subjects he asks about, the subjects he talks about in
 * the evening chat, his "This is wrong" taps, and his mistakes (Ask, chat,
 * coach box). Read by: every AI job that writes or judges content, through
 * `learnerContext()`. Phone-only (meta table), like the rest of v5.
 */

export const LEARNER_META = 'learn.profile';

export const TOPICS_MAX = 12;
export const NOTES_MAX = 6;
export const WATCH_MAX = 10;
export const AVOID_MAX = 50;
/** A track he asked to change stays nudged for this long, unless he says otherwise. */
export const NUDGE_DAYS = 30;

const TRACKS: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];
const DAY_MS = 86_400_000;

interface Dated {
  text: string;
  at: number;
}

interface TrackNudge {
  track: Track;
  /** +1 more of / harder, -1 less of / easier. */
  dir: 1 | -1;
  at: number;
}

/** Stored shape (meta `learn.profile`). Newest first everywhere. */
export interface LearnerProfile {
  /** Subjects he named in a wish: strongest signal, kept until replaced. */
  wishTopics: Dated[];
  /** Subjects from his asks and chats: kept newest first, capped. */
  seenTopics: Array<Dated & { source: 'ask' | 'chat' }>;
  notes: Dated[];
  avoid: Dated[];
  amount: TrackNudge[];
  difficulty: TrackNudge[];
}

const EMPTY: LearnerProfile = {
  wishTopics: [],
  seenTopics: [],
  notes: [],
  avoid: [],
  amount: [],
  difficulty: [],
};

const clean = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

/** Newest first, case-insensitive dedupe, capped. */
function mergeDated<T extends Dated>(fresh: T[], old: readonly T[], cap: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const d of [...fresh, ...old]) {
    const k = d.text.toLowerCase();
    if (!d.text || seen.has(k)) continue;
    seen.add(k);
    out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}

function validTracks(v: unknown): Track[] {
  return Array.isArray(v) ? v.filter((t): t is Track => TRACKS.includes(t as Track)) : [];
}

/** Latest nudge per track wins; "more" then "less" for the same track cancels to "less". */
function mergeNudges(fresh: TrackNudge[], old: readonly TrackNudge[]): TrackNudge[] {
  const byTrack = new Map<Track, TrackNudge>();
  for (const n of [...old].reverse()) byTrack.set(n.track, n);
  for (const n of fresh) byTrack.set(n.track, n);
  return [...byTrack.values()].sort((a, b) => b.at - a.at);
}

export async function getProfile(): Promise<LearnerProfile> {
  const p = await getMeta<Partial<LearnerProfile>>(LEARNER_META).catch(() => undefined);
  return { ...EMPTY, ...(p ?? {}) };
}

async function saveProfile(p: LearnerProfile): Promise<void> {
  await setMeta(LEARNER_META, p);
}

/**
 * Store one of his wishes. `said` is his own text, kept as the note when the
 * AI's one-line summary is empty. Returns the updated profile.
 */
export async function applyPreference(pref: AskPreference, said: string, now = Date.now()): Promise<LearnerProfile> {
  const p = await getProfile();
  const note = clean(pref.note, 160) || clean(said, 160);
  const topics = (pref.topics ?? []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 5);
  const avoid = (pref.avoid ?? []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 10);
  const amount: TrackNudge[] = [
    ...validTracks(pref.moreOf).map((track) => ({ track, dir: 1 as const, at: now })),
    ...validTracks(pref.lessOf).map((track) => ({ track, dir: -1 as const, at: now })),
  ];
  const difficulty: TrackNudge[] = [
    ...validTracks(pref.harder).map((track) => ({ track, dir: 1 as const, at: now })),
    ...validTracks(pref.easier).map((track) => ({ track, dir: -1 as const, at: now })),
  ];
  const next: LearnerProfile = {
    ...p,
    wishTopics: mergeDated(topics.map((text) => ({ text, at: now })), p.wishTopics, TOPICS_MAX),
    notes: note ? mergeDated([{ text: note, at: now }], p.notes, NOTES_MAX) : p.notes,
    avoid: mergeDated(avoid.map((text) => ({ text, at: now })), p.avoid, AVOID_MAX),
    amount: mergeNudges(amount, p.amount),
    difficulty: mergeNudges(difficulty, p.difficulty),
  };
  await saveProfile(next);
  return next;
}

/** Remember what an ask or a chat answer was about. Never throws. */
export async function noteTopics(topics: readonly unknown[] | undefined, source: 'ask' | 'chat', now = Date.now()): Promise<void> {
  const fresh = (topics ?? []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 3);
  if (fresh.length === 0) return;
  try {
    const p = await getProfile();
    await saveProfile({
      ...p,
      seenTopics: mergeDated(fresh.map((text) => ({ text, at: now, source })), p.seenTopics, TOPICS_MAX * 2),
    });
  } catch {
    /* memory is best-effort; a failed write never breaks the screen */
  }
}

/** Forget one wish (Me → "What the app knows about me"). */
export async function forgetNote(text: string): Promise<void> {
  const p = await getProfile();
  const k = text.toLowerCase();
  await saveProfile({
    ...p,
    notes: p.notes.filter((n) => n.text.toLowerCase() !== k),
    wishTopics: p.wishTopics.filter((n) => n.text.toLowerCase() !== k),
    avoid: p.avoid.filter((n) => n.text.toLowerCase() !== k),
  });
}

/** Active nudges (younger than NUDGE_DAYS). */
export function activeNudges(list: readonly TrackNudge[], now = Date.now()): TrackNudge[] {
  return list.filter((n) => now - n.at < NUDGE_DAYS * DAY_MS);
}

/** Level shift for a track from his "too easy / too hard" wishes: -1, 0 or +1. */
export function difficultyShift(p: LearnerProfile, track: Track, now = Date.now()): -1 | 0 | 1 {
  return activeNudges(p.difficulty, now).find((n) => n.track === track)?.dir ?? 0;
}

/** Open weak spots, newest first, merged with coach-box mistakes. Max 10. */
export async function watchList(): Promise<LearnerContext['watch']> {
  const spots = await db.weakSpots.toArray().catch(() => []);
  const open = spots
    .filter((w) => !w.fixedAt && w.wrong && w.right)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((w) => ({ wrong: w.wrong, right: w.right }));
  const inbox = await db.inbox
    .orderBy('createdAt')
    .reverse()
    .toArray()
    .catch(() => []);
  const out: LearnerContext['watch'] = [];
  const seen = new Set<string>();
  for (const w of [...open, ...getWatchList(inbox)]) {
    const k = w.wrong.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ wrong: w.wrong.trim(), right: w.right.trim() });
    if (out.length >= WATCH_MAX) break;
  }
  return out;
}

/**
 * Everything learned, ready to send. Order of topics: his wishes first, then
 * what he asked or talked about most recently. Never throws.
 */
export async function learnerContext(now = Date.now()): Promise<LearnerContext> {
  const p = await getProfile();
  const topics = mergeDated([...p.wishTopics, ...p.seenTopics], [], TOPICS_MAX).map((d) => d.text);
  const rejected = await rejectedTerms(AVOID_MAX).catch(() => [] as string[]);
  const avoid: string[] = [];
  const seen = new Set<string>();
  for (const t of [...p.avoid.map((d) => d.text), ...rejected]) {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    avoid.push(t);
    if (avoid.length >= AVOID_MAX) break;
  }
  const amount = activeNudges(p.amount, now);
  return {
    topics,
    avoid,
    notes: p.notes.slice(0, NOTES_MAX).map((n) => n.text),
    moreOf: amount.filter((n) => n.dir === 1).map((n) => n.track),
    lessOf: amount.filter((n) => n.dir === -1).map((n) => n.track),
    watch: await watchList().catch(() => []),
  };
}
