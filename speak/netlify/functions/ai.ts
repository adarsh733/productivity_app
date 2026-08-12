import type { AiRequest, AiResponse, AiTask } from '../../src/types/contract';

/**
 * The only path from the browser to a model.
 *
 * Two rules this function exists to enforce:
 *
 *  1. The API keys never reach the client. They are read from the environment
 *     here and nowhere else.
 *  2. The client cannot supply a prompt. It names a *task*; the prompt for that
 *     task lives below. Otherwise this endpoint is a free public LLM the moment
 *     anyone opens devtools, and the free quota is gone the same day.
 *
 * Shipped in Phase 0 but unused by the app — Phase 0 has no live AI. It is here
 * so the deploy path, the env wiring and the failover are proven before
 * anything depends on them.
 */

const ALLOWED_TASKS: readonly AiTask[] = [
  'expand_seed',
  'verify_batch',
  'classify_inbox',
  'review_recording',
];

/** Per-task generation settings. `verify_batch` is deliberately cold. */
const TASK_CONFIG: Record<AiTask, { temperature: number; maxTokens: number; system: string }> = {
  expand_seed: {
    temperature: 1.0,
    maxTokens: 2048,
    system: [
      'You generate vocabulary and delivery drill cards for one Indian English speaker',
      'working in a corporate setting. Return ONLY JSON matching the schema given.',
      'Everyday register, not literary. No rare or archaic words.',
      'Examples must be sentences a colleague would actually say out loud.',
    ].join(' '),
  },
  verify_batch: {
    temperature: 0,
    maxTokens: 2048,
    system: [
      'You are a strict verifier. For each item, answer whether it is real,',
      'standard, and natural in everyday professional English.',
      'Reject invented idioms, unnatural collocations, and calques from Hindi.',
      'When in doubt, reject. Return ONLY JSON.',
    ].join(' '),
  },
  classify_inbox: {
    temperature: 0.4,
    maxTokens: 2048,
    system: [
      'You turn a raw one-line thought into one or more typed drill cards.',
      'Preserve what the user was actually curious about. Return ONLY JSON.',
    ].join(' '),
  },
  review_recording: {
    temperature: 0.3,
    maxTokens: 1024,
    system: [
      'You review a transcript of one person speaking for up to 90 seconds.',
      'Comment on structure, word choice and clarity. Be specific and brief.',
      'Never comment on accent. Return ONLY JSON.',
    ].join(' '),
  },
};

type Provider = 'gemini' | 'groq';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }

  if (!body || !ALLOWED_TASKS.includes(body.task)) {
    return json({ ok: false, error: 'unknown task' }, 400);
  }

  const cfg = TASK_CONFIG[body.task];
  const userPrompt = JSON.stringify(body.payload ?? {});
  if (userPrompt.length > 60_000) {
    return json({ ok: false, task: body.task, error: 'payload too large' }, 413);
  }

  // Try the preferred provider, fall back to the other one on quota/5xx. The
  // point of two providers is that one exhausted free tier is not an outage.
  const order: Provider[] =
    body.prefer === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];

  const errors: string[] = [];
  for (const provider of order) {
    try {
      const text = await call(provider, cfg.system, userPrompt, cfg.temperature, cfg.maxTokens);
      if (text === null) {
        errors.push(`${provider}: not configured`);
        continue;
      }
      return json({ ok: true, task: body.task, provider, data: safeParse(text) });
    } catch (e) {
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }

  return json({ ok: false, task: body.task, error: errors.join(' | ') }, 502);
}

async function call(
  provider: Provider,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
): Promise<string | null> {
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function json(payload: Partial<AiResponse>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
