import { describe, expect, it } from 'vitest';
import {
  isDayComplete,
  currentStreak,
  emptyDay,
  isPass,
  validateSpeakingAttempt,
  applySpeakingCompletion,
  applyCardView,
  applyBookmarkToggle,
  creditSpeakingAttempt,
  getMonthlyFreezeStatus,
} from './day';
import type { DayKey, DayRecord } from '../../types/contract';
import { GAMIFICATION } from '../../types/contract';
import { addDays, parseDayKey, toDayKey } from '../../lib/date';

function days(done: DayKey[]): Map<DayKey, DayRecord> {
  const m = new Map<DayKey, DayRecord>();
  for (const d of done) m.set(d, { ...emptyDay(d), cardsCompleted: 5 });
  return m;
}

describe('Speaking attempt validation and completion', () => {
  it('Null audio does not credit a spoken rep or XP', () => {
    const initial = emptyDay('2026-08-26');
    const res = applySpeakingCompletion(initial, null, 30, 10);
    expect(res.credited).toBe(false);
    expect(res.day.spokenReps).toBe(0);
    expect(res.day.xp).toBe(0);
    expect(res.day.cardsCompleted).toBe(0);
    expect(res.day.coreThreeDone).toBe(false);
  });

  it('Empty audio blob does not credit a spoken rep or XP', () => {
    const initial = emptyDay('2026-08-26');
    const emptyBlob = new Blob([], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: emptyBlob }, 30, 10);
    expect(res.credited).toBe(false);
    expect(res.day.spokenReps).toBe(0);
    expect(res.day.xp).toBe(0);
  });

  it('Audio duration under 2 seconds does not credit a spoken rep or XP', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 1, 10);
    expect(res.credited).toBe(false);
    expect(res.day.spokenReps).toBe(0);
    expect(res.day.xp).toBe(0);
  });

  it('One valid standard recording credits 10 XP and completes the day', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 30, GAMIFICATION.XP.spokenRep);
    expect(res.credited).toBe(true);
    expect(res.day.spokenReps).toBe(1);
    expect(res.day.xp).toBe(10);
    expect(res.day.secondsActive).toBe(30);
    expect(res.day.cardsCompleted).toBe(1);
    expect(res.day.coreThreeDone).toBe(true);
    expect(isDayComplete(res.day)).toBe(true);
  });

  it('One valid Describe recording credits 25 XP and completes the day', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 45, GAMIFICATION.XP.describeRep);
    expect(res.credited).toBe(true);
    expect(res.day.spokenReps).toBe(1);
    expect(res.day.xp).toBe(25);
    expect(res.day.secondsActive).toBe(45);
    expect(res.day.coreThreeDone).toBe(true);
  });

  it('validateSpeakingAttempt rejects invalid inputs and accepts valid audio >= 2s', () => {
    expect(validateSpeakingAttempt(null, 5)).toBe(false);
    expect(validateSpeakingAttempt(undefined, 5)).toBe(false);
    expect(validateSpeakingAttempt({ blob: new Blob([]) }, 5)).toBe(false);
    expect(validateSpeakingAttempt({ blob: new Blob(['audio']) }, 1)).toBe(false);
    expect(validateSpeakingAttempt({ blob: new Blob(['audio']) }, 2)).toBe(true);
  });

  it('silence does not credit: 30 s with 0 s voiced earns nothing', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 30, 10, 0);
    expect(res.credited).toBe(false);
    expect(res.day.spokenReps).toBe(0);
    expect(res.day.xp).toBe(0);
  });

  it('short voice does not credit: 5 s with 1.0 s voiced earns nothing', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 5, 10, 1.0);
    expect(res.credited).toBe(false);
  });

  it('real speech credits: 5 s with 2.0 s voiced earns XP', () => {
    const initial = emptyDay('2026-08-26');
    const validBlob = new Blob(['sample-audio-data-chunk'], { type: 'audio/webm' });
    const res = applySpeakingCompletion(initial, { blob: validBlob }, 5, 10, 2.0);
    expect(res.credited).toBe(true);
    expect(res.day.spokenReps).toBe(1);
  });

  it('crediting the same attempt twice is impossible (idempotent by recordingId)', async () => {
    const store = new Map<string, unknown>();
    const dayStore = new Map<string, DayRecord>();
    const mockDb = {
      recordings: {
        get: async (id: string) => store.get(id) as never,
        put: async (r: never) => {
          store.set((r as { id: string }).id, r);
        },
      },
      days: {
        get: async (d: string) => dayStore.get(d),
        put: async (d: DayRecord) => {
          dayStore.set(d.date, d);
        },
      },
      transaction: async (_mode: string, ..._args: unknown[]) => {
        // emulate the real transaction body by invoking it directly
        const fn = _args[_args.length - 1] as () => Promise<{ credited: boolean; day: DayRecord }>;
        return fn();
      },
    };
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const noop = async () => {};
    const first = await creditSpeakingAttempt(
      { recordingId: 'rec-same', audio: { blob }, elapsedSec: 10, voicedSec: 8, drillTitle: 'T', date: '2026-08-26' },
      mockDb as never,
      noop as never,
    );
    expect(first.credited).toBe(true);
    const second = await creditSpeakingAttempt(
      { recordingId: 'rec-same', audio: { blob }, elapsedSec: 10, voicedSec: 8, drillTitle: 'T', date: '2026-08-26' },
      mockDb as never,
      noop as never,
    );
    expect(second.credited).toBe(false);
    expect(second.day.spokenReps).toBe(1);
  });
});

describe('XP Rules & Anti-Farming', () => {
  it('1 XP per UNIQUE card viewed per day; repeated views on same day earn 0 XP', () => {
    let day = emptyDay('2026-08-26');
    const seen = new Set<string>();

    // First view of card-A -> 1 XP
    const view1 = applyCardView(day, 'card-A', seen, { msSpent: 3000 });
    expect(view1.isUnique).toBe(true);
    expect(view1.xpEarned).toBe(1);
    expect(view1.day.xp).toBe(1);
    expect(view1.day.cardsCompleted).toBe(1);
    seen.add('card-A');
    day = view1.day;

    // Second view of card-A on the same day -> 0 XP, cardsCompleted does not increment
    const view2 = applyCardView(day, 'card-A', seen, { msSpent: 2000 });
    expect(view2.isUnique).toBe(false);
    expect(view2.xpEarned).toBe(0);
    expect(view2.day.xp).toBe(1);
    expect(view2.day.cardsCompleted).toBe(1);
    expect(view2.day.secondsActive).toBe(5);

    // View of card-B -> 1 XP
    const view3 = applyCardView(view2.day, 'card-B', seen, { msSpent: 4000 });
    expect(view3.isUnique).toBe(true);
    expect(view3.xpEarned).toBe(1);
    expect(view3.day.xp).toBe(2);
    expect(view3.day.cardsCompleted).toBe(2);
  });

  it('Bookmark toggle awards 3 XP the first time; prevents toggle farming', () => {
    let day = emptyDay('2026-08-26');
    const awarded = new Set<string>();

    // First time bookmarking card-1 -> +3 XP
    const bm1 = applyBookmarkToggle(day, 'card-1', true, awarded);
    expect(bm1.newlyAwarded).toBe(true);
    expect(bm1.xpEarned).toBe(3);
    expect(bm1.day.xp).toBe(3);
    awarded.add('card-1');
    day = bm1.day;

    // Unsaving card-1 -> 0 XP change
    const bm2 = applyBookmarkToggle(day, 'card-1', false, awarded);
    expect(bm2.newlyAwarded).toBe(false);
    expect(bm2.xpEarned).toBe(0);
    expect(bm2.day.xp).toBe(3);
    day = bm2.day;

    // Re-bookmarking card-1 -> 0 XP (anti-farming protected)
    const bm3 = applyBookmarkToggle(day, 'card-1', true, awarded);
    expect(bm3.newlyAwarded).toBe(false);
    expect(bm3.xpEarned).toBe(0);
    expect(bm3.day.xp).toBe(3);
  });

  it('Silent feed browsing never increments spoken reps', () => {
    let day = emptyDay('2026-08-26');
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = applyCardView(day, `card-${i}`, seen, { msSpent: 5000, engaged: true });
      seen.add(`card-${i}`);
      day = res.day;
    }
    expect(day.cardsCompleted).toBe(10);
    expect(day.spokenReps).toBe(0);
    expect(day.xp).toBe(10);
    expect(isDayComplete(day)).toBe(true);
  });
});

describe('Engaged-only XP and streak (AG-007 stage 2)', () => {
  it('a skimmed view earns 0 XP and does not advance cards today', () => {
    const day = emptyDay('2026-08-26');
    const res = applyCardView(day, 'card-A', new Set(), { msSpent: 1500, engaged: false });
    expect(res.isUnique).toBe(false);
    expect(res.xpEarned).toBe(0);
    expect(res.day.xp).toBe(0);
    expect(res.day.cardsCompleted).toBe(0);
    // Active seconds still accrue — he did spend the time.
    expect(res.day.secondsActive).toBe(2);
  });

  it('ten skims never complete the day; five engaged cards do', () => {
    let day = emptyDay('2026-08-26');
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = applyCardView(day, `skim-${i}`, seen, { msSpent: 1000, engaged: false });
      day = res.day;
    }
    expect(day.cardsCompleted).toBe(0);
    expect(day.xp).toBe(0);
    expect(isDayComplete(day)).toBe(false);

    for (let i = 0; i < 5; i++) {
      const res = applyCardView(day, `eng-${i}`, seen, { msSpent: 5000, engaged: true });
      seen.add(`eng-${i}`);
      day = res.day;
    }
    expect(day.cardsCompleted).toBe(5);
    expect(day.xp).toBe(5);
    expect(isDayComplete(day)).toBe(true);
  });

  it('engagement defaults to counted when the caller cannot measure it', () => {
    const day = emptyDay('2026-08-26');
    const res = applyCardView(day, 'card-A', new Set());
    expect(res.isUnique).toBe(true);
    expect(res.xpEarned).toBe(GAMIFICATION.XP.cardSeen);
  });
});

describe('Freeze Ledger & Proven Availability', () => {
  it('Evaluates 2 available freezes when no missed days have occurred', () => {
    const today = '2026-08-10';
    const m = days(['2026-08-08', '2026-08-09', '2026-08-10']);
    const status = getMonthlyFreezeStatus(m, today);

    expect(status.month).toBe('2026-08');
    expect(status.usedDates).toHaveLength(0);
    expect(status.remaining).toBe(2);
  });

  it('Proves 1 remaining freeze when 1 day was missed and protected by streak', () => {
    const today = '2026-08-10';
    // 2026-08-08 was missed and absorbed
    const m = days(['2026-08-07', '2026-08-09', '2026-08-10']);
    const status = getMonthlyFreezeStatus(m, today);

    expect(status.usedDates).toEqual(['2026-08-08']);
    expect(status.remaining).toBe(1);
  });

  it('Proves 0 remaining freezes when 2 days were missed and does not resurrect', () => {
    const today = '2026-08-10';
    // 2026-08-06 and 2026-08-08 were missed and absorbed
    const m = days(['2026-08-05', '2026-08-07', '2026-08-09', '2026-08-10']);
    const status = getMonthlyFreezeStatus(m, today);

    expect(status.usedDates).toEqual(['2026-08-08', '2026-08-06']);
    expect(status.remaining).toBe(0);
  });
});

describe('Asia/Kolkata Timezone Boundary Tests', () => {
  it('Parses and handles local calendar days consistently around midnight', () => {
    const d1 = parseDayKey('2026-08-26');
    expect(toDayKey(d1)).toBe('2026-08-26');

    const d2 = parseDayKey(addDays('2026-08-26', 1));
    expect(toDayKey(d2)).toBe('2026-08-27');

    const dPrev = parseDayKey(addDays('2026-08-26', -1));
    expect(toDayKey(dPrev)).toBe('2026-08-25');
  });

  it('Month boundary rollover transitions cleanly across local calendar days', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });
});

describe('isDayComplete', () => {
  it('is true when 5 cards completed', () => {
    expect(isDayComplete({ ...emptyDay('2026-08-11'), cardsCompleted: 5 })).toBe(true);
    expect(isDayComplete({ ...emptyDay('2026-08-11'), cardsCompleted: 10 })).toBe(true);
  });

  it('is true when 1 spoken rep completed', () => {
    expect(isDayComplete({ ...emptyDay('2026-08-11'), cardsCompleted: 1, spokenReps: 1 })).toBe(true);
  });

  it('is false when under threshold', () => {
    expect(isDayComplete({ ...emptyDay('2026-08-11'), cardsCompleted: 4, spokenReps: 0 })).toBe(false);
    expect(isDayComplete(undefined)).toBe(false);
  });
});

describe('isPass', () => {
  it('treats only `again` as a failure', () => {
    expect(isPass('again')).toBe(false);
    expect(isPass('hard')).toBe(true);
    expect(isPass('good')).toBe(true);
    expect(isPass('easy')).toBe(true);
  });
});

describe('currentStreak', () => {
  it('counts consecutive completed days', () => {
    const m = days(['2026-08-09', '2026-08-10', '2026-08-11']);
    expect(currentStreak(m, '2026-08-11')).toBe(3);
  });

  it('morning after one missed day: freeze covers it, streak does not show 0', () => {
    // Completed 08-09, missed 08-10, morning of 08-11 (today not done yet).
    const m = days(['2026-08-09']);
    expect(currentStreak(m, '2026-08-11')).toBe(1);
  });

  it('does not zero out just because today is not done yet', () => {
    const m = days(['2026-08-09', '2026-08-10']);
    expect(currentStreak(m, '2026-08-11')).toBe(2);
  });

  it('absorbs up to two missed days in a month', () => {
    const m = days(['2026-08-04', '2026-08-06', '2026-08-07', '2026-08-09', '2026-08-10']);
    expect(currentStreak(m, '2026-08-10')).toBe(5);
  });

  it('breaks on the third miss in a month', () => {
    const m = days(['2026-08-01', '2026-08-03', '2026-08-05', '2026-08-07', '2026-08-09']);
    expect(currentStreak(m, '2026-08-09')).toBe(3);
  });

  it('is zero when nothing has ever been done', () => {
    expect(currentStreak(new Map(), '2026-08-11')).toBe(0);
  });

  it('does not spend grace before the streak has started', () => {
    const m = days(['2026-08-01']);
    expect(currentStreak(m, '2026-08-11')).toBe(0);
  });

  it('terminates on a long empty history', () => {
    expect(currentStreak(days(['2020-01-01']), '2026-08-11')).toBe(0);
  });
});

