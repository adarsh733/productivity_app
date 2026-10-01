import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/db';
import type { Card } from '../../types/contract';
import { AVOID_MAX, identityTerm, rejectCard, rejectedTerms } from './reject';

function card(overrides: Record<string, unknown> = {}): Card {
  return {
    id: 'c1',
    type: 'word',
    lang: 'en',
    tags: [],
    source: 'ai',
    status: 'active',
    createdAt: 1,
    term: 'nuance',
    pos: 'noun',
    meaning: 'a small difference in meaning',
    examples: ['There is a nuance here.', 'He explained the nuance to the client.'],
    say: 'Explain the nuance in one line.',
    ...overrides,
  } as unknown as Card;
}

beforeEach(async () => {
  await db.cards.clear();
  await db.outbox.clear();
});

describe('identityTerm (AG-008 stage 4)', () => {
  it('reads the headline per draftable type', () => {
    expect(identityTerm(card())).toBe('nuance');
    expect(identityTerm(card({ type: 'swap', weak: 'very tired', answers: ['tired'], timerSec: 10 }))).toBe('very tired');
    expect(identityTerm(card({ type: 'idiom', phrase: 'circle back' }))).toBe('circle back');
    expect(identityTerm(card({ type: 'phrase', weak: 'revert back' }))).toBe('revert back');
    expect(identityTerm(card({ type: 'feeling', term: 'wary' }))).toBe('wary');
    expect(identityTerm(card({ type: 'story_move', move: 'Land short.' }))).toBe('Land short.');
    expect(identityTerm(card({ type: 'describe', title: 'Busy kitchen', alt: 'A kitchen' }))).toBe('Busy kitchen');
    expect(identityTerm(card({ type: 'describe', title: undefined, alt: 'A kitchen at rush' }))).toBe('A kitchen at rush');
    expect(identityTerm(card({ type: 'explain', topic: 'Monsoons' }))).toBe('Monsoons');
    expect(identityTerm(card({ type: 'teach_back', prompt: 'Teach indexes.' }))).toBe('Teach indexes.');
    expect(identityTerm(card({ type: 'situation', title: 'The missed flight' }))).toBe('The missed flight');
  });

  it('returns null for types AI may never produce', () => {
    expect(identityTerm(card({ type: 'breath', drill: 'mpt', logUnit: 'seconds' }))).toBeNull();
    expect(identityTerm(card({ type: 'say_it' }))).toBeNull();
    expect(identityTerm(card({ type: 'pronounce' }))).toBeNull();
    expect(identityTerm(card({ type: 'action_verb' }))).toBeNull();
  });
});

describe('rejectCard (AG-008 stage 4)', () => {
  it('one tap rejects the card and enqueues it', async () => {
    await db.cards.put(card({ id: 'r1' }));
    expect(await rejectCard(card({ id: 'r1' }))).toBe('card');
    const stored = await db.cards.get('r1');
    expect(stored?.status).toBe('rejected');
    expect(stored?.rejectedAt).toBeTypeOf('number');
    const outbox = await db.outbox.toArray();
    expect(outbox.some((o) => o.table === 'cards' && o.key === 'r1')).toBe(true);
  });

  it('re-flagging the same card is a no-op', async () => {
    await db.cards.put(card({ id: 'r1', status: 'rejected', rejectedAt: 42 }));
    expect(await rejectCard(card({ id: 'r1', status: 'rejected', rejectedAt: 42 }))).toBeNull();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.cards.get('r1'))?.rejectedAt).toBe(42);
  });

  it('a card without a batch rejects alone', async () => {
    await db.cards.put(card({ id: 'solo' }));
    expect(await rejectCard(card({ id: 'solo' }))).toBe('card');
    expect((await db.cards.get('solo'))?.status).toBe('rejected');
  });

  it('a second flag inside the same batch purges the whole batch', async () => {
    const batchId = 'topup-2026-10-01-word';
    await db.cards.bulkPut([
      card({ id: 'b1-a', batchId }),
      card({ id: 'b1-b', batchId }),
      card({ id: 'b1-c', batchId }),
    ]);
    expect(await rejectCard(card({ id: 'b1-a', batchId }))).toBe('card');
    expect((await db.cards.get('b1-b'))?.status).toBe('active');

    expect(await rejectCard(card({ id: 'b1-b', batchId }))).toBe('batch');
    const all = await db.cards.toArray();
    expect(all.every((c) => c.status === 'rejected')).toBe(true);
    expect(all.every((c) => typeof c.rejectedAt === 'number')).toBe(true);
    expect(await db.outbox.count()).toBe(3);

    // A card already purged by the batch flag cannot be rejected again.
    expect(await rejectCard(all.find((c) => c.id === 'b1-c')!)).toBeNull();
  });

  it('batches never purge each other', async () => {
    await db.cards.bulkPut([
      card({ id: 'b1-a', batchId: 'b1' }),
      card({ id: 'b1-b', batchId: 'b1' }),
      card({ id: 'b2-a', batchId: 'b2' }),
      card({ id: 'b2-b', batchId: 'b2' }),
    ]);
    expect(await rejectCard(card({ id: 'b1-a', batchId: 'b1' }))).toBe('card');
    expect(await rejectCard(card({ id: 'b2-a', batchId: 'b2' }))).toBe('card');
    expect(await rejectCard(card({ id: 'b1-b', batchId: 'b1' }))).toBe('batch');
    expect((await db.cards.get('b2-b'))?.status).toBe('active'); // b2 untouched
  });
});

describe('rejectedTerms — the do-not-produce list (AG-008 stage 4)', () => {
  it('newest first, case-insensitive dedupe, active cards ignored, blank terms skipped', async () => {
    await db.cards.bulkPut([
      card({ id: 'r1', status: 'rejected', rejectedAt: 100, term: 'alpha' }),
      card({ id: 'r2', status: 'rejected', rejectedAt: 300, term: 'beta' }),
      card({ id: 'r3', status: 'rejected', rejectedAt: 200, term: 'Alpha' }),
      card({ id: 'r4', status: 'rejected', rejectedAt: 150, term: '   ' }),
      card({ id: 'r5', status: 'active', term: 'gamma' }),
    ]);
    expect(await rejectedTerms()).toEqual(['beta', 'Alpha']);
  });

  it('honours the limit and falls back to createdAt for legacy rejections', async () => {
    await db.cards.bulkPut([
      card({ id: 'a', status: 'rejected', createdAt: 1, term: 'first' }),
      card({ id: 'b', status: 'rejected', createdAt: 2, term: 'second' }),
      card({ id: 'c', status: 'rejected', createdAt: 3, term: 'third' }),
      card({ id: 'd', status: 'rejected', createdAt: 999, term: 'legacy-newest' }),
    ]);
    const two = await rejectedTerms(2);
    expect(two).toEqual(['legacy-newest', 'third']);
  });

  it('caps the default list at AVOID_MAX', async () => {
    const many = Array.from({ length: AVOID_MAX + 2 }, (_, i) =>
      card({ id: `m${i}`, status: 'rejected', rejectedAt: i, term: `term-${i}` }),
    );
    await db.cards.bulkPut(many);
    const terms = await rejectedTerms();
    expect(terms).toHaveLength(AVOID_MAX);
    expect(terms[0]).toBe(`term-${AVOID_MAX + 1}`);
  });
});
