import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import type { Card, InboxItem } from '../../types/contract';
import {
  LEARNER_META,
  NOTES_MAX,
  NUDGE_DAYS,
  TOPICS_MAX,
  WATCH_MAX,
  activeNudges,
  applyPreference,
  difficultyShift,
  forgetNote,
  getProfile,
  learnerContext,
  noteTopics,
  watchList,
} from './profile';

const DAY = 86_400_000;

function mistake(id: string, wrong: string, right: string, createdAt: number, over: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    createdAt,
    text: `${wrong} -> ${right}`,
    status: 'processed',
    kind: 'mistake',
    subject: wrong,
    fix: right,
    ...over,
  };
}

beforeEach(async () => {
  await Promise.all([db.meta.clear(), db.weakSpots.clear(), db.inbox.clear(), db.cards.clear()]);
});

describe('getProfile', () => {
  it('a fresh phone has an empty memory', async () => {
    expect(await getProfile()).toEqual({
      wishTopics: [],
      seenTopics: [],
      notes: [],
      avoid: [],
      amount: [],
      difficulty: [],
    });
  });

  it('fills missing fields from an older stored shape', async () => {
    await db.meta.put({ key: LEARNER_META, value: { notes: [{ text: 'x', at: 1 }] }, updatedAt: 1 });
    const p = await getProfile();
    expect(p.notes).toEqual([{ text: 'x', at: 1 }]);
    expect(p.wishTopics).toEqual([]);
  });
});

describe('applyPreference', () => {
  it('stores his wish: note, topics, avoid, nudges', async () => {
    const p = await applyPreference(
      {
        note: '  More cricket   small talk ',
        topics: ['cricket', ' ', 'IPL'],
        avoid: ['revert back'],
        moreOf: ['smalltalk'],
        easier: ['words'],
        lessOf: ['nonsense' as never],
      },
      'more cricket small talk please',
      100,
    );
    expect(p.notes).toEqual([{ text: 'More cricket small talk', at: 100 }]);
    expect(p.wishTopics.map((t) => t.text)).toEqual(['cricket', 'IPL']);
    expect(p.avoid.map((t) => t.text)).toEqual(['revert back']);
    expect(p.amount).toEqual([{ track: 'smalltalk', dir: 1, at: 100 }]);
    expect(p.difficulty).toEqual([{ track: 'words', dir: -1, at: 100 }]);
    expect(await getProfile()).toEqual(p);
  });

  it('keeps his own words when the summary is empty; newest first; capped', async () => {
    for (let i = 0; i < NOTES_MAX + 2; i++) {
      await applyPreference({ note: '' }, `wish ${i}`, i);
    }
    const p = await getProfile();
    expect(p.notes).toHaveLength(NOTES_MAX);
    expect(p.notes[0]!.text).toBe(`wish ${NOTES_MAX + 1}`);
  });

  it('the latest nudge per skill wins', async () => {
    await applyPreference({ note: 'more stories', moreOf: ['stories'] }, '', 1);
    await applyPreference({ note: 'fewer stories', lessOf: ['stories'] }, '', 2);
    const p = await getProfile();
    expect(p.amount).toEqual([{ track: 'stories', dir: -1, at: 2 }]);
  });
});

describe('noteTopics / forgetNote', () => {
  it('remembers chat and ask subjects, newest first, max 3 at a time', async () => {
    await noteTopics(['billing', 'a', 'b', 'c'], 'chat', 5);
    await noteTopics(['Billing', 'hiring'], 'ask', 6);
    const p = await getProfile();
    expect(p.seenTopics.map((t) => t.text)).toEqual(['Billing', 'hiring', 'a', 'b']);
    expect(p.seenTopics[0]!.source).toBe('ask');
  });

  it('ignores nothing-to-say calls', async () => {
    await noteTopics(undefined, 'chat');
    await noteTopics(['  ', 4], 'chat');
    expect(await db.meta.get(LEARNER_META)).toBeUndefined();
  });

  it('forgets one wish (case-insensitive), leaving the rest', async () => {
    await applyPreference({ note: 'More cricket' }, '', 1);
    await applyPreference({ note: 'Too easy' }, '', 2);
    await forgetNote('more CRICKET');
    expect((await getProfile()).notes.map((n) => n.text)).toEqual(['Too easy']);
  });
});

describe('nudges expire', () => {
  it('difficultyShift reads the active nudge for a skill, 0 after NUDGE_DAYS', async () => {
    const p = await applyPreference({ note: 'harder clearly', harder: ['clearly'] }, '', 1000);
    expect(difficultyShift(p, 'clearly', 1000 + DAY)).toBe(1);
    expect(difficultyShift(p, 'words', 1000 + DAY)).toBe(0);
    expect(difficultyShift(p, 'clearly', 1000 + NUDGE_DAYS * DAY)).toBe(0);
    expect(activeNudges(p.difficulty, 1000 + NUDGE_DAYS * DAY)).toEqual([]);
  });
});

describe('watchList', () => {
  it('open weak spots newest first, then coach-box mistakes; deduped; max 10', async () => {
    await db.weakSpots.bulkPut([
      { id: 'w1', wrong: 'revert back', right: 'reply', source: 'ask', createdAt: 1 },
      { id: 'w2', wrong: 'do the needful', right: 'please handle it', source: 'chat', createdAt: 3 },
      { id: 'w3', wrong: 'fixed one', right: 'x', source: 'chat', createdAt: 9, fixedAt: 10 },
    ]);
    await db.inbox.bulkPut([
      mistake('i1', 'Revert Back', 'reply', 5),
      mistake('i2', 'discuss about', 'discuss', 6),
      mistake('i3', 'gone', 'x', 7, { status: 'discarded' }),
    ]);
    expect(await watchList()).toEqual([
      { wrong: 'do the needful', right: 'please handle it' },
      { wrong: 'revert back', right: 'reply' },
      { wrong: 'discuss about', right: 'discuss' },
    ]);
  });

  it('caps at WATCH_MAX', async () => {
    await db.weakSpots.bulkPut(
      Array.from({ length: WATCH_MAX + 4 }, (_, i) => ({
        id: `w${i}`,
        wrong: `wrong ${i}`,
        right: `right ${i}`,
        source: 'ask' as const,
        createdAt: i,
      })),
    );
    const list = await watchList();
    expect(list).toHaveLength(WATCH_MAX);
    expect(list[0]!.wrong).toBe(`wrong ${WATCH_MAX + 3}`);
  });
});

describe('learnerContext', () => {
  it('his wishes first, then recent subjects; avoid merges his wishes and rejected cards', async () => {
    await noteTopics(['billing migration'], 'chat', 1);
    await applyPreference(
      { note: 'More cricket small talk', topics: ['cricket'], avoid: ['circle back'], moreOf: ['smalltalk'], lessOf: ['words'] },
      '',
      Date.now(),
    );
    await db.cards.put({
      id: 'rej',
      type: 'word',
      lang: 'en',
      tags: [],
      source: 'ai',
      status: 'rejected',
      rejectedAt: 5,
      createdAt: 1,
      term: 'Circle Back',
      pos: 'verb',
      meaning: 'm',
      examples: ['a', 'b'],
      say: 's',
    } as unknown as Card);
    await db.cards.put({
      id: 'rej2',
      type: 'word',
      lang: 'en',
      tags: [],
      source: 'ai',
      status: 'rejected',
      rejectedAt: 6,
      createdAt: 1,
      term: 'synergy',
      pos: 'noun',
      meaning: 'm',
      examples: ['a', 'b'],
      say: 's',
    } as unknown as Card);

    const c = await learnerContext();
    expect(c.topics).toEqual(['cricket', 'billing migration']);
    expect(c.avoid).toEqual(['circle back', 'synergy']);
    expect(c.notes).toEqual(['More cricket small talk']);
    expect(c.moreOf).toEqual(['smalltalk']);
    expect(c.lessOf).toEqual(['words']);
    expect(c.watch).toEqual([]);
  });

  it('caps topics at TOPICS_MAX and drops expired more/less nudges', async () => {
    await db.meta.put({
      key: LEARNER_META,
      value: {
        wishTopics: [],
        seenTopics: Array.from({ length: TOPICS_MAX + 5 }, (_, i) => ({ text: `t${i}`, at: i, source: 'ask' })),
        notes: [],
        avoid: [],
        amount: [{ track: 'stories', dir: 1, at: Date.now() - (NUDGE_DAYS + 1) * DAY }],
        difficulty: [],
      },
      updatedAt: 1,
    });
    const c = await learnerContext();
    expect(c.topics).toHaveLength(TOPICS_MAX);
    expect(c.moreOf).toEqual([]);
  });
});
