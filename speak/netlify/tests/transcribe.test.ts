import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, {
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
  TRANSCRIBE_ERRORS,
  TRANSCRIBE_MODEL,
  validateTranscription,
} from '../functions/transcribe';

/*
 * The suite runs under jsdom (shared setup), whose FormData/Blob/File do not
 * mix with Node's Request. The Netlify runtime is plain Node, so borrow Node's
 * own classes (reachable through Node's Request/Response) for this file.
 */
const swapped = { FormData: globalThis.FormData, Blob: globalThis.Blob, File: globalThis.File };
beforeAll(async () => {
  const parsed = await new Request('http://x/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'a=1',
  }).formData();
  Object.assign(globalThis, { FormData: parsed.constructor, Blob: NodeBlob, File: NodeFile });
});
afterAll(() => {
  Object.assign(globalThis, swapped);
});

const URL_ = 'http://localhost/.netlify/functions/transcribe';
const KEY = 'gsk_secret_test_key_123';
let ip = 0;

function audio(bytes = 4096, type = 'audio/webm;codecs=opus'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

/** multipart upload in field `audio`, the way the record button sends it. */
function upload(blob: Blob, field = 'audio', headers: Record<string, string> = {}): Request {
  ip += 1;
  const form = new FormData();
  form.append(field, blob, 'answer');
  return new Request(URL_, {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.20.0.${ip}`, ...headers },
    body: form,
  });
}

/** Raw body upload with an audio content-type. */
function rawUpload(bytes: number, type: string): Request {
  ip += 1;
  return new Request(URL_, {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.21.0.${ip}`, 'content-type': type },
    body: new Uint8Array(bytes),
  });
}

const groqOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    text: ' I shipped the release on Friday. ',
    duration: 2.4,
    words: [
      { word: 'I', start: 0, end: 0.2 },
      { word: 'shipped', start: 0.2, end: 0.6 },
      { word: 'the', start: 0.6, end: 0.7 },
      { word: 'release', start: 0.7, end: 1.1 },
      { word: 'on', start: 1.1, end: 1.2 },
      { word: 'Friday.', start: 1.2, end: 1.8 },
    ],
    segments: [{ no_speech_prob: 0.01 }],
    ...over,
  }),
});

async function body(res: Response): Promise<any> {
  return res.json();
}

describe('transcribe function', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('pins the Groq Whisper model and sends verbose_json with word timestamps; the key stays server-side', async () => {
    expect(TRANSCRIBE_MODEL).toBe('whisper-large-v3-turbo');
    process.env.GROQ_API_KEY = KEY;
    const fetchSpy = vi.fn().mockResolvedValue(groqOk());
    global.fetch = fetchSpy as any;

    const res = await handler(upload(audio()));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.ok).toBe(true);
    expect(data.data).toEqual({
      text: 'I shipped the release on Friday.',
      words: [
        { word: 'I', start: 0, end: 0.2 },
        { word: 'shipped', start: 0.2, end: 0.6 },
        { word: 'the', start: 0.6, end: 0.7 },
        { word: 'release', start: 0.7, end: 1.1 },
        { word: 'on', start: 1.1, end: 1.2 },
        { word: 'Friday.', start: 1.2, end: 1.8 },
      ],
      durationSec: 2.4,
    });
    expect(JSON.stringify(data)).not.toContain(KEY);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, { headers: Record<string, string>; body: FormData }];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    const sent = init.body;
    expect(sent.get('model')).toBe('whisper-large-v3-turbo');
    expect(sent.get('response_format')).toBe('verbose_json');
    expect(sent.getAll('timestamp_granularities[]')).toContain('word');
    const file = sent.get('file') as File;
    expect(file.size).toBe(4096);
    expect(file.name).toBe('answer.webm');
  });

  it('accepts a raw audio body and the `file` field; iPhone audio/mp4 goes up as .mp4', async () => {
    process.env.GROQ_API_KEY = KEY;
    const fetchSpy = vi.fn().mockResolvedValue(groqOk());
    global.fetch = fetchSpy as any;

    expect((await handler(rawUpload(4096, 'audio/mp4'))).status).toBe(200);
    expect(((fetchSpy.mock.calls[0]![1] as { body: FormData }).body.get('file') as File).name).toBe('answer.mp4');
    expect((await handler(upload(audio(4096, 'audio/mpeg'), 'file'))).status).toBe(200);
  });

  it('no key on the server: a plain message, and Groq is never called', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = await handler(upload(audio()));
    expect(res.status).toBe(503);
    expect((await body(res)).error).toBe(TRANSCRIBE_ERRORS.noKey);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('oversize audio is refused before any call (by its size, and by content-length)', async () => {
    process.env.GROQ_API_KEY = KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const big = await handler(upload(audio(MAX_AUDIO_BYTES + 1)));
    expect(big.status).toBe(413);
    expect((await body(big)).error).toBe(TRANSCRIBE_ERRORS.tooBig);

    const bigRaw = await handler(rawUpload(MAX_AUDIO_BYTES + 1, 'audio/webm'));
    expect(bigRaw.status).toBe(413);

    const declared = await handler(
      upload(audio(), 'audio', { 'content-length': String(MAX_AUDIO_BYTES * 2) }),
    );
    expect(declared.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('wrong type, missing file, empty file and a too-short click are refused plainly', async () => {
    process.env.GROQ_API_KEY = KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const cases: Array<[Request, number, string]> = [
      [upload(audio(4096, 'image/png')), 415, TRANSCRIBE_ERRORS.wrongType],
      [upload(audio(4096, 'video/x-matroska')), 415, TRANSCRIBE_ERRORS.wrongType],
      [rawUpload(4096, 'text/plain'), 415, TRANSCRIBE_ERRORS.wrongType],
      [rawUpload(4096, 'application/json'), 415, TRANSCRIBE_ERRORS.wrongType],
      [upload(audio(), 'recording'), 400, TRANSCRIBE_ERRORS.noAudio],
      [upload(audio(0)), 400, TRANSCRIBE_ERRORS.noAudio],
      [upload(audio(MIN_AUDIO_BYTES - 1)), 400, TRANSCRIBE_ERRORS.tooSmall],
    ];
    for (const [req, status, error] of cases) {
      const res = await handler(req);
      expect(res.status).toBe(status);
      const data = await body(res);
      expect(data.ok).toBe(false);
      expect(data.error).toBe(error);
    }

    ip += 1;
    const noBody = await handler(new Request(URL_, { method: 'POST', headers: { 'x-forwarded-for': `10.22.0.${ip}` } }));
    expect(noBody.status).toBe(400);
    expect((await handler(new Request(URL_, { method: 'GET' }))).status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('provider errors become plain messages, never the raw error or the key', async () => {
    process.env.GROQ_API_KEY = KEY;
    const cases: Array<[unknown, number, string]> = [
      [{ ok: false, status: 500, json: async () => ({ error: { message: `bad key ${KEY}` } }) }, 502, TRANSCRIBE_ERRORS.failed],
      [{ ok: false, status: 401, json: async () => ({}) }, 502, TRANSCRIBE_ERRORS.failed],
      [{ ok: false, status: 429, json: async () => ({}) }, 503, TRANSCRIBE_ERRORS.busy],
      [{ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('Unexpected token <')) }, 502, TRANSCRIBE_ERRORS.failed],
      [{ ok: true, status: 200, json: async () => ({ words: [] }) }, 502, TRANSCRIBE_ERRORS.failed],
      [{ ok: true, status: 200, json: async () => ['not', 'an', 'object'] }, 502, TRANSCRIBE_ERRORS.failed],
    ];
    for (const [reply, status, error] of cases) {
      global.fetch = vi.fn().mockResolvedValue(reply) as any;
      const res = await handler(upload(audio()));
      expect(res.status).toBe(status);
      const text = await res.text();
      expect(JSON.parse(text).error).toBe(error);
      expect(text).not.toContain(KEY);
      expect(text).not.toMatch(/http|token|Unexpected/i);
    }

    global.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.groq.com')) as any;
    const down = await handler(upload(audio()));
    expect(down.status).toBe(502);
    expect(await down.text()).not.toContain('ENOTFOUND');

    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abort) as any;
    const slow = await handler(upload(audio()));
    expect(slow.status).toBe(504);
    expect((await body(slow)).error).toBe(TRANSCRIBE_ERRORS.slow);
  });

  it('an empty transcript (or Whisper hearing only silence) is "no words heard"', async () => {
    process.env.GROQ_API_KEY = KEY;
    for (const over of [
      { text: '', words: [] },
      { text: '   ', words: [] },
      { text: ' ... ', words: [] },
      { text: ' Thank you.', words: [{ word: 'Thank', start: 0, end: 0.3 }], segments: [{ no_speech_prob: 0.93 }] },
    ]) {
      global.fetch = vi.fn().mockResolvedValue(groqOk(over)) as any;
      const res = await handler(upload(audio()));
      expect(res.status).toBe(422);
      expect((await body(res)).error).toBe(TRANSCRIBE_ERRORS.noWords);
    }
  });

  it('validateTranscription drops words with bad timings and falls back to the last word for duration', () => {
    const out = validateTranscription({
      text: 'one two three',
      words: [
        { word: 'one', start: 0, end: 0.4 },
        { word: '', start: 0.4, end: 0.5 },
        { word: 'two', start: 'x', end: 0.8 },
        { word: 'three', start: 1, end: 0.5 },
        { word: 'three', start: 1, end: 1.5 },
        null,
      ],
    });
    expect(out.words).toEqual([
      { word: 'one', start: 0, end: 0.4 },
      { word: 'three', start: 1, end: 1.5 },
    ]);
    expect(out.durationSec).toBe(1.5);
    // Some speech in one stretch is enough: not every segment has to be sure.
    expect(
      validateTranscription({ text: 'hello there', segments: [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.1 }] }).text,
    ).toBe('hello there');
  });
});
