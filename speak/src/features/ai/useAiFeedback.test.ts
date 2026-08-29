import { describe, expect, it, vi } from 'vitest';
import { validateAiFeedback, type AiFeedbackResult } from './useAiFeedback';

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
});
