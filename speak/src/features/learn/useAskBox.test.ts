import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { AI_DAILY_CAP, aiCallsUsed, tryConsumeAiCalls } from '../auto/budget';
import { askLearnedLines } from './askLearned';
import { ASK_BUSY_LINE, ASK_NO_KEY_LINE, ASK_OFFLINE_LINE, useAskBox } from './useAskBox';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const GOOD = {
  ok: true,
  task: 'tell_app',
  provider: 'groq',
  data: { reply: 'Done. More about money.', learned: [{ kind: 'more', theme: 'Money' }] },
};

let fetchMock: ReturnType<typeof vi.fn>;

function sentBody(call: number) {
  return JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string);
}

beforeEach(async () => {
  await Promise.all([db.meta.clear(), db.profile.clear(), db.outbox.clear()]);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useAskBox', () => {
  it('sends one tell_app call, saves the turn and what it learned, and takes one slot', async () => {
    fetchMock.mockResolvedValueOnce(reply(GOOD));
    const { result } = renderHook(() => useAskBox());

    await act(async () => {
      await result.current.send('  more about money  ');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBody(0);
    expect(body.task).toBe('tell_app');
    expect(body.payload.text).toBe('more about money');
    expect(body.payload.themes).toContain('Money');
    expect(body.payload.recent).toEqual([]);

    expect(result.current.error).toBeNull();
    expect(result.current.sending).toBe(false);
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    expect(result.current.turns[0]!.said).toBe('more about money');
    expect(result.current.turns[0]!.reply).toBe('Done. More about money.');
    expect(result.current.turns[0]!.learned[0]!.text).toBe('More cards about Money.');
    expect((await askLearnedLines()).map((l) => l.text)).toEqual(['More cards about Money.']);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('ignores an empty message and sends nothing', async () => {
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('   ');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await aiCallsUsed()).toBe(0);
  });

  it('offline: plain line, nothing saved, the slot is given back', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('hello');
    });
    expect(result.current.error).toBe(ASK_OFFLINE_LINE);
    expect(result.current.turns).toEqual([]);
    expect(await aiCallsUsed()).toBe(0);
  });

  it('no key: plain line and the slot is given back', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: false, task: 'tell_app', reason: 'no_key', error: 'x' }, 503));
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('hello');
    });
    expect(result.current.error).toBe(ASK_NO_KEY_LINE);
    expect(await aiCallsUsed()).toBe(0);
  });

  it('busy server: the busy line, and the slot stays used (a model was reached)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: false, task: 'tell_app', reason: 'busy' }, 503));
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('hello');
    });
    expect(result.current.error).toBe(ASK_BUSY_LINE);
    expect(await aiCallsUsed()).toBe(1);
  });

  it('over budget: the busy line and no call is made', async () => {
    await tryConsumeAiCalls(AI_DAILY_CAP);
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('hello');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe(ASK_BUSY_LINE);
    expect(await aiCallsUsed()).toBe(AI_DAILY_CAP);
  });

  it('a good send clears an old error line, and the next call carries the recent turns', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(reply(GOOD));
    fetchMock.mockResolvedValueOnce(reply({ ...GOOD, data: { reply: 'Ok.', learned: [] } }));
    const { result } = renderHook(() => useAskBox());
    await act(async () => {
      await result.current.send('one');
    });
    expect(result.current.error).toBe(ASK_OFFLINE_LINE);
    await act(async () => {
      await result.current.send('two');
    });
    expect(result.current.error).toBeNull();
    await act(async () => {
      await result.current.send('three');
    });
    expect(sentBody(2).payload.recent).toEqual([{ said: 'two', reply: 'Done. More about money.' }]);
  });
});
