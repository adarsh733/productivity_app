import { describe, expect, it, beforeEach, vi } from 'vitest';
import { db } from '../../db/db';
import type { Card } from '../../types/contract';
import {
  AI_NEEDS_KEY_META,
  COACH_FAIL_PLAIN,
  COACH_NEEDS_KEY_PLAIN,
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
  saveRecordingMistake,
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

const SWAP_DRAFT = {
  type: 'swap' as const,
  weak: 'very tired',
  answers: ['exhausted', 'drained'],
  timerSec: 10,
};

const IDIOM_DRAFT = {
  type: 'idiom' as const,
  phrase: 'circle back',
  meaning: 'return to a topic at a later time',
  scenario: 'Tell your manager you want to revisit a decision next week.',
  example: "Let's circle back on this after the client call.",
  corporate: true,
};

const FEELING_DRAFT = {
  type: 'feeling' as const,
  term: 'wary',
  meaning: 'careful because something may go wrong',
  contrast: 'Not as strong as afraid — it is alert, not scared.',
  example: 'I am wary of promising a date before testing.',
};

const STORY_DRAFT = {
  type: 'story_move' as const,
  move: 'Land the ending on a short sentence.',
  why: 'A short last line sticks in the room.',
  example: 'We shipped it. Done.',
};

const DESCRIBE_DRAFT = {
  type: 'describe' as const,
  title: 'Busy kitchen',
  scene: 'Steam climbs over two cooks moving fast between pans.',
  alt: 'A small kitchen at dinner rush with steam and motion',
  prompt: 'Tell me what is happening — and how it feels.',
  beats: ['What you see first', 'Who is doing what', 'The mood'] as [string, string, string],
  targetVocab: ['steam', 'clatter', 'rush'],
  targetSec: 60,
};

const EXPLAIN_DRAFT = {
  type: 'explain' as const,
  topic: 'Monsoons',
  angle: 'Why Indian farming depends on the monsoon arriving on time',
  beats: ['What the monsoon is', 'What happens when it is late', 'Who feels it most'] as [string, string, string],
  targetVocab: ['onset', 'yield', 'reservoir'],
  targetSec: 90,
};

const TEACH_DRAFT = {
  type: 'teach_back' as const,
  prompt: 'Explain what a database index is, as if to a new teammate.',
  beats: ['The problem without it', 'What it actually is', 'When not to add one'] as [string, string, string],
  targetSec: 60,
};

const SITUATION_DRAFT = {
  type: 'situation' as const,
  kind: 'incident' as const,
  title: 'The missed flight',
  prompt: 'Tell the story of a flight you once missed and what happened next.',
  beats: ['Set the scene', 'What went wrong', 'How it ended'] as [string, string, string],
  targetVocab: [],
  targetSec: 60,
};

const TYPE_DRAFTS: Array<{ type: string; draft: unknown }> = [
  { type: 'word', draft: WORD_DRAFT },
  { type: 'swap', draft: SWAP_DRAFT },
  { type: 'idiom', draft: IDIOM_DRAFT },
  { type: 'phrase', draft: PHRASE_A },
  { type: 'feeling', draft: FEELING_DRAFT },
  { type: 'story_move', draft: STORY_DRAFT },
  { type: 'describe', draft: DESCRIBE_DRAFT },
  { type: 'explain', draft: EXPLAIN_DRAFT },
  { type: 'teach_back', draft: TEACH_DRAFT },
  { type: 'situation', draft: SITUATION_DRAFT },
];

function okJson(data: unknown, provider?: string) {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

function classifyFetch(
  kind: string,
  subject: string,
  cards: unknown[],
  verifyResults?: Array<{ key: string; ok: boolean; reason: string }>,
  providers: { classify?: string; verify?: string } = {},
) {
  const classifyProvider = providers.classify ?? 'gemini';
  const verifyProvider = providers.verify ?? 'groq';
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string };
    if (body.task === 'classify_inbox') {
      return okJson({ kind, subject, cards }, classifyProvider);
    }
    return okJson(
      { results: verifyResults ?? (cards as unknown[]).map((_, i) => ({ key: `d${i}`, ok: true, reason: 'real' })) },
      verifyProvider,
    );
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await db.cards.clear();
  await db.inbox.clear();
  await db.notes.clear();
  await db.outbox.clear();
  await db.meta.clear();
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

  it('every allowed draft type goes draft → verify → stored card (AG-008 stage 1)', async () => {
    for (const { type, draft } of TYPE_DRAFTS) {
      const id = `in-type-${type}`;
      await db.inbox.put({ id, createdAt: 1, text: `note about ${type}`, status: 'raw', attempts: 0 });
      const out = await processInboxItem(id, classifyFetch('word', type, [draft]));
      expect(out.outcome, type).toBe('processed');
      expect(out.added, type).toBe(1);
      const card = await db.cards.get(`coach-${id}-0`);
      expect(card?.type, type).toBe(type);
      expect(card?.tags, type).toEqual(['coach', 'word']);
      expect(card?.source, type).toBe('inbox');
      expect(card?.status, type).toBe('active');
    }
  });

  it('an idiom typed into the coach yields an idiom card (AG-008 stage 1)', async () => {
    await db.inbox.put({ id: 'in-idiom', createdAt: 1, text: 'People keep saying circle back', status: 'raw', attempts: 0 });
    const out = await processInboxItem('in-idiom', classifyFetch('other', 'circle back', [IDIOM_DRAFT]));
    expect(out.added).toBe(1);
    const card = await db.cards.get('coach-in-idiom-0');
    expect(card?.type).toBe('idiom');
    if (card?.type === 'idiom') expect(card.phrase).toBe('circle back');
  });

  it('a Hindi word draft is stored lang "hi" — it rides the Hindi slots, never the English float (AG-008 stage 1)', async () => {
    const hindiDraft = { ...WORD_DRAFT, term: 'जुगाड़', lang: 'hi' };
    await db.inbox.put({ id: 'in-hi', createdAt: 1, text: 'I liked the word jugaad', status: 'raw', attempts: 0 });
    const out = await processInboxItem('in-hi', classifyFetch('word', 'जुगाड़', [hindiDraft]));
    expect(out.added).toBe(1);
    const card = await db.cards.get('coach-in-hi-0');
    expect(card?.lang).toBe('hi');
    expect(card?.tags).toEqual(['coach', 'word']);
  });

  it('same provider generate + verify: nothing stored, plain needs-key line, no attempts burned (AG-008 §0.2)', async () => {
    await db.inbox.put({ id: 'in-same', createdAt: 1, text: 'I liked the word nuance', status: 'raw', attempts: 0 });
    const out = await processInboxItem(
      'in-same',
      classifyFetch('word', 'nuance', [WORD_DRAFT], undefined, { classify: 'gemini', verify: 'gemini' }),
    );
    expect(out).toEqual({ outcome: 'failed', added: 0 });
    expect(await db.cards.count()).toBe(0);
    const item = await db.inbox.get('in-same');
    expect(item?.status).toBe('raw');
    expect(item?.failReason).toBe(COACH_NEEDS_KEY_PLAIN);
    expect(item?.attempts).toBe(0);
    expect((await db.meta.get(AI_NEEDS_KEY_META))?.value).toBe(true);
  });

  it('a cross-provider run clears the needs-key notice (AG-008 §0.2)', async () => {
    await db.meta.put({ key: AI_NEEDS_KEY_META, value: true, updatedAt: 1 });
    await db.inbox.put({ id: 'in-ok', createdAt: 1, text: 'nuance', status: 'raw', attempts: 0 });
    const out = await processInboxItem('in-ok', classifyFetch('word', 'nuance', [WORD_DRAFT]));
    expect(out.added).toBe(1);
    expect((await db.meta.get(AI_NEEDS_KEY_META))?.value).toBe(false);
  });
});

describe('saveRecordingMistake (AG-008 stage 2)', () => {
  it('stores a processed mistake note on the watch list and enqueues it', async () => {
    const item = await saveRecordingMistake('r1', { wrong: 'revert back', right: 'revert' });
    expect(item).not.toBeNull();
    expect(item!.id).toBe('rec-r1');
    expect(item!.status).toBe('processed');
    expect(item!.kind).toBe('mistake');
    expect(item!.origin).toBe('recording');
    expect(item!.subject).toBe('revert back');
    expect(item!.fix).toBe('revert');
    expect(item!.text).toContain('revert back');
    expect(await db.inbox.get('rec-r1')).toEqual(item);

    const outbox = await db.outbox.toArray();
    expect(outbox.some((o) => o.table === 'inbox' && o.key === 'rec-r1')).toBe(true);
    const items = await db.inbox.toArray();
    expect(getWatchList(items)).toEqual([{ wrong: 'revert back', right: 'revert' }]);
  });

  it('is idempotent per recording id — a second call returns null', async () => {
    await saveRecordingMistake('r2', { wrong: 'discuss about', right: 'discuss' });
    expect(await saveRecordingMistake('r2', { wrong: 'discuss about', right: 'discuss' })).toBeNull();
    expect(await db.inbox.count()).toBe(1);
  });

  it('dedupes the same wrong phrase while it is watched, case-insensitively', async () => {
    await saveRecordingMistake('r3', { wrong: 'revert back', right: 'revert' });
    expect(await saveRecordingMistake('r4', { wrong: ' Revert Back ', right: 'revert' })).toBeNull();
    expect(await db.inbox.count()).toBe(1);
  });

  it('a discarded note with the same wrong phrase permits re-adding', async () => {
    await db.inbox.put({
      id: 'old',
      createdAt: 1,
      text: 'x',
      status: 'discarded',
      kind: 'mistake',
      subject: 'revert back',
      fix: 'revert',
    });
    const item = await saveRecordingMistake('r5', { wrong: 'revert back', right: 'revert' });
    expect(item).not.toBeNull();
    expect(await db.inbox.count()).toBe(2);
  });

  it('rejects empty and identical wrong/right silently', async () => {
    expect(await saveRecordingMistake('r6', { wrong: '   ', right: 'revert' })).toBeNull();
    expect(await saveRecordingMistake('r7', { wrong: 'revert', right: ' REVERT ' })).toBeNull();
    expect(await db.inbox.count()).toBe(0);
  });
});
