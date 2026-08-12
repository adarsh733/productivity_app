import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InboxItem } from '../../types/contract';
import { db, enqueue } from '../../db/db';

/**
 * The 3AM box. One field, no categories, no tags, no confirmation step.
 * It saves raw and gets out of the way — the classifier that turns these into
 * cards lands in Phase 2, and until then the value is simply that the thought
 * stopped being lost.
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
    };
    await db.inbox.put(item);
    await enqueue('inbox', item.id);
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
