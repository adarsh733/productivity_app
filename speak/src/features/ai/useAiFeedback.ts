import { useCallback, useRef, useState } from 'react';
import type { AiResponse } from '../../types/contract';

export interface AiFeedbackResult {
  summary: string;
  strongPoint: string;
  oneCorrection: string;
  suggestedAlternative?: string;
}

export interface RequestAiFeedbackParams {
  transcript?: string | null;
  promptText?: string;
  drillTitle?: string;
  elapsedSec?: number;
  targetVocab?: string[];
  prefer?: 'gemini' | 'groq' | 'anthropic';
}

/**
 * Validates the raw JSON returned from the AI model.
 * Strict validation: rejects incomplete responses without using fallback defaults.
 */
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

  return {
    summary: candidate.summary.trim(),
    strongPoint: candidate.strongPoint.trim(),
    oneCorrection: candidate.oneCorrection.trim(),
    ...(suggestedAlternative ? { suggestedAlternative } : {}),
  };
}

export function useAiFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AiFeedbackResult | null>(null);
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
        const res = await fetch('/.netlify/functions/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: abortCtrl.signal,
          body: JSON.stringify({
            task: 'review_recording',
            prefer: params.prefer,
            payload: {
              transcript,
              promptText: params.promptText,
              drillTitle: params.drillTitle,
              elapsedSec: params.elapsedSec,
              targetVocab: params.targetVocab,
            },
          }),
        });

        // If request was aborted during network call, drop result silently
        if (abortCtrl.signal.aborted) {
          setLoading(false);
          return null;
        }

        if (!res.ok) {
          let errorMsg = `AI feedback unavailable (HTTP ${res.status})`;
          try {
            const errData = (await res.json()) as AiResponse;
            if (errData.error) errorMsg = errData.error;
          } catch {}
          throw new Error(errorMsg);
        }

        const data = (await res.json()) as AiResponse;
        if (abortCtrl.signal.aborted) {
          setLoading(false);
          return null;
        }

        if (!data.ok || !data.data) {
          throw new Error(data.error ?? 'AI feedback unavailable');
        }

        const validated = validateAiFeedback(data.data);
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

        const message = (err as Error).message || 'AI feedback unavailable';
        setError(message);
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
    requestFeedback,
    cancel,
  };
}
