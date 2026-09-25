import { useState } from 'react';
import type { Card } from '../../../types/contract';
import { GAMIFICATION } from '../../../types/contract';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

const DEFAULT_PROMPTS = [
  'Describe how you handle unexpected technical roadblocks in a team meeting.',
  'Explain the single most important metric for your project to a stakeholder.',
  'Pitch a refactoring initiative that reduces tech debt without stopping features.',
  'Give a 30-second summary of why a recent project decision was the right call.',
];

export interface RapidRepModeProps {
  initialCard?: Card | null;
  onClose: () => void;
}

export default function RapidRepMode({ initialCard, onClose }: RapidRepModeProps) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  // Extract prompt text and target vocab from initialCard if passed
  const getPromptDetails = () => {
    if (!initialCard) {
      return {
        title: 'Rapid Speaking Rep',
        prompt: DEFAULT_PROMPTS[promptIndex % DEFAULT_PROMPTS.length]!,
        targetVocab: undefined,
      };
    }

    switch (initialCard.type) {
      case 'word':
      case 'feeling':
        return {
          title: `Drill: ${initialCard.term}`,
          prompt: `Use the word "${initialCard.term}" naturally in a professional sentence. (${initialCard.meaning})`,
          targetVocab: [initialCard.term],
        };
      case 'pronounce':
        return {
          title: `Drill: ${initialCard.term}`,
          prompt: `Pronounce and use "${initialCard.term}" (${initialCard.syllables}) naturally in a fluent sentence.`,
          targetVocab: [initialCard.term],
        };
      case 'idiom':
        return {
          title: `Drill: ${initialCard.phrase}`,
          prompt: `Use the idiom "${initialCard.phrase}" in a business context: ${initialCard.scenario || initialCard.meaning}`,
          targetVocab: [initialCard.phrase],
        };
      case 'swap':
        return {
          title: `Swap Drill: "${initialCard.weak}"`,
          prompt: `Instead of saying "${initialCard.weak}", speak a strong alternative like "${initialCard.answers[0]}" with confidence.`,
          targetVocab: initialCard.answers,
        };
      case 'phrase':
        return {
          title: 'Executive Phrasing Drill',
          prompt: `Deliver: "${initialCard.strong}" — ${initialCard.why}`,
          targetVocab: [initialCard.strong],
        };
      case 'say_it':
        return {
          title: 'Cadence & Pace Drill',
          prompt: initialCard.line,
          targetVocab: undefined,
        };
      case 'describe':
        return {
          title: 'Describe Drill',
          prompt: initialCard.prompt,
          targetVocab: initialCard.targetVocab,
        };
      case 'explain':
        return {
          title: `Explain: ${initialCard.topic}`,
          prompt: initialCard.angle,
          targetVocab: initialCard.targetVocab,
        };
      case 'action_verb':
        return {
          title: `Drill: ${initialCard.verb}`,
          prompt: `Use "${initialCard.verb}" in a sentence about your commute. (${initialCard.meaning} — not ${initialCard.contrast})`,
          targetVocab: [initialCard.verb],
        };
      case 'story_move':
        return {
          title: 'Story Move Drill',
          prompt: `Apply this move in a 30 s story: ${initialCard.move} — ${initialCard.why}`,
          targetVocab: undefined,
        };
      case 'teach_back':
        return {
          title: 'Teach-Back Drill',
          prompt: `${initialCard.prompt} Cover: ${initialCard.beats.join(' → ')} (${initialCard.targetSec}s)`,
          targetVocab: undefined,
        };
      case 'breath':
        return {
          title: initialCard.title,
          prompt: `${initialCard.instructions[0] ?? initialCard.title} — breath drills now live inside the voice routine (Speak tab).`,
          targetVocab: undefined,
        };
      case 'situation':
        return {
          title: initialCard.title,
          prompt: `${initialCard.prompt} Cover: ${initialCard.beats.join(' → ')}`,
          targetVocab: initialCard.targetVocab,
        };
      default:
        return {
          title: 'Rapid Speaking Rep',
          prompt: 'Speak continuously and fluently on your immediate goal for 30 seconds.',
          targetVocab: undefined,
        };
    }
  };

  const details = getPromptDetails();

  const handleComplete = (
    audio: CapturedAudio | null,
    elapsedSec: number,
    transcript?: string,
    result?: SpeakingAttemptResult,
  ) => {
    setCompleted({ audio, elapsedSec, transcript, result });
  };

  const handleRedo = () => {
    setCompleted(null);
    setPromptIndex((i) => i + 1);
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={details.title}
        promptText={details.prompt}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        cardId={initialCard?.id}
        cardType={initialCard?.type}
        targetVocab={details.targetVocab}
        targetVocabMatches={completed.result?.targetVocabMatches?.matched}
        onDone={onClose}
        onRedo={handleRedo}
      />
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-scn">⚡ Rapid Rep (30s)</span>
          <h2>{details.title}</h2>
        </div>
        <button
          type="button"
          className="deck-modal-close-btn tap"
          onClick={onClose}
          aria-label="Close drill"
        >
          ✕
        </button>
      </header>

      <AudioRecorder
        durationSec={30}
        targetVocab={details.targetVocab}
        cardLang={initialCard?.lang}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <span className="speak-prompt-label">Prompt</span>
            <p className="speak-prompt-content">{details.prompt}</p>
            <small className="speak-prompt-hint">
              Continuous stream of speech · Zero hesitation · Clean landing.
            </small>
          </div>
        }
      />
    </div>
  );
}
