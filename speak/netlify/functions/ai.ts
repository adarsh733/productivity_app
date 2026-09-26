import type { AiRequest, AiResponse, AiTask } from '../../src/types/contract';

/**
 * The only path from the browser to a model.
 *
 * Enforces:
 * 1. API keys never reach the client.
 * 2. Only strictly allowed tasks are accepted.
 * 3. Payload schema validated server-side.
 * 4. Provider output validated against exact schema with failover.
 * 5. Timeouts with AbortController per provider and total deadline.
 * 6. In-memory rate limiting against abuse.
 * 7. Never turns an AI failure into fake/generic coaching.
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
      'Also reject any claim that is contested, outdated, medically or legally',
      'risky, or not well established. Reject slurs or words with an offensive',
      'second meaning. When in doubt, reject. Return ONLY JSON.',
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
      'You are an executive speech and communication coach for an Indian English speaker in tech.',
      'Review the user transcript, prompt context, and performance duration.',
      'Provide concise, high-signal, actionable feedback grounded strictly in what was said.',
      'Return ONLY a valid JSON object matching this exact schema: {"summary": string, "strongPoint": string, "oneCorrection": string, "suggestedAlternative": string}.',
      'Rules:',
      '1. "summary": One crisp sentence evaluating the overall rep.',
      '2. "strongPoint": What worked well. You MUST quote or reference specific words or phrases that appear in the transcript.',
      '3. "oneCorrection": One high-leverage delivery or phrasing tweak for next time.',
      '4. "suggestedAlternative": An upgraded sentence showing better executive presence or phrasing.',
      'Never invent quotes. Never comment on accent or pronunciation quirks. Focus on pacing, executive presence, and word precision.',
      'If a "watch" list of known mistakes is provided, check the transcript for each watched phrase first;',
      'when the transcript contains one, the correction must address it.',
    ].join(' '),
  },
};

type Provider = 'gemini' | 'groq' | 'anthropic';

const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const PER_PROVIDER_TIMEOUT_MS = 8000;
const TOTAL_FUNCTION_DEADLINE_MS = 24000;

// Basic in-memory rate limiter: max 30 requests per minute per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerMin = 30): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMin) {
    return false;
  }
  entry.count++;
  return true;
}

export interface ReviewRecordingResponse {
  summary: string;
  strongPoint: string;
  oneCorrection: string;
  suggestedAlternative?: string;
}

/**
 * Validates provider output against exact schema for the task.
 * Returns validated data object, or throws Error if invalid.
 */
export function validateClassifyInbox(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Classifier response must be an object');
  const c = raw as Record<string, unknown>;
  const kinds = ['word', 'mistake', 'topic', 'other'];
  if (typeof c.kind !== 'string' || !kinds.includes(c.kind)) throw new Error('Missing or invalid "kind"');
  if (typeof c.subject !== 'string' || !c.subject.trim()) throw new Error('Missing or empty "subject"');
  if (c.fix !== undefined && (typeof c.fix !== 'string' || !c.fix.trim())) {
    throw new Error('Invalid "fix"');
  }
  if (!Array.isArray(c.cards)) throw new Error('Missing "cards" array');
  const cards = (c.cards as unknown[]).map((d, i) => validateClassifyDraft(d, i));
  return {
    kind: c.kind,
    subject: (c.subject as string).trim(),
    ...(typeof c.fix === 'string' && c.fix.trim() ? { fix: c.fix.trim() } : {}),
    cards,
  };
}

function validateClassifyDraft(d: unknown, i: number): unknown {
  if (!d || typeof d !== 'object') throw new Error(`Draft ${i}: must be an object`);
  const r = d as Record<string, unknown>;
  if (r.type === 'word') {
    for (const f of ['term', 'pos', 'meaning', 'say'] as const) {
      if (typeof r[f] !== 'string' || !(r[f] as string).trim()) throw new Error(`Draft ${i}: missing "${f}"`);
    }
    if (!Array.isArray(r.examples) || (r.examples as unknown[]).length !== 2) {
      throw new Error(`Draft ${i}: "examples" must have exactly 2 entries`);
    }
    return {
      type: 'word',
      term: (r.term as string).trim(),
      pos: (r.pos as string).trim(),
      meaning: (r.meaning as string).trim(),
      examples: [(r.examples as string[])[0]!.trim(), (r.examples as string[])[1]!.trim()],
      say: (r.say as string).trim(),
    };
  }
  if (r.type === 'phrase') {
    for (const f of ['weak', 'strong', 'why', 'register'] as const) {
      if (typeof r[f] !== 'string' || !(r[f] as string).trim()) throw new Error(`Draft ${i}: missing "${f}"`);
    }
    if (!['office', 'friends', 'presenting'].includes(r.register as string)) {
      throw new Error(`Draft ${i}: invalid "register"`);
    }
    return {
      type: 'phrase',
      weak: (r.weak as string).trim(),
      strong: (r.strong as string).trim(),
      why: (r.why as string).trim(),
      register: r.register,
    };
  }
  if (r.type === 'explain') {
    for (const f of ['topic', 'angle'] as const) {
      if (typeof r[f] !== 'string' || !(r[f] as string).trim()) throw new Error(`Draft ${i}: missing "${f}"`);
    }
    if (!Array.isArray(r.beats) || (r.beats as unknown[]).length !== 3) {
      throw new Error(`Draft ${i}: "beats" must have exactly 3 entries`);
    }
    if (!Array.isArray(r.targetVocab)) throw new Error(`Draft ${i}: missing "targetVocab"`);
    if (typeof r.targetSec !== 'number') throw new Error(`Draft ${i}: missing "targetSec"`);
    const out: Record<string, unknown> = {
      type: 'explain',
      topic: (r.topic as string).trim(),
      angle: (r.angle as string).trim(),
      beats: (r.beats as string[]).slice(0, 3),
      targetVocab: r.targetVocab,
      targetSec: r.targetSec,
    };
    if (typeof r.primer === 'string' && r.primer.trim()) out.primer = r.primer.trim();
    return out;
  }
  throw new Error(`Draft ${i}: unknown type`);
}

export function validateVerifyBatch(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Verifier response must be an object');
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.results)) throw new Error('Missing "results" array');
  const results = (c.results as unknown[]).map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`Result ${i}: must be an object`);
    const o = r as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key) throw new Error(`Result ${i}: missing "key"`);
    if (typeof o.ok !== 'boolean') throw new Error(`Result ${i}: missing "ok"`);
    if (typeof o.reason !== 'string' || !o.reason.trim()) throw new Error(`Result ${i}: missing "reason"`);
    return { key: o.key, ok: o.ok, reason: o.reason.trim() };
  });
  return { results };
}

export function validateProviderOutput(task: AiTask, raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Provider response must be an object');
  }

  if (task === 'review_recording') {
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) {
      throw new Error('Missing or empty "summary"');
    }
    if (typeof candidate.strongPoint !== 'string' || !candidate.strongPoint.trim()) {
      throw new Error('Missing or empty "strongPoint"');
    }
    if (typeof candidate.oneCorrection !== 'string' || !candidate.oneCorrection.trim()) {
      throw new Error('Missing or empty "oneCorrection"');
    }

    let suggestedAlternative: string | undefined;
    if (
      typeof candidate.suggestedAlternative === 'string' &&
      candidate.suggestedAlternative.trim()
    ) {
      suggestedAlternative = candidate.suggestedAlternative.trim();
    }

    const validated: ReviewRecordingResponse = {
      summary: candidate.summary.trim(),
      strongPoint: candidate.strongPoint.trim(),
      oneCorrection: candidate.oneCorrection.trim(),
      ...(suggestedAlternative ? { suggestedAlternative } : {}),
    };
    return validated;
  }

  if (task === 'classify_inbox') {
    return validateClassifyInbox(raw);
  }

  if (task === 'verify_batch') {
    return validateVerifyBatch(raw);
  }

  return raw;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('client-ip') ||
    'anonymous';

  if (!checkRateLimit(clientIp)) {
    return json({ ok: false, error: 'Rate limit exceeded. Please wait a moment.' }, 429);
  }

  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }

  if (!body || !ALLOWED_TASKS.includes(body.task)) {
    return json({ ok: false, error: 'unknown task' }, 400);
  }

  // Task-specific payload validation
  if (body.task === 'classify_inbox') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string' || !payload.text.trim()) {
      return json({ ok: false, task: body.task, error: 'AI sorting needs the note text' }, 400);
    }
  }

  if (body.task === 'verify_batch') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
  }

  if (body.task === 'review_recording') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    if (typeof payload.transcript !== 'string' || !payload.transcript.trim()) {
      return json({ ok: false, task: body.task, error: 'AI feedback needs a transcript' }, 400);
    }
    const transcript = payload.transcript.trim();
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 5) {
      return json(
        { ok: false, task: body.task, error: 'Transcript too short for AI review (minimum 5 words)' },
        400,
      );
    }
    // `watch` is optional: his known mistakes (max 10). Never a hard error.
    const watch = (payload as { watch?: unknown }).watch;
    if (watch !== undefined) {
      if (!Array.isArray(watch) || watch.length > 10) {
        return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
      }
    }
  }

  const cfg = TASK_CONFIG[body.task];
  const userPrompt = JSON.stringify(body.payload ?? {});
  if (userPrompt.length > 60_000) {
    return json({ ok: false, task: body.task, error: 'payload too large' }, 413);
  }

  // Provider order is Gemini → Groq → Anthropic (locked decision).
  // Anthropic stays only as a last fallback. `prefer` can still override.
  const allProviders: Provider[] = ['gemini', 'groq', 'anthropic'];
  const preferred = body.prefer && allProviders.includes(body.prefer) ? body.prefer : undefined;
  const order: Provider[] = preferred
    ? [preferred, ...allProviders.filter((p) => p !== preferred)]
    : allProviders;

  const functionDeadline = Date.now() + TOTAL_FUNCTION_DEADLINE_MS;
  const errors: string[] = [];

  for (const provider of order) {
    if (Date.now() >= functionDeadline) {
      errors.push('function deadline exceeded');
      break;
    }

    try {
      const remainingTime = Math.max(1000, functionDeadline - Date.now());
      const timeoutMs = Math.min(PER_PROVIDER_TIMEOUT_MS, remainingTime);

      const rawText = await callWithTimeout(
        provider,
        cfg.system,
        userPrompt,
        cfg.temperature,
        cfg.maxTokens,
        timeoutMs,
      );

      if (rawText === null) {
        errors.push(`${provider}: not configured`);
        continue;
      }

      const parsed = safeParse(rawText);
      const validated = validateProviderOutput(body.task, parsed);

      return json({ ok: true, task: body.task, provider, data: validated });
    } catch (e) {
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }

  return json({ ok: false, task: body.task, error: 'AI is unavailable right now (offline or no key). Saved — I will try again when you are online.' }, 502);
}

async function callWithTimeout(
  provider: Provider,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
): Promise<string | null> {
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  try {
    return await call(provider, system, user, temperature, maxTokens, abortCtrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function call(
  provider: Provider,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string | null> {
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        signal,
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
    signal,
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
    throw new Error('Malformed JSON returned by provider');
  }
}

function json(payload: Partial<AiResponse>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
