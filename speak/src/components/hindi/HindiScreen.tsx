import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

import { db } from '../../db/db';
import CardView from '../cards/CardView';
import CardActions from '../feed/CardActions';
import { useCardGestures } from '../feed/useCardGestures';
import type { Grade } from '../../types/contract';

export default function HindiScreen() {
  const cards = useLiveQuery(() => db.cards.where('lang').equals('hi').toArray(), [], []);

  const [index, setIndex] = useState(0);
  const [doneTodayCount, setDoneTodayCount] = useState(0);

  const activeCards = (cards ?? []).filter((c) => c.status === 'active');
  const cardCount = activeCards.length;

  const currentCard = cardCount > 0 ? activeCards[index % cardCount] : null;
  const cardId = currentCard?.id;

  const busy = useRef(false);

  useEffect(() => {
    busy.current = false;
  }, [cardId]);

  const handleGrade = useCallback(
    (grade: Grade) => {
      if (busy.current || cardCount === 0) return;
      busy.current = true;
      if (grade !== 'again') {
        setDoneTodayCount((n) => n + 1);
      }
      setIndex((i) => (i + 1) % cardCount);
    },
    [cardCount],
  );

  const { dragOffset, leavingDirection, bindGestures } = useCardGestures(cardId, handleGrade);

  if (cardCount === 0) {
    return (
      <div className="screen hindi center">
        <p className="meaning">No Hindi cards available.</p>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="screen hindi center">
        <span className="spinner" aria-label="loading" />
      </div>
    );
  }

  const transformStyle =
    leavingDirection === 'up'
      ? 'translateY(-100vh)'
      : leavingDirection === 'left'
        ? 'translateX(-100vw)'
        : dragOffset.x || dragOffset.y
          ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
          : undefined;

  return (
    <div className="screen hindi">
      <header className="feed-head">
        <div className="feed-head-row">
          <span className="feed-mode-label">हिंदी</span>
          <span className="feed-cards-done">{doneTodayCount} today</span>
        </div>
      </header>

      <div
        className={`card-frame${leavingDirection ? ' is-leaving' : ''}`}
        style={{ transform: transformStyle }}
        {...bindGestures}
      >
        <CardView card={currentCard} />
      </div>

      <CardActions
        onSubmit={(g) => handleGrade(g)}
        onLogUrge={() => {
          // urge logging placeholder for Hindi view
        }}
      />
    </div>
  );
}
