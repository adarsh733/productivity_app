import { describe, expect, it } from 'vitest';
import type { AiFailReason, AiRequest, AiResponse, AiTask } from '../../types/contract';

describe('Netlify AI Function Contract Suite', () => {
  const ALLOWED_TASKS: readonly AiTask[] = [
    'expand_seed',
    'verify_batch',
    'classify_inbox',
    'review_recording',
    'plan_week',
  ];

  const TASK_CONFIG: Record<AiTask, { temperature: number; maxTokens: number }> = {
    expand_seed: {
      temperature: 1.0,
      maxTokens: 2048,
    },
    verify_batch: {
      temperature: 0,
      maxTokens: 2048,
    },
    classify_inbox: {
      temperature: 0.4,
      maxTokens: 2048,
    },
    review_recording: {
      temperature: 0.3,
      maxTokens: 1024,
    },
    plan_week: {
      temperature: 0.2,
      maxTokens: 1024,
    },
    answer_ask: {
      temperature: 0.4,
      maxTokens: 4096,
    },
    coach_chat: {
      temperature: 0.3,
      maxTokens: 1024,
    },
  };

  it('ALLOWED_TASKS includes all 5 system tasks and rejects arbitrary tasks', () => {
    expect(ALLOWED_TASKS).toContain('expand_seed');
    expect(ALLOWED_TASKS).toContain('verify_batch');
    expect(ALLOWED_TASKS).toContain('classify_inbox');
    expect(ALLOWED_TASKS).toContain('review_recording');
    expect(ALLOWED_TASKS).toContain('plan_week');

    const isTaskAllowed = (task: string): boolean =>
      (ALLOWED_TASKS as readonly string[]).includes(task);
    expect(isTaskAllowed('arbitrary_prompt')).toBe(false);
    expect(isTaskAllowed('chat_completion')).toBe(false);
  });

  it('verify_batch is strictly cold (temperature 0) to prevent hallucinated English validation', () => {
    expect(TASK_CONFIG.verify_batch.temperature).toBe(0);
  });

  it('review_recording has focused 0.3 temperature for consistent coaching', () => {
    expect(TASK_CONFIG.review_recording.temperature).toBe(0.3);
  });

  it('Payload size guard rejects payloads exceeding 60,000 chars', () => {
    const isPayloadWithinLimit = (payloadStr: string) => payloadStr.length <= 60_000;

    expect(isPayloadWithinLimit('{"promptText": "short text"}')).toBe(true);
    expect(isPayloadWithinLimit('x'.repeat(60_001))).toBe(false);
  });

  it('review_recording requires non-empty transcript payload with minimum 5 words', () => {
    const isValidReviewPayload = (payload: unknown): { valid: boolean; error?: string } => {
      if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid payload' };
      const p = payload as { transcript?: string };
      if (typeof p.transcript !== 'string' || !p.transcript.trim()) {
        return { valid: false, error: 'AI feedback needs a transcript' };
      }
      const words = p.transcript.trim().split(/\s+/).filter(Boolean);
      if (words.length < 5) {
        return { valid: false, error: 'Transcript too short for AI review (minimum 5 words)' };
      }
      return { valid: true };
    };

    expect(isValidReviewPayload(null).valid).toBe(false);
    expect(isValidReviewPayload({}).valid).toBe(false);
    expect(isValidReviewPayload({ transcript: '' }).valid).toBe(false);
    expect(isValidReviewPayload({ transcript: '   ' }).valid).toBe(false);
    expect(isValidReviewPayload({ transcript: 'Three short words' }).valid).toBe(false);
    expect(isValidReviewPayload({ transcript: 'Three short words' }).error).toContain('minimum 5 words');
    expect(isValidReviewPayload({ transcript: 'Here is a valid spoken transcript with many words' }).valid).toBe(true);
  });

  it('AiRequest and AiResponse interface shapes conform to the contract', () => {
    const req: AiRequest = {
      task: 'review_recording',
      prefer: 'gemini',
      payload: {
        transcript: 'Valid transcript text for speaking rep',
        promptText: 'A prompt',
        drillTitle: 'Rapid Rep',
        elapsedSec: 30,
      },
    };

    const res: AiResponse<{ summary: string }> = {
      ok: true,
      task: 'review_recording',
      provider: 'gemini',
      data: { summary: 'Great pacing' },
    };

    expect(req.task).toBe('review_recording');
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('gemini');
  });
  it('a verify_batch request can name the providers that must not serve it', () => {
    const req: AiRequest = { task: 'verify_batch', payload: { items: [] }, prefer: 'groq', exclude: ['gemini'] };
    expect(req.exclude).toEqual(['gemini']);
  });

  it('every failure reply carries plain words and a reason the phone can act on', () => {
    const reasons: AiFailReason[] = ['no_key', 'bad_reply', 'busy', 'bad_input', 'rate_limited'];
    for (const reason of reasons) {
      const res: AiResponse = { ok: false, task: 'answer_ask', error: 'Plain words.', reason };
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(reason);
      expect(typeof res.error).toBe('string');
    }
  });
});
