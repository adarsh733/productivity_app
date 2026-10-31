import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnyCard } from '../../types/contract';
import { artFor } from '../../features/cards/art';
import type { ExampleItem, PickOption, Slide } from '../../features/cards/slides';
import { trackOf } from '../../features/skills/trackOf';

export interface PosterCardProps {
  card: AnyCard;
  slides: Slide[];
  index: number;
  /** A game on this slide was played. */
  onSolved: () => void;
  /** Small label above the words, e.g. "Review". */
  kicker?: string;
  /** Round buttons down the right edge. Hidden during a game: it needs the room. */
  rail?: ReactNode;
  /** The row at the bottom: buttons on the last slide, or a hint. */
  foot?: ReactNode;
}

/** Long lines drop a size so they fit without scrolling. */
function headSize(text: string): 'xl' | 'l' | 'm' | 's' {
  if (text.length <= 12) return 'xl';
  if (text.length <= 44) return 'l';
  if (text.length <= 90) return 'm';
  return 's';
}

/**
 * A full-size card: one picture, one idea on screen, dots for the rest. Which
 * slide shows and what a tap does belong to the screen that holds it.
 */
export default function PosterCard({ card, slides, index, onSolved, kicker, rail, foot }: PosterCardProps) {
  const slideRef = useRef<HTMLDivElement>(null);

  // A slide that fits leaves every swipe to the card. One that is too long for a
  // small phone scrolls by finger instead of being cut off.
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const check = () => el.classList.toggle('is-scrollable', el.scrollHeight > el.clientHeight + 4);
    check();
    const watcher = new MutationObserver(check);
    watcher.observe(el, { childList: true, subtree: true });
    window.addEventListener('resize', check);
    return () => {
      watcher.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [card.id, index]);

  const slide = slides[index];
  if (!slide) return null;
  const { track } = trackOf(card);
  const isGame = slide.kind === 'pick' || slide.kind === 'tapword';
  const isTryCard = card.type === 'teach' && card.kind === 'try';

  return (
    <article
      className={`poster${isTryCard ? ' try-face' : ''}`}
      data-track={track}
      data-slide={slide.kind}
      aria-label={`Card: ${card.id}`}
    >
      <img
        className="poster-art"
        src={artFor(card)}
        alt=""
        draggable={false}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      <div key={index} ref={slideRef} className="poster-slide card-inner-body" role="region" aria-label="Card content">
        {kicker && <span className="poster-kicker">{kicker}</span>}
        <SlideBody slide={slide} onSolved={onSolved} />
      </div>

      <div className="poster-bottom">
        {rail && !isGame && <div className="poster-rail">{rail}</div>}
        {foot && <div className="poster-foot">{foot}</div>}
        {slides.length > 1 && (
          <div className="poster-dots" aria-hidden="true">
            {slides.map((_, i) => (
              <span key={i} className={`poster-dot${i === index ? ' is-on' : ''}`} data-testid="poster-dot" />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function SlideBody({ slide, onSolved }: { slide: Slide; onSolved: () => void }) {
  switch (slide.kind) {
    case 'idea':
      return (
        <>
          <h2 className={`poster-h poster-h-${headSize(slide.headline)}`}>{slide.headline}</h2>
          {slide.sub && <p className="poster-sub">{slide.sub}</p>}
        </>
      );
    case 'examples':
      return (
        <div className="poster-examples">
          {slide.items.map((item) => (
            <Example key={item.label} item={item} />
          ))}
        </div>
      );
    case 'picture':
      return (
        <>
          <span className="poster-label">Think of it like this</span>
          <h2 className={`poster-h poster-h-${headSize(slide.headline)}`}>{slide.headline}</h2>
        </>
      );
    case 'pick':
      return <PickGame slide={slide} onSolved={onSolved} />;
    case 'tapword':
      return <TapWordGame slide={slide} onSolved={onSolved} />;
    case 'try':
      return <TrySlide slide={slide} />;
    default: {
      const _exhaustive: never = slide;
      throw new Error(`Unhandled slide: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function Example({ item }: { item: ExampleItem }) {
  if (!item.chat) {
    return (
      <div className="poster-strip">
        <span className="poster-strip-label">{item.label}</span>
        <p className="poster-strip-text">{item.text}</p>
      </div>
    );
  }
  return (
    <div className="poster-chat-wrap">
      <span className="poster-label">{item.label}</span>
      <ul className="poster-chat">
        {item.chat.map((line, i) => (
          <li key={i} className={`poster-bubble${line.mine ? ' is-mine' : ''}`}>
            {!line.mine && <span className="poster-bubble-who">{line.who}</span>}
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickGame({ slide, onSolved }: { slide: Extract<Slide, { kind: 'pick' }>; onSolved: () => void }) {
  const [picked, setPicked] = useState<PickOption | null>(null);
  const stateOf = (option: PickOption) => {
    if (!picked) return '';
    if (option.right) return ' is-right';
    return option === picked ? ' is-wrong' : ' is-out';
  };
  return (
    <div className="poster-game">
      <h2 className={`poster-h poster-h-${headSize(slide.question)}`}>{slide.question}</h2>
      <div className="poster-game-fill" />
      {picked && (
        <p className="poster-game-result" role="status">
          {picked.right ? 'Yes!' : 'Not quite.'}
          {slide.why ? ` ${slide.why}` : ''}
        </p>
      )}
      <div className="poster-options">
        {slide.options.map((option) => (
          <button
            key={option.text}
            type="button"
            className={`poster-option tap${stateOf(option)}`}
            disabled={picked !== null}
            onClick={() => {
              setPicked(option);
              onSolved();
            }}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function TapWordGame({ slide, onSolved }: { slide: Extract<Slide, { kind: 'tapword' }>; onSolved: () => void }) {
  const [done, setDone] = useState(false);
  const [missed, setMissed] = useState<number | null>(null);
  const prompt = slide.weak.includes(' ') ? 'Tap the weak words' : 'Tap the weak word';

  const plainChip = (word: string, key: number) => (
    <button
      key={key}
      type="button"
      className={`poster-chip tap${missed === key ? ' is-miss' : ''}`}
      disabled={done}
      onClick={() => setMissed(key)}
    >
      {word}
    </button>
  );

  return (
    <div className="poster-game">
      <h2 className={`poster-h poster-h-${headSize(prompt)}`}>{done ? 'Much better' : prompt}</h2>
      <div className="poster-game-fill" />
      {done && slide.why && (
        <p className="poster-game-result" role="status">
          {slide.why}
        </p>
      )}
      <div className="poster-chips" data-testid="tapword-chips">
        {slide.before.map((w, i) => plainChip(w, i))}
        <button
          type="button"
          className={`poster-chip tap${done ? ' is-right' : ''}`}
          disabled={done}
          onClick={() => {
            setDone(true);
            onSolved();
          }}
        >
          {done ? slide.strong : slide.weak}
        </button>
        {slide.after.map((w, i) => plainChip(w, slide.before.length + 1 + i))}
      </div>
    </div>
  );
}

function TrySlide({ slide }: { slide: Extract<Slide, { kind: 'try' }> }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <span className="poster-label">Your turn</span>
      <h2 className={`poster-h try-prompt poster-h-${headSize(slide.prompt)}`}>{slide.prompt}</h2>
      {slide.shape && <p className="poster-sub">{slide.shape}</p>}
      {slide.answer &&
        (revealed ? (
          <div className="poster-strip" data-testid="try-great">
            <span className="poster-strip-label">A great answer</span>
            <p className="poster-strip-text">{slide.answer}</p>
          </div>
        ) : (
          <button type="button" className="poster-reveal tap try-reveal" onClick={() => setRevealed(true)}>
            Show a great answer
          </button>
        ))}
    </>
  );
}
