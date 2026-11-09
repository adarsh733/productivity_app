import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import type { CardFeedback, ModuleCard, ModuleId } from '../../types/contract';
import { gotItLine, learnedLines, newReasons } from './cardFeedback';
import { useCardFeedback } from './useCardFeedback';

const recheck = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../auto/moduleBatch', async (orig) => ({
  ...(await orig<typeof import('../auto/moduleBatch')>()),
  recheckBatch: recheck,
}));

describe('gotItLine', () => {
  it('returns the exact brief exemplar: Too easy on Words', () => {
    const line = gotItLine('words', { reasons: ['too_easy'] });
    expect(line).toBe('Got it: Words will get harder from the next batch.');
  });

  it('formats too_easy correctly across each module using its label', () => {
    const cases: Array<[ModuleId, string]> = [
      ['words', 'Words'],
      ['smalltalk', 'Small talk'],
      ['better', 'Say it better'],
      ['phrases', 'Office phrases'],
      ['stories', 'Stories'],
    ];

    for (const [mod, label] of cases) {
      expect(gotItLine(mod, { reasons: ['too_easy'] })).toBe(
        `Got it: ${label} will get harder from the next batch.`,
      );
    }
  });

  it('handles too_hard', () => {
    expect(gotItLine('words', { reasons: ['too_hard'] })).toBe(
      'Got it: Words will get easier from the next batch.',
    );
  });

  it('handles confusing', () => {
    expect(gotItLine('smalltalk', { reasons: ['confusing'] })).toBe(
      "Got it: We'll use simpler examples for Small talk from the next batch.",
    );
  });

  it('handles wrong_english (takes top priority to remove the card)', () => {
    expect(gotItLine('phrases', { reasons: ['wrong_english', 'too_easy'] })).toBe(
      'Got it: Card removed and flagged for review.',
    );
  });

  it('handles loved', () => {
    expect(gotItLine('better', { reasons: ['loved'] })).toBe(
      'Got it: More like this in Say it better from the next batch.',
    );
  });

  it('handles comment without reasons', () => {
    expect(gotItLine('stories', { reasons: [], comment: 'More personal stories please' })).toBe(
      'Got it: Feedback noted for the next Stories batch.',
    );
  });

  it('handles thumb up alone', () => {
    expect(gotItLine('words', { thumb: 'up', reasons: [] })).toBe(
      'Got it: More like this in Words from the next batch.',
    );
  });

  it('handles thumb down alone', () => {
    expect(gotItLine('phrases', { thumb: 'down', reasons: [] })).toBe(
      'Got it: Fewer cards like this in Office phrases from the next batch.',
    );
  });

  it('falls back gracefully when nothing is provided', () => {
    expect(gotItLine('words', { reasons: [] })).toBe(
      'Got it: Feedback saved for the next Words batch.',
    );
  });
});

describe('learnedLines', () => {
  it('returns items sorted newest first, excluding hidden rows', () => {
    const rows: CardFeedback[] = [
      {
        id: 'fb-1',
        cardId: 'c1',
        module: 'words',
        reply: 'Got it: Words will get harder from the next batch.',
        reasons: ['too_easy'],
        at: 100,
      },
      {
        id: 'fb-2',
        cardId: 'c2',
        module: 'smalltalk',
        reply: "Got it: We'll use simpler examples for Small talk from the next batch.",
        reasons: ['confusing'],
        at: 300,
      },
      {
        id: 'fb-3',
        cardId: 'c3',
        module: 'better',
        reply: 'Hidden reply',
        reasons: ['loved'],
        at: 200,
        hidden: true,
      },
    ];

    const lines = learnedLines(rows);
    expect(lines).toEqual([
      {
        id: 'fb-2',
        text: "Got it: We'll use simpler examples for Small talk from the next batch.",
      },
      {
        id: 'fb-1',
        text: 'Got it: Words will get harder from the next batch.',
      },
    ]);
  });

  it('falls back to comment if reply is empty, and skips empty rows', () => {
    const rows: CardFeedback[] = [
      {
        id: 'fb-1',
        cardId: 'c1',
        module: 'words',
        reply: '',
        comment: 'Keep it concise',
        reasons: [],
        at: 50,
      },
      {
        id: 'fb-2',
        cardId: 'c2',
        module: 'stories',
        reply: '',
        comment: '',
        reasons: [],
        at: 60,
      },
    ];

    const lines = learnedLines(rows);
    expect(lines).toEqual([
      {
        id: 'fb-1',
        text: 'Keep it concise',
      },
    ]);
  });
});

describe('newReasons', () => {
  it('returns only reasons the earlier row did not have, once each', () => {
    expect(newReasons(undefined, ['too_easy', 'too_easy'])).toEqual(['too_easy']);
    expect(newReasons(['too_easy'], ['too_easy', 'wrong_english'])).toEqual(['wrong_english']);
    expect(newReasons(['loved'], [])).toEqual([]);
  });
});

describe('useCardFeedback.send (v7 batches)', () => {
  const card = (over: Record<string, unknown> = {}) =>
    ({ id: 'v7-ai-words-0001', type: 'module', module: 'words', batchId: 'batch-words-1', ...over }) as unknown as ModuleCard;

  beforeEach(async () => {
    recheck.mockClear();
    await db.feedback.clear();
    await db.profile.clear();
    await db.outbox.clear();
  });

  it('Too easy / Too hard move the module level once per tap and queue the profile', async () => {
    const { result } = renderHook(() => useCardFeedback(card()));
    await act(async () => {
      await result.current.send({ reasons: ['too_easy'] });
    });
    expect((await db.profile.get('me'))!.moduleLevels).toEqual({ words: 3 });
    // sending the same sheet again does not move it twice
    await act(async () => {
      await result.current.send({ reasons: ['too_easy'], comment: 'still easy' });
    });
    expect((await db.profile.get('me'))!.moduleLevels).toEqual({ words: 3 });
    await act(async () => {
      await result.current.send({ reasons: ['too_easy', 'too_hard'] });
    });
    expect((await db.profile.get('me'))!.moduleLevels).toEqual({ words: 2 });
    expect((await db.outbox.toArray()).filter((o) => o.table === 'profile').length).toBeGreaterThan(0);
  });

  it('Wrong English on a batch card rechecks its batch once; a library card does not', async () => {
    const { result } = renderHook(() => useCardFeedback(card()));
    await act(async () => {
      await result.current.send({ reasons: ['wrong_english'] });
      await result.current.send({ reasons: ['wrong_english'], comment: 'again' });
    });
    expect(recheck).toHaveBeenCalledTimes(1);

    const lib = renderHook(() => useCardFeedback(card({ id: 'v7-words-01', batchId: undefined })));
    await act(async () => {
      await lib.result.current.send({ reasons: ['wrong_english'] });
    });
    expect(recheck).toHaveBeenCalledTimes(1);
  });
});
