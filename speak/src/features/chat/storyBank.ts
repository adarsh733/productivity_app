import type { ChatTurn, DayKey, StoryBankEntry } from '../../types/contract';
import { db } from '../../db/db';

/**
 * The story bank: one real moment from his day, kept so it can be told as a
 * story later. Phone-only (Dexie `storyBank`), one entry per day.
 *
 * It keeps HIS words, never a rewrite: a story bank full of sentences he did
 * not say would be teaching him someone else's day.
 */

/** A moment shorter than this is a reply, not a moment. */
export const MIN_MOMENT_WORDS = 12;

/** The most characters kept for one moment. */
export const MAX_MOMENT_CHARS = 600;

/** The first question of every chat asks for a moment, so it gets a head start. */
const MOMENT_QUESTION_BONUS = 15;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export interface BestMoment {
  turnIndex: number;
  text: string;
}

/**
 * Pick the day's best moment out of a chat's turns. Longest real answer wins,
 * with the "tell me one moment" question (always first) given a head start.
 * Null when nothing was long enough to be worth keeping.
 */
export function pickBestMoment(turns: readonly ChatTurn[]): BestMoment | null {
  let best: { score: number; turnIndex: number; text: string } | null = null;
  turns.forEach((t, i) => {
    const text = (t.transcript ?? '').trim().replace(/\s+/g, ' ');
    const words = wordCount(text);
    if (words < MIN_MOMENT_WORDS) return;
    const score = words + (i === 0 ? MOMENT_QUESTION_BONUS : 0);
    if (!best || score > best.score) best = { score, turnIndex: i, text };
  });
  if (!best) return null;
  const b = best as { score: number; turnIndex: number; text: string };
  return { turnIndex: b.turnIndex, text: b.text.slice(0, MAX_MOMENT_CHARS) };
}

export function storyBankId(day: DayKey): string {
  return `sb-${day}`;
}

/**
 * Keep one moment for a day. A day that already has one keeps the longer of
 * the two, so a second chat can improve it but never erase it.
 */
export async function saveMoment(
  day: DayKey,
  text: string,
  now: number = Date.now(),
): Promise<StoryBankEntry | null> {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, MAX_MOMENT_CHARS);
  if (wordCount(clean) < MIN_MOMENT_WORDS) return null;
  const id = storyBankId(day);
  const existing = await db.storyBank.get(id);
  if (existing && wordCount(existing.text) >= wordCount(clean)) return existing;
  const entry: StoryBankEntry = { id, day, text: clean, createdAt: now };
  await db.storyBank.put(entry);
  return entry;
}

/** Pick the best moment of a finished chat and store it. Never throws. */
export async function saveBestMoment(
  day: DayKey,
  turns: readonly ChatTurn[],
  now: number = Date.now(),
): Promise<StoryBankEntry | null> {
  try {
    const best = pickBestMoment(turns);
    if (!best) return null;
    return await saveMoment(day, best.text, now);
  } catch {
    return null;
  }
}

/** Everything in the bank, newest day first. */
export async function readStoryBank(): Promise<StoryBankEntry[]> {
  const all = await db.storyBank.toArray();
  return all.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt - a.createdAt));
}
