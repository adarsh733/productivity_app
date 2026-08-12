import { useEffect, useRef, useState } from 'react';
import type { Grade } from '../../types/contract';

const CARDS_SEEN_KEY = 'speak.cardsSeen.v1';
const DISTANCE_THRESHOLD = 60; // px
const VELOCITY_THRESHOLD = 0.3; // px/ms
const LEFT_EDGE_GUARD = 40; // px

function getCardsSeenCount(): number {
  try {
    const val = localStorage.getItem(CARDS_SEEN_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function incrementCardsSeenCount(): number {
  const current = getCardsSeenCount();
  const updated = current + 1;
  try {
    localStorage.setItem(CARDS_SEEN_KEY, updated.toString());
  } catch {
    // ignore quota / restricted errors
  }
  return updated;
}

export function useCardGestures(
  cardId: string | undefined,
  onSubmitGrade: (grade: Grade) => void,
) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [leavingDirection, setLeavingDirection] = useState<'up' | 'left' | null>(null);
  const [cardsSeen, setCardsSeen] = useState<number>(getCardsSeenCount());

  const startPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const isBusy = useRef<boolean>(false);
  /** The scrollable card body this drag started inside, if any. */
  const scrollEl = useRef<HTMLElement | null>(null);
  /** Which card the "seen" counter has already been charged for. */
  const countedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
    setLeavingDirection(null);
    isBusy.current = false;
  }, [cardId]);

  // The hint retires after three cards have been SEEN, not after three swipes.
  // Counting swipes means someone who only taps the buttons keeps the hint
  // forever — which is the permanent-instruction defect it exists to remove.
  useEffect(() => {
    if (!cardId || countedFor.current === cardId) return;
    countedFor.current = cardId;
    setCardsSeen(incrementCardsSeenCount());
  }, [cardId]);

  /**
   * A vertical swipe may only be claimed when the card body is not scrollable,
   * or has already been read to the bottom. Otherwise scrolling down a long
   * word card silently grades it `good` and advances — the reader loses the
   * card they were in the middle of reading.
   */
  const verticalAllowed = () => {
    const el = scrollEl.current;
    if (!el) return true;
    if (el.scrollHeight - el.clientHeight <= 4) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  };

  const triggerGrade = (grade: Grade, direction: 'up' | 'left') => {
    if (isBusy.current) return;
    isBusy.current = true;
    setLeavingDirection(direction);
    onSubmitGrade(grade);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (isBusy.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const target = e.target as HTMLElement | null;
    scrollEl.current = target?.closest?.('.card-body') as HTMLElement | null;
    startPos.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startPos.current || isBusy.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;

    // Left edge guard for swipe-left (prevent back gesture conflict)
    const isLeftSwipeAllowed = startPos.current.x >= LEFT_EDGE_GUARD;

    // Apply 0.4 damping factor during drag
    let dampedX = 0;
    let dampedY = 0;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominant
      if (dx < 0 && isLeftSwipeAllowed) {
        dampedX = dx * 0.4;
      }
    } else {
      // Vertical dominant — leave it to the scroller if the body still has
      // unread content below.
      if (dy < 0 && verticalAllowed()) {
        dampedY = dy * 0.4;
      }
    }

    setDragOffset({ x: dampedX, y: dampedY });
  };

  const onTouchEnd = () => {
    if (!startPos.current || isBusy.current) return;
    const start = startPos.current;
    startPos.current = null;

    const dt = Math.max(1, Date.now() - start.time);
    // Undamped travel values for threshold check
    const dx = dragOffset.x / 0.4;
    const dy = dragOffset.y / 0.4;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const velX = absDx / dt;
    const velY = absDy / dt;

    const isLeftSwipeAllowed = start.x >= LEFT_EDGE_GUARD;

    if (absDx > absDy && dx < 0 && isLeftSwipeAllowed) {
      // Left swipe dominant
      if (absDx > DISTANCE_THRESHOLD || velX > VELOCITY_THRESHOLD) {
        triggerGrade('hard', 'left');
        return;
      }
    } else if (absDy > absDx && dy < 0 && verticalAllowed()) {
      // Upward swipe dominant
      if (absDy > DISTANCE_THRESHOLD || velY > VELOCITY_THRESHOLD) {
        triggerGrade('good', 'up');
        return;
      }
    }

    // Snap back if threshold not met
    scrollEl.current = null;
    setDragOffset({ x: 0, y: 0 });
  };

  return {
    dragOffset,
    leavingDirection,
    // The counter is incremented as the card appears, so the first three cards
    // read 1, 2, 3 — `<= 3` is what "the first three cards ever" means here.
    showHint: cardsSeen <= 3,
    bindGestures: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
