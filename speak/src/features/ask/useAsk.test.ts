import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Card, TeachDraft } from '../../types/contract';
import { db } from '../../db/db';
import { useAsk } from './useAsk';
import { ASK_LINES } from './askPipeline';

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
});
