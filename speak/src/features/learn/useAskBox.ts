import { useCallback, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { THEMES, type AskTurn, type TellAppRequest, type TellAppResult } from '../../types/contract';
import { tryConsumeAiCall, refundAiCalls } from '../auto/budget';
import { AiCallError, CoachNeedsKeyError, aiPost, neverReachedModel } from '../coach/pipeline';
import { addedThemes, askTurns, saveAskTurn } from './askLearned';
import { db } from '../../db/db';

/** Plain error lines. On every one of them the text stays in the box. */
export const ASK_OFFLINE_LINE = 'No signal. Your words are still in the box.';
export const ASK_NO_KEY_LINE = 'The AI is not set up yet.';
export const ASK_BUSY_LINE = 'The AI is busy. Try again in a bit.';

/** His longest message (the server refuses more). */
export const ASK_TEXT_MAX = 1000;
/** Turns sent along so a short "yes, that" still makes sense. */
const RECENT_SENT = 5;

function errorLine(e: unknown): string {
  if (e instanceof CoachNeedsKeyError) return ASK_NO_KEY_LINE;
  if (e instanceof AiCallError) {
    if (e.reason === 'offline') return ASK_OFFLINE_LINE;
    if (e.reason === 'no_key') return ASK_NO_KEY_LINE;
    if (e.reason === 'bad_input') return e.message;
  }
  return ASK_BUSY_LINE;
}

/**
 * The Ask box. One send = one slot from the daily budget and one `tell_app`
 * call; the reply and what it learned are saved on the phone. A call that
 * never reached a model (offline, no key, refused) gives its slot back.
 */
export function useAskBox(): {
  turns: AskTurn[];
  sending: boolean;
  error: string | null;
  send(text: string): Promise<void>;
} {
  const turns = useLiveQuery(() => askTurns(), []) ?? [];
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const send = useCallback(async (text: string): Promise<void> => {
    const said = text.trim().slice(0, ASK_TEXT_MAX);
    if (!said || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    let taken = false;
    try {
      taken = await tryConsumeAiCall();
      if (!taken) {
        setError(ASK_BUSY_LINE);
        return;
      }
      const [extra, profile, recent] = await Promise.all([addedThemes(), db.profile.get('me'), askTurns(RECENT_SENT)]);
      const request: TellAppRequest = {
        text: said,
        themes: [...THEMES, ...extra],
        levels: profile?.moduleLevels ?? {},
        recent: recent.map((t) => ({ said: t.said, reply: t.reply })),
      };
      const res = await aiPost<TellAppResult>('tell_app', request, (...a) => fetch(...a));
      await saveAskTurn(said, res.data);
    } catch (e) {
      if (taken && neverReachedModel(e)) await refundAiCalls(1).catch(() => {});
      setError(errorLine(e));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, []);

  return { turns, sending, error, send };
}
