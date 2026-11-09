import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, enqueue } from '../../db/db';
import type { CardFeedback, FeedbackReason, ModuleCard } from '../../types/contract';
import { gotItLine, learnedLines, newReasons } from './cardFeedback';
import { recheckBatch, shiftModuleLevel } from '../auto/moduleBatch';

export function useCardFeedback(card: ModuleCard | undefined): {
  thumb: 'up' | 'down' | null;
  setThumb(t: 'up' | 'down'): Promise<void>;
  send(input: { reasons: FeedbackReason[]; comment?: string }): Promise<string>;
} {
  const cardId = card?.id;
  const feedbackId = cardId ? `fb-${cardId}` : undefined;

  const row = useLiveQuery(
    () => (feedbackId ? db.feedback.get(feedbackId) : undefined),
    [feedbackId],
  );

  const thumb = row?.thumb ?? null;

  const setThumb = useCallback(
    async (t: 'up' | 'down') => {
      if (!card) return;
      const id = `fb-${card.id}`;
      const existing = await db.feedback.get(id);
      const reply = gotItLine(card.module, {
        thumb: t,
        reasons: existing?.reasons ?? [],
        comment: existing?.comment,
      });
      const record: CardFeedback = {
        id,
        cardId: card.id,
        module: card.module,
        thumb: t,
        reasons: existing?.reasons ?? [],
        comment: existing?.comment,
        reply: existing?.reply || reply,
        at: Date.now(),
        hidden: existing?.hidden ?? false,
      };
      await db.feedback.put(record);
      await enqueue('feedback', id);
    },
    [card],
  );

  const send = useCallback(
    async (input: { reasons: FeedbackReason[]; comment?: string }): Promise<string> => {
      if (!card) return '';
      const id = `fb-${card.id}`;
      const existing = await db.feedback.get(id);
      const reply = gotItLine(card.module, {
        thumb: existing?.thumb,
        reasons: input.reasons,
        comment: input.comment,
      });
      const record: CardFeedback = {
        id,
        cardId: card.id,
        module: card.module,
        thumb: existing?.thumb,
        reasons: input.reasons,
        comment: input.comment?.trim() ? input.comment.trim() : undefined,
        reply,
        at: Date.now(),
        hidden: false,
      };
      await db.feedback.put(record);
      await enqueue('feedback', id);

      // v7: Too easy / Too hard move this module's level (once per tap);
      // Wrong English on an AI card re-checks the rest of its batch.
      const added = newReasons(existing?.reasons, input.reasons);
      if (added.includes('too_easy') || added.includes('too_hard')) {
        await shiftModuleLevel(card.module, added).catch(() => {});
      }
      if (added.includes('wrong_english') && card.batchId) {
        void recheckBatch(card).catch(() => {});
      }
      return reply;
    },
    [card],
  );

  return { thumb, setThumb, send };
}

export function useLearned(): {
  lines: { id: string; text: string }[];
  forget(id: string): Promise<void>;
} {
  const rows =
    useLiveQuery(
      () => db.feedback.orderBy('at').reverse().toArray(),
      [],
    ) ?? [];

  const lines = useMemo(() => learnedLines(rows), [rows]);

  const forget = useCallback(async (id: string) => {
    await db.feedback.update(id, { hidden: true });
    await enqueue('feedback', id);
  }, []);

  return { lines, forget };
}
