import { useCallback, useRef, useState } from 'react';
import type { AiResponse } from '../../types/contract';
import type { WatchEntry } from '../coach/pipeline';

export interface AiFeedbackResult {
  summary: string;
  strongPoint: string;
  oneCorrection: string;
  suggestedAlternative?: string;
  /** AG-008 stage 2 — one grounded slip from the transcript, when found. */
  mistake?: { wrong: string; right: string };
}

export interface RequestAiFeedbackParams {
  transcript?: string | null;
  promptText?: string;
  drillTitle?: string;
  elapsedSec?: number;
  targetVocab?: string[];
  /** His known mistakes. Sent as `watch` on every review_recording call, capped at 10. */
  watch?: WatchEntry[];
  prefer?: 'gemini' | 'groq' | 'anthropic';
}

/**
 * Quote check: the feedback must quote his actual words. A double- or
 * single-quoted phrase in the feedback that does not appear in the transcript
 * (case-insensitive) is fabricated — the whole feedback is dropped, never shown.
 */
export function quotesIn(text: string): string[] {
  const out: string[] = [];
  const re = /["“”'‘’]([^"“”'‘’]{2,}?)["“”'‘’]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1]!.trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

export function containsFabricatedQuote(feedback: AiFeedbackResult, transcript: string): boolean {
  const lower = transcript.toLowerCase();
  for (const field of [feedback.summary, feedback.strongPoint, feedback.oneCorrection, feedback.suggestedAlternative ?? '']) {
    for (const q of quotesIn(field)) {
      if (!lower.includes(q.toLowerCase())) return true;
    }
  }
  return false;
}
export function validateAiFeedback(raw: unknown): AiFeedbackResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Malformed AI feedback response: expected an object');
  }

  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) {
    throw new Error('Malformed AI feedback response: missing or empty summary');
  }

  if (typeof candidate.strongPoint !== 'string' || !candidate.strongPoint.trim()) {
    throw new Error('Malformed AI feedback response: missing or empty strongPoint');
  }

  if (typeof candidate.oneCorrection !== 'string' || !candidate.oneCorrection.trim()) {
    throw new Error('Malformed AI feedback response: missing or empty oneCorrection');
  }

  let suggestedAlternative: string | undefined;
  if (typeof candidate.suggestedAlternative === 'string' && candidate.suggestedAlternative.trim()) {
    suggestedAlternative = candidate.suggestedAlternative.trim();
  }

  // `mistake` is optional and never fatal: a malformed one is dropped, not thrown.
  let mistake: { wrong: string; right: string } | undefined;
  const m = candidate.mistake;
  if (m && typeof m === 'object') {
    const mm = m as Record<string, unknown>;
    const wrong = typeof mm.wrong === 'string' ? mm.wrong.trim().slice(0, 60) : '';
    const right = typeof mm.right === 'string' ? mm.right.trim().slice(0, 60) : '';
    if (wrong && right && wrong.toLowerCase() !== right.toLowerCase()) {
      mistake = { wrong, right };
    }
  }

  return {
    summary: candidate.summary.trim(),
    strongPoint: candidate.strongPoint.trim(),
    oneCorrection: candidate.oneCorrection.trim(),
    ...(suggestedAlternative ? { suggestedAlternative } : {}),
    ...(mistake ? { mistake } : {}),
  };
}

export function useAiFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AiFeedbackResult | null>(null);
  /** True when the failure means no key or no connection — UI shows one grey line. */
  const [unavailable, setUnavailable] = useState(false);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setLoading(false);
  }, []);

  const requestFeedback = useCallback(
    async (params: RequestAiFeedbackParams): Promise<AiFeedbackResult | null> => {
      cancel();
      setFeedback(null);
      setError(null);
      setUnavailable(false);

      const transcript = params.transcript?.trim();
      if (!transcript) {
        setError('AI feedback needs a transcript. Listen back to your recording.');
        return null;
      }

      const wordCount = transcript.split(/\s+/).filter(Boolean).length;
      if (wordCount < 5) {
        setError('Transcript too short for AI review (minimum 5 words).');
        return null;
      }

      setLoading(true);
      const abortCtrl = new AbortController();
      abortCtrlRef.current = abortCtrl;

      try {
        // Transcript only — never audio.
        const res = await fetch('/.netlify/functions/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: abortCtrl.signal,
          body: JSON.stringify({
            task: 'review_recording',
            prefer: params.prefer,
            payload: { transcript, watch: (params.watch ?? []).slice(0, 10) },
          }),
        });

        // If request was aborted during network call, drop result silently
        if (abortCtrl.signal.aborted) {
          setLoading(false);
          return null;
        }

        if (!res.ok) {
          // Never surface raw provider errors. No key / offline → unavailable.
          let serverError = '';
          try {
            const errData = (await res.json()) as AiResponse;
            serverError = errData.error ?? '';
          } catch {}
          if (/not configured|failed to fetch|network|offline/i.test(serverError)) {
            setUnavailable(true);
          } else {
            setError('AI feedback unavailable right now.');
          }
          setLoading(false);
          return null;
        }

        const data = (await res.json()) as AiResponse;
        if (abortCtrl.signal.aborted) {
          setLoading(false);
          return null;
        }

        if (!data.ok || !data.data) {
          const serverError = data.error ?? '';
          if (/not configured|failed to fetch|network|offline/i.test(serverError)) {
            setUnavailable(true);
          } else {
            setError('AI feedback unavailable right now.');
          }
          setLoading(false);
          return null;
        }

        const validated = validateAiFeedback(data.data);
        // Quote check: drop fabricated quotes, never show them.
        if (containsFabricatedQuote(validated, transcript)) {
          setFeedback(null);
          setLoading(false);
          return null;
        }
        // AG-008 stage 2 — a mistake must be grounded: "wrong" has to be
        // something he actually said. Ungrounded ⇒ drop the field, keep the rest.
        if (
          validated.mistake &&
          !transcript.toLowerCase().includes(validated.mistake.wrong.toLowerCase())
        ) {
          delete validated.mistake;
        }
        if (!abortCtrl.signal.aborted) {
          setFeedback(validated);
          setLoading(false);
        }
        return validated;
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError' || abortCtrl.signal.aborted) {
          setLoading(false);
          return null;
        }

        // Network failure (offline) → unavailable, not a raw error.
        const message = (err as Error).message || '';
        if (/failed to fetch|network|offline|not configured/i.test(message)) {
          setUnavailable(true);
        } else {
          setError('AI feedback unavailable right now.');
        }
        setFeedback(null);
        setLoading(false);
        return null;
      }
    },
    [cancel],
  );

  return {
    loading,
    error,
    feedback,
    unavailable,
    requestFeedback,
    cancel,
  };
}
