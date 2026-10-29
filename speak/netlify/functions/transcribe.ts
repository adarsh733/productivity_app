import type { TranscribeResult } from '../../src/types/contract';

/**
 * `/.netlify/functions/transcribe` — his recorded answer in, text with word
 * timings out. The only path from the browser to speech-to-text.
 *
 * Request: POST, either
 *   - multipart/form-data with the recording in field `audio` (or `file`), or
 *   - the raw recording as the body with an `audio/*` content-type.
 * Response: `{ ok: true, data: TranscribeResult }`, or `{ ok: false, error }`
 * where `error` is one plain sentence he can read. Never a raw provider error.
 *
 * Enforces:
 * 1. The Groq key never reaches the client (server env only).
 * 2. Size cap (Netlify's request limit is 6 MB) and audio types Groq reads.
 * 3. One timeout per call; a slow or failing provider gets a plain answer.
 * 4. Groq output is checked: words with bad timings are dropped, and silence
 *    (no words, or Whisper's "thank you" on a quiet clip) is "no words heard".
 * 5. In-memory rate limiting against abuse.
 */

/** Model pinned by a test. */
export const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** 4 MB: about 8 minutes of phone audio; stays under Netlify's 6 MB request cap. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Under 1 KB is a click, not an answer. */
export const MIN_AUDIO_BYTES = 1024;
export const TRANSCRIBE_TIMEOUT_MS = 20_000;
/** Whisper's own guess that a stretch is silence. Every stretch above it ⇒ no words. */
const NO_SPEECH_PROB = 0.8;

/** Recording types Groq accepts, mapped to the file name it reads the format from. */
const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

/** Plain sentences for every way this can fail. Tests pin them. */
export const TRANSCRIBE_ERRORS = {
  method: 'POST only',
  rate: 'Too many tries in a minute. Wait a moment and try again.',
  noAudio: 'No recording came through. Record your answer and try again.',
  tooBig: 'That recording is too long to turn into text. Keep one answer under about 5 minutes.',
  tooSmall: 'That recording is too short. Hold the button and say a full sentence.',
  wrongType: "That file isn't a recording I can read. Use the app's record button.",
  noKey: "Voice-to-text isn't set up on the server yet.",
  busy: 'Voice-to-text is busy right now. Try again in a minute.',
  slow: 'Voice-to-text took too long. Try again.',
  failed: "Couldn't turn your voice into text right now. Try again in a moment.",
  noWords: "I didn't catch any words. Try again, a little closer to the phone.",
} as const;

// Basic in-memory rate limiter: max 20 uploads per minute per IP.
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerMin = 20): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMin) return false;
  entry.count++;
  return true;
}

/** `audio/webm;codecs=opus` → `audio/webm`. */
function baseType(type: string | null | undefined): string {
  return (type ?? '').split(';')[0]!.trim().toLowerCase();
}

/** A failure the handler turns into a plain response. */
class Plain extends Error {
  constructor(
    readonly plain: string,
    readonly status: number,
  ) {
    super(plain);
  }
}

/** Read the recording out of the request: its bytes and its audio type. */
async function readAudio(req: Request): Promise<{ bytes: Blob; type: string }> {
  const declared = Number(req.headers.get('content-length'));
  // Multipart adds a little framing, so allow a few KB over the audio cap.
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 16 * 1024) {
    throw new Plain(TRANSCRIBE_ERRORS.tooBig, 413);
  }

  const contentType = baseType(req.headers.get('content-type'));
  let blob: Blob;
  let type: string;

  if (contentType === 'multipart/form-data') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new Plain(TRANSCRIBE_ERRORS.noAudio, 400);
    }
    const part = form.get('audio') ?? form.get('file');
    if (!part || typeof part === 'string') throw new Plain(TRANSCRIBE_ERRORS.noAudio, 400);
    blob = part;
    type = baseType(part.type);
  } else if (contentType.startsWith('audio/')) {
    blob = await req.blob();
    type = contentType;
  } else if (!contentType) {
    throw new Plain(TRANSCRIBE_ERRORS.noAudio, 400);
  } else {
    throw new Plain(TRANSCRIBE_ERRORS.wrongType, 415);
  }

  if (blob.size === 0) throw new Plain(TRANSCRIBE_ERRORS.noAudio, 400);
  if (!AUDIO_TYPES[type]) throw new Plain(TRANSCRIBE_ERRORS.wrongType, 415);
  if (blob.size > MAX_AUDIO_BYTES) throw new Plain(TRANSCRIBE_ERRORS.tooBig, 413);
  if (blob.size < MIN_AUDIO_BYTES) throw new Plain(TRANSCRIBE_ERRORS.tooSmall, 400);
  return { bytes: blob, type };
}

/**
 * Groq's verbose_json → the contract shape. Throws `Plain` for a reply that
 * is not the expected shape and for a clip with no words in it.
 */
export function validateTranscription(raw: unknown): TranscribeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Plain(TRANSCRIBE_ERRORS.failed, 502);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== 'string') throw new Plain(TRANSCRIBE_ERRORS.failed, 502);

  const words: TranscribeResult['words'] = [];
  if (Array.isArray(r.words)) {
    for (const w of r.words) {
      if (!w || typeof w !== 'object') continue;
      const ww = w as Record<string, unknown>;
      const word = typeof ww.word === 'string' ? ww.word.trim() : '';
      const start = ww.start;
      const end = ww.end;
      if (
        !word ||
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start
      ) {
        continue;
      }
      words.push({ word, start, end });
    }
  }

  const text = r.text.replace(/\s+/g, ' ').trim();
  const hasLetters = /[\p{L}\p{N}]/u.test(text);
  // Whisper writes "Thank you." over silence; its own no-speech guess catches that.
  const segments = Array.isArray(r.segments) ? (r.segments as Array<Record<string, unknown>>) : [];
  const allSilent =
    segments.length > 0 &&
    segments.every((s) => typeof s?.no_speech_prob === 'number' && s.no_speech_prob >= NO_SPEECH_PROB);
  if (!hasLetters || allSilent) throw new Plain(TRANSCRIBE_ERRORS.noWords, 422);

  const lastEnd = words.length ? words[words.length - 1]!.end : 0;
  const duration = typeof r.duration === 'number' && Number.isFinite(r.duration) && r.duration >= 0 ? r.duration : lastEnd;

  return { text, words, durationSec: Math.round(duration * 100) / 100 };
}

async function callGroq(audio: Blob, type: string, key: string): Promise<unknown> {
  const form = new FormData();
  form.append('file', audio, `answer.${AUDIO_TYPES[type]}`);
  form.append('model', TRANSCRIBE_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  form.append('language', 'en');
  form.append('temperature', '0');

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TRANSCRIBE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: abort.signal,
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Plain(TRANSCRIBE_ERRORS.slow, 504);
    throw new Plain(TRANSCRIBE_ERRORS.failed, 502);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new Plain(TRANSCRIBE_ERRORS.busy, 503);
  if (!res.ok) throw new Plain(TRANSCRIBE_ERRORS.failed, 502);
  try {
    return await res.json();
  } catch {
    throw new Plain(TRANSCRIBE_ERRORS.failed, 502);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: TRANSCRIBE_ERRORS.method }, 405);

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('client-ip') || 'anonymous';
  if (!checkRateLimit(clientIp)) return json({ ok: false, error: TRANSCRIBE_ERRORS.rate }, 429);

  try {
    // Check the upload before the key, so a bad file gets the right message either way.
    const { bytes, type } = await readAudio(req);
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Plain(TRANSCRIBE_ERRORS.noKey, 503);
    const raw = await callGroq(bytes, type, key);
    return json({ ok: true, data: validateTranscription(raw) });
  } catch (e) {
    if (e instanceof Plain) return json({ ok: false, error: e.plain }, e.status);
    return json({ ok: false, error: TRANSCRIBE_ERRORS.failed }, 500);
  }
}

function json(payload: { ok: boolean; data?: TranscribeResult; error?: string }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
