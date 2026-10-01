import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db, getMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import type {
  Card,
  CardEvent,
  InboxItem,
  PlanWeekResult,
  Profile,
  Review,
  VoiceSample,
} from '../../types/contract';
import { AI_DRAFT_TYPES } from '../coach/pipeline';
import { AI_BUDGET_META, aiCallsUsed } from './budget';
import {
  PLAN_GAP_MS,
  PLAN_META,
  applyPlanToProfile,
  buildPlanPayload,
  clampPlan,
  knownWordMap,
  maybePlanWeek,
  planDue,
  undoWeekPlan,
} from './plan';
import { buildQueue, getTypeMultiplier } from '../../srs/queue';
import type { PaceAttempt } from '../speak/pace';

const DAY_MS = 24 * 60 * 60 * 1000;

function wordCard(id: string, term: string): Card {
  return {
    id,
    type: 'word',
    term,
    pos: 'noun',
    meaning: `meaning of ${term}`,
    examples: [`Use ${term} today.`, `He said ${term}.`],
    say: `Say ${term}.`,
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
  } as unknown as Card;
}

function idiomCard(id: string, phrase: string): Card {
  return {
    id,
    type: 'idiom',
    phrase,
    meaning: `meaning of ${phrase}`,
    scenario: `Use ${phrase} in a meeting.`,
    example: `He used ${phrase}.`,
    corporate: true,
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 1,
  } as unknown as Card;
}

function profile(over: Partial<Profile> = {}): Profile {
  return { id: 'me', createdAt: 1, ...over };
}

function viewed(id: string, cardId: string, cardType: Card['type'], at: number): CardEvent {
  return { id, type: 'card_viewed', at, cardId, cardType } as CardEvent;
}

function graded(id: string, cardId: string, grade: string, at: number): CardEvent {
  return {
    id,
    type: 'recall_graded',
    at,
    cardId,
    grade: grade as CardEvent['grade'],
  } as CardEvent;
}

function note(i: number, subject: string | undefined, status: InboxItem['status'] = 'processed'): InboxItem {
  return {
    id: `n-${i}`,
    createdAt: i,
    text: `note ${i}`,
    status,
    ...(subject !== undefined ? { subject } : {}),
  };
}

function planFetch(data: unknown, provider = 'gemini') {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string };
    return {
      ok: true,
      json: async () => ({ ok: true, task: body.task, provider, data }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function callsOf(fn: typeof fetch) {
  const calls = (fn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
  return calls.map(([, init]) => JSON.parse(init.body as string) as { task: string; payload: Record<string, unknown> });
}

beforeEach(async () => {
  await db.cards.clear();
  await db.events.clear();
  await db.reviews.clear();
  await db.meta.clear();
  await db.profile.clear();
  await db.inbox.clear();
  await db.voiceSamples.clear();
  await db.outbox.clear();
  localStorage.clear();
});

describe('clampPlan (the safety layer)', () => {
  it('clamps weights into [0.5, 1.5] and drops unknown and non-numeric types', () => {
    const raw: PlanWeekResult = {
      typeWeights: { word: 9, idiom: 0.1, feeling: 1.234, breath: 1.2, nonsense: 0.5, swap: 'x' as unknown as number },
      note: 'Practice words this week.',
    };
    const plan = clampPlan(raw, new Map());
    expect(plan).not.toBeNull();
    expect(plan!.typeWeights).toEqual({ word: 1.5, idiom: 0.5, feeling: 1.23 });
  });

  it('keeps only existing voice branches; unknown branches are ignored', () => {
    const kept = clampPlan({ challengeFocus: 'softer', note: 'Soften your voice.' }, new Map());
    expect(kept?.challengeFocus).toBe('softer');
    expect(kept?.note).toBe('Soften your voice.');

    const dropped = clampPlan({ challengeFocus: 'louder', note: 'Louder, please.' }, new Map());
    expect(dropped?.challengeFocus).toBeUndefined();
    expect(dropped?.note).toBe('Louder, please.');
  });

  it('focusWords: only existing cards, canonical casing, deduped, max 5', () => {
    const known = knownWordMap([
      wordCard('w1', 'Hiring'),
      wordCard('w2', 'revert'),
      wordCard('w3', 'escalate'),
      wordCard('w4', 'bandwidth'),
      wordCard('w5', 'circle back'),
      wordCard('w6', 'sync up'),
      wordCard('w7', 'touch base'),
    ]);
    const raw: PlanWeekResult = {
      focusWords: ['hiring', 'HIRING', 'revert', 'escalate', 'bandwidth', 'circle back', 'sync up', 'touch base', 'ghost'],
      note: 'Use these words.',
    };
    const plan = clampPlan(raw, known);
    expect(plan!.focusWords).toEqual(['Hiring', 'revert', 'escalate', 'bandwidth', 'circle back']);
  });

  it('note: whitespace collapsed, clipped to 90 chars; missing or blank note rejects the plan', () => {
    const long = 'a'.repeat(200);
    const plan = clampPlan({ note: `  Practice   ${long} things.  ` }, new Map());
    expect(plan!.note.length).toBeLessThanOrEqual(90);
    expect(plan!.note.startsWith('Practice a')).toBe(true);
    expect(plan!.note).not.toContain('  ');

    // A stored plan must be visible on Speak and undoable — note is required.
    expect(clampPlan({ typeWeights: { word: 9 } }, new Map())).toBeNull();
    expect(clampPlan({ note: '   ' }, new Map())).toBeNull();
    expect(clampPlan({ note: 42 as unknown as string }, new Map())).toBeNull();
  });
});

describe('applyPlanToProfile / undoWeekPlan', () => {
  const clamped = {
    typeWeights: { word: 1.5 },
    challengeFocus: 'slower' as const,
    focusWords: ['Hiring'],
    note: 'Practice hiring stories.',
  };

  it('merges new weights over the old, records previousTypeWeights for Undo', () => {
    const before = profile({ typeWeights: { word: 0.8, idiom: 1.1 } });
    const after = applyPlanToProfile(before, clamped, 1234);
    expect(after.typeWeights).toEqual({ word: 1.5, idiom: 1.1 });
    expect(after.weekPlan).toEqual({
      createdAt: 1234,
      typeWeights: { word: 1.5 },
      challengeFocus: 'slower',
      focusWords: ['Hiring'],
      note: 'Practice hiring stories.',
      previousTypeWeights: { word: 0.8, idiom: 1.1 },
    });
    // The original is untouched.
    expect(before.typeWeights).toEqual({ word: 0.8, idiom: 1.1 });
    expect(before.weekPlan).toBeUndefined();
  });

  it('undo restores the exact previous weights and clears the plan', () => {
    const before = profile({ typeWeights: { word: 0.8, idiom: 1.1 } });
    const undone = undoWeekPlan(applyPlanToProfile(before, clamped, 1234));
    expect(undone.typeWeights).toEqual({ word: 0.8, idiom: 1.1 });
    expect(undone.weekPlan).toBeUndefined();
  });

  it('undo with no prior weights removes typeWeights entirely', () => {
    const before = profile();
    const undone = undoWeekPlan(applyPlanToProfile(before, clamped, 1234));
    expect(undone.typeWeights).toBeUndefined();
    expect(undone.weekPlan).toBeUndefined();
  });

  it('undo without a plan returns the same profile', () => {
    const p = profile();
    expect(undoWeekPlan(p)).toBe(p);
  });
});

describe('planDue (7-day gate)', () => {
  const now = 100 * DAY_MS;

  it('fires exactly at the gap boundary, not a millisecond before', () => {
    expect(planDue(undefined, now - PLAN_GAP_MS + 1, now)).toBe(false);
    expect(planDue(undefined, now - PLAN_GAP_MS, now)).toBe(true);
  });

  it('first-ever plan is anchored to profile creation', () => {
    expect(planDue(profile({ createdAt: now - PLAN_GAP_MS }), undefined, now)).toBe(true);
    expect(planDue(profile({ createdAt: now - PLAN_GAP_MS + 1 }), undefined, now)).toBe(false);
    expect(planDue(undefined, undefined, now)).toBe(false);
  });
});

describe('buildPlanPayload', () => {
  const now = 10 * DAY_MS;
  const since = now - PLAN_GAP_MS;

  it('per-type views/again-rate/skips over the last 7 days only', () => {
    const cards = [wordCard('w1', 'Hiring'), idiomCard('i1', 'circle back')];
    const events: CardEvent[] = [
      viewed('old', 'w1', 'word', since - 1), // outside the window
      viewed('v1', 'w1', 'word', since + 1),
      viewed('v2', 'i1', 'idiom', since + 2),
      viewed('v3', 'w1', 'word', now),
      graded('g1', 'w1', 'again', now),
      graded('g2', 'w1', 'good', now),
      graded('g3', 'i1', 'good', now),
      graded('g4', 'i1', 'easy', now),
    ];
    const reviews: Review[] = [
      { cardId: 'i1', skippedAt: since + 5 } as Review,
      { cardId: 'w1', skippedAt: since - 10 } as Review, // outside the window
      { cardId: 'w1' } as Review, // never skipped
    ];

    const payload = buildPlanPayload({
      events,
      cards,
      reviews,
      inbox: [],
      voiceSamples: [],
      paceAttempts: [],
      profile: undefined,
      now,
    });

    expect(payload.types.map((t) => t.type)).toEqual([...AI_DRAFT_TYPES]);
    const word = payload.types.find((t) => t.type === 'word')!;
    const idiom = payload.types.find((t) => t.type === 'idiom')!;
    expect(word).toEqual({ type: 'word', views: 2, againRate: 0.5, skips: 0 });
    expect(idiom).toEqual({ type: 'idiom', views: 1, againRate: 0, skips: 1 });
    expect(payload.types.find((t) => t.type === 'feeling')).toEqual({
      type: 'feeling',
      views: 0,
      againRate: 0,
      skips: 0,
    });
  });

  it('coach subjects: newest first, discarded and blank skipped, deduped, max 10', () => {
    const inbox = [
      note(200, 'Budget', 'discarded'), // newest, but discarded
      note(199, 'Hiring'),
      note(198, 'hiring'), // dupe of the newer subject
      note(197, '  Words  '),
      ...Array.from({ length: 9 }, (_, i) => note(100 + i, `topic ${i}`)),
    ];
    const payload = buildPlanPayload({
      events: [],
      cards: [],
      reviews: [],
      inbox,
      voiceSamples: [],
      paceAttempts: [],
      profile: undefined,
      now,
    });
    expect(payload.coachSubjects).toEqual([
      'Hiring',
      'Words',
      'topic 8',
      'topic 7',
      'topic 6',
      'topic 5',
      'topic 4',
      'topic 3',
      'topic 2',
      'topic 1',
    ]);
  });

  it('voice block: mean dB, pace target, recent WPM, latest MPT gap', () => {
    const samples: VoiceSample[] = [
      { id: 's1', at: now - 1000, date: '2026-01-01', kind: 'session_db', value: -24 },
      { id: 's2', at: now - 2000, date: '2026-01-01', kind: 'session_db', value: -26 },
      { id: 's3', at: since - 5, date: '2026-01-01', kind: 'session_db', value: -40 }, // outside window
      { id: 'm1', at: 5, date: '2026-01-01', kind: 'mpt_habitual', value: 15 },
      { id: 'm2', at: 6, date: '2026-01-01', kind: 'mpt_soft', value: 25 },
    ];
    const base: PaceAttempt[] = Array.from({ length: 5 }, (_, i) => ({
      wpm: 100 + i,
      durationSec: 25,
      at: since - 20, // baseline attempts: before the window
    }));
    const recent: PaceAttempt[] = [
      { wpm: 90, durationSec: 25, at: now - 3000 },
      { wpm: 100, durationSec: 25, at: now - 2000 },
      { wpm: 110, durationSec: 25, at: now - 1000 },
    ];

    const payload = buildPlanPayload({
      events: [],
      cards: [],
      reviews: [],
      inbox: [],
      voiceSamples: samples,
      paceAttempts: [...base, ...recent],
      profile: profile({ baselineDb: -30, calibrationSamples: 7 }),
      now,
    });

    expect(payload.voice).toBeDefined();
    expect(payload.voice!.calibrated).toBe(true);
    expect(payload.voice!.baselineDb).toBe(-30);
    expect(payload.voice!.recentAvgDb).toBe(-25);
    expect(payload.voice!.paceBaseline).toBe(102);
    expect(payload.voice!.paceTarget).toBe(92);
    expect(payload.voice!.recentWpm).toBe(100);
    expect(payload.voice!.mptGapSec).toBe(10);
  });

  it('omits voice and coachSubjects entirely when there is nothing to say', () => {
    const payload = buildPlanPayload({
      events: [],
      cards: [],
      reviews: [],
      inbox: [],
      voiceSamples: [],
      paceAttempts: [],
      profile: undefined,
      now,
    });
    expect('voice' in payload).toBe(false);
    expect('coachSubjects' in payload).toBe(false);
    expect(payload.types).toHaveLength(AI_DRAFT_TYPES.length);
  });
});

describe('maybePlanWeek (gates, budget, storage)', () => {
  function seedActivity() {
    return db.events.put(viewed('v1', 'w1', 'word', Date.now()));
  }

  it('stores the clamped plan on the first due open; merges weights; consumes one AI call', async () => {
    await db.cards.put(wordCard('w1', 'Hiring'));
    await db.profile.put(profile({ typeWeights: { idiom: 1.1 } }));
    await seedActivity();
    const fetchFn = planFetch({
      typeWeights: { word: 9, breath: 1.2 },
      challengeFocus: 'louder',
      focusWords: ['Ghost', 'Hiring'],
      note: '  Practice   hiring stories this week. ',
    });

    expect(await maybePlanWeek(fetchFn)).toBe(true);

    const stored = await db.profile.get('me');
    expect(stored?.typeWeights).toEqual({ idiom: 1.1, word: 1.5 });
    expect(stored?.weekPlan?.note).toBe('Practice hiring stories this week.');
    expect(stored?.weekPlan?.typeWeights).toEqual({ word: 1.5 });
    expect(stored?.weekPlan?.challengeFocus).toBeUndefined(); // 'louder' is not a real branch
    expect(stored?.weekPlan?.focusWords).toEqual(['Hiring']);
    expect(stored?.weekPlan?.previousTypeWeights).toEqual({ idiom: 1.1 });

    const calls = callsOf(fetchFn);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.task).toBe('plan_week');
    expect(Array.isArray(calls[0]!.payload.types)).toBe(true);
    expect(calls[0]!.payload.coachSubjects).toBeUndefined();

    expect(typeof (await getMeta<number>(PLAN_META))).toBe('number');
    expect(await aiCallsUsed()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('inside the 7-day gate: no fetch, no claim', async () => {
    await db.profile.put(profile());
    await db.meta.put({ key: PLAN_META, value: Date.now(), updatedAt: 1 });
    await seedActivity();
    const fetchFn = planFetch({ note: 'x' });

    expect(await maybePlanWeek(fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('a completely quiet week costs nothing — not even a claim', async () => {
    await db.profile.put(profile());
    const fetchFn = planFetch({ note: 'x' });

    expect(await maybePlanWeek(fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(PLAN_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('driver failure: silent, gate released, the spent call is not refunded', async () => {
    await db.profile.put(profile());
    await seedActivity();
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    expect(await maybePlanWeek(failing)).toBe(false);
    expect(await db.profile.get('me').then((p) => p?.weekPlan)).toBeUndefined();
    expect(await getMeta(PLAN_META)).toBeUndefined(); // released: next open retries
    expect(await aiCallsUsed()).toBe(1);

    // Next open: the claim works again and the plan lands.
    const ok = planFetch({ note: 'Try slower sentences.' });
    expect(await maybePlanWeek(ok)).toBe(true);
    expect((await db.profile.get('me'))?.weekPlan?.note).toBe('Try slower sentences.');
  });

  it('a response with no usable note stores nothing and releases the gate', async () => {
    await db.profile.put(profile());
    await seedActivity();

    expect(await maybePlanWeek(planFetch({ typeWeights: { word: 9 } }))).toBe(false);
    expect(await db.profile.get('me').then((p) => p?.weekPlan)).toBeUndefined();
    expect(await getMeta(PLAN_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(1);
  });

  it('offline: no fetch, no claim, no budget', async () => {
    await db.profile.put(profile());
    await seedActivity();
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchFn = planFetch({ note: 'x' });

    expect(await maybePlanWeek(fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(PLAN_META)).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);
    spy.mockRestore();
  });

  it('over the shared daily budget: silently skipped, nothing claimed', async () => {
    await db.profile.put(profile());
    await seedActivity();
    await db.meta.put({
      key: AI_BUDGET_META,
      value: { date: todayKey(), count: 25 },
      updatedAt: 1,
    });
    const fetchFn = planFetch({ note: 'x' });

    expect(await maybePlanWeek(fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getMeta(PLAN_META)).toBeUndefined();
  });

  it('two simultaneous opens: exactly one plan, one request', async () => {
    await db.profile.put(profile());
    await seedActivity();
    const fetchFn = planFetch({ note: 'One plan only.' });

    const [a, b] = await Promise.all([maybePlanWeek(fetchFn), maybePlanWeek(fetchFn)]);
    expect([a, b].sort()).toEqual([false, true]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('after a successful plan, the next open within the week does nothing', async () => {
    await db.profile.put(profile());
    await seedActivity();

    expect(await maybePlanWeek(planFetch({ note: 'First.' }))).toBe(true);
    const fetchFn = planFetch({ note: 'Second.' });
    expect(await maybePlanWeek(fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await db.profile.get('me'))?.weekPlan?.note).toBe('First.');
  });
});

describe('the queue actually reads the plan weights (AG-008 §5)', () => {
  it('getTypeMultiplier honours the stored weights', () => {
    expect(getTypeMultiplier('word', undefined, { word: 1.5 })).toBeCloseTo(1.5);
    expect(getTypeMultiplier('idiom', undefined, { word: 1.5 })).toBeCloseTo(1);
  });

  it('buildQueue serves the up-weighted type first', () => {
    const cards = [idiomCard('i1', 'circle back'), wordCard('w1', 'Hiring')];
    const merged = applyPlanToProfile(profile(), {
      typeWeights: { word: 1.5, idiom: 0.5 },
      note: 'Words first this week.',
    }, 1);

    const queue = buildQueue(
      cards,
      new Map(),
      {
        today: todayKey(),
        seenCardIds: new Set(),
        breathServedToday: 0,
        newServedToday: 1, // defeats the fresh-day-1 starter injection
        limit: 2,
        typeWeights: merged.typeWeights,
      },
      Date.now(),
    );

    expect(queue).toHaveLength(2);
    expect(queue[0]!.card.type).toBe('word');
  });
});
