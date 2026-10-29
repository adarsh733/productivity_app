import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import { AI_BUDGET_META, aiCallsUsed } from '../auto/budget';
import source from './useEveningChat.ts?raw';
import {
  CHAT_LINES,
  CHAT_QUESTION_COUNT,
  ChatError,
  MOMENT_QUESTION,
  loudnessVsNormal,
  questionsFor,
  startMicCapture,
  transcribeAudio,
  useEveningChat,
  validateFeedback,
  wpmFromWords,
  type StartCapture,
} from './useEveningChat';

const DAY = '2026-10-29';

const sentence =
  'It was good I had meetings and then I worked on the pricing page and then the designer gave feedback';

function wordsFor(text: string, perWord = 0.33) {
  return text.split(' ').map((word, i) => ({ word, start: i * perWord, end: i * perWord + 0.3 }));
}

const HEARD = {
  text: sentence,
  words: wordsFor(sentence),
  durationSec: 6,
};

const FEEDBACK = {
  good: 'You picked a real thing from your day: "pricing page".',
  fixes: [{ text: 'Swap "and then" for "but" and "so".', lesson: 'ls-stories-1-1-3' }],
  better: 'The designer tore up my pricing page. But one comment was gold, so we rebuilt it.',
  slip: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Calls {
  transcribe: number;
  coach: Array<Record<string, unknown>>;
}

/** A fake network: the transcribe function and the ai function. */
function fakeNet(opts: {
  transcribe?: () => Response | Promise<Response>;
  coach?: () => Response | Promise<Response>;
} = {}) {
  const calls: Calls = { transcribe: 0, coach: [] };
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/transcribe')) {
      calls.transcribe++;
      return opts.transcribe ? opts.transcribe() : json(HEARD);
    }
    calls.coach.push(JSON.parse(String(init?.body ?? '{}')));
    return opts.coach ? opts.coach() : json({ ok: true, data: FEEDBACK, provider: 'anthropic' });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

/** A fake microphone that records a few readings and a tiny blob. */
function fakeCapture(db0 = -30): StartCapture {
  return async () => ({
    async stop() {
      const samples = Array.from({ length: 40 }, (_, i) => ({ db: db0, atMs: i * 16 }));
      return { blob: new Blob(['audio'], { type: 'audio/webm' }), samples, durationSec: 6 };
    },
    cancel() {},
  });
}

async function setBaseline(baselineDb: number) {
  await db.profile.put({
    id: 'me',
    createdAt: 1,
    userId: null,
    baselineDb,
    calibrationSamples: 7,
  } as never);
}

beforeEach(async () => {
  await Promise.all([
    db.chats.clear(),
    db.storyBank.clear(),
    db.weakSpots.clear(),
    db.meta.clear(),
    db.profile.clear(),
  ]);
});

function mount(opts: Parameters<typeof useEveningChat>[0]) {
  return renderHook(() => useEveningChat({ day: DAY, ...opts }));
}

async function record(r: ReturnType<typeof mount>) {
  await act(async () => {
    await r.result.current.start();
  });
  await act(async () => {
    await r.result.current.stop();
  });
}

describe('the pure parts', () => {
  it('gives three questions, the first one asking for a moment from the day', () => {
    const q = questionsFor(DAY);
    expect(q).toHaveLength(CHAT_QUESTION_COUNT);
    expect(q[0]).toBe(MOMENT_QUESTION);
    expect(new Set(q).size).toBe(3);
  });

  it('measures pace from the word times, never an estimate', () => {
    expect(wpmFromWords(wordsFor(sentence))).toBe(Math.round((17 / (16 * 0.33 + 0.3)) * 60));
    expect(wpmFromWords(wordsFor('too few words here'))).toBeUndefined();
    expect(wpmFromWords(wordsFor('one two three four five six', 0.1))).toBeUndefined();
  });

  it('compares loudness with his own normal, and says nothing without a baseline', () => {
    const s = (db0: number) => Array.from({ length: 20 }, () => ({ db: db0 }));
    expect(loudnessVsNormal(s(-30), -30)).toBe('normal');
    expect(loudnessVsNormal(s(-24), -30)).toBe('above');
    expect(loudnessVsNormal(s(-36), -30)).toBe('below');
    expect(loudnessVsNormal(s(-30), undefined)).toBeUndefined();
    expect(loudnessVsNormal(s(-70), -30)).toBeUndefined(); // silence only
  });

  it('discards feedback that quotes words he did not say', () => {
    const guards = { hasWpm: false, hasLoudness: false };
    expect(validateFeedback(FEEDBACK, sentence, guards)).not.toBeNull();
    expect(
      validateFeedback({ ...FEEDBACK, good: 'You said "synergy" well.' }, sentence, guards),
    ).toBeNull();
  });

  it('discards feedback about pace or loudness when no number was measured', () => {
    const off = { hasWpm: false, hasLoudness: false };
    const on = { hasWpm: true, hasLoudness: true };
    const fast = { ...FEEDBACK, fixes: [{ text: 'You spoke too fast.' }] };
    expect(validateFeedback(fast, sentence, off)).toBeNull();
    expect(validateFeedback(fast, sentence, on)).not.toBeNull();
    const loud = { ...FEEDBACK, fixes: [{ text: 'Project more.' }] };
    expect(validateFeedback(loud, sentence, off)).toBeNull();
  });

  it('keeps at most two fixes, and drops a slip that is not in his words', () => {
    const many = {
      ...FEEDBACK,
      fixes: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      slip: { wrong: 'discuss about it', right: 'discuss it' },
    };
    const clean = validateFeedback(many, sentence, { hasWpm: false, hasLoudness: false });
    expect(clean?.fixes).toHaveLength(2);
    expect(clean?.slip).toBeNull();
    const real = validateFeedback(
      { ...FEEDBACK, slip: { wrong: 'worked on the pricing page', right: 'worked on the pricing page!' } },
      sentence,
      { hasWpm: false, hasLoudness: false },
    );
    expect(real?.slip?.wrong).toBe('worked on the pricing page');
  });

  it('rejects broken feedback shapes', () => {
    const g = { hasWpm: false, hasLoudness: false };
    expect(validateFeedback(null, sentence, g)).toBeNull();
    expect(validateFeedback({ good: 'x' }, sentence, g)).toBeNull();
    expect(validateFeedback({ good: '', better: 'x', fixes: [] }, sentence, g)).toBeNull();
  });

  it('never uses the phone speech recogniser', () => {
    expect(source).not.toMatch(/SpeechRecognition/i);
  });
});

describe('transcribeAudio — every failure is one plain line', () => {
  const blob = new Blob(['x'], { type: 'audio/webm' });
  const codeOf = async (fetchFn: typeof fetch) =>
    transcribeAudio(blob, fetchFn).then(
      () => 'ok',
      (e) => (e instanceof ChatError ? e.code : 'other'),
    );

  it('reads a bare result and an { ok, data } wrapper', async () => {
    expect((await transcribeAudio(blob, (async () => json(HEARD)) as never)).text).toBe(sentence);
    expect(
      (await transcribeAudio(blob, (async () => json({ ok: true, data: HEARD })) as never)).words,
    ).toHaveLength(HEARD.words.length);
  });

  it('upload fails (network down, or too big)', async () => {
    expect(await codeOf((async () => { throw new TypeError('offline'); }) as never)).toBe('upload');
    expect(await codeOf((async () => json({}, 413)) as never)).toBe('upload');
  });

  it('transcribe fails (server error, junk, no words)', async () => {
    expect(await codeOf((async () => json({ error: 'x' }, 500)) as never)).toBe('transcribe');
    expect(await codeOf((async () => new Response('<html>', { status: 200 })) as never)).toBe('transcribe');
    expect(await codeOf((async () => json({ nope: 1 })) as never)).toBe('transcribe');
    expect(await codeOf((async () => json({ text: '  ', words: [], durationSec: 1 })) as never)).toBe('empty');
  });
});

describe('the real recorder', () => {
  it('says "no microphone" instead of throwing when capture is blocked', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) },
    });
    expect(await startMicCapture(() => {})).toBeNull();
    vi.stubGlobal('navigator', { onLine: true });
    expect(await startMicCapture(() => {})).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('useEveningChat', () => {
  it('records, uploads, measures and coaches one answer', async () => {
    await setBaseline(-30);
    const net = fakeNet();
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(-30), online: true });
    expect(r.result.current.phase).toBe('ask');
    expect(r.result.current.question).toBe(MOMENT_QUESTION);

    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));

    const turn = r.result.current.turn!;
    expect(turn.transcript).toBe(sentence);
    expect(turn.wpm).toBeGreaterThan(100);
    expect(turn.loudness).toBe('normal');
    expect(turn.feedback?.better).toContain('pricing page');
    expect(r.result.current.line).toBeNull();

    expect(net.calls.transcribe).toBe(1);
    const sent = net.calls.coach[0] as { task: string; prefer: string; payload: Record<string, unknown> };
    expect(sent.task).toBe('coach_chat');
    expect(sent.prefer).toBe('anthropic');
    expect(sent.payload.transcript).toBe(sentence);
    expect(sent.payload.wpm).toBe(turn.wpm);
    expect(sent.payload.loudness).toBe('normal');
    expect(await aiCallsUsed()).toBe(1);
    // Kept on the phone after the answer.
    expect((await db.chats.toArray())[0]!.turns).toHaveLength(1);
  });

  it('sends no pace or loudness when they could not be measured', async () => {
    const net = fakeNet({ transcribe: () => json({ text: 'Hello there my friend', words: [], durationSec: 2 }) });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    const payload = (net.calls.coach[0] as { payload: Record<string, unknown> }).payload;
    expect('wpm' in payload).toBe(false);
    expect('loudness' in payload).toBe(false);
    expect(r.result.current.turn?.wpm).toBeUndefined();
  });

  it('mic denied: one plain line, then he can type his answer', async () => {
    const net = fakeNet();
    const denied: StartCapture = async () => null;
    const r = mount({ fetchFn: net.fetchFn, startCapture: denied, online: true });
    await act(async () => { await r.result.current.start(); });
    expect(r.result.current.phase).toBe('typing');
    expect(r.result.current.failure).toBe('mic');
    expect(r.result.current.line).toBe(CHAT_LINES.mic);

    act(() => r.result.current.setTyped('I fixed the pricing page with the designer'));
    await act(async () => { await r.result.current.submitTyped(); });
    expect(r.result.current.phase).toBe('review');
    expect(r.result.current.turn?.transcript).toBe('I fixed the pricing page with the designer');
    expect(r.result.current.turn?.wpm).toBeUndefined();
    expect(r.result.current.turn?.feedback).toBeTruthy();
    expect(r.result.current.line).toBeNull();
  });

  it('a capture that throws counts as mic denied', async () => {
    const boom: StartCapture = async () => { throw new Error('boom'); };
    const r = mount({ fetchFn: fakeNet().fetchFn, startCapture: boom, online: true });
    await act(async () => { await r.result.current.start(); });
    expect(r.result.current.failure).toBe('mic');
  });

  it('upload fails: one line, type instead or skip', async () => {
    const net = fakeNet({ transcribe: () => { throw new TypeError('network'); } });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.failure).toBe('upload'));
    expect(r.result.current.phase).toBe('typing');
    expect(r.result.current.line).toBe(CHAT_LINES.upload);
    expect(net.calls.coach).toHaveLength(0);
    expect(await aiCallsUsed()).toBe(0);
    act(() => r.result.current.skip());
    expect(r.result.current.index).toBe(1);
    expect(r.result.current.phase).toBe('ask');
    expect(r.result.current.line).toBeNull();
  });

  it('transcribe fails: one line, typing works', async () => {
    const net = fakeNet({ transcribe: () => json({ error: 'bad' }, 500) });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.failure).toBe('transcribe'));
    expect(r.result.current.phase).toBe('typing');
  });

  it('empty recording: says so and lets him say it again', async () => {
    const net = fakeNet({ transcribe: () => json({ text: '', words: [], durationSec: 1 }) });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.failure).toBe('empty'));
    expect(r.result.current.phase).toBe('typing');
  });

  it('coach fails: the answer is kept, the budget is given back, retry works', async () => {
    let fail = true;
    const net = fakeNet({
      coach: () => (fail ? json({ ok: false }, 502) : json({ ok: true, data: FEEDBACK, provider: 'anthropic' })),
    });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    expect(r.result.current.failure).toBe('coach');
    expect(r.result.current.line).toBe(CHAT_LINES.coach);
    expect(r.result.current.turn?.transcript).toBe(sentence);
    expect(r.result.current.turn?.feedback).toBeUndefined();
    expect(await aiCallsUsed()).toBe(0);

    fail = false;
    await act(async () => { await r.result.current.retryCoach(); });
    expect(r.result.current.line).toBeNull();
    expect(r.result.current.turn?.feedback?.good).toBeTruthy();
  });

  it('a coach answer that fails the checks is left out, with one line', async () => {
    const net = fakeNet({
      coach: () => json({ ok: true, data: { ...FEEDBACK, good: 'Nice "synergy"!' }, provider: 'anthropic' }),
    });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    expect(r.result.current.failure).toBe('bad_coach');
    expect(r.result.current.turn?.feedback).toBeUndefined();
  });

  it('offline: one line before anything is sent, typing and skipping still work', async () => {
    const net = fakeNet();
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: false });
    await act(async () => { await r.result.current.start(); });
    expect(r.result.current.failure).toBe('offline');
    expect(r.result.current.phase).toBe('typing');
    expect(net.fetchFn).not.toHaveBeenCalled();

    act(() => r.result.current.setTyped('I fixed the pricing page'));
    await act(async () => { await r.result.current.submitTyped(); });
    // Saved without coaching; the plain line is the offline one.
    expect(r.result.current.phase).toBe('review');
    expect(r.result.current.failure).toBe('offline');
    expect(r.result.current.turn?.transcript).toBe('I fixed the pricing page');
    expect(net.fetchFn).not.toHaveBeenCalled();
  });

  it('budget used up: one line, typed answer is kept without coaching', async () => {
    await setMeta(AI_BUDGET_META, { date: todayKey(), count: 25 });
    const net = fakeNet();
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await act(async () => { await r.result.current.start(); });
    expect(r.result.current.failure).toBe('budget');
    expect(r.result.current.line).toBe(CHAT_LINES.budget);
    expect(r.result.current.phase).toBe('typing');

    act(() => r.result.current.setTyped('I fixed the pricing page'));
    await act(async () => { await r.result.current.submitTyped(); });
    expect(r.result.current.phase).toBe('review');
    expect(r.result.current.failure).toBe('budget');
    expect(net.fetchFn).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(25);
  });

  it('Say it again records a new answer for the same question', async () => {
    const net = fakeNet();
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    await act(async () => { await r.result.current.sayAgain(); });
    expect(r.result.current.phase).toBe('recording');
    await act(async () => { await r.result.current.stop(); });
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    expect(r.result.current.index).toBe(0);
    expect(r.result.current.turns).toHaveLength(1);
  });

  it('three questions, then the best moment goes to the story bank and the slip to weak spots', async () => {
    const withSlip = {
      ...FEEDBACK,
      slip: { wrong: 'worked on the pricing page', right: 'worked on the pricing page!' },
    };
    const net = fakeNet({ coach: () => json({ ok: true, data: withSlip, provider: 'anthropic' }) });
    const r = mount({ fetchFn: net.fetchFn, startCapture: fakeCapture(), online: true });

    for (let i = 0; i < CHAT_QUESTION_COUNT; i++) {
      expect(r.result.current.index).toBe(i);
      await record(r);
      await waitFor(() => expect(r.result.current.phase).toBe('review'));
      act(() => r.result.current.next());
    }
    await waitFor(() => expect(r.result.current.phase).toBe('done'));
    await waitFor(() => expect(r.result.current.saved).not.toBeNull());

    expect(r.result.current.turns).toHaveLength(3);
    expect((await db.chats.toArray())[0]!.turns).toHaveLength(3);
    const bank = await db.storyBank.toArray();
    expect(bank).toHaveLength(1);
    expect(bank[0]!.day).toBe(DAY);
    expect(bank[0]!.text).toBe(sentence);
    const spots = await db.weakSpots.toArray();
    expect(spots).toHaveLength(1);
    expect(spots[0]!.source).toBe('chat');
  });

  it('skipping every question ends cleanly with nothing stored', async () => {
    const r = mount({ fetchFn: fakeNet().fetchFn, startCapture: fakeCapture(), online: true });
    for (let i = 0; i < CHAT_QUESTION_COUNT; i++) act(() => r.result.current.skip());
    expect(r.result.current.phase).toBe('done');
    await waitFor(() => expect(r.result.current.saved).toBeNull());
    expect(await db.chats.count()).toBe(0);
    expect(await db.storyBank.count()).toBe(0);
  });

  it('a failed save to the phone never crashes the chat', async () => {
    const put = vi.spyOn(db.chats, 'put').mockRejectedValue(new Error('disk full'));
    const r = mount({ fetchFn: fakeNet().fetchFn, startCapture: fakeCapture(), online: true });
    await record(r);
    await waitFor(() => expect(r.result.current.phase).toBe('review'));
    expect(r.result.current.turn?.feedback).toBeTruthy();
    put.mockRestore();
  });
});
