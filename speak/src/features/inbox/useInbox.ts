import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InboxItem } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import { processInboxItem } from '../coach/pipeline';

/**
 * The 3AM box. One field, no categories, no tags, no confirmation step.
 * It saves raw and gets out of the way — the coach pipeline
 * (`features/coach/pipeline`) classifies in the background: raw →
 * classify_inbox → verify_batch every draft → dedupe → inbox-sourced cards.
 * Unverified ⇒ nothing added; failures keep `raw` with a plain failReason.
 */
export function useInbox() {
  const items = useLiveQuery(
    () => db.inbox.orderBy('createdAt').reverse().limit(200).toArray(),
    [],
    [] as InboxItem[],
  );

  const add = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const item: InboxItem = {
      id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      text: trimmed,
      status: 'raw',
      attempts: 0,
    };
    await db.inbox.put(item);
    await enqueue('inbox', item.id);
    // Background classify; failures stay `raw` with a plain failReason.
    void processInboxItem(item.id).catch(() => {});
  }, []);

  const discard = useCallback(async (id: string) => {
    const existing = await db.inbox.get(id);
    if (!existing) return;
    await db.inbox.put({ ...existing, status: 'discarded' });
    await enqueue('inbox', id);
  }, []);

  return {
    items: items ?? [],
    pending: (items ?? []).filter((i) => i.status === 'raw').length,
    add,
    discard,
  };
}
