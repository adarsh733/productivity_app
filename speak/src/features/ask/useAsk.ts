import { useCallback, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AnswerAskPayload, AnyCard, AskRecord } from '../../types/contract';
import { db } from '../../db/db';
import type { FetchFn } from '../coach/pipeline';
import { buildLibraryIndex, searchLibrary, type LibraryHit } from './librarySearch';
import {
  ASK_MAX_CHARS,
  ASK_NEED_LETTER,
  addAskCardsToFeed,
  hasLetter,
  retryAskCheck,
  runAsk,
  saveAskResult,
  saveWeakSpotStatus,
  type AskView,
} from './askPipeline';

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
  /** Edits the question. Clipped to ASK_MAX_CHARS. While an Ask is in flight it only edits the text. */
  setText(next: string): void;
  /** Most characters a question may have. */
  maxChars: number;
  /** A plain hint under the box (e.g. emoji only: "Type a word or a question"); null when fine. */
  hint: string | null;
  /** Cards he already has that match what is typed. Instant, no network. */
  library: LibraryHit[];
  phase: AskPhase;
  /** The answer (or the one plain line) for the question he sent. */
  view: AskView | null;
  /** How many cards "Add to my feed" stored; null until he taps it. */
  added: number | null;
  adding: boolean;
  /** True while "tap to try again" re-runs the check. */
  checking: boolean;
  /** Can he send? Needs 2+ characters with at least one letter, and no question in flight. */
  canSend: boolean;
  /** His last 5 questions, newest first. */
  recent: AskRecord[] | undefined;
  send(): Promise<void>;
  addToFeed(): Promise<void>;
  /** Re-run only the check on a kept answer (1 call). */
  retryCheck(): Promise<void>;
}

/** All Ask logic. The screen only calls this and draws what it returns. */
export function useAsk(opts: UseAskOptions = {}): UseAskReturn {
  const [text, setTextState] = useState('');
  const [phase, setPhase] = useState<AskPhase>('idle');
  const [view, setView] = useState<AskView | null>(null);
  const [askId, setAskId] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  /** One Ask at a time, whatever the screen does meanwhile. */
  const inFlight = useRef(false);
  const checkingRef = useRef(false);
  /** Bumped whenever the shown answer is cleared, so a late retry cannot bring it back. */
  const viewTicket = useRef(0);

  const cards = useLiveQuery(
    () => db.cards.where('status').equals('active').toArray(),
    [],
  ) as AnyCard[] | undefined;
  const recent = useLiveQuery(() => db.asks.orderBy('createdAt').reverse().limit(5).toArray(), []);
  const index = useMemo(() => buildLibraryIndex(cards ?? []), [cards]);
  const library = useMemo(() => searchLibrary(text, index), [text, index]);

  const setText = useCallback((next: string) => {
    setTextState(next.slice(0, ASK_MAX_CHARS));
    // While a question is in flight, editing only changes the box: the
    // answer still lands, is saved and is shown.
    if (inFlight.current) return;
    // A new thought makes the old answer stale.
    viewTicket.current++;
    setView(null);
    setAskId(null);
    setAdded(null);
    setPhase('idle');
  }, []);

  const trimmed = text.trim();
  const lettered = hasLetter(trimmed);
  const hint = trimmed.length > 0 && !lettered ? ASK_NEED_LETTER : null;
  const canSend = trimmed.length >= 2 && lettered && phase !== 'asking';

  const send = useCallback(async () => {
    const q = text.trim();
    if (q.length < 2 || !hasLetter(q) || inFlight.current) return;
    inFlight.current = true;
    viewTicket.current++;
    const mine = viewTicket.current;
    setPhase('asking');
    setView(null);
    setAskId(null);
    setAdded(null);
    try {
      const result = await runAsk({
        text: q,
        index,
        existing: cards ?? [],
        fetchFn: opts.fetchFn,
        levels: opts.levels,
        online: opts.online,
      });
      let id: string | null = null;
      let shown = result;
      try {
        const saved = await saveAskResult(result);
        id = saved.id;
        if (saved.weakSpot) shown = { ...result, weakSpotSaved: saved.weakSpot };
      } catch {
        id = null;
      }
      if (mine !== viewTicket.current) return;
      setAskId(id);
      setView(shown);
      setPhase('done');
    } finally {
      inFlight.current = false;
    }
  }, [text, index, cards, opts.fetchFn, opts.levels, opts.online]);

  const retryCheck = useCallback(async () => {
    if (!view || !view.canRetryCheck || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const mine = viewTicket.current;
    try {
      let next = await retryAskCheck(view, { fetchFn: opts.fetchFn, existing: cards ?? [] });
      if (askId && next.weakSpot && next.answerCheck === 'passed' && !next.weakSpotSaved) {
        const status = await saveWeakSpotStatus(next.weakSpot, askId).catch(() => 'invalid' as const);
        if (status !== 'invalid') next = { ...next, weakSpotSaved: status };
      }
      if (mine === viewTicket.current) setView(next);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [view, askId, cards, opts.fetchFn]);

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

  return {
    text,
    setText,
    maxChars: ASK_MAX_CHARS,
    hint,
    library,
    phase,
    view,
    added,
    adding,
    checking,
    canSend,
    recent,
    send,
    addToFeed,
    retryCheck,
  };
}
