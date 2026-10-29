import { useCallback, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AnswerAskPayload, AnyCard, AskRecord } from '../../types/contract';
import { db } from '../../db/db';
import type { FetchFn } from '../coach/pipeline';
import { buildLibraryIndex, searchLibrary, type LibraryHit } from './librarySearch';
import { addAskCardsToFeed, runAsk, saveAsk, type AskView } from './askPipeline';

export interface UseAskOptions {
  fetchFn?: FetchFn;
  /** His level in each skill, sent so cards fit. */
  levels?: AnswerAskPayload['levels'];
  /** Test hook. Defaults to `navigator.onLine`. */
  online?: boolean;
}

export type AskPhase = 'idle' | 'asking' | 'done';

export interface UseAskReturn {
  text: string;
  setText(next: string): void;
  /** Cards he already has that match what is typed. Instant, no network. */
  library: LibraryHit[];
  phase: AskPhase;
  /** The answer (or the one plain line) for the question he sent. */
  view: AskView | null;
  /** How many cards "Add to my feed" stored; null until he taps it. */
  added: number | null;
  adding: boolean;
  /** Can he send? Needs at least 2 characters and no question in flight. */
  canSend: boolean;
  /** His last 5 questions, newest first. */
  recent: AskRecord[] | undefined;
  send(): Promise<void>;
  addToFeed(): Promise<void>;
}

/** All Ask logic. The screen only calls this and draws what it returns. */
export function useAsk(opts: UseAskOptions = {}): UseAskReturn {
  const [text, setTextState] = useState('');
  const [phase, setPhase] = useState<AskPhase>('idle');
  const [view, setView] = useState<AskView | null>(null);
  const [askId, setAskId] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const ticket = useRef(0);

  const cards = useLiveQuery(
    () => db.cards.where('status').equals('active').toArray(),
    [],
  ) as AnyCard[] | undefined;
  const recent = useLiveQuery(() => db.asks.orderBy('createdAt').reverse().limit(5).toArray(), []);
  const index = useMemo(() => buildLibraryIndex(cards ?? []), [cards]);
  const library = useMemo(() => searchLibrary(text, index), [text, index]);

  const setText = useCallback((next: string) => {
    setTextState(next);
    // A new thought makes the old answer stale.
    ticket.current++;
    setView(null);
    setAskId(null);
    setAdded(null);
    setPhase('idle');
  }, []);

  const canSend = text.trim().length >= 2 && phase !== 'asking';

  const send = useCallback(async () => {
    const q = text.trim();
    if (q.length < 2 || phase === 'asking') return;
    const mine = ++ticket.current;
    setPhase('asking');
    setView(null);
    setAdded(null);
    const result = await runAsk({
      text: q,
      index,
      existing: cards ?? [],
      fetchFn: opts.fetchFn,
      levels: opts.levels,
      online: opts.online,
    });
    if (mine !== ticket.current) return;
    let id: string | null = null;
    try {
      id = await saveAsk(result);
    } catch {
      id = null;
    }
    if (mine !== ticket.current) return;
    setAskId(id);
    setView(result);
    setPhase('done');
  }, [text, phase, index, cards, opts.fetchFn, opts.levels, opts.online]);

  const addToFeed = useCallback(async () => {
    if (!view || !askId || adding || added !== null) return;
    setAdding(true);
    try {
      setAdded(await addAskCardsToFeed(askId, view.fresh));
    } catch {
      setAdded(null);
    } finally {
      setAdding(false);
    }
  }, [view, askId, adding, added]);

  return { text, setText, library, phase, view, added, adding, canSend, recent, send, addToFeed };
}
