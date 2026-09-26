import { useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InboxItem } from '../../types/contract';
import { db, enqueue } from '../../db/db';
import {
  deleteCoachNote,
  getCoachWords,
  getWatchList,
  migrateNotesOnce,
  processInboxItem,
  removeCoachBatch,
  retryRaws,
  saveCoachRaw,
} from './pipeline';

/**
 * The coach box hook. Components read from here — never `db` directly.
 * Saves raw, classifies in the background, retries raws on app open (max 3).
 * Mic never gates: dictation lives in CoachBox and only when SpeechRecognition exists.
 */
export function useCoach() {
  const items = useLiveQuery(
    () => db.inbox.orderBy('createdAt').reverse().toArray(),
    [],
    [] as InboxItem[],
  ) ?? [];

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        await migrateNotesOnce();
        if (dead) return;
        await retryRaws();
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, []);

  const add = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const item = await saveCoachRaw(trimmed);
    // Classify in the background; the row stays `raw` with a plain
    // failReason until the network answers. Never throws to the caller.
    void processInboxItem(item.id).catch(() => {});
    return item;
  }, []);

  const retry = useCallback(async (id: string) => {
    const item = await db.inbox.get(id);
    if (!item) return;
    if ((item.attempts ?? 0) >= 3) {
      await db.inbox.put({ ...item, attempts: 0, failReason: undefined });
      await enqueue('inbox', id).catch(() => {});
    }
    await processInboxItem(id);
  }, []);

  const removeBatch = useCallback(async (inboxId: string) => {
    await removeCoachBatch(inboxId);
  }, []);

  const deleteNote = useCallback(async (inboxId: string) => {
    await deleteCoachNote(inboxId);
  }, []);

  const discard = useCallback(async (id: string) => {
    const existing = await db.inbox.get(id);
    if (!existing) return;
    await db.inbox.put({ ...existing, status: 'discarded' });
    await enqueue('inbox', id).catch(() => {});
  }, []);

  return {
    items,
    pending: items.filter((i) => i.status === 'raw').length,
    watch: getWatchList(items),
    coachWords: getCoachWords(items),
    add,
    retry,
    removeBatch,
    deleteNote,
    discard,
  };
}

/**
 * Lightweight watch list for PlaybackReview: his coach mistakes (max 10),
 * no side effects (no migration, no retry).
 */
export function useWatchList() {
  const items = useLiveQuery(
    () => db.inbox.orderBy('createdAt').reverse().toArray(),
    [],
    [] as InboxItem[],
  ) ?? [];
  return getWatchList(items);
}
