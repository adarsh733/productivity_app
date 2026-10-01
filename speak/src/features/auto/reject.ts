import type { Card, ClassifyInboxResult } from '../../types/contract';
import { db, enqueue } from '../../db/db';

/**
 * AG-008 stage 4 — "This is wrong".
 *
 * One tap rejects the card; a second tap on any other card of the same batch
 * rejects the whole batch. Rejected headlines feed the "do not produce" list
 * (last 50) that every generation path sends with its next ask.
 */

export const AVOID_MAX = 50;

type Draft = ClassifyInboxResult['cards'][number];

/** The card's headline — the term a "do not produce" list can match on. */
export function identityTerm(c: Card | Draft): string | null {
  switch (c.type) {
    case 'word':
      return c.term;
    case 'swap':
      return c.weak;
    case 'idiom':
      return c.phrase;
    case 'phrase':
      return c.weak;
    case 'feeling':
      return c.term;
    case 'story_move':
      return c.move;
    case 'describe':
      return c.title ?? c.alt;
    case 'explain':
      return c.topic;
    case 'teach_back':
      return c.prompt;
    case 'situation':
      return c.title;
    default:
      return null;
  }
}

export type RejectOutcome = 'card' | 'batch';

/**
 * Flag one card wrong. Returns `batch` when this flag pushed the batch to its
 * second rejection (the rest of the batch is then rejected too). Returns null
 * when the card was already rejected.
 */
export async function rejectCard(card: Card): Promise<RejectOutcome | null> {
  if (card.status === 'rejected') return null;
  const at = Date.now();
  await db.transaction('rw', db.cards, db.outbox, async () => {
    await db.cards.put({ ...card, status: 'rejected', rejectedAt: at });
    await enqueue('cards', card.id);
  });

  if (!card.batchId) return 'card';

  // Second flag inside a batch purges the rest of it.
  const batch = await db.cards.where('batchId').equals(card.batchId).toArray();
  if (batch.filter((c) => c.status === 'rejected').length < 2) return 'card';

  await db.transaction('rw', db.cards, db.outbox, async () => {
    for (const c of batch) {
      if (c.status === 'rejected') continue;
      await db.cards.put({ ...c, status: 'rejected', rejectedAt: at });
      await enqueue('cards', c.id);
    }
  });
  return 'batch';
}

/** Newest-first rejected headlines; max `limit`, case-insensitive dedupe. */
export async function rejectedTerms(limit = AVOID_MAX): Promise<string[]> {
  const rows = await db.cards.toArray();
  const rejected = rows
    .filter((c) => c.status === 'rejected')
    .sort((a, b) => (b.rejectedAt ?? b.createdAt) - (a.rejectedAt ?? a.createdAt))
    .slice(0, limit);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of rejected) {
    const text = (identityTerm(c) ?? '').trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}
