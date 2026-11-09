import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, enqueue } from '../../db/db';
import { todayKey } from '../../lib/date';
import { answerSavedReview, reviewDue } from '../../srs/savedReview';

export interface UseSavedReviewApi {
  /** ♡ cards due for review today, oldest due first. */
  dueIds: string[];
  answer(cardId: string, a: 'knew' | 'not_yet'): Promise<void>;
}

export function useSavedReview(): UseSavedReviewApi {
  const rows = useLiveQuery(() => db.savedReviews.toArray(), []);
  const today = todayKey();

  const dueIds = useMemo(() => reviewDue(rows ?? [], today), [rows, today]);

  const answer = useCallback(async (cardId: string, a: 'knew' | 'not_yet') => {
    await db.transaction('rw', db.savedReviews, db.outbox, async () => {
      const row = await db.savedReviews.get(cardId);
      if (!row) return;
      await db.savedReviews.put(answerSavedReview(row, a, todayKey()));
      await enqueue('savedReviews', cardId);
    });
  }, []);

  return { dueIds, answer };
}
