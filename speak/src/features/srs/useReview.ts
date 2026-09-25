import { useCallback } from 'react';
import type { Card, Grade } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { grade, newReview } from '../../srs/scheduler';
import { todayKey } from '../../lib/date';

/**
 * SRS writes — the only place reviews are created or graded.
 *
 * - First sighting (Feed or Browse deck): create newReview + grade `good`
 *   so it returns tomorrow. Never ask him to grade a first meeting.
 * - Due returns: grade `again` (requeue) or `good`.
 * - Spoken use of a target word: grade `easy`.
 */
export function useReview() {
  const markSeen = useCallback(async (card: Card): Promise<void> => {
    const today = todayKey();
    const now = Date.now();
    const existing = await db.reviews.get(card.id);
    if (!existing) {
      const { review } = grade(newReview(card.id, today), 'good', today, now);
      await db.transaction('rw', db.reviews, db.events, db.outbox, async () => {
        await db.reviews.put(review);
        await db.events.put({
          id: `evt-view-${card.id}-${now}`,
          type: 'card_viewed',
          cardId: card.id,
          cardType: card.type,
          at: now,
          date: today,
          mode: 'endless',
        } as never);
        await enqueue('events', `evt-view-${card.id}-${now}`);
        await enqueue('reviews', card.id);
      });
    }
  }, []);

  const gradeDue = useCallback(async (cardId: string, cardType: Card['type'], g: Grade): Promise<boolean> => {
    const today = todayKey();
    const now = Date.now();
    const existing = await db.reviews.get(cardId);
    if (!existing) return false;
    const { review, requeueNow } = grade(existing, g, today, now);
    await db.transaction('rw', db.reviews, db.events, db.outbox, async () => {
      await db.reviews.put(review);
      await db.events.put({
        id: `evt-grade-${cardId}-${now}`,
        type: 'recall_graded',
        cardId,
        cardType,
        grade: g,
        at: now,
        date: today,
      } as never);
      await enqueue('events', `evt-grade-${cardId}-${now}`);
      await enqueue('reviews', cardId);
    });
    return requeueNow;
  }, []);

  const gradeEasy = useCallback(async (cardId: string): Promise<void> => {
    const today = todayKey();
    const now = Date.now();
    const existing = await db.reviews.get(cardId);
    const base = existing ?? newReview(cardId, today);
    const { review } = grade(base, 'easy', today, now);
    await db.transaction('rw', db.reviews, db.events, db.outbox, async () => {
      await db.reviews.put(review);
      await enqueue('reviews', cardId);
    });
  }, []);

  return { markSeen, gradeDue, gradeEasy };
}
