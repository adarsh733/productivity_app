import { describe, expect, it } from 'vitest';
import {
  buildDailyChallenge,
  ensureChallengeOnDay,
  makeTitle,
  pickVoiceGoal,
} from './buildDailyChallenge';
import { ensureStoredChallenge } from './useDailyChallenge';
import { emptyDay } from '../session/day';
import type { DayRecord } from '../../types/contract';

describe('buildDailyChallenge', () => {
  it('is deterministic per date: same inputs give the same challenge', () => {
    const inputs = {
      coachWords: ['nuance', 'brief'],
      coachMistakes: [{ wrong: 'revert back', right: 'revert' }],
      engagedWords: ['deadline'],
      situationCardIds: ['sit-1', 'sit-2'],
      calibrated: true,
      baselineDb: -20,
      recentAvgDb: -15,
    };
    const a = buildDailyChallenge('2026-09-26', inputs);
    const b = buildDailyChallenge('2026-09-26', inputs);
    expect(a).toEqual(b);
  });

  it('picks softer when calibrated and recent average is louder than normal', () => {
    const c = buildDailyChallenge('2026-09-26', {
      calibrated: true,
      baselineDb: -20,
      recentAvgDb: -15,
    });
    expect(c.voiceGoal).toBe('softer');
    expect(pickVoiceGoal({ calibrated: true, baselineDb: -20, recentAvgDb: -25 })).toBe('pause_first');
  });

  it('picks slower when pace baseline exists and recent WPM is above target', () => {
    const c = buildDailyChallenge('2026-09-26', {
      paceBaseline: 160,
      paceTarget: 144,
      recentWpm: 170,
    });
    expect(c.voiceGoal).toBe('slower');
    expect(pickVoiceGoal({ paceBaseline: 160, paceTarget: 144, recentWpm: 120 })).toBe('pause_first');
  });

  it('falls back to pause_first with no voice data', () => {
    expect(pickVoiceGoal({})).toBe('pause_first');
    const c = buildDailyChallenge('2026-09-26', {});
    expect(c.voiceGoal).toBe('pause_first');
  });

  it('a coachFocus from the weekly plan overrides the picked voice goal (AG-008 stage 5)', () => {
    // Voice data alone would pick 'softer'; the plan's branch wins.
    const overridden = buildDailyChallenge('2026-09-26', {
      calibrated: true,
      baselineDb: -20,
      recentAvgDb: -15,
      coachFocus: 'slower',
    });
    expect(overridden.voiceGoal).toBe('slower');
    expect(overridden.title).toBe(makeTitle('slower', overridden.targetSec, overridden.useWord));

    // Even with no voice data at all, the plan's branch stands.
    expect(buildDailyChallenge('2026-09-26', { coachFocus: 'softer' }).voiceGoal).toBe('softer');

    // Without a coachFocus the picker still decides.
    expect(
      buildDailyChallenge('2026-09-26', { calibrated: true, baselineDb: -20, recentAvgDb: -15 })
        .voiceGoal,
    ).toBe('softer');
  });

  it('titles stay plain and within 70 chars, even with a long word', () => {
    const titles = [
      makeTitle('softer', 45, 'nuance'),
      makeTitle('slower', 60, 'nuance'),
      makeTitle('pause_first', 30, 'nuance'),
      makeTitle('pause_first', 60, 'antidisestablishmentarianism-very-long-word-here'),
      makeTitle('softer', 45, undefined),
    ];
    for (const t of titles) {
      expect(t.length).toBeLessThanOrEqual(70);
    }
    expect(makeTitle('softer', 45, 'nuance')).toContain('nuance');
  });

  it('prefers coach words, falls back to engaged words', () => {
    const withCoach = buildDailyChallenge('2026-09-26', {
      coachWords: ['nuance'],
      engagedWords: ['deadline'],
    });
    expect(withCoach.useWord).toBe('nuance');
    const fallback = buildDailyChallenge('2026-09-26', { engagedWords: ['deadline'] });
    expect(fallback.useWord).toBe('deadline');
  });

  it('stores once per day: existing challenge for the date is untouched', () => {
    const day = { ...emptyDay('2026-09-26'), challenge: buildDailyChallenge('2026-09-26', {}) };
    const same = ensureChallengeOnDay(day, buildDailyChallenge('2026-09-26', { coachWords: ['x'] }));
    expect(same).toBe(day);
    const fresh = ensureChallengeOnDay(emptyDay('2026-09-26'), buildDailyChallenge('2026-09-26', {}));
    expect(fresh.challenge?.date).toBe('2026-09-26');
  });

  it('ensureStoredChallenge creates once then reuses', async () => {
    const store = new Map<string, DayRecord>();
    const first = await ensureStoredChallenge('2026-09-26', { coachWords: ['nuance'] }, {
      get: async (d) => store.get(d),
      put: async (d) => {
        store.set(d.date, d);
      },
    });
    expect(first.created).toBe(true);
    const second = await ensureStoredChallenge('2026-09-26', { coachWords: ['other'] }, {
      get: async (d) => store.get(d),
      put: async (d) => {
        store.set(d.date, d);
      },
    });
    expect(second.created).toBe(false);
    expect(second.challenge).toEqual(first.challenge);
  });
});
