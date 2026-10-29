import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EveningChat, { lessonLabel } from './EveningChat';
import MeScreen from '../me/MeScreen';
import { db, setMeta } from '../../db/db';
import { todayKey } from '../../lib/date';
import { AI_BUDGET_META } from '../../features/auto/budget';
import {
  CHAT_LINES,
  MOMENT_QUESTION,
  type StartCapture,
} from '../../features/chat/useEveningChat';

const sentence =
  'It was good I had meetings and then I worked on the pricing page and then the designer gave feedback';

const HEARD = {
  text: sentence,
  words: sentence.split(' ').map((word, i) => ({ word, start: i * 0.33, end: i * 0.33 + 0.3 })),
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

function fakeNet(opts: {
  transcribe?: () => Response | Promise<Response>;
  coach?: () => Response | Promise<Response>;
} = {}) {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('/transcribe')) return opts.transcribe ? opts.transcribe() : json(HEARD);
    return opts.coach ? opts.coach() : json({ ok: true, data: FEEDBACK, provider: 'anthropic' });
  }) as unknown as typeof fetch;
}

const goodMic: StartCapture = async () => ({
  async stop() {
    const samples = Array.from({ length: 40 }, (_, i) => ({ db: -30, atMs: i * 16 }));
    return { blob: new Blob(['a'], { type: 'audio/webm' }), samples, durationSec: 6 };
  },
  cancel() {},
});

const deniedMic: StartCapture = async () => null;

beforeEach(async () => {
  await Promise.all([
    db.chats.clear(),
    db.storyBank.clear(),
    db.weakSpots.clear(),
    db.meta.clear(),
    db.profile.clear(),
    db.days.clear(),
    db.reviews.clear(),
    db.bookmarks.clear(),
    db.lessonProgress.clear(),
    db.asks.clear(),
  ]);
});

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));

async function answerByVoice() {
  click(/Tap and answer/);
  await screen.findByText(/Listening/);
  click(/I'm done/);
  await screen.findByTestId('chat-better');
}

describe('EveningChat', () => {
  it('shows the first question, then the answer with tiles, good, fix and a better version', async () => {
    render(<EveningChat fetchFn={fakeNet()} startCapture={goodMic} online />);
    expect(screen.getByTestId('chat-question').textContent).toBe(MOMENT_QUESTION);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await answerByVoice();
    expect(screen.getByTestId('chat-answer').textContent).toContain('pricing page');
    expect(screen.getByTestId('tile-wpm').textContent).toMatch(/\d+ wpm/);
    // No baseline yet, so loudness says nothing rather than guessing.
    expect(screen.getByTestId('tile-loudness').textContent).toContain('—');
    expect(screen.getByTestId('chat-good').textContent).toContain('Good');
    expect(screen.getByTestId('chat-fix').textContent).toContain('Stories L1');
    expect(screen.getByTestId('chat-better').textContent).toContain('Try it like this');
    expect(screen.queryByTestId('chat-line')).toBeNull();
    expect(screen.getByRole('button', { name: /Say it again/ })).toBeInTheDocument();
  });

  it('walks three questions and saves the best moment to the story bank', async () => {
    const onClose = vi.fn();
    render(<EveningChat fetchFn={fakeNet()} startCapture={goodMic} online onClose={onClose} />);
    for (let i = 0; i < 3; i++) {
      await answerByVoice();
      click(i === 2 ? /Finish/ : /Next question/);
    }
    expect(await screen.findByTestId('chat-done')).toBeInTheDocument();
    expect((await screen.findByTestId('chat-saved')).textContent).toContain('pricing page');
    expect(await db.storyBank.count()).toBe(1);
    click(/Done/);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mic denied: one plain line, type instead, still coached', async () => {
    render(<EveningChat fetchFn={fakeNet()} startCapture={deniedMic} online />);
    click(/Tap and answer/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.mic);
    // No Record button: it cannot work. Typing and skipping can.
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I fixed the pricing page today' } });
    click(/Send/);
    expect(await screen.findByTestId('chat-better')).toBeInTheDocument();
    expect(screen.getByTestId('tile-wpm').textContent).toContain('—');
  });

  it('type instead works from the start without touching the microphone', async () => {
    const mic = vi.fn(goodMic);
    render(<EveningChat fetchFn={fakeNet()} startCapture={mic} online />);
    click(/Type instead/);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I fixed the pricing page today' } });
    click(/Send/);
    expect(await screen.findByTestId('chat-good')).toBeInTheDocument();
    expect(mic).not.toHaveBeenCalled();
  });

  it('upload fails: one plain line, and he can type or skip', async () => {
    const fetchFn = fakeNet({ transcribe: () => { throw new TypeError('network'); } });
    render(<EveningChat fetchFn={fetchFn} startCapture={goodMic} online />);
    click(/Tap and answer/);
    await screen.findByText(/Listening/);
    click(/I'm done/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.upload);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    click(/Skip/);
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('transcribe fails: one plain line, typing is offered', async () => {
    const fetchFn = fakeNet({ transcribe: () => json({ error: 'x' }, 500) });
    render(<EveningChat fetchFn={fetchFn} startCapture={goodMic} online />);
    click(/Tap and answer/);
    await screen.findByText(/Listening/);
    click(/I'm done/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.transcribe);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('coach fails: his answer stays on screen with one line and Try again', async () => {
    let broken = true;
    const fetchFn = fakeNet({
      coach: () => (broken ? json({ ok: false }, 500) : json({ ok: true, data: FEEDBACK, provider: 'anthropic' })),
    });
    render(<EveningChat fetchFn={fetchFn} startCapture={goodMic} online />);
    click(/Tap and answer/);
    await screen.findByText(/Listening/);
    click(/I'm done/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.coach);
    expect(screen.getByTestId('chat-answer').textContent).toContain('pricing page');
    expect(screen.queryByTestId('chat-good')).toBeNull();
    expect(screen.getByRole('button', { name: /Next question/ })).toBeInTheDocument();

    broken = false;
    click(/Try again/);
    expect(await screen.findByTestId('chat-good')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-line')).toBeNull();
  });

  it('offline: one plain line, no blank screen, typing and skipping work', async () => {
    const fetchFn = fakeNet();
    render(<EveningChat fetchFn={fetchFn} startCapture={goodMic} online={false} />);
    click(/Tap and answer/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.offline);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
    click(/Skip/);
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('budget used up: one plain line, he can still type his answer', async () => {
    await setMeta(AI_BUDGET_META, { date: todayKey(), count: 25 });
    const fetchFn = fakeNet();
    render(<EveningChat fetchFn={fetchFn} startCapture={goodMic} online />);
    click(/Tap and answer/);
    expect((await screen.findByTestId('chat-line')).textContent).toBe(CHAT_LINES.budget);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I fixed the pricing page today' } });
    click(/Send/);
    expect((await screen.findByRole('button', { name: /Next question/ }))).toBeInTheDocument();
    expect(screen.getByTestId('chat-answer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-line').textContent).toBe(CHAT_LINES.budget);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Say it again goes back to listening for the same question', async () => {
    render(<EveningChat fetchFn={fakeNet()} startCapture={goodMic} online />);
    await answerByVoice();
    click(/Say it again/);
    expect(await screen.findByText(/Listening/)).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('shows lesson ids as plain labels', () => {
    expect(lessonLabel('ls-clearly-2-3-1')).toBe('🎯 Speak clearly L2');
    expect(lessonLabel('The 1+1 answer')).toBe('The 1+1 answer');
  });
});

describe('Me: Evening chats and Story bank', () => {
  it('fills both rows from a finished chat, and lists them', async () => {
    render(<MeScreen chatProps={{ fetchFn: fakeNet(), startCapture: goodMic, online: true }} />);
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
    expect(screen.getByText('Empty for now')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Evening chats'));
    click(/Start tonight's chat/);
    for (let i = 0; i < 3; i++) {
      await answerByVoice();
      click(i === 2 ? /Finish/ : /Next question/);
    }
    await screen.findByTestId('chat-saved');
    click(/Done/);

    // Back on the chats list.
    await waitFor(() => expect(screen.getAllByTestId('chat-item')).toHaveLength(1));
    expect(screen.getByTestId('chat-item').textContent).toContain('3 answers');

    click(/Back to Me/);
    await waitFor(() => expect(screen.getByText(/1 chat · last/)).toBeInTheDocument());
    expect(screen.getByText('1 moment from your days')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Story bank'));
    await waitFor(() => expect(screen.getByTestId('story-item').textContent).toContain('pricing page'));
  });
});
