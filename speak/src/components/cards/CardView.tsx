import { useEffect, useRef, useState } from 'react';
import type { Card, CardType } from '../../types/contract';
import { speak, stop } from '../../lib/speech';

export interface CardViewProps {
  card: Card;
  /** Breath drills report seconds or a count here. */
  onMeasure?: (value: number) => void;
  bestMptSec?: number;
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

export default function CardView({ card, onMeasure, bestMptSec }: CardViewProps) {
  const [sayOverride, setSayOverride] = useState<string | null>(null);

  useEffect(() => {
    setSayOverride(null);
    return () => stop();
  }, [card.id]);

  const defaultSayText = getDefaultSayText(card);
  const sayText = sayOverride ?? defaultSayText;

  return (
    <article
      className="card no-select"
      data-type={card.type}
      style={{ ['--accent-card' as string]: `var(--t-${card.type})` }}
    >
      <div className="card-spine" aria-hidden="true" />
      <div className="card-kicker">{LABELS[card.type]}</div>

      <div className="card-body">
        <Body card={card} onMeasure={onMeasure} setSayText={setSayOverride} bestMptSec={bestMptSec} />
      </div>

      <div className="say-block">
        <div className="say-label">SAY THIS</div>
        <div className="say-text">{sayText}</div>
      </div>
    </article>
  );
}

function getDefaultSayText(card: Card): string {
  switch (card.type) {
    case 'word':
      return card.say;
    case 'swap':
      return 'One word instead. Say it out loud before the clock runs out.';
    case 'idiom':
      return 'Say your own sentence for that situation.';
    case 'action_verb':
      return `Describe something that happened to you using “${card.verb}”.`;
    case 'pronounce':
      return 'Now say it three times. Slower than feels natural.';
    case 'say_it':
      return `Read it aloud. Land on every pause. Around ${card.targetWpm} wpm.`;
    case 'breath':
      return 'Follow the steps out loud.';
  }
}

interface BodyProps {
  card: Card;
  onMeasure?: (value: number) => void;
  setSayText: (text: string) => void;
  bestMptSec?: number;
}

function Body({ card, onMeasure, setSayText, bestMptSec }: BodyProps) {
  switch (card.type) {
    case 'word': {
      const isLong = card.term.length > 14;
      return (
        <>
          <h1 className={`term${isLong ? ' term-sm' : ''}`}>{card.term}</h1>
          <p className="pos">{card.pos}</p>
          <p className="meaning">{card.meaning}</p>
          <ul className="examples">
            {card.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      );
    }

    case 'swap':
      return <Swap card={card} setSayText={setSayText} />;

    case 'idiom': {
      const isLong = card.phrase.length > 14;
      return (
        <>
          <h1 className={`term${isLong ? ' term-sm' : ''}`}>{card.phrase}</h1>
          <p className="meaning">{card.meaning}</p>
          <blockquote className="quote">{card.example}</blockquote>
          <p className="scenario">{card.scenario}</p>
        </>
      );
    }

    case 'action_verb': {
      const isLong = card.verb.length > 14;
      return (
        <>
          <h1 className={`term${isLong ? ' term-sm' : ''}`}>{card.verb}</h1>
          <p className="meaning">{card.meaning}</p>
          <p className="contrast">{card.contrast}</p>
          <ul className="examples">
            {card.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      );
    }

    case 'pronounce':
      return <Pronounce card={card} />;

    case 'say_it':
      return <SayIt card={card} />;

    case 'breath':
      return <Breath card={card} onMeasure={onMeasure} bestMptSec={bestMptSec} />;
  }
}

// ─── swap ────────────────────────────────────────────────────────────────────

function Swap({
  card,
  setSayText,
}: {
  card: Extract<Card, { type: 'swap' }>;
  setSayText: (text: string) => void;
}) {
  const { weak, answers, timerSec } = card;
  const [left, setLeft] = useState(timerSec);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setLeft(timerSec);
    setRevealed(false);
    const id = setInterval(() => setLeft((n) => (n <= 1 ? (clearInterval(id), 0) : n - 1)), 1000);
    return () => clearInterval(id);
  }, [weak, timerSec]);

  const handleReveal = () => {
    setRevealed(true);
    setSayText('Say the best one in a full sentence.');
  };

  return (
    <>
      <p className="hint">One word instead. Out loud, before the clock runs out.</p>
      <h1 className="term term-weak">{weak}</h1>

      {!revealed ? (
        <button className="btn btn-big tap" onClick={handleReveal} type="button">
          {left > 0 ? <span className="countdown">{left}</span> : 'Show me'}
        </button>
      ) : (
        <ul className="answers">
          {answers.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </>
  );
}

// ─── pronounce ───────────────────────────────────────────────────────────────

function Pronounce({ card }: { card: Extract<Card, { type: 'pronounce' }> }) {
  const parts = card.syllables.split('·');
  const isLong = card.term.length > 14;

  return (
    <>
      <h1 className={`term${isLong ? ' term-sm' : ''}`}>{card.term}</h1>
      <p className="syllables">
        {parts.map((s, i) => (
          <span key={i}>
            {i > 0 && <span className="syllables-dot"> · </span>}
            <span className={i === card.stressIndex ? 'stressed' : 'unstressed'}>{s}</span>
          </span>
        ))}
      </p>
      {card.commonError && <p className="warn">{card.commonError}</p>}
      <button
        className="btn tap"
        onClick={() => speak(card.term, { lang: card.lang, rate: 0.8 })}
        type="button"
      >
        ▶ Hear it
      </button>
    </>
  );
}

// ─── say it ──────────────────────────────────────────────────────────────────

function SayIt({ card }: { card: Extract<Card, { type: 'say_it' }> }) {
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
      <button
        className="btn tap"
        onClick={() => speak(card.line, { lang: 'en', rate: 0.78 })}
        type="button"
      >
        ▶ Hear the pace
      </button>
    </>
  );
}

// ─── breath ──────────────────────────────────────────────────────────────────

function Breath({
  card,
  onMeasure,
  bestMptSec,
}: {
  card: Extract<Card, { type: 'breath' }>;
  onMeasure?: (n: number) => void;
  bestMptSec?: number;
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

  const hasMultipleSteps = card.instructions.length > 3;

  return (
    <>
      <h1 className="term-sm">{card.title}</h1>

      {bestMptSec !== undefined && bestMptSec > 0 && (
        <p className="hint">Personal best: {bestMptSec.toFixed(1)}s</p>
      )}

      <ol className="instructions">
        {card.instructions.map((s, i) => (
          <li key={i} className={hasMultipleSteps && i > 0 ? 'step-secondary' : 'step-highlight'}>
            {s}
          </li>
        ))}
      </ol>

      {card.logUnit === 'seconds' && (
        <div className="drill">
          <p className="timer">
            {elapsed.toFixed(1)}
            <span className="unit">s</span>
          </p>
          <button
            className={`btn btn-big tap${running ? ' is-running' : ''}`}
            type="button"
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
            <button
              className="btn btn-round tap"
              type="button"
              onClick={() => setCount((n) => Math.max(0, n - 1))}
            >
              −
            </button>
            <button
              className="btn btn-round tap"
              type="button"
              onClick={() => setCount((n) => n + 1)}
            >
              +
            </button>
            <button
              className="btn tap"
              type="button"
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
