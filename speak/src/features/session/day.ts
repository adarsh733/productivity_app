import type {
  DayKey,
  DayRecord,
  FreezeRecord,
  Grade,
  ProductionEvent,
  Recording,
} from '../../types/contract';
import { GAMIFICATION } from '../../types/contract';
import { addDays, todayKey } from '../../lib/date';
import { db, enqueue, saveRecording } from '../../db/db';

/**
 * Streak rules, isolated here so they are testable and so there is exactly one
 * definition of "a day counts".
 *
 * A day counts if: cardsCompleted >= 5 OR (spokenReps ?? 0) >= 1.
 * A 30-second day at 11:50 PM is a full day.
 */

export function emptyDay(date: DayKey): DayRecord {
  return {
    date,
    coreThreeDone: false,
    cardsCompleted: 0,
    secondsActive: 0,
    urgesRedirected: 0,
    xp: 0,
    spokenReps: 0,
  };
}

export function isDayComplete(record: DayRecord | undefined): boolean {
  if (!record) return false;
  return record.cardsCompleted >= GAMIFICATION.STREAK_CARDS || (record.spokenReps ?? 0) >= 1;
}

export function isPass(grade: Grade): boolean {
  return grade !== 'again';
}

/**
 * Viewing a card:
 * - 1 XP per UNIQUE card viewed per day (GAMIFICATION.XP.cardSeen = 1).
 * - Repeated views of the same card on the same day earn view XP once.
 * - Active seconds are always accumulated.
 * - Spoken reps are NEVER incremented by browsing.
 */
export function applyCardView(
  day: DayRecord,
  cardId: string,
  seenCardIdsToday: ReadonlySet<string>,
  opts?: { msSpent?: number },
): { day: DayRecord; isUnique: boolean; xpEarned: number } {
  const isAlreadySeen = seenCardIdsToday.has(cardId);
  const nextCards = isAlreadySeen ? day.cardsCompleted : day.cardsCompleted + 1;
  const xpEarned = isAlreadySeen ? 0 : GAMIFICATION.XP.cardSeen;
  const nextXp = (day.xp ?? 0) + xpEarned;
  const nextSeconds = day.secondsActive + Math.round((opts?.msSpent ?? 0) / 1000);

  const updated: DayRecord = {
    ...day,
    cardsCompleted: nextCards,
    secondsActive: nextSeconds,
    xp: nextXp,
    spokenReps: day.spokenReps ?? 0,
    coreThreeDone: isDayComplete({
      ...day,
      cardsCompleted: nextCards,
      spokenReps: day.spokenReps ?? 0,
    }),
  };

  return { day: updated, isUnique: !isAlreadySeen, xpEarned };
}

/**
 * Legacy wrapper for backwards compatibility with tests that don't pass seen sets.
 */
export function applyCardCompletion(
  day: DayRecord,
  opts?: { msSpent?: number },
): DayRecord {
  return applyCardView(day, `legacy-${Date.now()}-${Math.random()}`, new Set(), opts).day;
}

/**
 * Bookmark toggle XP:
 * - 3 XP the first time a bookmark is added (GAMIFICATION.XP.cardSaved = 3).
 * - Toggle farming is strictly prevented: re-saving an unsaved card earns 0 XP.
 */
export function applyBookmarkToggle(
  day: DayRecord,
  cardId: string,
  isSaving: boolean,
  alreadyAwardedCards: ReadonlySet<string>,
): { day: DayRecord; xpEarned: number; newlyAwarded: boolean } {
  if (!isSaving || alreadyAwardedCards.has(cardId)) {
    return { day, xpEarned: 0, newlyAwarded: false };
  }

  const xpEarned = GAMIFICATION.XP.cardSaved;
  const nextXp = (day.xp ?? 0) + xpEarned;

  const updated: DayRecord = {
    ...day,
    xp: nextXp,
  };

  return { day: updated, xpEarned, newlyAwarded: true };
}

/**
 * Validates whether a speaking attempt produced legitimate captured audio.
 * Must have a non-empty audio blob and duration >= 2 seconds.
 */
export function validateSpeakingAttempt(
  audio: { blob?: Blob } | null | undefined,
  durationSec: number,
): boolean {
  if (!audio || !audio.blob) return false;
  if (typeof audio.blob.size !== 'number' || audio.blob.size <= 0) return false;
  if (typeof durationSec !== 'number' || durationSec < 2) return false;
  return true;
}

/**
 * Pure domain function to apply a speaking completion.
 * Only credits spokenReps and XP if the attempt is valid (non-empty audio, duration >= 2s).
 * If invalid (e.g. null audio), returns the unmodified DayRecord and credited: false.
 */
export function applySpeakingCompletion(
  day: DayRecord,
  audio: { blob?: Blob } | null | undefined,
  elapsedSec: number,
  xpReward: number,
): { day: DayRecord; credited: boolean } {
  if (!validateSpeakingAttempt(audio, elapsedSec)) {
    return { day, credited: false };
  }

  const nextCards = day.cardsCompleted + 1;
  const nextSpoken = (day.spokenReps ?? 0) + 1;
  const nextXp = (day.xp ?? 0) + xpReward;
  const nextSeconds = day.secondsActive + elapsedSec;

  const nextDay: DayRecord = {
    ...day,
    cardsCompleted: nextCards,
    spokenReps: nextSpoken,
    xp: nextXp,
    secondsActive: nextSeconds,
    coreThreeDone: isDayComplete({
      ...day,
      cardsCompleted: nextCards,
      spokenReps: nextSpoken,
    }),
  };

  return { day: nextDay, credited: true };
}

export interface SpeakingDatabase {
  recordings: {
    get(id: string): Promise<Recording | undefined>;
    put(r: Recording): Promise<unknown>;
  };
  days: {
    get(date: string): Promise<DayRecord | undefined>;
    put(d: DayRecord): Promise<unknown>;
  };
  events?: {
    put(e: ProductionEvent): Promise<unknown>;
  };
  transaction<T>(mode: string, ...args: any[]): Promise<T>;
}

/**
 * Persist speaking attempt to database idempotently by recording ID.
 * Returns { credited: boolean, day: DayRecord }.
 */
export async function creditSpeakingAttempt(
  params: {
    recordingId: string;
    audio: { blob: Blob; mimeType?: string } | null | undefined;
    elapsedSec: number;
    xpReward?: number;
    drillTitle: string;
    isDescribe?: boolean;
    transcript?: string;
    date?: DayKey;
  },
  database: SpeakingDatabase = db as any,
  enqueueFn: typeof enqueue = enqueue,
): Promise<{ credited: boolean; day: DayRecord }> {
  const dateKey = params.date ?? todayKey();
  const xpReward =
    params.xpReward ??
    (params.isDescribe ? GAMIFICATION.XP.describeRep : GAMIFICATION.XP.spokenRep);

  if (!validateSpeakingAttempt(params.audio, params.elapsedSec)) {
    const current = (await database.days.get(dateKey)) ?? emptyDay(dateKey);
    return { credited: false, day: current };
  }

  return await database.transaction('rw', db.recordings, db.days, db.events, db.outbox, async () => {
    const existing = await database.recordings.get(params.recordingId);
    const dayRow = await database.days.get(dateKey);
    const currentDay = dayRow ?? emptyDay(dateKey);

    if (existing) {
      // Already credited for this recordingId — idempotent
      return { credited: false, day: currentDay };
    }

    const recording: Recording = {
      id: params.recordingId,
      sessionId: params.recordingId,
      attempt: 1,
      missionId: params.drillTitle,
      missionTitle: params.drillTitle,
      date: dateKey,
      at: Date.now(),
      durationSec: params.elapsedSec,
      mimeType: params.audio!.mimeType ?? 'audio/webm',
      blob: params.audio!.blob!,
      ...(params.transcript ? { transcript: params.transcript } : {}),
    };

    await saveRecording(recording, database.recordings as any);

    const { day: updatedDay } = applySpeakingCompletion(
      currentDay,
      params.audio,
      params.elapsedSec,
      xpReward,
    );

    // Write production event
    const eventType = params.isDescribe ? 'describe_rep_completed' : 'spoken_rep_completed';
    const prodEvent: ProductionEvent = {
      id: `evt-speak-${params.recordingId}`,
      type: eventType,
      recordingId: params.recordingId,
      drillTitle: params.drillTitle,
      durationSec: params.elapsedSec,
      xpEarned: xpReward,
      transcript: params.transcript,
      at: Date.now(),
      date: dateKey,
    };

    if (database.events) {
      await database.events.put(prodEvent as any);
    } else {
      try {
        await db.events.put(prodEvent as any);
      } catch {
        // in memory or test environment without IndexedDB
      }
    }

    await database.days.put(updatedDay);
    await enqueueFn('events', prodEvent.id);
    await enqueueFn('days', dateKey);

    return { credited: true, day: updatedDay };
  });
}

/**
 * Current streak length and monthly freeze consumption.
 *
 * Two grace days per calendar month are absorbed silently — a missed day inside
 * the allowance does not reset the count and is never mentioned in the UI.
 */
export const GRACE_DAYS_PER_MONTH = GAMIFICATION.FREEZES_PER_MONTH;

export interface StreakEvaluation {
  streak: number;
  monthlyFreezes: Map<string, DayKey[]>;
}

function hasCompletedDayBefore(days: ReadonlyMap<DayKey, DayRecord>, cursor: DayKey): boolean {
  for (const [dateKey, record] of days.entries()) {
    if (dateKey < cursor && isDayComplete(record)) {
      return true;
    }
  }
  return false;
}

export function evaluateStreak(
  days: ReadonlyMap<DayKey, DayRecord>,
  today: DayKey,
): StreakEvaluation {
  let streak = 0;
  let cursor = today;
  const monthlyFreezes = new Map<string, DayKey[]>();

  // Today not being done yet must not zero a real streak — start from today,
  // and only start spending grace once we're looking at days that are past.
  if (!isDayComplete(days.get(cursor))) cursor = addDays(cursor, -1);

  for (let guard = 0; guard < 3650; guard++) {
    const rec = days.get(cursor);
    if (isDayComplete(rec)) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }

    // A missed day is only a freeze if there is an earlier completed day to preserve
    const hasPrior = hasCompletedDayBefore(days, cursor);
    if (!hasPrior) break;

    const month = cursor.slice(0, 7);
    const usedList = monthlyFreezes.get(month) ?? [];
    if (usedList.length < GAMIFICATION.FREEZES_PER_MONTH && streak > 0) {
      usedList.push(cursor);
      monthlyFreezes.set(month, usedList);
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  return { streak, monthlyFreezes };
}

export function currentStreak(days: ReadonlyMap<DayKey, DayRecord>, today: DayKey): number {
  return evaluateStreak(days, today).streak;
}

/**
 * Freeze Ledger: Computes the proven freeze status for a given month.
 * Ensures the UI never claims 2 available freezes if freezes were consumed.
 */
export function getMonthlyFreezeStatus(
  days: ReadonlyMap<DayKey, DayRecord>,
  today: DayKey,
  targetMonth: string = today.slice(0, 7),
): FreezeRecord {
  const { monthlyFreezes } = evaluateStreak(days, today);
  const usedDates = monthlyFreezes.get(targetMonth) ?? [];
  const remaining = Math.max(0, GAMIFICATION.FREEZES_PER_MONTH - usedDates.length);

  return {
    month: targetMonth,
    usedDates,
    remaining,
  };
}



