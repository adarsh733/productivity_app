import { useState } from 'react';
import type { LearnerKnows } from '../../features/me/useMe';

export interface LearnerMemoryProps {
  knows: LearnerKnows;
  onForget(text: string): Promise<void> | void;
}

function weakSpotLine(w: LearnerKnows['weakSpots']): string {
  if (w.open === 0) return 'None open right now.';
  const parts: string[] = [];
  if (w.fromAsk > 0) parts.push(`${w.fromAsk} from Ask`);
  if (w.fromChat > 0) parts.push(`${w.fromChat} from evening chats`);
  const total = `${w.open} open`;
  return parts.length > 0 ? `${total} · ${parts.join(', ')}` : total;
}

/**
 * Me → "What the app knows about me": his wishes (each can be forgotten),
 * the subjects new cards are about, and how many weak spots it is watching.
 */
export default function LearnerMemory({ knows, onForget }: LearnerMemoryProps) {
  const [forgetting, setForgetting] = useState<string | null>(null);

  const forget = async (text: string) => {
    if (forgetting) return;
    setForgetting(text);
    try {
      await onForget(text);
    } finally {
      setForgetting(null);
    }
  };

  return (
    <section className="me-knows" aria-labelledby="me-knows-title" data-testid="me-knows">
      <h2 className="me-knows-title" id="me-knows-title">
        What the app knows about me
      </h2>

      <div className="me-knows-part">
        <h3 className="me-knows-label">Your wishes</h3>
        {knows.wishes.length === 0 ? (
          <p className="me-knows-empty">Nothing yet. Tell Ask what you want, like “more cricket small talk”.</p>
        ) : (
          <ul className="me-knows-wishes">
            {knows.wishes.map((w) => (
              <li className="me-knows-wish" key={w.text} data-testid="me-wish">
                <span className="me-knows-wish-text">{w.text}</span>
                <button
                  type="button"
                  className="me-knows-forget tap"
                  onClick={() => void forget(w.text)}
                  disabled={forgetting === w.text}
                  aria-label={`Forget: ${w.text}`}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="me-knows-part">
        <h3 className="me-knows-label">Subjects for new cards</h3>
        {knows.topics.length === 0 ? (
          <p className="me-knows-empty">None yet. They come from what you ask and talk about.</p>
        ) : (
          <ul className="me-knows-topics">
            {knows.topics.map((t) => (
              <li className="me-knows-topic" key={t} data-testid="me-topic">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="me-knows-part">
        <h3 className="me-knows-label">Weak spots it is watching</h3>
        <p className="me-knows-line" data-testid="me-knows-weak">
          {weakSpotLine(knows.weakSpots)}
        </p>
      </div>
    </section>
  );
}
