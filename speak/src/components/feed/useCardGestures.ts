import { useEffect, useRef, useState } from 'react';
import type { Grade } from '../../types/contract';

const CARDS_SEEN_KEY = 'speak.cardsSeen.v1';
const DISTANCE_THRESHOLD = 50; // px
const VELOCITY_THRESHOLD = 0.25; // px/ms
const LEFT_EDGE_GUARD = 35; // px

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
  onSubmitGrade: (grade: Grade, direction: 'up' | 'left' | 'right') => void,
  onSwipeDown?: () => boolean | void,
) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [leavingDirection, setLeavingDirection] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
  const [cardsSeen, setCardsSeen] = useState<number>(getCardsSeenCount());

  const startPos = useRef<{ x: number; y: number; time: number; pointerId: number } | null>(null);
  const isBusy = useRef<boolean>(false);
  const scrollEl = useRef<HTMLElement | null>(null);
  const countedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
    setLeavingDirection(null);
    isBusy.current = false;
  }, [cardId]);

  useEffect(() => {
    if (!cardId || countedFor.current === cardId) return;
    countedFor.current = cardId;
    setCardsSeen(incrementCardsSeenCount());
  }, [cardId]);

  const verticalAllowed = () => {
    const el = scrollEl.current;
    if (!el) return true;
    if (el.scrollHeight - el.clientHeight <= 4) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  };

  const topPullAllowed = () => {
    const el = scrollEl.current;
    if (!el) return true;
    return el.scrollTop <= 4;
  };

  const triggerGrade = (grade: Grade, direction: 'up' | 'left' | 'right') => {
    if (isBusy.current) return;
    isBusy.current = true;
    setLeavingDirection(direction);
    onSubmitGrade(grade, direction);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isBusy.current || (e.button !== undefined && e.button !== 0)) return;
    const target = e.target as HTMLElement | null;
    // Don't intercept button or input clicks
    if (target?.closest('button, input, textarea, a, select')) return;

    scrollEl.current = target?.closest?.('.card-inner-body') as HTMLElement | null;
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      pointerId: e.pointerId,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPos.current || isBusy.current || startPos.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    const isLeftSwipeAllowed = startPos.current.x >= LEFT_EDGE_GUARD;

    let dampedX = 0;
    let dampedY = 0;

    if (Math.abs(dx) > Math.abs(dy)) {
      if ((dx < 0 && isLeftSwipeAllowed) || dx > 0) {
        dampedX = dx * 0.45;
      }
    } else {
      if (dy < 0 && verticalAllowed()) {
        dampedY = dy * 0.45;
      } else if (dy > 0 && topPullAllowed() && onSwipeDown) {
        dampedY = dy * 0.45;
      }
    }

    setDragOffset({ x: dampedX, y: dampedY });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!startPos.current || isBusy.current || startPos.current.pointerId !== e.pointerId) return;
    const start = startPos.current;
    startPos.current = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }

    const dt = Math.max(1, Date.now() - start.time);
    const dx = dragOffset.x / 0.45;
    const dy = dragOffset.y / 0.45;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const velX = absDx / dt;
    const velY = absDy / dt;

    const isLeftSwipeAllowed = start.x >= LEFT_EDGE_GUARD;

    if (absDx > absDy) {
      if (dx < 0 && isLeftSwipeAllowed && (absDx > DISTANCE_THRESHOLD || velX > VELOCITY_THRESHOLD)) {
        triggerGrade('hard', 'left');
        return;
      } else if (dx > 0 && (absDx > DISTANCE_THRESHOLD || velX > VELOCITY_THRESHOLD)) {
        triggerGrade('good', 'right');
        return;
      }
    } else if (absDy > absDx) {
      if (dy < 0 && verticalAllowed() && (absDy > DISTANCE_THRESHOLD || velY > VELOCITY_THRESHOLD)) {
        triggerGrade('good', 'up');
        return;
      } else if (dy > 0 && topPullAllowed() && onSwipeDown && (absDy > DISTANCE_THRESHOLD || velY > VELOCITY_THRESHOLD)) {
        const handled = onSwipeDown();
        if (handled === false) {
          // First card: spring back into place, never fly off-screen.
          setDragOffset({ x: 0, y: 0 });
          return;
        }
        setLeavingDirection('down');
        return;
      }
    }

    scrollEl.current = null;
    setDragOffset({ x: 0, y: 0 });
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (startPos.current && startPos.current.pointerId === e.pointerId) {
      startPos.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // safe fallback
      }
      setDragOffset({ x: 0, y: 0 });
    }
  };

  return {
    dragOffset,
    leavingDirection,
    showHint: cardsSeen <= 3,
    bindGestures: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
