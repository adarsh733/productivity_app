import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Card, TeachDraft } from '../../types/contract';
import { db } from '../../db/db';
import { useAsk } from './useAsk';
import { ASK_LINES, ASK_MAX_CHARS, ASK_NEED_LETTER } from './askPipeline';

const base = { lang: 'en' as const, tags: [], source: 'seed' as const, status: 'active' as const, createdAt: 0 };

const LIB = {
  ...base,
  id: 'lib-1',
  type: 'word',
  term: 'ubiquitous',
  pos: 'adj.',
  meaning: 'found everywhere',
  examples: ['a', 'b'],
  say: '',
} as Card;

function draft(kind: TeachDraft['kind'], title: string): TeachDraft {
  return {
    type: 'teach',
    track: 'words',
    level: 1,
    kind,
    category: 'c',
    title,
    rule: 'A rule.',
    examples: { work: 'At work.', everyday: 'At home.' },
    analogy: 'Like this.',
    tryPrompt: 'Try it.',
    register: 'both',
  } as TeachDraft;
}

function okJson(data: unknown, provider: string): Response {
  return { ok: true, json: async () => ({ ok: true, task: 'x', provider, data }) } as unknown as Response;
}

function goodFetch() {
  return vi.fn(async (_u: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { task: string; payload: { items?: Array<{ key: string }> } };
    if (body.task === 'answer_ask') {
      return okJson(
        { askKind: 'word', answer: 'It means found everywhere.', cards: [draft('learn', 'Ubiquitous at work'), draft('try', 'Use ubiquitous')] },
        'gemini',
      );
    }
    return okJson({ results: (body.payload.items ?? []).map((i) => ({ key: i.key, ok: true, reason: 'real' })) }, 'groq');
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.reviews.clear(),
    db.asks.clear(),
    db.weakSpots.clear(),
    db.meta.clear(),
    db.outbox.clear(),
  ]);
  await db.cards.put(LIB);
});

describe('useAsk', () => {
  it('searches the library as he types, with no network', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAsk({ fetchFn }));
    await waitFor(() => expect(result.current.library).toEqual([]));

    act(() => result.current.setText('ubiq'));
    await waitFor(() => expect(result.current.library.map((h) => h.card.id)).toEqual(['lib-1']));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.canSend).toBe(true);
  });

  it('needs two characters before it will send', () => {
    const { result } = renderHook(() => useAsk({ fetchFn: goodFetch() }));
    act(() => result.current.setText('u'));
    expect(result.current.canSend).toBe(false);
  });

  it('send → answer, checked cards, then Add to my feed stores them', async () => {
    const { result } = renderHook(() => useAsk({ fetchFn: goodFetch() }));
    await waitFor(() => expect(result.current.library).toEqual([]));
    act(() => result.current.setText('ubiquitous'));
    await waitFor(() => expect(result.current.library).toHaveLength(1));

    await act(async () => {
      await result.current.send();
    });
    expect(result.current.phase).toBe('done');
    expect(result.current.view?.answer).toBe('It means found everywhere.');
    expect(result.current.view?.fresh).toHaveLength(2);
    expect(await db.asks.count()).toBe(1);

    await act(async () => {
      await result.current.addToFeed();
    });
    expect(result.current.added).toBe(2);
    const stored = await db.cards.where('source').equals('ai').toArray();
    expect(stored).toHaveLength(2);
    expect(stored.every((c) => c.tags.includes('ask'))).toBe(true);
  });

  it('offline: one plain line, library still there, nothing stored', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAsk({ fetchFn, online: false }));
    await waitFor(() => expect(result.current.library).toEqual([]));
    act(() => result.current.setText('ubiquitous'));
    await waitFor(() => expect(result.current.library).toHaveLength(1));

    await act(async () => {
      await result.current.send();
    });
    expect(result.current.view?.line).toBe(ASK_LINES.offline);
    expect(result.current.view?.library.map((h) => h.card.id)).toEqual(['lib-1']);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await db.asks.count()).toBe(0);
  });

  it('changing the text clears the old answer', async () => {
    const { result } = renderHook(() => useAsk({ fetchFn: goodFetch() }));
    await waitFor(() => expect(result.current.library).toEqual([]));
    act(() => result.current.setText('ubiquitous'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.view).not.toBeNull();
    act(() => result.current.setText('ubiquitous word'));
    expect(result.current.view).toBeNull();
    expect(result.current.phase).toBe('idle');
    expect(result.current.added).toBeNull();
  });

  it('lists his recent questions, newest first, at most 5', async () => {
    for (let i = 0; i < 7; i++) {
      await db.asks.put({ id: `r${i}`, createdAt: 100 + i, text: `q${i}`, askKind: 'word', answer: 'a', cardIds: [], addedToFeed: false });
    }
    const { result } = renderHook(() => useAsk({ fetchFn: goodFetch() }));
    await waitFor(() => expect(result.current.recent).toHaveLength(5));
    expect(result.current.recent!.map((a) => a.text)).toEqual(['q6', 'q5', 'q4', 'q3', 'q2']);
  });
});

describe('useAsk: guards', () => {
  it('emoji only: cannot send, and says "Type a word or a question"', () => {
    const fetchFn = goodFetch();
    const { result } = renderHook(() => useAsk({ fetchFn }));
    act(() => result.current.setText('🙂🙂🙂'));
    expect(result.current.canSend).toBe(false);
    expect(result.current.hint).toBe(ASK_NEED_LETTER);
    act(() => result.current.setText('क्या'));
    expect(result.current.canSend).toBe(true);
    expect(result.current.hint).toBeNull();
  });

  it('clips the question to 1000 characters', () => {
    const { result } = renderHook(() => useAsk({ fetchFn: goodFetch() }));
    act(() => result.current.setText('a'.repeat(1500)));
    expect(result.current.text).toHaveLength(ASK_MAX_CHARS);
    expect(result.current.maxChars).toBe(ASK_MAX_CHARS);
  });

  it('editing while an Ask is in flight cannot fire a second Ask, and the first answer is still saved', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const inner = goodFetch();
    const fetchFn = vi.fn(async (u: string, init: RequestInit) => {
      await gate;
      return (inner as unknown as (u: string, i: RequestInit) => Promise<Response>)(u, init);
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAsk({ fetchFn }));
    await waitFor(() => expect(result.current.library).toEqual([]));
    act(() => result.current.setText('ubiquitous'));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.send();
    });
    expect(result.current.phase).toBe('asking');

    act(() => result.current.setText('ubiquitous, and also something else'));
    expect(result.current.phase).toBe('asking');
    expect(result.current.canSend).toBe(false);
    await act(async () => {
      await result.current.send();
    });

    release();
    await act(async () => {
      await first;
    });
    const answerCalls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (c) => (JSON.parse((c[1] as RequestInit).body as string) as { task: string }).task === 'answer_ask',
    );
    expect(answerCalls).toHaveLength(1);
    expect(await db.asks.count()).toBe(1);
    expect(result.current.phase).toBe('done');
    expect(result.current.view?.text).toBe('ubiquitous');
    expect(result.current.text).toBe('ubiquitous, and also something else');
  });

  it('marks the weak spot as saved only when it was stored, and "duplicate" when already there', async () => {
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string; payload: { items?: Array<{ key: string }> } };
      if (body.task === 'answer_ask') {
        return okJson(
          { askKind: 'mistake', answer: 'Say discuss.', weakSpot: { wrong: 'discuss about', right: 'discuss' }, cards: [] },
          'gemini',
        );
      }
      return okJson({ results: (body.payload.items ?? []).map((i) => ({ key: i.key, ok: true, reason: '' })) }, 'groq');
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAsk({ fetchFn }));
    act(() => result.current.setText('discuss about'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.view?.weakSpotSaved).toBe('saved');
    act(() => result.current.setText('discuss about it'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.view?.weakSpotSaved).toBe('duplicate');
    expect(await db.weakSpots.count()).toBe(1);
  });

  it('retryCheck re-runs the check and the cards appear', async () => {
    let up = false;
    const inner = goodFetch() as unknown as (u: string, i: RequestInit) => Promise<Response>;
    const fetchFn = vi.fn(async (u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { task: string };
      if (body.task === 'verify_batch' && !up) {
        return { ok: false, status: 503, json: async () => ({ ok: false, error: 'x', reason: 'busy' }) } as unknown as Response;
      }
      return inner(u, init);
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAsk({ fetchFn }));
    act(() => result.current.setText('ubiquitous'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.view?.answer).toBe('It means found everywhere.');
    expect(result.current.view?.fresh).toHaveLength(0);
    expect(result.current.view?.canRetryCheck).toBe(true);

    up = true;
    await act(async () => {
      await result.current.retryCheck();
    });
    expect(result.current.view?.fresh).toHaveLength(2);
    expect(result.current.view?.canRetryCheck).toBe(false);
    expect(result.current.checking).toBe(false);
  });
});
