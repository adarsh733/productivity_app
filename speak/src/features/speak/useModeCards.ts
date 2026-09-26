import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Card, SituationKind } from '../../types/contract';
import { db } from '../../db/db';
import { getCoachWords, getTryWords } from '../coach/pipeline';

/**
 * Coach words for "Try to use" in speaking prompts (AG-007 stage 3).
 * Up to 2, newest first. Empty when he has told the coach no words yet.
 */
export function useTryWords(): string[] {
  const items =
    useLiveQuery(() => db.inbox.orderBy('createdAt').reverse().toArray(), [], []) ?? [];
  return getTryWords(getCoachWords(items));
}

/** Random-without-repeat from the database. Never crashes when content is missing. */
function useCardsOfType<T extends Card>(type: T['type']) {
  const [cards, setCards] = useState<T[]>([]);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    void db.cards
      .where('type')
      .equals(type)
      .and((c) => c.status === 'active')
      .toArray()
      .then((rows) => {
        if (dead) return;
        // Shuffle once per mount for random-without-repeat.
        const shuffled = [...(rows as T[])].sort(() => Math.random() - 0.5);
        setCards(shuffled);
        setIndex(0);
        setReady(true);
      })
      .catch(() => {
        if (!dead) setReady(true);
      });
    return () => {
      dead = true;
    };
  }, [type]);

  const current: T | null = cards.length > 0 ? (cards[index % cards.length] ?? null) : null;

  const next = useCallback(() => {
    setIndex((i) => (cards.length > 0 ? (i + 1) % cards.length : 0));
  }, [cards.length]);

  return { ready, cards, current, next, count: cards.length };
}

export function useSituationCards(kind: SituationKind | 'all' = 'all') {
  const base = useCardsOfType<Extract<Card, { type: 'situation' }>>('situation');
  const [kindFilter, setKindFilter] = useState<SituationKind | 'all'>(kind);
  useEffect(() => {
    setKindFilter(kind);
  }, [kind]);

  const filtered =
    kindFilter === 'all' ? base.cards : base.cards.filter((c) => c.kind === kindFilter);

  const [fi, setFi] = useState(0);
  useEffect(() => {
    setFi(0);
  }, [kindFilter, base.cards.length]);
  const item = filtered.length > 0 ? (filtered[fi % filtered.length] ?? null) : null;

  return {
    ready: base.ready,
    cards: filtered,
    current: item,
    next: () => setFi((i) => (filtered.length > 0 ? (i + 1) % filtered.length : 0)),
    count: filtered.length,
    kind: kindFilter,
    setKind: setKindFilter,
  };
}

export function useDescribeCards() {
  return useCardsOfType<Extract<Card, { type: 'describe' }>>('describe');
}

export function useStoryMoveCards() {
  return useCardsOfType<Extract<Card, { type: 'story_move' }>>('story_move');
}

export function useExplainCards() {
  return useCardsOfType<Extract<Card, { type: 'explain' }>>('explain');
}

export function useTeachBackCards() {
  return useCardsOfType<Extract<Card, { type: 'teach_back' }>>('teach_back');
}
