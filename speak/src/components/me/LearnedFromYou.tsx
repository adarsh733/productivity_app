import { useState } from 'react';
import { useLearned } from '../../features/learn/useCardFeedback';

export interface LearnedFromYouProps {
  lines?: { id: string; text: string }[];
  onForget?: (id: string) => Promise<void> | void;
}

export default function LearnedFromYou(props?: LearnedFromYouProps) {
  const learned = useLearned();
  const lines = props?.lines ?? learned.lines;
  const onForget = props?.onForget ?? learned.forget;
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    if (removingId) return;
    setRemovingId(id);
    try {
      await onForget(id);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section className="me-learned" aria-labelledby="me-learned-title" data-testid="me-learned">
      <h2 className="me-learned-title" id="me-learned-title">
        What the app learned from you
      </h2>

      {lines.length === 0 ? (
        <p className="me-learned-empty" data-testid="me-learned-empty">
          Nothing yet. Thumbs and comments on cards teach the app what to show next.
        </p>
      ) : (
        <ul className="me-learned-list" data-testid="me-learned-list">
          {lines.map((line) => (
            <li className="me-learned-item" key={line.id} data-testid="me-learned-item">
              <span className="me-learned-text">{line.text}</span>
              <button
                type="button"
                className="me-learned-remove tap"
                onClick={() => void handleRemove(line.id)}
                disabled={removingId === line.id}
                aria-label={`Remove: ${line.text}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
