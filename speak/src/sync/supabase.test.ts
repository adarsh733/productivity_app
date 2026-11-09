import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CardEvent,
  CardFeedback,
  DayRecord,
  InboxItem,
  Review,
  SavedReview,
  SeenTerm,
  WeekPlan,
} from '../types/contract';
import { db, enqueue } from '../db/db';
import {
  aiModuleCardFromRow,
  dayFromRow,
  dayRow,
  eventRow,
  feedbackFromRow,
  feedbackRow,
  inboxFromRow,
  inboxRow,
  moduleLevelsFromRemote,
  moduleLevelsToRemote,
  push,
  restore,
  reviewFromRow,
  reviewRow,
  savedReviewFromRow,
  savedReviewRow,
  seenFromRow,
  seenRow,
  sendCode,
  setSupabaseForTests,
  syncConfigured,
  verifyCode,
  viewEventFromRow,
  weekPlanFromRemote,
  weekPlanToRemote,
} from './supabase';

// Round-trip: local → remote row → local must be identity for every field the
// backup carries. A field that survives one way but not the other is a silent
// restore loss (the AG-009 A3 backup gap).

const USER = 'user-1';

describe('review row round-trip', () => {
  it('preserves every field including skippedAt', () => {
    const review: Review = {
      cardId: 'card-1',
      state: 'learning',
      due: '2026-10-01',
      intervalDays: 1,
      ease: 2.5,
      reps: 3,
      lapses: 2,
      lastGrade: 'again',
      lastSeenAt: 1787700000000,
      skippedAt: 1787700099999,
    };
    const row = reviewRow(review, USER);
    expect(row.user_id).toBe(USER);
    expect(row.skipped_at).toBe(new Date(review.skippedAt!).toISOString());
    expect(reviewFromRow(row)).toEqual(review);
  });

  it('maps absent optionals to null and back to undefined', () => {
    const review: Review = {
      cardId: 'card-2',
      state: 'new',
      due: '2026-10-01',
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
    };
    const row = reviewRow(review, USER);
    expect(row.last_grade).toBeNull();
    expect(row.last_seen_at).toBeNull();
    expect(row.skipped_at).toBeNull();
    expect(reviewFromRow(row)).toEqual(review);
  });
});

describe('day row round-trip', () => {
  it('preserves xp, spokenReps, challenge and challengeResult', () => {
    const day: DayRecord = {
      date: '2026-09-28',
      coreThreeDone: true,
      cardsCompleted: 12,
      secondsActive: 480,
      urgesRedirected: 2,
      bestMptSec: 18.5,
      labSessionDone: true,
      labSeconds: 300,
      xp: 17,
      spokenReps: 4,
      challenge: {
        date: '2026-09-28',
        title: 'Talk about the monsoon jam',
        situationCardId: 'sit-incident-05',
        useWord: 'gridlock',
        avoidPhrase: 'do the needful',
        voiceGoal: 'slower',
        targetSec: 60,
      },
      challengeResult: {
        recordingId: 'rec-9',
        longEnough: true,
        usedWord: true,
        avoidedPhrase: null,
        voiceGoalMet: false,
        done: false,
      },
    };
    const row = dayRow(day, USER);
    expect(row.user_id).toBe(USER);
    expect(row.xp).toBe(17);
    expect(row.spoken_reps).toBe(4);
    expect(row.challenge).toEqual(day.challenge);
    expect(row.challenge_result).toEqual(day.challengeResult);
    expect(dayFromRow(row)).toEqual(day);
  });

  it('maps absent optionals to defaults/null and back to undefined', () => {
    const day: DayRecord = {
      date: '2026-09-29',
      coreThreeDone: false,
      cardsCompleted: 0,
      secondsActive: 30,
      urgesRedirected: 0,
    };
    const row = dayRow(day, USER);
    expect(row.xp).toBe(0);
    expect(row.spoken_reps).toBe(0);
    expect(row.challenge).toBeNull();
    expect(row.challenge_result).toBeNull();
    // lab_session_done/lab_seconds/xp/spoken_reps are not-null columns with
    // defaults, so a restored row always materialises them — absence cannot
    // survive the trip. Values are equivalent to undefined for every reader.
    expect(dayFromRow(row)).toEqual({
      ...day,
      labSessionDone: false,
      labSeconds: 0,
      xp: 0,
      spokenReps: 0,
    });
  });
});

describe('inbox row round-trip', () => {
  it('preserves the coach fields kind, subject, fix, failReason, attempts, origin', () => {
    const item: InboxItem = {
      id: 'ib-1',
      createdAt: 1787700000000,
      text: 'I keep saying "revert back"',
      status: 'processed',
      processedAt: 1787700600000,
      generatedCardIds: ['card-a', 'card-b'],
      kind: 'mistake',
      subject: 'revert back',
      fix: 'revert',
      failReason: 'drafts failed verify',
      attempts: 2,
      origin: 'recording',
    };
    const row = inboxRow(item, USER);
    expect(row.user_id).toBe(USER);
    expect(row.kind).toBe('mistake');
    expect(row.subject).toBe('revert back');
    expect(row.fix).toBe('revert');
    expect(row.fail_reason).toBe('drafts failed verify');
    expect(row.attempts).toBe(2);
    expect(row.origin).toBe('recording');
    expect(inboxFromRow(row)).toEqual(item);
  });

  it('maps absent optionals to null and back to undefined', () => {
    const item: InboxItem = {
      id: 'ib-2',
      createdAt: 1787700000000,
      text: 'something to process later',
      status: 'raw',
    };
    const row = inboxRow(item, USER);
    expect(row.kind).toBeNull();
    expect(row.subject).toBeNull();
    expect(row.fix).toBeNull();
    expect(row.fail_reason).toBeNull();
    expect(row.attempts).toBeNull();
    expect(row.origin).toBeNull();
    expect(inboxFromRow(row)).toEqual(item);
  });
});

describe('week plan round-trip', () => {
  const plan: WeekPlan = {
    createdAt: 1787700000000,
    typeWeights: { word: 1.3, idiom: 0.8 },
    challengeFocus: 'slower',
    focusWords: ['Hiring', 'budget review'],
    note: 'Word reps first, then pauses.',
    previousTypeWeights: { word: 1, idiom: 1 },
  };

  it('preserves every field through toRemote → fromRemote', () => {
    const remote = weekPlanToRemote(plan);
    expect(remote).toEqual(plan);
    expect(weekPlanFromRemote(remote)).toEqual(plan);
  });

  it('maps no plan to null and back to undefined', () => {
    expect(weekPlanToRemote(undefined)).toBeNull();
    expect(weekPlanFromRemote(null)).toBeUndefined();
  });

  it('keeps a plan whose previousTypeWeights is an empty object', () => {
    // applyPlanToProfile snapshots `{}` when the profile had no typeWeights,
    // so an empty snapshot must not read as "malformed" on restore.
    const fresh: WeekPlan = {
      createdAt: 1787700000000,
      typeWeights: { word: 1.2 },
      note: 'Speak more words this week.',
      previousTypeWeights: {},
    };
    expect(weekPlanFromRemote(weekPlanToRemote(fresh))).toEqual(fresh);
  });

  it('drops a malformed plan whole rather than half-restoring it', () => {
    const good = weekPlanToRemote(plan);
    expect(weekPlanFromRemote('nope')).toBeUndefined();
    expect(weekPlanFromRemote([])).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, createdAt: 'x' })).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, note: '   ' })).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, typeWeights: undefined })).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, typeWeights: 'x' })).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, previousTypeWeights: undefined })).toBeUndefined();
    expect(weekPlanFromRemote({ ...good, previousTypeWeights: [] })).toBeUndefined();
  });

  it('cleans loose values instead of trusting them', () => {
    const loose = weekPlanFromRemote({
      ...weekPlanToRemote(plan),
      challengeFocus: 'louder',
      focusWords: [' Hiring ', 7, 'budget', 'w3', 'w4', 'w5', 'w6'],
      typeWeights: { word: 1.2, idiom: Number.NaN },
    });
    expect(loose).toEqual({
      createdAt: plan.createdAt,
      typeWeights: { word: 1.2 },
      previousTypeWeights: plan.previousTypeWeights,
      focusWords: ['Hiring', 'budget', 'w3', 'w4', 'w5'],
      note: plan.note,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v7 (2026-11-08): feedback, seen list, saved reviews, view events, AI cards,
// module levels, code sign-in. Every test below runs on a fake client through
// `setSupabaseForTests` — never real keys.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = [string, unknown];
const matches = (r: Row, f: Filter[]) => f.every(([k, v]) => r[k] === v);

function fakeClient(opts: { user?: { id: string; email: string } | null; tables?: Record<string, Row[]> } = {}) {
  const state = {
    user: opts.user ?? null,
    tables: opts.tables ?? ({} as Record<string, Row[]>),
    upserts: [] as { table: string; payload: Row; onConflict?: string }[],
    deletes: [] as { table: string; filters: Filter[] }[],
    otp: [] as unknown[],
    verify: [] as Record<string, unknown>[],
  };
  const select = (table: string) => {
    const filters: Filter[] = [];
    const run = () => ({ data: (state.tables[table] ?? []).filter((r) => matches(r, filters)), error: null });
    const q = {
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signInWithOtp: async (c: unknown) => {
        state.otp.push(c);
        return { data: {}, error: null };
      },
      verifyOtp: async (p: Record<string, unknown>) => {
        state.verify.push(p);
        if (p.token !== '123456') {
          return { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid' } };
        }
        state.user = { id: 'user-1', email: String(p.email) };
        return { data: { user: state.user, session: {} }, error: null };
      },
      signOut: async () => {
        state.user = null;
        return { error: null };
      },
    },
    from(table: string) {
      return {
        select: () => select(table),
        upsert: async (payload: Row, o?: { onConflict?: string }) => {
          state.upserts.push({ table, payload, onConflict: o?.onConflict });
          return { error: null };
        },
        delete: () => {
          const filters: Filter[] = [];
          const d = {
            eq(k: string, v: unknown) {
              filters.push([k, v]);
              return d;
            },
            then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
              state.deletes.push({ table, filters });
              state.tables[table] = (state.tables[table] ?? []).filter((r) => !matches(r, filters));
              return Promise.resolve({ error: null }).then(ok, bad);
            },
          };
          return d;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

const AT = 1_793_000_000_000;

const feedback: CardFeedback = {
  id: 'fb-v7-words-001',
  cardId: 'v7-words-001',
  module: 'words',
  thumb: 'down',
  reasons: ['too_easy', 'confusing'],
  comment: 'More office words please',
  reply: 'Got it: Words will get harder from the next batch.',
  at: AT,
  hidden: true,
};
const seen: SeenTerm = { id: 'words:ubiquitous', module: 'words', head: 'ubiquitous', cardId: 'v7-words-001', at: AT };
const saved: SavedReview = {
  cardId: 'v7-phrases-003',
  module: 'phrases',
  savedAt: AT,
  step: 1,
  due: '2026-11-15',
  rights: 1,
  retiredAt: AT + 1000,
  lastAnswer: 'knew',
};
const view: CardEvent = {
  id: 'ev-1',
  type: 'card_viewed',
  at: AT,
  date: '2026-10-26',
  cardId: 'v7-words-001',
  cardType: 'module',
  msSpent: 2400,
  mode: 'endless',
};

describe('v7 row round-trips', () => {
  it('feedback keeps every field, and absent optionals stay absent', () => {
    const row = feedbackRow(feedback, USER);
    expect(row.user_id).toBe(USER);
    expect(feedbackFromRow(row)).toEqual(feedback);
    const bare: CardFeedback = { id: 'fb-x', cardId: 'x', module: 'stories', reasons: [], reply: 'Got it', at: AT };
    const bareRow = feedbackRow(bare, USER);
    expect(bareRow.thumb).toBeNull();
    expect(bareRow.comment).toBeNull();
    expect(bareRow.hidden).toBe(false);
    expect(feedbackFromRow(bareRow)).toEqual(bare);
  });

  it('seen terms and saved reviews round-trip', () => {
    expect(seenFromRow(seenRow(seen, USER))).toEqual(seen);
    expect(savedReviewFromRow(savedReviewRow(saved, USER))).toEqual(saved);
    const fresh: SavedReview = { cardId: 'c', module: 'words', savedAt: AT, step: 0, due: '2026-11-11', rights: 0 };
    const row = savedReviewRow(fresh, USER);
    expect(row.retired_at).toBeNull();
    expect(row.last_answer).toBeNull();
    expect(savedReviewFromRow(row)).toEqual(fresh);
  });

  it('a card_viewed event carries its type and no grade, and comes back whole', () => {
    const row = eventRow(view, USER);
    expect(row.type).toBe('card_viewed');
    expect(row.grade).toBeNull();
    const back = viewEventFromRow(row);
    // `date` is rebuilt from `at` on this phone's clock.
    expect(back).toEqual({ ...view, date: back!.date });
    expect(back!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(viewEventFromRow({ ...row, type: 'card_saved' })).toBeNull();
    expect(viewEventFromRow({ ...row, card_id: null })).toBeNull();
  });

  it('module levels round-trip and drop bad values', () => {
    expect(moduleLevelsToRemote(undefined)).toBeNull();
    expect(moduleLevelsToRemote({})).toBeNull();
    expect(moduleLevelsFromRemote(moduleLevelsToRemote({ words: 3, stories: 1 }))).toEqual({ words: 3, stories: 1 });
    expect(moduleLevelsFromRemote({ words: 9, nope: 2, phrases: 2.5, better: 4 })).toEqual({ better: 4 });
    expect(moduleLevelsFromRemote('x')).toBeUndefined();
  });

  it('only AI-written module cards come back from the cards table', () => {
    const base = { id: 'v7-ai-words-0001', type: 'module', source: 'ai', lang: 'en', tags: ['t'], status: 'active' };
    const payload = { module: 'words', topic: 'work', word: 'candid' };
    const c = aiModuleCardFromRow({
      ...base,
      payload,
      batch_id: 'batch-words-1',
      seed_id: null,
      created_at: new Date(AT).toISOString(),
    });
    expect(c).toMatchObject({
      id: 'v7-ai-words-0001',
      module: 'words',
      word: 'candid',
      source: 'ai',
      batchId: 'batch-words-1',
      createdAt: AT,
    });
    expect(aiModuleCardFromRow({ ...base, source: 'seed', payload })).toBeNull();
    expect(aiModuleCardFromRow({ ...base, type: 'word', payload })).toBeNull();
    expect(aiModuleCardFromRow({ ...base, payload: { ...payload, module: 'nope' } })).toBeNull();
  });
});

async function clearSyncTables() {
  await Promise.all([
    db.outbox.clear(),
    db.feedback.clear(),
    db.seen.clear(),
    db.savedReviews.clear(),
    db.events.clear(),
    db.cards.clear(),
    db.profile.clear(),
    db.reviews.clear(),
    db.days.clear(),
    db.inbox.clear(),
    db.labSessions.clear(),
    db.voiceSamples.clear(),
  ]);
}

describe('push and restore on a fake client', () => {
  beforeEach(clearSyncTables);
  afterEach(() => setSupabaseForTests(null));

  it('is silent and sends nothing when not set up or signed out', async () => {
    setSupabaseForTests(null);
    expect(syncConfigured()).toBe(false);
    expect(await push()).toBe(0);
    expect(await sendCode('a@b.co')).toEqual({ ok: false, error: 'Backup is not switched on yet' });

    const { client, state } = fakeClient({ user: null });
    setSupabaseForTests(client);
    await db.seen.put(seen);
    await enqueue('seen', seen.id);
    expect(await push()).toBe(0);
    expect(state.upserts).toEqual([]);
    expect(await db.outbox.count()).toBe(1);
  });

  it('pushes feedback, seen, saved reviews, a view event and module levels, then empties the outbox', async () => {
    const { client, state } = fakeClient({ user: { id: USER, email: 'a@b.co' } });
    setSupabaseForTests(client);
    await db.feedback.put(feedback);
    await db.seen.put(seen);
    await db.savedReviews.put(saved);
    await db.events.put(view);
    await db.profile.put({ id: 'me', createdAt: AT, moduleLevels: { words: 3 } });
    await enqueue('feedback', feedback.id);
    await enqueue('seen', seen.id);
    await enqueue('savedReviews', saved.cardId);
    await enqueue('events', view.id);
    await enqueue('profile', 'me');

    expect(await push()).toBe(5);
    const by = Object.fromEntries(state.upserts.map((u) => [u.table, u]));
    expect(by.card_feedback).toMatchObject({ onConflict: 'user_id,id', payload: { id: feedback.id, hidden: true } });
    expect(by.seen_terms).toMatchObject({ onConflict: 'user_id,id', payload: { id: seen.id, head: 'ubiquitous' } });
    expect(by.saved_reviews).toMatchObject({
      onConflict: 'user_id,card_id',
      payload: { card_id: saved.cardId, step: 1 },
    });
    expect(by.events!.payload).toMatchObject({ id: 'ev-1', type: 'card_viewed', grade: null });
    expect(by.profile!.payload).toMatchObject({ user_id: USER, module_levels: { words: 3 } });
    expect(await db.outbox.count()).toBe(0);
    expect((await db.profile.get('me'))?.lastSyncAt).toBeTypeOf('number');
  });

  it('a card taken off the Sunday review is deleted from the backup, not left to come back', async () => {
    const { client, state } = fakeClient({
      user: { id: USER, email: 'a@b.co' },
      tables: { saved_reviews: [{ ...savedReviewRow(saved, USER) }] },
    });
    setSupabaseForTests(client);
    await enqueue('savedReviews', saved.cardId, 'delete');
    expect(await push()).toBe(1);
    expect(state.deletes).toEqual([
      {
        table: 'saved_reviews',
        filters: [
          ['user_id', USER],
          ['card_id', saved.cardId],
        ],
      },
    ]);
    expect(state.tables.saved_reviews).toEqual([]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('restore brings back feedback, seen, saved reviews, view events, AI cards and levels; local wins', async () => {
    await db.seen.put({ ...seen, cardId: 'local-card' });
    const { client } = fakeClient({
      user: { id: USER, email: 'a@b.co' },
      tables: {
        card_feedback: [feedbackRow(feedback, USER)],
        seen_terms: [
          seenRow({ ...seen, cardId: 'remote-card' }, USER),
          seenRow({ id: 'phrases:circle back', module: 'phrases', head: 'circle back', cardId: 'p1', at: AT }, USER),
        ],
        saved_reviews: [savedReviewRow(saved, USER)],
        events: [
          eventRow(view, USER),
          eventRow({ id: 'ev-2', type: 'card_saved', at: AT, cardId: 'v7-words-001' }, USER),
        ],
        cards: [
          {
            user_id: USER,
            id: 'v7-ai-words-0001',
            type: 'module',
            lang: 'en',
            tags: [],
            source: 'ai',
            status: 'active',
            payload: { module: 'words', topic: 'work', word: 'candid' },
            batch_id: 'batch-words-1',
            seed_id: null,
            created_at: new Date(AT).toISOString(),
          },
          { user_id: USER, id: 'old-1', type: 'word', source: 'ai', payload: {}, created_at: new Date(AT).toISOString() },
        ],
        profile: [{ user_id: USER, module_levels: { phrases: 4 } }],
      },
    });
    setSupabaseForTests(client);

    const n = await restore();
    expect(n).toMatchObject({ feedback: 1, seen: 1, savedReviews: 1, events: 1, cards: 1 });
    expect(await db.feedback.get(feedback.id)).toEqual(feedback);
    expect((await db.seen.get(seen.id))?.cardId).toBe('local-card');
    expect(await db.seen.get('phrases:circle back')).toBeTruthy();
    expect(await db.savedReviews.get(saved.cardId)).toEqual(saved);
    expect(await db.events.get('ev-1')).toMatchObject({ type: 'card_viewed', cardId: 'v7-words-001', msSpent: 2400 });
    expect(await db.events.get('ev-2')).toBeUndefined();
    expect(await db.cards.get('v7-ai-words-0001')).toMatchObject({ source: 'ai', batchId: 'batch-words-1' });
    expect(await db.cards.get('old-1')).toBeUndefined();
    expect((await db.profile.get('me'))?.moduleLevels).toEqual({ phrases: 4 });
  });
});

describe('6-digit email code sign-in', () => {
  afterEach(() => setSupabaseForTests(null));

  it('sendCode asks for a code with no redirect link', async () => {
    const { client, state } = fakeClient();
    setSupabaseForTests(client);
    expect(await sendCode('  me@example.com ')).toEqual({ ok: true });
    expect(state.otp).toEqual([{ email: 'me@example.com', options: { shouldCreateUser: true } }]);
    expect(await sendCode('   ')).toMatchObject({ ok: false });
    expect(state.otp).toHaveLength(1);
  });

  it('verifyCode checks the code with type email and rejects bad codes', async () => {
    const { client, state } = fakeClient();
    setSupabaseForTests(client);
    expect(await verifyCode('me@example.com', '12 34')).toEqual({ ok: false, error: 'The code is 6 digits' });
    expect(state.verify).toEqual([]);
    expect(await verifyCode('me@example.com', '000000')).toEqual({
      ok: false,
      error: 'Token has expired or is invalid',
    });
    expect(await verifyCode('me@example.com', '123 456')).toEqual({ ok: true });
    expect(state.verify.at(-1)).toEqual({ email: 'me@example.com', token: '123456', type: 'email' });
    expect(state.user).toMatchObject({ email: 'me@example.com' });
  });
});
