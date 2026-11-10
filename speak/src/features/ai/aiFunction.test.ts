import { describe, expect, it } from 'vitest';
import type { AiFailReason, AiRequest, AiResponse, AiTask } from '../../types/contract';

describe('Netlify AI Function Contract Suite', () => {
  const ALLOWED_TASKS: readonly AiTask[] = ['expand_seed', 'verify_batch', 'plan_week', 'tell_app'];

  const TASK_CONFIG: Record<AiTask, { temperature: number; maxTokens: number }> = {
    expand_seed: {
      temperature: 1.0,
      maxTokens: 2048,
    },
    verify_batch: {
      temperature: 0,
      maxTokens: 2048,
    },
    plan_week: {
      temperature: 0.2,
      maxTokens: 1024,
    },
    // v8 Ask box (2026-11-10): the values in netlify/functions/ai.ts. 1,024 tokens, not
    // fewer: Groq's gpt-oss and Claude Haiku think first, and thinking spends max_tokens.
    tell_app: {
      temperature: 0.3,
      maxTokens: 1024,
    },
  };

  it('ALLOWED_TASKS holds the 4 system tasks and rejects arbitrary tasks', () => {
    expect(ALLOWED_TASKS).toEqual(['expand_seed', 'verify_batch', 'plan_week', 'tell_app']);
    expect(Object.keys(TASK_CONFIG).sort()).toEqual([...ALLOWED_TASKS].sort());

    const isTaskAllowed = (task: string): boolean =>
      (ALLOWED_TASKS as readonly string[]).includes(task);
    expect(isTaskAllowed('arbitrary_prompt')).toBe(false);
    expect(isTaskAllowed('chat_completion')).toBe(false);
  });

  it('the tasks removed on 2026-11-10 are not AI tasks any more', () => {
    // Each line fails the type check if the name ever comes back into AiTask.
    // @ts-expect-error answer_ask was removed with the old Ask screen
    const ask: AiTask = 'answer_ask';
    // @ts-expect-error coach_chat was removed with the evening voice chat
    const chat: AiTask = 'coach_chat';
    // @ts-expect-error review_recording was removed with the old Speak tools
    const review: AiTask = 'review_recording';
    // @ts-expect-error classify_inbox was removed with the coach box
    const inbox: AiTask = 'classify_inbox';
    for (const task of [ask, chat, review, inbox]) {
      expect((ALLOWED_TASKS as readonly string[]).includes(task)).toBe(false);
    }
  });

  it('verify_batch is strictly cold (temperature 0) to prevent hallucinated English validation', () => {
    expect(TASK_CONFIG.verify_batch.temperature).toBe(0);
  });

  it('Payload size guard rejects payloads exceeding 60,000 chars', () => {
    const isPayloadWithinLimit = (payloadStr: string) => payloadStr.length <= 60_000;

    expect(isPayloadWithinLimit('{"promptText": "short text"}')).toBe(true);
    expect(isPayloadWithinLimit('x'.repeat(60_001))).toBe(false);
  });

  it('AiRequest and AiResponse interface shapes conform to the contract', () => {
    const req: AiRequest = {
      task: 'expand_seed',
      prefer: 'gemini',
      payload: { type: 'word', count: 2 },
    };

    const res: AiResponse<{ cards: unknown[] }> = {
      ok: true,
      task: 'expand_seed',
      provider: 'gemini',
      data: { cards: [] },
    };

    expect(req.task).toBe('expand_seed');
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
      const res: AiResponse = { ok: false, task: 'expand_seed', error: 'Plain words.', reason };
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(reason);
      expect(typeof res.error).toBe('string');
    }
  });
});
