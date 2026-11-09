import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getMeta, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { Card, CardFeedback, ModuleBatchRequest, ModuleCard, ModuleId, ModuleLevel } from '../../types/contract';
import { AI_BUDGET_META, AI_DAILY_CAP, BACKGROUND_RESERVE, aiCallsUsed } from './budget';
import { AiCallError, CoachNeedsKeyError } from '../coach/pipeline';
import {
  MODULE_BATCH_CALLS,
  MODULE_BATCH_META,
  MODULE_BATCH_PER_CALL,
  MODULE_BATCH_SIZE,
  MODULE_BATCH_TRIGGER,
  batchProviderMeta,
  batchRequest,
  draftProblems,
  maybeModuleBatch,
  nextLevel,
  pickBatchModule,
  recheckBatch,
  runModuleBatch,
  seenKey,
  shiftModuleLevel,
  unseenByModule,
  type BatchDeps,
  type BatchState,
} from './moduleBatch';

const NOW = new Date(2026, 10, 8, 10, 0, 0).getTime();
const TODAY = todayKey(new Date(NOW));

/** A words card the way the writer returns it; the head carries the index so each is unique. */
function wordDraft(head: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'x',
    type: 'module',
    module: 'words',
    topic: 'Loud sounds',
    lang: 'en',
    track: 'words',
    level: 2,
    kind: 'learn',
    category: 'Words',
    tags: ['words'],
    word: head,
    pos: 'adjective',
    say: 'SAY-it',
    meaning: 'A plain meaning.',
    examples: [
      { label: 'At home', text: `This is **${head}** at home.`, icon: 'home' },
      { label: 'At work', text: `That was **${head}** at work.`, icon: 'work' },
    ],
    right: { label: '✓ Right', text: `A **${head}** sound.` },
    wrong: [{ label: '✗ Not for people', text: `He is ${head}.` }],
    rule: 'only for sound',
    ...over,
  };
}

function libraryWord(id: string, head: string, over: Record<string, unknown> = {}): Card {
  return { ...wordDraft(head), id, source: 'seed', status: 'active', createdAt: 1, ...over } as unknown as Card;
}

function fb(cardId: string, over: Partial<CardFeedback> = {}): CardFeedback {
  return { id: `fb-${cardId}`, cardId, module: 'words', reasons: [], reply: '', at: 1, ...over };
}

const full = (): Record<ModuleId, number> => ({ words: 100, smalltalk: 100, better: 100, phrases: 100, stories: 100 });

beforeEach(async () => {
  await db.cards.clear();
  await db.feedback.clear();
  await db.seen.clear();
  await db.events.clear();
  await db.batches.clear();
  await db.outbox.clear();
  await db.meta.clear();
  await db.profile.clear();
});

describe('constants', () => {
  it('are the fixed names', () => {
    expect(MODULE_BATCH_SIZE).toBe(30);
    expect(MODULE_BATCH_TRIGGER).toBe(60);
    expect(MODULE_BATCH_PER_CALL).toBe(10);
    expect(MODULE_BATCH_CALLS).toBe(6);
  });
});

describe('unseenByModule / pickBatchModule (pure)', () => {
  const cards = [
    libraryWord('a', 'alpha'),
    libraryWord('b', 'beta'),
    libraryWord('c', 'gamma'),
    libraryWord('d', 'delta'),
    libraryWord('e', 'epsilon', { status: 'buried' }),
  ];

  it('counts active cards not seen by id or head and not hidden', () => {
    const n = unseenByModule(cards, new Set(['a']), new Set([seenKey('words', 'Gamma')]), new Set(['d']));
    expect(n.words).toBe(1);
    expect(n.smalltalk).toBe(0);
  });

  it('picks the module with the fewest unseen under the trigger; null when all are full', () => {
    expect(pickBatchModule(full(), undefined, TODAY)).toBeNull();
    expect(pickBatchModule({ ...full(), better: 59, phrases: 10 }, undefined, TODAY)).toBe('phrases');
    expect(pickBatchModule({ ...full(), better: 60 }, undefined, TODAY)).toBeNull();
  });

  it('skips a module already batched today and stops at two a day', () => {
    const low = { ...full(), words: 0, stories: 5 };
    const one: BatchState = { date: TODAY, count: 1, lastAt: 1, modules: ['words'] };
    expect(pickBatchModule(low, one, TODAY)).toBe('stories');
    expect(pickBatchModule(low, { ...one, count: 2, modules: ['words', 'stories'] }, TODAY)).toBeNull();
    expect(pickBatchModule(low, { ...one, date: '2000-01-01' }, TODAY)).toBe('words');
  });
});

describe('nextLevel', () => {
  it('moves one step, stays inside 1-5', () => {
    expect(nextLevel(2, ['too_easy'])).toBe(3);
    expect(nextLevel(2, ['too_hard'])).toBe(1);
    expect(nextLevel(5, ['too_easy'])).toBe(5);
    expect(nextLevel(1, ['too_hard'])).toBe(1);
    expect(nextLevel(3, ['confusing'])).toBe(3);
    expect(nextLevel(3, ['too_easy', 'too_hard'])).toBe(3);
  });
});

describe('batchRequest', () => {
  it('carries his thumbs, reasons, comments (newest first), level, seen heads and start id', () => {
    const rows = [
      { ...fb('a', { thumb: 'up', at: 1 }), head: 'alpha' },
      { ...fb('b', { thumb: 'down', reasons: ['confusing'], comment: 'too wordy', at: 3 }), head: 'beta' },
      { ...fb('c', { reasons: ['loved'], at: 2 }), head: 'gamma' },
      { ...fb('d', { thumb: 'down', hidden: true, comment: 'forgotten', at: 9 }), head: 'delta' },
      { ...fb('e', { module: 'stories', thumb: 'up', comment: 'elsewhere', at: 4 }), head: 'story' },
    ];
    const r = batchRequest('words', 3 as ModuleLevel, rows, ['alpha', 'beta'], 'v7-ai-words-0007');
    expect(r).toEqual({
      type: 'module',
      module: 'words',
      count: 10,
      level: 3,
      liked: ['gamma', 'alpha'],
      disliked: [{ head: 'beta', reasons: ['confusing'] }],
      comments: ['too wordy'],
      seen: ['alpha', 'beta'],
      startId: 'v7-ai-words-0007',
    });
  });

  it('keeps at most 20 comments', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ ...fb(`c${i}`, { comment: `note ${i}`, at: i }), head: `h${i}` }));
    const r = batchRequest('words', 2, rows, [], 'v7-ai-words-0001');
    expect(r.comments).toHaveLength(20);
    expect(r.comments[0]).toBe('note 24');
  });
});

describe('draftProblems (local check)', () => {
  it('accepts a good card and rejects Hindi, a missing ✗ line and long slides', () => {
    expect(draftProblems(wordDraft('thunderous'), 'words')).toEqual([]);
    expect(draftProblems(wordDraft('x1', { meaning: 'Arre yaar, loud.' }), 'words').join(' ')).toMatch(/Hindi/);
    expect(draftProblems(wordDraft('x2', { wrong: [{ label: 'Not this', text: 'no' }] }), 'words').join(' ')).toMatch(/✗/);
    expect(draftProblems(wordDraft('x3', { meaning: Array(60).fill('word').join(' ') }), 'words').join(' ')).toMatch(/words \(max/);
    expect(draftProblems('nope', 'words')).toEqual(['not a card']);
  });
});

/** Fake aiPost + checkItems: every writer call returns `perCall` drafts; remembers what it was asked. */
function fakes(
  opts: {
    perCall?: number;
    heads?: (call: number, i: number) => string;
    failAt?: number;
    passKeys?: (keys: string[]) => string[];
  } = {},
) {
  const requests: ModuleBatchRequest[] = [];
  const checks: string[][] = [];
  let call = 0;
  const aiPostFake = vi.fn(async (task: string, payload: unknown) => {
    expect(task).toBe('expand_seed');
    requests.push(payload as ModuleBatchRequest);
    const c = call++;
    if (opts.failAt === c) throw new AiCallError('offline', 'offline');
    const cards = Array.from({ length: opts.perCall ?? 10 }, (_, i) =>
      wordDraft(opts.heads ? opts.heads(c, i) : `word${c}x${i}`),
    );
    return { data: { cards }, provider: 'gemini' as const };
  });
  const checkFake = vi.fn(async (items: readonly { key: string }[]) => {
    const keys = items.map((i) => i.key);
    checks.push(keys);
    return new Set(opts.passKeys ? opts.passKeys(keys) : keys);
  });
  const deps: Partial<BatchDeps> = {
    aiPost: aiPostFake as unknown as BatchDeps['aiPost'],
    checkItems: checkFake as unknown as BatchDeps['checkItems'],
    now: () => NOW,
  };
  return { deps, requests, checks, aiPostFake, checkFake };
}

describe('runModuleBatch', () => {
  it('runs 3 writer calls of 10, checks each, stores 30 ai cards and queues them', async () => {
    const f = fakes();
    const b = await runModuleBatch('words', f.deps);
    expect(f.aiPostFake).toHaveBeenCalledTimes(3);
    expect(f.checkFake).toHaveBeenCalledTimes(3);
    expect(b.status).toBe('done');
    expect(b.kept).toHaveLength(30);
    expect(b.asked).toBe(30);
    expect(b.level).toBe(2);
    expect(b.id).toBe(`batch-words-${NOW}`);

    const stored = (await db.cards.toArray()) as unknown as ModuleCard[];
    expect(stored).toHaveLength(30);
    expect(stored.every((c) => c.source === 'ai' && c.batchId === b.id && c.status === 'active')).toBe(true);
    expect(stored.map((c) => c.id)).toContain('v7-ai-words-0001');
    expect(stored.map((c) => c.id)).toContain('v7-ai-words-0030');
    expect((await db.outbox.toArray()).filter((o) => o.table === 'cards')).toHaveLength(30);
    expect(await db.batches.get(b.id)).toMatchObject({ status: 'done', kept: b.kept });
    expect(await getMeta(batchProviderMeta(b.id))).toBe('gemini');
    expect(await aiCallsUsed(TODAY)).toBe(MODULE_BATCH_CALLS);
  });

  it('tells the writer his feedback, his level and every seen head; later calls also avoid earlier cards', async () => {
    await db.cards.put(libraryWord('v7-words-01', 'deafening'));
    await db.feedback.put(fb('v7-words-01', { thumb: 'up', comment: 'more like this' }));
    await db.seen.put({ id: seenKey('words', 'Muffled'), module: 'words', head: 'Muffled', cardId: 'old', at: 1 });
    await db.profile.put({ id: 'me', createdAt: 1, userId: null, moduleLevels: { words: 4 } });
    const f = fakes();
    await runModuleBatch('words', f.deps);
    const [first, , third] = f.requests;
    expect(first).toMatchObject({
      type: 'module',
      module: 'words',
      count: 10,
      level: 4,
      liked: ['deafening'],
      comments: ['more like this'],
      seen: ['Muffled'],
      startId: 'v7-ai-words-0001',
    });
    expect(third!.seen).toContain('Muffled');
    expect(third!.seen).toContain('word0x0');
    expect(third!.startId).toBe('v7-ai-words-0021');
  });

  it('drops cards that fail the local check, repeat a seen or library head, or fail the other provider', async () => {
    await db.cards.put(libraryWord('v7-words-01', 'deafening'));
    await db.seen.put({ id: seenKey('words', 'muffled'), module: 'words', head: 'muffled', cardId: 'old', at: 1 });
    const f = fakes({
      perCall: 4,
      heads: (c, i) => (c === 0 ? ['Deafening', 'Muffled', 'fine0', 'fine1'][i]! : `c${c}n${i}`),
      passKeys: (keys) => keys.filter((k) => k !== 'd0'),
    });
    const b = await runModuleBatch('words', f.deps);
    // call 0: two repeats dropped on the phone, so only 2 go to the checker; d0 (fine0) fails there.
    expect(f.checks[0]).toHaveLength(2);
    const heads = ((await db.cards.toArray()) as unknown as Array<ModuleCard & { word: string }>)
      .filter((c) => c.source === 'ai')
      .map((c) => c.word);
    expect(heads).not.toContain('Deafening');
    expect(heads).not.toContain('Muffled');
    expect(heads).not.toContain('fine0');
    expect(heads).toContain('fine1');
    expect(b.dropped).toBeGreaterThan(0);
  });

  it('stores nothing the checker did not pass; a missing second key stops the batch', async () => {
    const f = fakes({ passKeys: () => [] });
    const b = await runModuleBatch('words', f.deps);
    expect(await db.cards.count()).toBe(0);
    expect(b.status).toBe('failed');

    await db.meta.clear();
    const keyless = fakes();
    keyless.checkFake.mockRejectedValue(new CoachNeedsKeyError());
    const b2 = await runModuleBatch('words', keyless.deps);
    expect(await db.cards.count()).toBe(0);
    expect(b2.status).toBe('failed');
    expect(keyless.aiPostFake).toHaveBeenCalledTimes(1);
  });

  it('gives back the slots that never reached a model when offline', async () => {
    const f = fakes({ failAt: 0 });
    const b = await runModuleBatch('words', f.deps);
    expect(b.status).toBe('failed');
    expect(await db.cards.count()).toBe(0);
    expect(await aiCallsUsed(TODAY)).toBe(0);
  });

  it('refuses when the budget would eat the Ask reserve; nothing is called', async () => {
    await setMeta(AI_BUDGET_META, {
      date: TODAY,
      count: AI_DAILY_CAP - BACKGROUND_RESERVE - MODULE_BATCH_CALLS + 1,
    });
    const f = fakes();
    const b = await runModuleBatch('words', f.deps);
    expect(b.status).toBe('failed');
    expect(f.aiPostFake).not.toHaveBeenCalled();
  });

  it('numbers new ids after the ai cards already stored', async () => {
    await db.cards.put(libraryWord('v7-ai-words-0007', 'oldai', { source: 'ai' }));
    const f = fakes({ perCall: 2 });
    const b = await runModuleBatch('words', f.deps);
    expect(b.kept[0]).toBe('v7-ai-words-0008');
  });
});

describe('maybeModuleBatch', () => {
  it('does nothing while every module is above the trigger', async () => {
    const mods: ModuleId[] = ['words', 'smalltalk', 'better', 'phrases', 'stories'];
    for (const m of mods) {
      await db.cards.bulkPut(
        Array.from(
          { length: MODULE_BATCH_TRIGGER },
          (_, i) => libraryWord(`${m}-${i}`, `head ${m} ${i}`, { module: m }),
        ),
      );
    }
    const f = fakes();
    expect(await maybeModuleBatch(f.deps)).toBeNull();
    expect(f.aiPostFake).not.toHaveBeenCalled();
  });

  it('runs one batch for a thin module, then holds the gap, one module a day and the cap of two', async () => {
    await db.cards.put(libraryWord('w1', 'one'));
    const f = fakes({ perCall: 2 });
    const first = await maybeModuleBatch(f.deps);
    expect(first).not.toBeNull();
    const state = await getMeta<BatchState>(MODULE_BATCH_META);
    expect(state).toMatchObject({ date: TODAY, count: 1 });
    expect(state!.modules).toHaveLength(1);

    // inside the gap: nothing
    expect(await maybeModuleBatch(f.deps)).toBeNull();
    // after the gap: another module
    const second = await maybeModuleBatch({ ...f.deps, now: () => NOW + 10 * 60 * 1000 });
    expect(second).not.toBeNull();
    expect(second!.module).not.toBe(first!.module);
    // two a day
    expect(await maybeModuleBatch({ ...f.deps, now: () => NOW + 20 * 60 * 1000 })).toBeNull();
  });
});

describe('recheckBatch (Wrong English)', () => {
  async function seedBatch() {
    const f = fakes({ perCall: 3 });
    return runModuleBatch('words', f.deps);
  }

  it('re-checks the rest of the batch on the other provider and buries what fails', async () => {
    const b = await seedBatch();
    const flagged = (await db.cards.get(b.kept[0]!)) as unknown as ModuleCard;
    const spent = await aiCallsUsed(TODAY);
    const asked: string[][] = [];
    const checkItems = vi.fn(async (items: readonly { key: string }[], generator?: string) => {
      asked.push(items.map((i) => i.key));
      expect(generator).toBe('gemini');
      return new Set(items.map((i) => i.key).filter((k) => k !== b.kept[2]));
    });
    const n = await recheckBatch(flagged, {
      checkItems: checkItems as unknown as BatchDeps['checkItems'],
      now: () => NOW,
    });
    expect(n).toBe(1);
    expect(asked[0]).toHaveLength(b.kept.length - 1);
    expect(asked[0]).not.toContain(flagged.id);
    expect((await db.cards.get(b.kept[2]!))!.status).toBe('buried');
    expect((await db.cards.get(b.kept[1]!))!.status).toBe('active');
    expect((await db.feedback.get(`fb-${b.kept[2]}`))!.reasons).toContain('wrong_english');
    expect((await db.batches.get(b.id))!.recheckedAt).toBe(NOW);
    expect(await aiCallsUsed(TODAY)).toBe(spent + 1);
  });

  it('does nothing for a library card or an unknown batch; a failed check buries nothing and gives the slot back', async () => {
    const b = await seedBatch();
    const never = vi.fn(async () => new Set<string>());
    const dep = { checkItems: never as unknown as BatchDeps['checkItems'], now: () => NOW };
    expect(await recheckBatch({ id: 'v7-words-01' }, dep)).toBe(0);
    expect(await recheckBatch({ id: b.kept[0]!, batchId: 'batch-words-1' }, dep)).toBe(0);
    expect(never).not.toHaveBeenCalled();

    const flaky = vi.fn(async () => {
      throw new AiCallError('offline', 'offline');
    });
    const spent = await aiCallsUsed(TODAY);
    const n = await recheckBatch(
      { id: b.kept[0]!, batchId: b.id },
      { checkItems: flaky as unknown as BatchDeps['checkItems'], now: () => NOW },
    );
    expect(n).toBe(0);
    expect(await aiCallsUsed(TODAY)).toBe(spent);
    expect((await db.cards.get(b.kept[1]!))!.status).toBe('active');
  });
});

describe('shiftModuleLevel', () => {
  it('moves Profile.moduleLevels one step per call, clamps, and queues the profile', async () => {
    expect(await shiftModuleLevel('words', ['too_easy'])).toBe(3);
    expect((await db.profile.get('me'))!.moduleLevels).toEqual({ words: 3 });
    expect((await db.outbox.toArray()).filter((o) => o.table === 'profile')).toHaveLength(1);
    expect(await shiftModuleLevel('stories', ['too_hard'])).toBe(1);
    expect(await shiftModuleLevel('stories', ['too_hard'])).toBe(1);
    expect((await db.profile.get('me'))!.moduleLevels).toEqual({ words: 3, stories: 1 });
    expect(await shiftModuleLevel('words', ['confusing'])).toBe(3);
  });
});
