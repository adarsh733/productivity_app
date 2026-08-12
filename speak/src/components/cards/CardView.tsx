import { useEffect, useRef, useState } from 'react';
import type { Card, CardType } from '../../types/contract';
import { speak, stop } from '../../lib/speech';

/**
 * The seven card renderers.
 *
 * The rule that is not cosmetic: every card ends with him having SAID
 * something. If a change here makes a card answerable in silence, the card is
 * broken — the app is a speaking gym with a vocabulary annexe, not the reverse.
 */
export interface CardViewProps {
  card: Card;
  /** Breath drills report seconds or a count here. */
  onMeasure?: (value: number) => void;
}

const LABELS: Record<CardType, string> = {
  word: 'WORD',
  swap: 'SAY IT BETTER',
  idiom: 'PHRASE',
  action_verb: 'ACTION',
  pronounce: 'PRONOUNCE',
  say_it: 'SAY IT',
  breath: 'BREATH',
};

export default function CardView({ card, onMeasure }: CardViewProps) {
  useEffect(() => () => stop(), [card.id]);

  return (
    <article className="card" data-type={card.type} style={{ ['--accent-card' as string]: `var(--t-${card.type})` }}>
      <div className="card-kicker">{LABELS[card.type]}</div>
      <div className="card-body">
        <Body card={card} onMeasure={onMeasure} />
      </div>
    </article>
  );
}

function Body({ card, onMeasure }: CardViewProps) {
  switch (card.type) {
    case 'word':
      return (
        <>
          <h1 className="term">{card.term}</h1>
          <p className="pos">{card.pos}</p>
          <p className="meaning">{card.meaning}</p>
          <ul className="examples">
            {card.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <Prompt>{card.say}</Prompt>
        </>
      );

    case 'swap':
      return <Swap weak={card.weak} answers={card.answers} timerSec={card.timerSec} />;

    case 'idiom':
      return (
        <>
          <h1 className="term">{card.phrase}</h1>
          <p className="meaning">{card.meaning}</p>
          <blockquote className="quote">{card.example}</blockquote>
          <p className="scenario">{card.scenario}</p>
          <Prompt>Say your own sentence for that situation.</Prompt>
        </>
      );

    case 'action_verb':
      return (
        <>
          <h1 className="term">{card.verb}</h1>
          <p className="meaning">{card.meaning}</p>
          <p className="contrast">{card.contrast}</p>
          <ul className="examples">
            {card.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <Prompt>Describe something that happened to you using “{card.verb}”.</Prompt>
        </>
      );

    case 'pronounce':
      return <Pronounce card={card} />;

    case 'say_it':
      return <SayIt card={card} />;

    case 'breath':
      return <Breath card={card} onMeasure={onMeasure} />;
  }
}

function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <p className="prompt">
      <span className="prompt-mark" aria-hidden="true" />
      {children}
    </p>
  );
}

// ─── swap ────────────────────────────────────────────────────────────────────

function Swap({ weak, answers, timerSec }: { weak: string; answers: string[]; timerSec: number }) {
  const [left, setLeft] = useState(timerSec);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setLeft(timerSec);
    setRevealed(false);
    const id = setInterval(() => setLeft((n) => (n <= 1 ? (clearInterval(id), 0) : n - 1)), 1000);
    return () => clearInterval(id);
  }, [weak, timerSec]);

  return (
    <>
      <p className="hint">One word instead. Out loud, before the clock runs out.</p>
      <h1 className="term term-weak">{weak}</h1>

      {!revealed ? (
        <button className="btn big" onClick={() => setRevealed(true)}>
          {left > 0 ? <span className="countdown">{left}</span> : 'Show me'}
        </button>
      ) : (
        <>
          <ul className="answers">
            {answers.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <Prompt>Say the best one in a full sentence.</Prompt>
        </>
      )}
    </>
  );
}

// ─── pronounce ───────────────────────────────────────────────────────────────

function Pronounce({ card }: { card: Extract<Card, { type: 'pronounce' }> }) {
  const parts = card.syllables.split('·');
  return (
    <>
      <h1 className="term">{card.term}</h1>
      <p className="syllables">
        {parts.map((s, i) => (
          <span key={i} className={i === card.stressIndex ? 'stressed' : 'unstressed'}>
            {s}
          </span>
        ))}
      </p>
      {card.commonError && <p className="warn">{card.commonError}</p>}
      <button className="btn" onClick={() => speak(card.term, { lang: card.lang, rate: 0.8 })}>
        ▶ Hear it
      </button>
      <Prompt>Now say it three times. Slower than feels natural.</Prompt>
    </>
  );
}

// ─── say it ──────────────────────────────────────────────────────────────────

function SayIt({ card }: { card: Extract<Card, { type: 'say_it' }> }) {
  // Render the pause marks as real visual beats rather than punctuation.
  const chunks = card.marked.split(/(\/\/|\/)/g).filter((s) => s.trim().length > 0);

  return (
    <>
      <p className="line">
        {chunks.map((c, i) =>
          c === '/' || c === '//' ? (
            <span key={i} className={c === '//' ? 'pause pause-long' : 'pause'} aria-hidden="true" />
          ) : (
            <span key={i}>{c.trim()} </span>
          ),
        )}
      </p>
      <p className="hint">
        <span className="pause" aria-hidden="true" /> short breath ·{' '}
        <span className="pause pause-long" aria-hidden="true" /> full stop
      </p>
      <button className="btn" onClick={() => speak(card.line, { lang: 'en', rate: 0.78 })}>
        ▶ Hear the pace
      </button>
      <Prompt>Read it aloud. Land on every pause. Around {card.targetWpm} wpm.</Prompt>
    </>
  );
}

// ─── breath ──────────────────────────────────────────────────────────────────

function Breath({
  card,
  onMeasure,
}: {
  card: Extract<Card, { type: 'breath' }>;
  onMeasure?: (n: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [logged, setLogged] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    setElapsed(0);
    setCount(0);
    setRunning(false);
    setLogged(false);
  }, [card.id]);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 100) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  return (
    <>
      <h1 className="term term-sm">{card.title}</h1>
      <ol className="instructions">
        {card.instructions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {card.logUnit === 'seconds' && (
        <div className="drill">
          <p className="timer">{elapsed.toFixed(1)}<span className="unit">s</span></p>
          <button
            className={`btn big${running ? ' is-running' : ''}`}
            onClick={() => {
              if (running) {
                setRunning(false);
                setLogged(true);
                onMeasure?.(elapsed);
              } else {
                setElapsed(0);
                setLogged(false);
                setRunning(true);
              }
            }}
          >
            {running ? 'Stop' : logged ? 'Again' : 'Start'}
          </button>
          {logged && <p className="hint">Logged {elapsed.toFixed(1)}s.</p>}
        </div>
      )}

      {card.logUnit === 'count' && (
        <div className="drill">
          <p className="timer">{count}</p>
          <div className="counter">
            <button className="btn round" onClick={() => setCount((n) => Math.max(0, n - 1))}>
              −
            </button>
            <button className="btn round" onClick={() => setCount((n) => n + 1)}>
              +
            </button>
            <button
              className="btn"
              onClick={() => {
                setLogged(true);
                onMeasure?.(count);
              }}
            >
              Log
            </button>
          </div>
          {logged && <p className="hint">Logged {count}.</p>}
        </div>
      )}

      {card.logUnit === 'none' && card.durationSec && (
        <p className="hint">Takes about {Math.round(card.durationSec / 15) * 15} seconds.</p>
      )}
    </>
  );
}
