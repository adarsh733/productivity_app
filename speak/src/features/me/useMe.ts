import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { db } from '../../db/db';
import { currentStreak } from '../session/day';
import { todayKey } from '../../lib/date';
import type { ChatSession, StoryBankEntry, WeakSpot } from '../../types/contract';
import { forgetNote, getProfile, learnerContext } from '../learn/profile';

/** Subjects shown in "What the app knows about me". */
export const KNOWS_TOPICS_MAX = 8;

export interface LearnerKnows {
  /** His wishes, newest first. */
  wishes: Array<{ text: string; at: number }>;
  /** Subjects new cards are grounded in (his wishes first). Max 8. */
  topics: string[];
  /** Open weak spots, all and by where they came from. */
  weakSpots: { open: number; fromAsk: number; fromChat: number };
}

export interface UseMeReturn {
  /** Consecutive days with a counted day — traces to `db.days`. */
  streak: number;
  /** Distinct cards with at least one SRS rep — traces to `db.reviews`. */
  wordsAndPhrases: number;
  /** Rows in `db.lessonProgress`. */
  lessonsDone: number;
  /** Rows in `db.bookmarks`. */
  savedCount: number;
  /** Weak spots not yet fixed, newest first (all of them). */
  openWeakSpots: WeakSpot[];
  /** Rows in `db.storyBank`. */
  storyCount: number;
  /** Rows in `db.chats`. */
  chatCount: number;
  /** Evening chats, newest day first. */
  chats: ChatSession[];
  /** Story-bank moments, newest day first. */
  stories: StoryBankEntry[];
  /** Rows in `db.asks`. */
  askCount: number;
  /** Total cards made from asks. */
  askCardCount: number;
  /** What the app has learned about him (learner memory). */
  knows: LearnerKnows;
  /** Forget one of his wishes. Never throws. */
  forgetWish(text: string): Promise<void>;
}

/** Everything the Me screen shows. Each number traces to one stored query. */
export function useMe(): UseMeReturn {
  const days = useLiveQuery(() => db.days.toArray(), []);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []);
  const lessonsDone = useLiveQuery(() => db.lessonProgress.count(), []) ?? 0;
  const savedCount = useLiveQuery(() => db.bookmarks.count(), []) ?? 0;
  const weakSpots = useLiveQuery(() => db.weakSpots.orderBy('createdAt').reverse().toArray(), []);
  const storyRows = useLiveQuery(() => db.storyBank.orderBy('day').reverse().toArray(), []);
  const chatRows = useLiveQuery(() => db.chats.orderBy('day').reverse().toArray(), []);
  const asks = useLiveQuery(() => db.asks.toArray(), []);
  const memory = useLiveQuery(() => getProfile(), []);
  const topics = useLiveQuery(
    () => learnerContext().then((c) => c.topics.slice(0, KNOWS_TOPICS_MAX)).catch(() => [] as string[]),
    [],
  );

  const today = todayKey();

  const streak = useMemo(() => {
    const dayMap = new Map((days ?? []).map((d) => [d.date, d]));
    return currentStreak(dayMap, today);
  }, [days, today]);

  const wordsAndPhrases = useMemo(
    () => (reviews ?? []).filter((r) => (r.reps ?? 0) >= 1).length,
    [reviews],
  );

  const stories = useMemo(() => storyRows ?? [], [storyRows]);
  const chats = useMemo(() => chatRows ?? [], [chatRows]);

  const openWeakSpots = useMemo(
    () => (weakSpots ?? []).filter((w) => w.fixedAt === undefined),
    [weakSpots],
  );

  const askCardCount = useMemo(
    () => (asks ?? []).reduce((n, a) => n + a.cardIds.length, 0),
    [asks],
  );

  const knows = useMemo<LearnerKnows>(
    () => ({
      wishes: [...(memory?.notes ?? [])].sort((a, b) => b.at - a.at),
      topics: topics ?? [],
      weakSpots: {
        open: openWeakSpots.length,
        fromAsk: openWeakSpots.filter((w) => w.source === 'ask').length,
        fromChat: openWeakSpots.filter((w) => w.source === 'chat').length,
      },
    }),
    [memory, topics, openWeakSpots],
  );

  const forgetWish = useCallback(async (text: string) => {
    await forgetNote(text).catch(() => {});
  }, []);

  return {
    streak,
    wordsAndPhrases,
    lessonsDone,
    savedCount,
    openWeakSpots,
    storyCount: stories.length,
    chatCount: chats.length,
    chats,
    stories,
    askCount: asks?.length ?? 0,
    askCardCount,
    knows,
    forgetWish,
  };
}
