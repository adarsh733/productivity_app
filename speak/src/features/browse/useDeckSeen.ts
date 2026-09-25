import { useCallback } from 'react';
import { db, enqueue } from '../../db/db';
import { grade, newReview } from '../../srs/scheduler';
import { applyCardView } from '../session/day';
import { todayKey } from '../../lib/date';
import type { Card } from '../../types/contract';

/**
 * Browse deck views count as "seen": same XP as the Feed, same scheduling
 * (first sight → due tomorrow). Deck rings then show real seen/total.
 */
export function useDeckSeen() {
  const seeCard = useCallback(async (card: Card, seenToday: ReadonlySet<string>): Promise<void> => {
    const today = todayKey();
    const now = Date.now();
    const existingDay = await db.days.get(today);
    const { day: nextDay } = applyCardView(
      existingDay ?? { date: today, coreThreeDone: false, cardsCompleted: 0, secondsActive: 0, urgesRedirected: 0 },
      card.id,
      seenToday,
    );
    const existingReview = await db.reviews.get(card.id);
    await db.transaction('rw', db.events, db.days, db.reviews, db.outbox, async () => {
      await db.events.put({
        id: `evt-view-${card.id}-${now}`,
        type: 'card_viewed',
        cardId: card.id,
        cardType: card.type,
        at: now,
        date: today,
        mode: 'endless',
      } as never);
      await db.days.put(nextDay);
      await enqueue('events', `evt-view-${card.id}-${now}`);
      await enqueue('days', today);
      if (!existingReview) {
        const { review } = grade(newReview(card.id, today), 'good', today, now);
        await db.reviews.put(review);
        await enqueue('reviews', card.id);
      }
    });
  }, []);

  return { seeCard };
}
