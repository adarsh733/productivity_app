import type { CardFeedback, ModuleCard, ModuleLevel, Profile } from '../../types/contract';
import { MODULE_LABEL } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { knowItLevel, levelOf } from '../cards/cardTags';
import { MODULE_LEVEL_START, maybeModuleBatch } from '../auto/moduleBatch';

/**
 * v8 (2026-11-10): one tap of "Know it" on a Feed card = Too easy, and it
 * drops that card's level and every easier one at once (answer 1 = A).
 *
 * Stored as reason `too_easy` on the card's own `fb-<cardId>` feedback row (no
 * new reason, no new table, so backup needs no change) and as a higher
 * `profile.moduleLevels[module]` (queued for backup). A second tap on the same
 * card changes nothing. Then a module batch may start: about 10 Know-its in a
 * module bring 30 harder cards (moduleBatch.ts decides; fire-and-forget).
 */
export async function recordKnowIt(
  card: ModuleCard,
  now: number = Date.now(),
): Promise<{ level: ModuleLevel; line: string }> {
  const id = `fb-${card.id}`;
  const name = MODULE_LABEL[card.module] ?? card.module;

  const result = await db.transaction('rw', db.feedback, db.profile, db.outbox, async () => {
    const existing = await db.feedback.get(id);
    const known = existing?.reasons?.includes('too_easy') ?? false;

    const profile: Profile = (await db.profile.get('me')) ?? {
      id: 'me',
      createdAt: now,
      userId: null,
    };
    const current = profile.moduleLevels?.[card.module] ?? MODULE_LEVEL_START;
    const level = known ? current : knowItLevel(current, levelOf(card));
    const rose = level > current;
    const line = rose ? `Got it: ${name} moves up to level ${level}.` : 'Got it: you know this one.';

    const row: CardFeedback = {
      id,
      cardId: card.id,
      module: card.module,
      thumb: existing?.thumb,
      reasons: known ? existing!.reasons : [...(existing?.reasons ?? []), 'too_easy'],
      comment: existing?.comment,
      reply: rose || !existing?.reply?.trim() ? line : existing.reply,
      at: now,
      hidden: existing?.hidden ?? false,
    };
    await db.feedback.put(row);
    await enqueue('feedback', id);

    if (rose) {
      await db.profile.put({
        ...profile,
        moduleLevels: { ...(profile.moduleLevels ?? {}), [card.module]: level },
      });
      await enqueue('profile', 'me');
    }
    return { level, line };
  });

  void maybeModuleBatch();
  return result;
}
