import type { AnyCard, SkillTag } from '../../types/contract';
import { speak } from '../../lib/speech';
import { VolumeIcon } from '../shell/Icons';
import TeachCardFace, { exampleLabels } from './TeachCardFace';
import { trackChipText, trackOf } from '../../features/skills/trackOf';

export interface CardFaceProps {
  card: AnyCard;
  isDetail?: boolean;
  onToggleDetail?: () => void;
  showSwipeHint?: boolean;
  /** v5 teach cards only: the buttons that live on the card. */
  saved?: boolean;
  onAgain?: () => void;
  onGotIt?: () => void;
  onSave?: () => void;
  /** v5 Try cards only: the optional 🎤 Say mine button. */
  onSayMine?: () => void;
}

function getBadge(card: AnyCard): { label: string; className: string } {
  if (card.lang === 'hi') {
    return { label: '🇮🇳 Practical Hindi', className: 'b-hindi' };
  }
  switch (card.type) {
    case 'word':
      return { label: '📖 Vocabulary', className: 'b-word' };
    case 'idiom':
      return { label: '💼 Office Idiom', className: 'b-idiom' };
    case 'swap':
      return { label: '🔄 Say This Instead', className: 'b-swap' };
    case 'phrase':
      return {
        label:
          card.register === 'office'
            ? '💼 Office Phrase'
            : card.register === 'presenting'
              ? '🎙️ Presenting Phrase'
              : '✨ Phrasing Upgrade',
        className: 'b-scn',
      };
    case 'action_verb':
      return { label: '🏃 Dynamic Verb', className: 'b-verb' };
    case 'feeling':
      return { label: '🎭 Emotional Precision', className: 'b-scn' };
    case 'story_move':
      return { label: '📚 Story Craft', className: 'b-verb' };
    case 'pronounce':
      return { label: '🗣️ Pronunciation', className: 'b-word' };
    case 'say_it':
      return { label: '⏱️ Speech Pace', className: 'b-scn' };
    case 'breath':
      return { label: '🌬️ Composure Reset', className: 'b-breath' };
    case 'describe':
      return card.imagePath && card.imagePath.trim() !== ''
        ? { label: '🎨 Describe This', className: 'b-describe' }
        : { label: '🎬 Describe a Scene', className: 'b-describe' };
    case 'explain':
      return { label: '💡 60s Explainer', className: 'b-explain' };
    case 'teach_back':
      return { label: '🎓 Teach It Back', className: 'b-teach' };
    case 'situation':
      return { label: '🎙️ Situation', className: 'b-situation' };
    case 'teach':
      return { label: 'Teach', className: 'b-scn' };
    default: {
      const _exhaustive: never = card;
      throw new Error(`Unhandled badge for card type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export default function CardFace({
  card,
  isDetail = false,
  onToggleDetail,
  showSwipeHint = false,
  saved,
  onAgain,
  onGotIt,
  onSave,
  onSayMine,
}: CardFaceProps) {
  if (card.type === 'teach') {
    return (
      <TeachCardFace
        card={card}
        saved={saved}
        onAgain={onAgain}
        onGotIt={onGotIt}
        onSave={onSave}
        onSayMine={onSayMine}
      />
    );
  }

  const badge = getBadge(card);
  const skill = trackOf(card);
  const isLong = (text: string) => text.length > 14;

  const handleHearIt = (e: React.MouseEvent) => {
    e.stopPropagation();
    let textToSpeak = '';
    if (card.type === 'word' || card.type === 'pronounce' || card.type === 'feeling') {
      textToSpeak = card.term;
    } else if (card.type === 'idiom') {
      textToSpeak = card.phrase;
    } else if (card.type === 'phrase') {
      textToSpeak = card.strong;
    } else if (card.type === 'action_verb') {
      textToSpeak = card.verb;
    } else if (card.type === 'swap') {
      textToSpeak = card.answers[0] ?? card.weak;
    } else if (card.type === 'say_it') {
      textToSpeak = card.line;
    } else if (card.type === 'story_move') {
      textToSpeak = card.move;
    } else if (card.type === 'describe') {
      textToSpeak = card.prompt;
    } else if (card.type === 'explain') {
      textToSpeak = `${card.topic}. ${card.angle}`;
    } else if (card.type === 'teach_back') {
      textToSpeak = card.prompt;
    } else if (card.type === 'situation') {
      textToSpeak = card.prompt;
    }
    if (textToSpeak) {
      speak(textToSpeak, { lang: card.lang, rate: card.type === 'pronounce' ? 0.8 : 1.0 });
    }
  };

  const hasAudio = card.type !== 'breath';

  return (
    <article className={`fcard ${isDetail ? 'is-flipped' : ''}`} aria-label={`Card: ${card.id}`}>
      <div className="card-top-row">
        <span className="card-chips">
          <span className={`badge ${badge.className}`}>{badge.label}</span>
          <span className="teach-chip teach-chip-track" data-track={skill.track} data-testid="track-chip">
            {trackChipText(skill)}
          </span>
        </span>
        {hasAudio && (
          <button
            type="button"
            className="card-hear-btn tap"
            onClick={handleHearIt}
            aria-label="Hear pronunciation audio"
          >
            <VolumeIcon aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className="card-inner-body tap-flip-area"
        onClick={onToggleDetail}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleDetail?.();
          }
        }}
        tabIndex={0}
        role="region"
        aria-label="Card content (click to flip detail)"
      >
        {renderCardContent(card, isDetail, isLong)}
        <SkillParts skill={skill} />
      </div>

      <div className="hint" onClick={onToggleDetail}>
        {isDetail
          ? 'Tap card to flip back'
          : showSwipeHint
            ? 'Swipe up/right to advance · Tap for detail'
            : 'Tap for detail · Swipe to advance'}
      </div>
    </article>
  );
}

/**
 * v5: an old card that was reshaped carries a work example, an everyday
 * example and an analogy in its `skill` tag. They show under the card, in the
 * same labels the teach cards use. A card without them shows nothing extra.
 */
function SkillParts({ skill }: { skill: SkillTag }) {
  const { work, everyday, analogy } = skill;
  if (!work && !everyday && !analogy) return null;
  const labels = exampleLabels(skill.track);
  return (
    <div className="skill-parts" data-testid="skill-parts">
      {work && (
        <div className="block skill-example">
          <div className="lbl">{labels.work}</div>
          <div className="val teach-lines">{work}</div>
        </div>
      )}
      {everyday && (
        <div className="block skill-example">
          <div className="lbl">{labels.everyday}</div>
          <div className="val teach-lines">{everyday}</div>
        </div>
      )}
      {analogy && (
        <p className="teach-analogy">
          <span aria-hidden="true">💡 </span>
          {analogy}
        </p>
      )}
    </div>
  );
}

function renderCardContent(
  card: AnyCard,
  isDetail: boolean,
  isLong: (text: string) => boolean,
) {
  switch (card.type) {
    case 'word': {
      if (!isDetail) {
        return (
          <>
            <div className={`hero ${isLong(card.term) ? 'sm' : ''}`}>{card.term}</div>
            <div className="pos">{card.pos}</div>
            <div className="gloss">{card.meaning}</div>
            <div className="spacer" />
          </>
        );
      }
      return (
        <>
          <div className="hero sm card-hero-detail">{card.term}</div>
          <div className="block">
            <div className="lbl">Meaning</div>
            <div className="val">({card.pos}) {card.meaning}</div>
          </div>
          {card.examples && card.examples[0] && (
            <div className="quote">"{card.examples[0]}"</div>
          )}
          {card.examples && card.examples[1] && (
            <div className="block">
              <div className="lbl">In Conversation</div>
              <div className="val">{card.examples[1]}</div>
            </div>
          )}
          {card.say && (
            <div className="block">
              <div className="lbl">Say this</div>
              <div className="val card-say-highlight">{card.say}</div>
            </div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'idiom': {
      if (!isDetail) {
        return (
          <>
            <div className={`hero ${isLong(card.phrase) ? 'sm' : ''}`}>{card.phrase}</div>
            <div className="gloss">{card.meaning}</div>
            {card.scenario && (
              <div className="block card-scenario-block">
                <div className="lbl">When to use</div>
                <div className="val">{card.scenario}</div>
              </div>
            )}
            <div className="spacer" />
          </>
        );
      }
      return (
        <>
          <div className="hero sm card-hero-detail">{card.phrase}</div>
          <div className="block">
            <div className="lbl">Meaning</div>
            <div className="val">{card.meaning}</div>
          </div>
          <div className="block">
            <div className="lbl">Scenario</div>
            <div className="val">{card.scenario}</div>
          </div>
          <div className="quote">"{card.example}"</div>
          <div className="spacer" />
        </>
      );
    }

    case 'swap': {
      return (
        <>
          <div className="hero xs card-swap-weak">
            "{card.weak}"
          </div>
          <div className="card-swap-arrow" aria-hidden="true">
            ➔
          </div>
          <div className="hero xs card-swap-strong">
            "{card.answers[0]}"
          </div>
          {card.answers.length > 1 && (
            <div className="block card-options-block">
              <div className="lbl">Other strong options</div>
              <div className="val">{card.answers.slice(1).join(', ')}</div>
            </div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'phrase': {
      return (
        <>
          <div className="hero xs card-swap-weak">
            "{card.weak}"
          </div>
          <div className="card-swap-arrow" aria-hidden="true">
            ➔
          </div>
          <div className="hero xs card-swap-strong">
            "{card.strong}"
          </div>
          <div className="block card-phrase-why-block">
            <div className="lbl">Why it lands</div>
            <div className="val">{card.why}</div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'feeling': {
      return (
        <>
          <div className={`hero ${isLong(card.term) ? 'sm' : ''}`}>{card.term}</div>
          <div className="gloss">{card.meaning}</div>
          <div className="block card-scenario-block">
            <div className="lbl">Instead of reaching for</div>
            <div className="val card-contrast-highlight">{card.contrast}</div>
          </div>
          <div className="quote">"{card.example}"</div>
          <div className="spacer" />
        </>
      );
    }

    case 'story_move': {
      return (
        <>
          <div className="hero xs card-story-move-title">{card.move}</div>
          <div className="block">
            <div className="lbl">The move</div>
            <div className="val">{card.why}</div>
          </div>
          <div className="quote">"{card.example}"</div>
          {card.heardIn && (
            <div className="block">
              <div className="lbl">Heard in</div>
              <div className="val">{card.heardIn}</div>
            </div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'action_verb': {
      return (
        <>
          <div className={`hero ${isLong(card.verb) ? 'sm' : ''}`}>{card.verb}</div>
          <div className="gloss">{card.meaning}</div>
          <div className="block card-action-contrast-block">
            <div className="lbl">Contrast</div>
            <div className="val">{card.contrast}</div>
          </div>
          {card.examples && card.examples[0] && (
            <div className="quote">"{card.examples[0]}"</div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'pronounce': {
      const parts = card.syllables.split('·');
      return (
        <>
          <div className={`hero ${isLong(card.term) ? 'sm' : ''}`}>{card.term}</div>
          <div className="syllables card-syllables-box">
            {parts.map((s, i) => (
              <span key={i}>
                {i > 0 && <span className="syllables-dot"> · </span>}
                <span className={i === card.stressIndex ? 'stressed' : 'unstressed'}>{s}</span>
              </span>
            ))}
          </div>
          {card.commonError && (
            <div className="block card-pronounce-error-block">
              <div className="lbl">Watch out for</div>
              <div className="val card-danger-highlight">{card.commonError}</div>
            </div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'say_it': {
      return (
        <>
          <div className="quote card-sayit-quote">
            "{card.marked}"
          </div>
          <div className="block card-options-block">
            <div className="lbl">Target cadence</div>
            <div className="val">~{card.targetWpm} words per minute with pauses at / and //</div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'breath': {
      return (
        <>
          <div className="hero sm card-hero-detail">{card.title}</div>
          <div className="pos">Format: {card.drill.toUpperCase()} Drill</div>
          <div className="block card-options-block">
            <div className="lbl">Technique Cues</div>
            <ol className="card-breath-steps">
              {card.instructions.map((step, idx) => (
                <li key={idx} className="card-breath-step-item">
                  {step}
                </li>
              ))}
            </ol>
          </div>
          {card.durationSec && (
            <div className="block">
              <div className="lbl">Target Duration</div>
              <div className="val">{card.durationSec} seconds</div>
            </div>
          )}
          <div className="spacer" />
        </>
      );
    }

    case 'describe': {
      return (
        <>
          {card.imagePath && (
            <div className="card-describe-image-box">
              <img
                src={card.imagePath}
                alt={card.alt}
                className="card-describe-image"
                loading="lazy"
              />
            </div>
          )}
          <div className="hero xs card-describe-prompt">{card.prompt}</div>
          <div className="block card-describe-beats-block">
            <div className="lbl">Key Observation Beats</div>
            <ul className="card-beats-list">
              {card.beats.map((beat, idx) => (
                <li key={idx}>{beat}</li>
              ))}
            </ul>
          </div>
          <div className="block card-describe-vocab-block">
            <div className="lbl">Target Vocabulary</div>
            <div className="card-vocab-chips">
              {card.targetVocab.map((v, i) => (
                <span key={i} className="card-vocab-chip">
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'explain': {
      return (
        <>
          <div className="hero sm card-hero-detail">{card.topic}</div>
          <div className="gloss">{card.angle}</div>
          <div className="block card-describe-beats-block">
            <div className="lbl">Structural Beats</div>
            <ol className="card-beats-list">
              {card.beats.map((beat, idx) => (
                <li key={idx}>{beat}</li>
              ))}
            </ol>
          </div>
          <div className="block card-describe-vocab-block">
            <div className="lbl">Recommended Terms</div>
            <div className="card-vocab-chips">
              {card.targetVocab.map((v, i) => (
                <span key={i} className="card-vocab-chip">
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'teach_back': {
      return (
        <>
          <div className="hero xs card-describe-prompt">{card.prompt}</div>
          <div className="block card-describe-beats-block">
            <div className="lbl">Recall Structure</div>
            <ol className="card-beats-list">
              {card.beats.map((beat, idx) => (
                <li key={idx}>{beat}</li>
              ))}
            </ol>
          </div>
          <div className="block">
            <div className="lbl">Target Time</div>
            <div className="val">Deliver smoothly in ~{card.targetSec} seconds</div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'situation': {
      return (
        <>
          <div className="hero xs card-describe-prompt">{card.title}</div>
          <div className="meaning">{card.prompt}</div>
          <div className="block card-describe-beats-block">
            <div className="lbl">Structure</div>
            <ol className="card-beats-list">
              {card.beats.map((beat, idx) => (
                <li key={idx}>{beat}</li>
              ))}
            </ol>
          </div>
          {card.targetVocab.length > 0 && (
            <div className="block card-describe-vocab-block">
              <div className="lbl">Worth using</div>
              <div className="card-vocab-chips">
                {card.targetVocab.map((v, i) => (
                  <span key={i} className="card-vocab-chip">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="block">
            <div className="lbl">Target Time</div>
            <div className="val">Speak for ~{card.targetSec} seconds</div>
          </div>
          <div className="spacer" />
        </>
      );
    }

    case 'teach':
      return null; // drawn by TeachCardFace before we get here

    default: {
      const _exhaustive: never = card;
      throw new Error(`Unhandled card type in CardFace: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
