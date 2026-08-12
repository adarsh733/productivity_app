import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../db/db';
import CardView from '../cards/CardView';
import { speak } from '../../lib/speech';

/**
 * Hindi is deliberately NOT in the main feed — it is a section entered on
 * purpose, so it never competes for slots with the English work.
 *
 * Phase 3 gives it its own scheduler. For now: browse, hear it, say it.
 */
export default function HindiScreen() {
  const cards = useLiveQuery(() => db.cards.where('lang').equals('hi').toArray(), [], []);
  const [index, setIndex] = useState(0);

  const list = (cards ?? []).filter((c) => c.status === 'active');

  if (list.length === 0) {
    return (
      <div className="screen center">
        <p className="meta">No Hindi cards yet.</p>
      </div>
    );
  }

  const at = Math.min(index, list.length - 1);
  const card = list[at]!;

  return (
    <div className="screen hindi">
      <header className="hindi-top">
        <span className="pill">हिंदी</span>
        <span className="meta">
          {at + 1} / {list.length}
        </span>
      </header>

      <div className="card-stage">
        <CardView card={card} />
      </div>

      <footer className="hindi-nav">
        <button
          className="btn tap"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={at === 0}
        >
          ←
        </button>
        <button
          className="btn tap"
          onClick={() => card.type === 'word' && speak(card.term, { lang: 'hi', rate: 0.8 })}
        >
          ▶ सुनिए
        </button>
        <button
          className="btn primary tap"
          onClick={() => setIndex((i) => Math.min(list.length - 1, i + 1))}
          disabled={at === list.length - 1}
        >
          →
        </button>
      </footer>
    </div>
  );
}
