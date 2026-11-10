import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardLevel, CardFeedback, ModuleCard, WordsCard } from '../../types/contract';
import { db } from '../../db/db';

const batch = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../auto/moduleBatch', async (importOriginal) => {
  const real = await importOriginal<typeof import('../auto/moduleBatch')>();
  return {
    ...real,
    maybeModuleBatch: () => {
      batch.calls++;
      return Promise.resolve(null);
    },
  };
});

import { recordKnowIt } from './knowIt';

const T0 = 1_762_700_000_000;

function word(id: string, level?: CardLevel): ModuleCard {
  return {
    id,
    type: 'module',
    module: 'words',
    lang: 'en',
    topic: 'test',
    theme: 'Money',
    ...(level !== undefined ? { level } : {}),
    word: `Word-${id}`,
    pos: 'noun',
    say: 'say',
    meaning: 'meaning',
    examples: [
      { label: 'Ex 1', text: 'Line 1 **word**' },
      { label: 'Ex 2', text: 'Line 2 **word**' },
    ],
    right: { label: 'Right', text: 'Correct' },
    wrong: [{ label: 'Wrong', text: 'Wrong use' }],
    rule: 'The rule',
  } as WordsCard;
}

const wordsLevel = async () => (await db.profile.get('me'))?.moduleLevels?.words;

beforeEach(async () => {
  await Promise.all([db.feedback.clear(), db.profile.clear(), db.outbox.clear()]);
  batch.calls = 0;
});

describe('recordKnowIt', () => {
  it('adds too_easy to the card feedback row and queues it for backup', async () => {
    await recordKnowIt(word('w-1', 2), T0);
    const row = await db.feedback.get('fb-w-1');
    expect(row).toMatchObject({
      id: 'fb-w-1',
      cardId: 'w-1',
      module: 'words',
      reasons: ['too_easy'],
      at: T0,
      hidden: false,
    } satisfies Partial<CardFeedback>);
    const out = await db.outbox.toArray();
    expect(out.some((o) => o.table === 'feedback' && o.key === 'fb-w-1')).toBe(true);
  });

  it('keeps what the row already had (thumb, reasons, comment)', async () => {
    await db.feedback.put({
      id: 'fb-w-1',
      cardId: 'w-1',
      module: 'words',
      thumb: 'up',
      reasons: ['loved'],
      comment: 'nice one',
      reply: 'Got it: More like this in Words from the next batch.',
      at: 1,
    });
    await recordKnowIt(word('w-1', 2), T0);
    const row = await db.feedback.get('fb-w-1');
    expect(row?.thumb).toBe('up');
    expect(row?.reasons).toEqual(['loved', 'too_easy']);
    expect(row?.comment).toBe('nice one');
  });

  it('raises the module level past the card (start 2, level-2 card → 3) with the line, queued for backup', async () => {
    const res = await recordKnowIt(word('w-1', 2), T0);
    expect(res).toEqual({ level: 3, line: 'Got it: Words moves up to level 3.' });
    expect(await wordsLevel()).toBe(3);
    expect((await db.feedback.get('fb-w-1'))?.reply).toBe('Got it: Words moves up to level 3.');
    const out = await db.outbox.toArray();
    expect(out.some((o) => o.table === 'profile' && o.key === 'me')).toBe(true);
    // other modules keep their level
    expect((await db.profile.get('me'))?.moduleLevels?.smalltalk).toBeUndefined();
  });

  it('a level-3 card lifts the module to 4; a card with no level counts as 2', async () => {
    expect((await recordKnowIt(word('w-3', 3), T0)).level).toBe(4);
    await db.profile.clear();
    expect((await recordKnowIt(word('w-x'), T0)).level).toBe(3);
  });

  it('an easy card on a harder module says "you know this one" and changes no level', async () => {
    await db.profile.put({ id: 'me', createdAt: 1, userId: null, moduleLevels: { words: 4 } });
    const res = await recordKnowIt(word('w-1', 1), T0);
    expect(res).toEqual({ level: 4, line: 'Got it: you know this one.' });
    expect(await wordsLevel()).toBe(4);
    const row = await db.feedback.get('fb-w-1');
    expect(row?.reasons).toEqual(['too_easy']);
    expect(row?.reply).toBe('Got it: you know this one.');
    expect((await db.outbox.toArray()).some((o) => o.table === 'profile')).toBe(false);
  });

  it('a second tap on the same card never raises the level again', async () => {
    await recordKnowIt(word('w-1', 2), T0);
    // a Too hard in between brings Words back to 2
    const p = (await db.profile.get('me'))!;
    await db.profile.put({ ...p, moduleLevels: { words: 2 } });
    const again = await recordKnowIt(word('w-1', 2), T0 + 1000);
    expect(again).toEqual({ level: 2, line: 'Got it: you know this one.' });
    expect(await wordsLevel()).toBe(2);
    expect((await db.feedback.get('fb-w-1'))?.reasons).toEqual(['too_easy']);
  });

  it('never goes above level 5', async () => {
    await db.profile.put({ id: 'me', createdAt: 1, userId: null, moduleLevels: { words: 5 } });
    expect((await recordKnowIt(word('w-3', 3), T0)).level).toBe(5);
  });

  it('asks for a module batch after every tap (moduleBatch decides whether one runs)', async () => {
    await recordKnowIt(word('w-1', 2), T0);
    await recordKnowIt(word('w-2', 3), T0);
    expect(batch.calls).toBe(2);
  });
});
