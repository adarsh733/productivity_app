import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/db';
import { todayKey } from '../../lib/date';
import { emptyDay } from '../session/day';

describe('You weekly counters trace to stored queries', () => {
  beforeEach(async () => {
    await db.events.clear();
    await db.days.clear();
  });

  it('counts new cards, reviews, words, reps, routine days and urges from stored rows', async () => {
    const today = todayKey();
    const now = Date.now();
    await db.events.bulkPut([
      { id: 'e1', type: 'card_viewed', cardId: 'a', cardType: 'word', at: now, date: today } as never,
      { id: 'e2', type: 'card_viewed', cardId: 'b', cardType: 'word', at: now, date: today } as never,
      { id: 'e3', type: 'recall_graded', cardId: 'a', cardType: 'word', grade: 'good', at: now, date: today } as never,
      {
        id: 'e4', type: 'spoken_rep_completed', recordingId: 'r1', drillTitle: 'T',
        durationSec: 30, xpEarned: 10, transcript: 'hello brave new world', at: now, date: today,
      } as never,
    ]);
    await db.days.put({ ...emptyDay(today), labSessionDone: true, urgesRedirected: 2 });

    const events = await db.events.toArray();
    const days = await db.days.toArray();
    const viewed = new Set(events.filter((e) => e.type === 'card_viewed' && e.cardId).map((e) => e.cardId as string));
    const reviewed = events.filter((e) => e.type === 'recall_graded').length;
    const reps = events.filter((e) => e.type === 'spoken_rep_completed').length;
    const words = events
      .filter((e) => e.type === 'spoken_rep_completed')
      .reduce((s, e) => s + (((e as { transcript?: string }).transcript ?? '').trim().split(/\s+/).filter(Boolean).length), 0);
    const routineDays = days.filter((d) => d.labSessionDone).length;
    const urges = days.reduce((s, d) => s + (d.urgesRedirected || 0), 0);

    expect(viewed.size).toBe(2);
    expect(reviewed).toBe(1);
    expect(reps).toBe(1);
    expect(words).toBe(4);
    expect(routineDays).toBe(1);
    expect(urges).toBe(2);
  });
});
