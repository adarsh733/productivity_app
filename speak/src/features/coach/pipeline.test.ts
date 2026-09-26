import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db } from '../../db/db';
import type { Card } from '../../types/contract';
import {
  COACH_FAIL_PLAIN,
  coachFirst,
  dedupeDrafts,
  deleteCoachNote,
  draftsToCards,
  findWatchHits,
  getTryWords,
  getWatchList,
  migrateNotesOnce,
  processInboxItem,
  removeCoachBatch,
} from './pipeline';

const WORD_DRAFT = {
  type: 'word' as const,
  term: 'nuance',
  pos: 'noun',
  meaning: 'a small difference in meaning',
  examples: ['There is a nuance here.', 'He explained the nuance to the client.'] as [string, string],
  say: 'Explain the nuance in one line.',
};

const PHRASE_A = {
  type: 'phrase' as const,
  weak: 'revert back',
  strong: 'revert',
  why: 'Revert already means back.',
  register: 'office' as const,
};

const PHRASE_B = {
  type: 'phrase' as const,
  weak: 'discuss about',
  strong: 'discuss',
  why: 'Discuss takes no about.',
  register: 'office' as const,
};

function okJson(data: unknown) {
  return { ok: true, json: async () => ({ ok: true, task: 'x', data }) } as unknown as Response;
}

function classifyFetch(kind: string, subject: string, cards: unknown[], verifyResults?: Array<{ key: string; ok: boolean; reason: string }>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string };
    if (body.task === 'classify_inbox') {
      return okJson({ kind, subject, cards });
    }
    return okJson({ results: verifyResults ?? (cards as unknown[]).map((_, i) => ({ key: `d${i}`, ok: true, reason: 'real' })) });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await db.cards.clear();
  await db.inbox.clear();
  await db.notes.clear();
  await db.outbox.clear();
});

describe('coach pipeline (AG-007 stage 3)', () => {
  it('happy path: word → 1 WordCard, inbox processed with generatedCardIds', async () => {
    await db.inbox.put({ id: 'in-1', createdAt: 1, text: 'I liked the word nuance', status: 'raw', attempts: 0 });
    const out = await processInboxItem('in-1', classifyFetch('word', 'nuance', [WORD_DRAFT]));
    expect(out.outcome).toBe('processed');
    expect(out.added).toBe(1);
    const card = await db.cards.get('coach-in-1-0');
    expect(card?.type).toBe('word');
    expect(card?.source).toBe('inbox');
    expect(card?.status).toBe('active');
    expect(card?.seedId).toBe('in-1');
    expect(card?.batchId).toBe('coach-in-1');
    expect(card?.tags).toEqual(['coach', 'word']);
    const item = await db.inbox.get('in-1');
    expect(item?.status).toBe('processed');
    expect(item?.kind).toBe('word');
    expect(item?.generatedCardIds).toEqual(['coach-in-1-0']);
  });

  it('verify rejects one draft: only the passing draft is stored', async () => {
    await db.inbox.put({ id: 'in-2', createdAt: 1, text: 'I keep saying revert back', status: 'raw', attempts: 0 });
    const fetchFn = classifyFetch('mistake', 'revert back', [PHRASE_A, PHRASE_B], [
      { key: 'd0', ok: true, reason: 'real' },
      { key: 'd1', ok: false, reason: 'unnatural' },
    ]);
    const out = await processInboxItem('in-2', fetchFn);
    expect(out.added).toBe(1);
    expect(await db.cards.get('coach-in-2-0')).toBeDefined();
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect((cards[0] as unknown as { weak: string }).weak).toBe('revert back');
  });

  it('dedupe: a draft matching an existing card adds nothing new', async () => {
    const existing = draftsToCards('word', [WORD_DRAFT], 'old-inbox')[0]!;
    await db.cards.put(existing);
    await db.inbox.put({ id: 'in-3', createdAt: 1, text: 'nuance again', status: 'raw', attempts: 0 });
    const out = await processInboxItem('in-3', classifyFetch('word', 'nuance', [WORD_DRAFT]));
    expect(out.outcome).toBe('processed');
    expect(out.added).toBe(0);
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    // Case-insensitive dedupe helper
    expect(dedupeDrafts([{ ...WORD_DRAFT, term: 'NUANCE' }], cards as Card[])).toHaveLength(0);
  });

  it('offline retry cap: 3 failures then a capped message, no more auto work', async () => {
    await db.inbox.put({ id: 'in-4', createdAt: 1, text: 'offline note', status: 'raw', attempts: 0 });
    const dead = vi.fn(async () => {
      throw new Error('Network service unavailable');
    }) as unknown as typeof fetch;
    for (let i = 0; i < 3; i++) {
      await processInboxItem('in-4', dead);
    }
    const item = await db.inbox.get('in-4');
    expect(item?.status).toBe('raw');
    expect(item?.attempts).toBe(3);
    expect(item?.failReason).toMatch(/tap to try again/i);
    // Nothing was added despite 3 attempts
    expect(await db.cards.count()).toBe(0);
    // Plain message on the way up (first failure), never raw
    await db.inbox.put({ id: 'in-4b', createdAt: 1, text: 'offline note', status: 'raw', attempts: 0 });
    await processInboxItem('in-4b', dead);
    const first = await db.inbox.get('in-4b');
    expect(first?.failReason).toBe(COACH_FAIL_PLAIN);
  });

  it('batch removal rejects the whole batch; delete drops the note too', async () => {
    await db.inbox.put({ id: 'in-5', createdAt: 1, text: 'x', status: 'raw', attempts: 0 });
    await processInboxItem('in-5', classifyFetch('mistake', 'revert back', [PHRASE_A, PHRASE_B]));
    expect(await db.cards.count()).toBe(2);
    await removeCoachBatch('in-5');
    const after = await db.cards.toArray();
    expect(after.every((c) => c.status === 'rejected')).toBe(true);
    await deleteCoachNote('in-5');
    expect((await db.inbox.get('in-5'))?.status).toBe('discarded');
  });

  it('local mistake check: word boundaries, case-insensitive, no AI', () => {
    const watch = [{ wrong: 'revert back', right: 'revert' }];
    expect(findWatchHits('I always revert back, sorry', watch)).toHaveLength(1);
    expect(findWatchHits('I always REVERT BACK here', watch)).toHaveLength(1);
    expect(findWatchHits('revertedback is one word', watch)).toHaveLength(0);
    expect(findWatchHits('nothing wrong here', watch)).toHaveLength(0);
  });

  it('one-time notes migration is idempotent (note-<id>, then stops)', async () => {
    await db.notes.put({ id: 'abc', text: 'old note', createdAt: 10 });
    expect(await migrateNotesOnce()).toBe(1);
    expect(await migrateNotesOnce()).toBe(0);
    const item = await db.inbox.get('note-abc');
    expect(item?.status).toBe('raw');
    expect(item?.text).toBe('old note');
  });

  it('queue jump keeps coach cards within the first 10; try-words caps at 2', () => {
    const items = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const isCoach = (id: string) => id === 'c15' || id === 'c18';
    const ordered = coachFirst(items, isCoach);
    expect(ordered.slice(0, 10)).toContain('c15');
    expect(ordered.slice(0, 10)).toContain('c18');
    expect(getTryWords(['nuance', 'trade-off', 'extra'])).toEqual(['nuance', 'trade-off']);
  });

  it('watch list holds at most 10 mistakes', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      createdAt: i,
      text: `m${i}`,
      status: 'raw' as const,
      kind: 'mistake' as const,
      subject: `wrong${i}`,
      fix: `right${i}`,
    }));
    expect(getWatchList(items)).toHaveLength(10);
  });
});
