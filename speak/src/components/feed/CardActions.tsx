import { useRef, useState } from 'react';
import type { Grade } from '../../types/contract';

interface CardActionsProps {
  onSubmit: (grade: Grade) => void;
  onLogUrge: () => void;
}

export default function CardActions({ onSubmit, onLogUrge }: CardActionsProps) {
  const [isPressingGotIt, setIsPressingGotIt] = useState(false);
  const [isUrgeCounted, setIsUrgeCounted] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEasyTriggered = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const startPress = (clientX: number, clientY: number) => {
    setIsPressingGotIt(true);
    isEasyTriggered.current = false;
    touchStartPos.current = { x: clientX, y: clientY };

    longPressTimer.current = setTimeout(() => {
      isEasyTriggered.current = true;
    }, 500);
  };

  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPressingGotIt(false);
    isEasyTriggered.current = false;
    touchStartPos.current = null;
  };

  const endPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isEasyTriggered.current) {
      onSubmit('easy');
    } else if (touchStartPos.current !== null) {
      onSubmit('good');
    }

    setIsPressingGotIt(false);
    isEasyTriggered.current = false;
    touchStartPos.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 20 || dy > 20) {
      cancelPress();
    }
  };

  const handleUrgeClick = () => {
    onLogUrge();
    setIsUrgeCounted(true);
    setTimeout(() => {
      setIsUrgeCounted(false);
    }, 2000);
  };

  return (
    <div className="feed-actions-container">
      <div className="actions">
        <button
          className="btn btn-ghost no-select tap"
          onClick={() => onSubmit('again')}
          type="button"
        >
          Again
        </button>

        <button
          className={`btn btn-primary no-select tap${isPressingGotIt ? ' is-pressing' : ''}`}
          type="button"
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) startPress(touch.clientX, touch.clientY);
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={endPress}
          onTouchCancel={cancelPress}
          onMouseDown={(e) => startPress(e.clientX, e.clientY)}
          onMouseUp={endPress}
          onMouseLeave={cancelPress}
        >
          Got it
        </button>
      </div>

      <button
        className={`urge-chip tap no-select${isUrgeCounted ? ' is-counted' : ''}`}
        onClick={handleUrgeClick}
        type="button"
      >
        {isUrgeCounted ? 'Counted.' : 'I felt the pull'}
      </button>
    </div>
  );
}
