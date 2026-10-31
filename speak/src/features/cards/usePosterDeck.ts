import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnyCard } from '../../types/contract';
import { slidesFor, type Slide } from './slides';

const isGame = (slide: Slide | undefined) => slide?.kind === 'pick' || slide?.kind === 'tapword';

/** Where he is inside one card's slides. A game holds the tap until it is played. */
export function usePosterDeck(card: AnyCard | undefined) {
  const slides = useMemo(() => (card ? slidesFor(card) : []), [card]);
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    setIndex(0);
    setSolved(false);
  }, [card?.id]);

  const go = useCallback((next: number) => {
    setIndex(next);
    setSolved(false);
  }, []);

  const slide = slides[index];
  return {
    slides,
    slide,
    index,
    atStart: index === 0,
    atEnd: index >= slides.length - 1,
    /** True while an unplayed game is on screen: taps do nothing. */
    locked: isGame(slide) && !solved,
    next: useCallback(() => go(Math.min(index + 1, Math.max(0, slides.length - 1))), [go, index, slides.length]),
    back: useCallback(() => go(Math.max(0, index - 1)), [go, index]),
    markSolved: useCallback(() => setSolved(true), []),
  };
}

/** Left third of the card goes back, like a story. */
export function isBackTap(clientX: number, rect: { left: number; width: number }): boolean {
  return rect.width > 0 && clientX - rect.left < rect.width * 0.3;
}
