import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

const SCENARIOS = [
  {
    id: 'pushback-scope',
    title: 'Pushing Back on Scope Creep',
    situation: 'A product manager requests adding three new features 4 days before release without shifting the deadline.',
    challenge: 'Politely reject the addition while proposing a structured phase-two follow-up.',
    targetVocab: ['trade-off', 'bandwidth', 'milestone', 'prioritize'],
  },
  {
    id: 'outage-update',
    title: 'Executive Outage Briefing',
    situation: 'Payment processing dropped by 40% due to an upstream database lock issue.',
    challenge: 'Explain the root cause, immediate mitigation, and permanent fix in 45 seconds without panic.',
    targetVocab: ['mitigation', 'root cause', 'stability', 'failover'],
  },
  {
    id: 'feedback-junior',
    title: 'Constructive Code Review Pushback',
    situation: 'A peer submitted a 2,000-line PR that bypasses core architectural layers.',
    challenge: 'Ask them to decompose the PR respectfully while explaining the risk of unisolated state.',
    targetVocab: ['decouple', 'maintainability', 'incremental', 'isolate'],
  },
];

export interface IncidentModeProps {
  onClose: () => void;
}

export default function IncidentMode({ onClose }: IncidentModeProps) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const scenario = SCENARIOS[scenarioIndex % SCENARIOS.length]!;

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
    setScenarioIndex((i) => i + 1);
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={`Incident: ${scenario.title}`}
        promptText={`${scenario.situation} Challenge: ${scenario.challenge}`}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        targetVocab={scenario.targetVocab}
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
          <span className="badge b-scn">💼 Incident Rep (45s)</span>
          <h2>{scenario.title}</h2>
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
        durationSec={45}
        targetVocab={scenario.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <div className="speak-incident-situation">
              <b>Situation:</b>
              <p>{scenario.situation}</p>
            </div>
            <div className="speak-incident-challenge">
              <b>Your Challenge:</b>
              <p>{scenario.challenge}</p>
            </div>
            <small className="speak-prompt-hint">
              Keep your delivery measured, concise, and executive-ready.
            </small>
          </div>
        }
      />
    </div>
  );
}
