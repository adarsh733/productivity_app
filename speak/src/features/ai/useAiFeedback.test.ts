import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { containsFabricatedQuote, useAiFeedback, validateAiFeedback, type AiFeedbackResult } from './useAiFeedback';

describe('AI Coaching Feedback Suite', () => {
  it('Structured AI feedback matches contract schema when all fields are present', () => {
    const raw = {
      summary: 'Delivered a crisp 30s status update.',
      strongPoint: 'Framed the trade-off immediately without preamble.',
      oneCorrection: 'Slow down before the punchline for higher gravitas.',
      suggestedAlternative: 'Instead of "maybe we could", use "I recommend we move the date".',
    };

    const feedback = validateAiFeedback(raw);
    expect(feedback.summary).toBe('Delivered a crisp 30s status update.');
    expect(feedback.strongPoint).toBe('Framed the trade-off immediately without preamble.');
    expect(feedback.oneCorrection).toBe('Slow down before the punchline for higher gravitas.');
    expect(feedback.suggestedAlternative).toBe(
      'Instead of "maybe we could", use "I recommend we move the date".',
    );
  });

  it('Malformed AI data is rejected rather than filled with canned defaults', () => {
    // Missing strongPoint
    expect(() =>
      validateAiFeedback({
        summary: 'Some summary',
        oneCorrection: 'Some correction',
      }),
    ).toThrow(/missing or empty strongPoint/);

    // Missing summary
    expect(() =>
      validateAiFeedback({
        strongPoint: 'Good',
        oneCorrection: 'Pause more',
      }),
    ).toThrow(/missing or empty summary/);

    // Missing oneCorrection
    expect(() =>
      validateAiFeedback({
        summary: 'Good rep',
        strongPoint: 'Clear tone',
      }),
    ).toThrow(/missing or empty oneCorrection/);

    // Empty strings
    expect(() =>
      validateAiFeedback({
        summary: '   ',
        strongPoint: 'Good',
        oneCorrection: 'Fix',
      }),
    ).toThrow(/missing or empty summary/);

    // Non-object
    expect(() => validateAiFeedback(null)).toThrow(/expected an object/);
    expect(() => validateAiFeedback('raw text string')).toThrow(/expected an object/);
  });

  it('Rejects transcripts under 5 words without making network call', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const requestWithValidation = async (transcript?: string | null) => {
      const trimmed = transcript?.trim();
      if (!trimmed) {
        return { called: false, error: 'AI feedback needs a transcript. Listen back to your recording.' };
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length < 5) {
        return { called: false, error: 'Transcript too short for AI review (minimum 5 words).' };
      }
      await fetch('/.netlify/functions/ai');
      return { called: true, error: null };
    };

    const emptyRes = await requestWithValidation('   ');
    expect(emptyRes.called).toBe(false);
    expect(emptyRes.error).toContain('AI feedback needs a transcript');
    expect(fetchSpy).not.toHaveBeenCalled();

    const shortRes = await requestWithValidation('Only three words');
    expect(shortRes.called).toBe(false);
    expect(shortRes.error).toContain('minimum 5 words');
    expect(fetchSpy).not.toHaveBeenCalled();

    const validRes = await requestWithValidation('This transcript has more than five spoken words.');
    expect(validRes.called).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('Client cancellation discards in-flight request and does not display stale feedback', async () => {
    const abortCtrl = new AbortController();
    let feedbackState: AiFeedbackResult | null = null;

    const executeRequest = async (signal: AbortSignal) => {
      try {
        const res = await new Promise<{ ok: boolean; data: any }>((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              data: {
                summary: 'Delayed summary',
                strongPoint: 'Delayed strong point',
                oneCorrection: 'Delayed correction',
              },
            });
          }, 100);
        });

        if (signal.aborted) return;
        feedbackState = validateAiFeedback(res.data);
      } catch {
        if (signal.aborted) return;
      }
    };

    const promise = executeRequest(abortCtrl.signal);
    // User cancels immediately
    abortCtrl.abort();

    await promise;
    // Feedback must remain null (no stale feedback)
    expect(feedbackState).toBeNull();
  });

  it('Network failure produces zero generic coaching claims', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (Network Error)'));

    let feedbackState: AiFeedbackResult | null = null;
    let errorState: string | null = null;

    try {
      const res = await fetch('/.netlify/functions/ai', { method: 'POST' });
      const json = await res.json();
      feedbackState = validateAiFeedback(json);
    } catch (err) {
      feedbackState = null;
      errorState = (err as Error).message;
    }

    // Zero coaching claims must be produced
    expect(feedbackState).toBeNull();
    expect(errorState).toBe('Failed to fetch (Network Error)');
  });

  it('Quote check: a quoted phrase missing from the transcript is fabricated', () => {
    const transcript = 'We will ship the migration on Friday after the review';
    const honest: AiFeedbackResult = {
      summary: 'Crisp update.',
      strongPoint: 'You said "ship the migration on Friday" with a clean landing.',
      oneCorrection: 'Pause before the date.',
    };
    expect(containsFabricatedQuote(honest, transcript)).toBe(false);

    const fabricated: AiFeedbackResult = {
      summary: 'Crisp update.',
      strongPoint: 'You said "synergize the paradigm shift" with confidence.',
      oneCorrection: 'Pause before the date.',
    };
    expect(containsFabricatedQuote(fabricated, transcript)).toBe(true);
  });

  it('Quote check is case-insensitive', () => {
    const transcript = 'We Will Ship On Friday';
    const feedback: AiFeedbackResult = {
      summary: 'Good.',
      strongPoint: 'Loved "will ship on friday".',
      oneCorrection: 'Slow down.',
    };
    expect(containsFabricatedQuote(feedback, transcript)).toBe(false);
  });

  it('every review_recording call sends watch, capped at 10 (AG-007 stage 3)', async () => {
    const bodies: Array<{ task: string; payload: { watch?: unknown } }> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: { summary: 'Crisp update.', strongPoint: 'Clean landing.', oneCorrection: 'Pause more.' },
        }),
      };
    });

    const { result } = renderHook(() => useAiFeedback());
    const bigWatch = Array.from({ length: 12 }, (_, i) => ({ wrong: `wrong${i}`, right: `right${i}` }));
    await act(async () => {
      await result.current.requestFeedback({
        transcript: 'This transcript has more than five spoken words in it.',
        watch: bigWatch,
      });
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.task).toBe('review_recording');
    expect(bodies[0]!.payload.watch).toHaveLength(10);

    // No watch passed → still sent, as an empty list.
    await act(async () => {
      await result.current.requestFeedback({
        transcript: 'Another transcript with more than five spoken words here.',
      });
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.payload.watch).toEqual([]);
  });

  it('validateAiFeedback keeps a well-formed mistake trimmed and capped, drops bad ones (AG-008 stage 2)', () => {
    const base = {
      summary: 'Crisp update.',
      strongPoint: 'Clean landing.',
      oneCorrection: 'Pause more.',
    };
    const kept = validateAiFeedback({
      ...base,
      mistake: { wrong: '  revert back  ', right: '  revert  ' },
    });
    expect(kept.mistake).toEqual({ wrong: 'revert back', right: 'revert' });

    const long = validateAiFeedback({
      ...base,
      mistake: { wrong: 'w'.repeat(80), right: 'r'.repeat(80) },
    });
    expect(long.mistake?.wrong).toHaveLength(60);
    expect(long.mistake?.right).toHaveLength(60);

    // Never fatal: a malformed mistake is dropped, the rest survives.
    expect(validateAiFeedback({ ...base, mistake: null }).mistake).toBeUndefined();
    expect(validateAiFeedback({ ...base, mistake: { wrong: ' ', right: 'revert' } }).mistake).toBeUndefined();
    expect(validateAiFeedback({ ...base, mistake: { wrong: 'revert', right: 'REVERT' } }).mistake).toBeUndefined();
  });

  it('a mistake not present in the transcript is dropped; a grounded one is kept (AG-008 stage 2)', async () => {
    const respond = (mistake: unknown) =>
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            summary: 'Crisp update.',
            strongPoint: 'Clean landing.',
            oneCorrection: 'Pause more.',
            mistake,
          },
        }),
      }));

    const transcript = 'I will Revert Back to this after the call with the client';

    // Grounded, case-insensitively: kept.
    global.fetch = respond({ wrong: 'revert back', right: 'revert' }) as unknown as typeof fetch;
    const first = renderHook(() => useAiFeedback());
    await act(async () => {
      await first.result.current.requestFeedback({ transcript });
    });
    expect(first.result.current.feedback?.mistake).toEqual({ wrong: 'revert back', right: 'revert' });
    first.unmount();

    // Not in the transcript: dropped, rest of the feedback survives.
    global.fetch = respond({ wrong: 'synergize the paradigm', right: 'align' }) as unknown as typeof fetch;
    const second = renderHook(() => useAiFeedback());
    await act(async () => {
      await second.result.current.requestFeedback({ transcript });
    });
    expect(second.result.current.feedback?.mistake).toBeUndefined();
    expect(second.result.current.feedback?.summary).toBe('Crisp update.');
    second.unmount();
  });
});
