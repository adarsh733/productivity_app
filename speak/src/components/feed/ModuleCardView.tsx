import {
  type ReactNode,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CheckIcon,
  CloseIcon,
  FriendsIcon,
  HomeIcon,
  ThinkingIcon,
  VolumeIcon,
  WorkIcon,
} from '../shell/Icons';
import {
  MODULE_LABEL,
  type LineIcon,
  type ModuleCard,
  type SmallTalkCard,
} from '../../types/contract';
import { type ModuleSlide, moduleSlides } from '../../features/cards/moduleSlides';
import { levelOf, themeOf } from '../../features/cards/cardTags';

export interface ModuleCardViewProps {
  card: ModuleCard;
  rail?: ReactNode;
  onSlideChange?: (index: number) => void;
}

function renderLineIcon(icon?: LineIcon) {
  switch (icon) {
    case 'home':
      return <HomeIcon className="v7-line-icon" />;
    case 'work':
      return <WorkIcon className="v7-line-icon" />;
    case 'friends':
      return <FriendsIcon className="v7-line-icon" />;
    case 'thinking':
      return <ThinkingIcon className="v7-line-icon" />;
    default:
      return null;
  }
}

export function renderHighlightedText(text: string): ReactNode {
  if (!text.includes('**')) return text;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <b key={i} className="v7-hl">
              {part.slice(2, -2)}
            </b>
          );
        }
        return part;
      })}
    </>
  );
}

/** The ✓ / ✗ icon is drawn beside the label, so a mark typed into the label goes. */
function markless(label: string): string {
  return label.replace(/^[✓✗]\s*/u, '');
}

/** Long words shrink so the word always fits on one line beside the rail. */
function heroStyle(word: string): { fontSize: string } | undefined {
  const n = word.length;
  if (n <= 9) return undefined;
  return { fontSize: `calc(var(--hero-size) * ${(9 / n).toFixed(3)})` };
}

function formatChatKind(kind: SmallTalkCard['kind']): string {
  switch (kind) {
    case 'reply':
      return 'REPLY';
    case 'open':
      return 'OPEN';
    case 'keep_going':
      return 'KEEP IT GOING';
    case 'exit':
      return 'EXIT';
    case 'save_it':
      return 'SAVE IT';
  }
}

function getCardHeadline(card: ModuleCard): string {
  switch (card.module) {
    case 'words':
      return card.word;
    case 'smalltalk':
      return card.moment;
    case 'better':
      return card.situation;
    case 'phrases':
      return card.phrase;
    case 'stories':
      return card.topic;
  }
}

export default function ModuleCardView({
  card,
  rail,
  onSlideChange,
}: ModuleCardViewProps) {
  const slides: ModuleSlide[] = moduleSlides(card);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedCheckOpt, setSelectedCheckOpt] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // A slide never scrolls on its own (that would trap the swipe to the next
  // card): when its words are taller than the room, the slide shrinks to fit.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const fit = () => {
      row.querySelectorAll<HTMLElement>('.v7-slide').forEach((slide) => {
        const body = slide.querySelector<HTMLElement>('.v7-slide-body');
        if (!body) return;
        body.style.removeProperty('zoom');
        const cs = getComputedStyle(slide);
        const room = slide.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (!(room > 0)) return;
        // Rendered height (after zoom); the text re-wraps, so step down a few times.
        let zoom = 1;
        for (let i = 0; i < 5; i++) {
          const h = body.getBoundingClientRect().height;
          if (h <= room + 1 || zoom <= 0.6) break;
          zoom = Math.max(0.6, zoom * (room / h) * 0.99);
          body.style.setProperty('zoom', zoom.toFixed(3));
        }
      });
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [card.id]);

  useEffect(() => {
    setActiveSlide(0);
    setSelectedCheckOpt(null);
    if (rowRef.current) {
      rowRef.current.scrollLeft = 0;
    }
  }, [card.id]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const width = el.clientWidth || 1;
    const index = Math.round(el.scrollLeft / width);
    if (index !== activeSlide && index >= 0 && index < slides.length) {
      setActiveSlide(index);
      onSlideChange?.(index);
    }
  };

  const renderSlideContent = (slide: ModuleSlide) => {
    switch (slide.kind) {
      case 'word':
        return (
          <>
            <span className="v7-kicker">WORD · {slide.pos.toUpperCase()}</span>
            <h1 className="v7-word-hero" style={heroStyle(slide.word)}>
              {slide.word}
            </h1>
            <div className="v7-pronounce">
              <VolumeIcon className="v7-icon-sm" />
              <span>{slide.say}</span>
            </div>
            <p className="v7-meaning">{slide.meaning}</p>
            {slide.examples.map((ex, i) => (
              <div key={i} className="v7-panel">
                <div className="v7-panel-lbl">
                  {renderLineIcon(ex.icon)}
                  <span>{ex.label}</span>
                </div>
                <div className="v7-panel-txt">{renderHighlightedText(ex.text)}</div>
              </div>
            ))}
          </>
        );

      case 'right_wrong':
        return (
          <>
            <span className="v7-kicker">USE IT RIGHT</span>
            <div className="v7-panel">
              <div className="v7-panel-lbl">
                <CheckIcon className="v7-line-icon v7-check-icon" />
                <span>{markless(slide.right.label)}</span>
              </div>
              <div className="v7-panel-txt">{renderHighlightedText(slide.right.text)}</div>
            </div>
            {slide.wrong.map((w, i) => (
              <div key={i} className="v7-panel is-weak">
                <div className="v7-panel-lbl">
                  <CloseIcon className="v7-line-icon v7-cross-icon" />
                  <span>{markless(w.label)}</span>
                </div>
                <div className="v7-panel-txt">{renderHighlightedText(w.text)}</div>
              </div>
            ))}
            <div className="v7-pill">{slide.rule}</div>
          </>
        );

      case 'check':
        return (
          <>
            <span className="v7-kicker">QUICK CHECK · 5 SECONDS</span>
            <h2 className="v7-check-q">{slide.question}</h2>
            <div className="v7-options">
              {slide.options.map((opt, i) => {
                const isSelected = selectedCheckOpt === i;
                const statusCls = isSelected
                  ? opt.right
                    ? ' is-right'
                    : ' is-wrong'
                  : '';
                return (
                  <button
                    key={i}
                    type="button"
                    className={`v7-opt-btn tap${statusCls}`}
                    onClick={() => setSelectedCheckOpt(i)}
                  >
                    {opt.text}
                  </button>
                );
              })}
            </div>
          </>
        );

      case 'chat':
        return (
          <>
            <span className="v7-kicker">
              SMALL TALK · {formatChatKind(slide.chatKind)}
            </span>
            {slide.they && (
              <div className="v7-bubble them">{slide.they}</div>
            )}
            <div className="v7-bubble is-weak">{slide.deadEnd}</div>
            <div className="v7-bubble me">
              {renderHighlightedText(slide.reply)}
            </div>
            <div className="v7-pill">{slide.formula}</div>
          </>
        );

      case 'more':
        return (
          <>
            <span className="v7-kicker">MORE WAYS TO REPLY</span>
            {slide.more.map((m, i) => (
              <div key={i} className="v7-panel">
                <div className="v7-panel-lbl">
                  {renderLineIcon(m.icon)}
                  <span>{m.label}</span>
                </div>
                <div className="v7-panel-txt">{renderHighlightedText(m.text)}</div>
              </div>
            ))}
          </>
        );

      case 'donts':
        return (
          <>
            <span className="v7-kicker">DON'T</span>
            {slide.donts.map((d, i) => (
              <div key={i} className="v7-panel is-weak">
                <div className="v7-panel-txt">{d}</div>
              </div>
            ))}
          </>
        );

      case 'better':
        return (
          <>
            <span className="v7-kicker">
              SAY IT BETTER
              {slide.thinking
                ? ' · EXPLAIN YOUR THINKING'
                : ` · ${slide.situation.toUpperCase()}`}
            </span>
            <div className="v7-panel is-weak">
              <div className="v7-panel-lbl">YOU MIGHT SAY</div>
              <div className="v7-panel-txt">{slide.mightSay}</div>
            </div>
            <div className="v7-panel is-strong">
              <div className="v7-panel-lbl">BETTER</div>
              <div className="v7-panel-txt">{renderHighlightedText(slide.better)}</div>
            </div>
            <div className="v7-chips-row">
              {slide.changes.map((c, i) => (
                <span key={i} className="v7-pill">
                  {c}
                </span>
              ))}
            </div>
          </>
        );

      case 'next':
        return (
          <>
            <span className="v7-kicker">EVEN BETTER</span>
            <div className="v7-panel is-strong">
              <div className="v7-panel-lbl">{slide.next.title}</div>
              {slide.next.lines.map((l, i) => (
                <div key={i} className="v7-panel-txt">
                  {renderHighlightedText(l.text)}
                </div>
              ))}
            </div>
            {slide.next.note && (
              <p className="v7-meaning">{slide.next.note}</p>
            )}
          </>
        );

      case 'phrase':
        return (
          <>
            <span className="v7-kicker">
              OFFICE PHRASE · {slide.group.toUpperCase()}
            </span>
            <h1 className="v7-word-hero is-phrase">"{slide.phrase}"</h1>
            <p className="v7-meaning">{slide.meaning}</p>
            <div className="v7-panel">
              <div className="v7-panel-lbl">USE WHEN</div>
              <div className="v7-panel-txt">{slide.useWhen}</div>
            </div>
            <div className="v7-panel">
              <div className="v7-panel-lbl">EXAMPLE</div>
              <div className="v7-panel-txt">{renderHighlightedText(slide.example)}</div>
            </div>
            <div className="v7-pill">{slide.tone}</div>
          </>
        );

      case 'careful':
        return (
          <>
            <span className="v7-kicker">CAREFUL</span>
            <div className="v7-panel is-weak">
              <div className="v7-panel-lbl">
                <CloseIcon className="v7-line-icon v7-cross-icon" />
                <span>{markless(slide.wrong.label)}</span>
              </div>
              <div className="v7-panel-txt">{slide.wrong.text}</div>
            </div>
            <div className="v7-panel">
              <div className="v7-panel-lbl">NOTE</div>
              <div className="v7-panel-txt">{slide.careful}</div>
            </div>
            <div className="v7-panel">
              <div className="v7-panel-lbl">SIMILAR</div>
              <div className="v7-panel-txt">
                {slide.similar.map((s, i) => (
                  <div key={i}>"{s}"</div>
                ))}
              </div>
            </div>
          </>
        );

      case 'story':
        return (
          <>
            <span className="v7-kicker">STORIES · {slide.topic.toUpperCase()}</span>
            <div className="v7-panel is-weak">
              <div className="v7-panel-lbl">REPORT</div>
              <div className="v7-panel-txt">{slide.report}</div>
            </div>
            <div className="v7-panel is-strong">
              <div className="v7-panel-lbl">STORY</div>
              <div className="v7-panel-txt">{renderHighlightedText(slide.story)}</div>
            </div>
            <div className="v7-pill">{slide.trick}</div>
          </>
        );

      case 'your_turn':
        return (
          <>
            <span className="v7-kicker">YOUR TURN · OPTIONAL</span>
            <h2 className="v7-check-q">{slide.yourTurn.prompt}</h2>
            <p className="v7-meaning">{slide.yourTurn.hint}</p>
          </>
        );
    }
  };

  const headline = getCardHeadline(card);
  const isRailSelfContained =
    isValidElement(rail) &&
    typeof rail.props === 'object' &&
    rail.props !== null &&
    'className' in rail.props &&
    typeof (rail.props as { className?: string }).className === 'string' &&
    (rail.props as { className?: string }).className?.includes('v7-rail');

  return (
    <article
      className="v7-card"
      data-module={card.module}
      data-card-id={card.id}
      data-theme={themeOf(card)}
      data-level={levelOf(card)}
      aria-label={`${MODULE_LABEL[card.module]}: ${headline}`}
    >
      <div className="v7-hrow" ref={rowRef} onScroll={handleScroll}>
        {slides.map((slide, idx) => (
          <section
            key={idx}
            className="v7-slide"
            aria-label={`Slide ${idx + 1} of ${slides.length}`}
          >
            <div className="v7-slide-body">
              {idx === 0 && (
                <span className="v7-theme" data-testid="card-theme">
                  {themeOf(card)}
                </span>
              )}
              {renderSlideContent(slide)}
            </div>
          </section>
        ))}
      </div>

      {rail && (isRailSelfContained ? rail : <div className="v7-rail">{rail}</div>)}

      {slides.length > 1 && (
        <div className="v7-dots" aria-hidden="true">
          {slides.map((_, i) => (
            <i key={i} className={i === activeSlide ? 'is-on' : ''} />
          ))}
        </div>
      )}
    </article>
  );
}
