import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import type { SituationKind } from '../../../types/contract';
import { useSituationCards } from '../../../features/speak/useModeCards';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

const KINDS: Array<{ id: SituationKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'incident', label: 'Incident' },
  { id: 'office_call', label: 'Office call' },
  { id: 'feeling', label: 'Feeling' },
  { id: 'opinion', label: 'Opinion' },
  { id: 'life_story', label: 'Life story' },
];

export interface IncidentModeProps {
  onClose: () => void;
}

export default function IncidentMode({ onClose }: IncidentModeProps) {
  const situations = useSituationCards('all');
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const scenario = situations.current;

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
    situations.next();
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={scenario ? `Situation: ${scenario.title}` : 'Situations'}
        promptText={scenario?.prompt ?? 'Tell a real story from your week.'}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        cardId={scenario?.id}
        cardType="situation"
        targetVocab={scenario?.targetVocab}
        targetVocabMatches={completed.result?.targetVocabMatches?.matched}
        onDone={onClose}
        onRedo={handleRedo}
      />
    );
  }

  if (!situations.ready) {
    return (
      <div className="speak-drill-runner">
        <p className="sub">Loading situations…</p>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="speak-drill-runner">
        <header className="speak-drill-header">
          <div className="speak-drill-title-group">
            <span className="badge b-scn">Situations</span>
            <h2>No prompts yet</h2>
          </div>
          <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
        </header>
        <p className="sub">Situation prompts are on their way — check back soon. Browsing still works fully.</p>
        <button type="button" className="prim tap" onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-scn">Situations ({situations.count})</span>
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

      <div className="chips" role="group" aria-label="Situation kind">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`chip tap${situations.kind === k.id ? ' on' : ''}`}
            aria-pressed={situations.kind === k.id}
            onClick={() => situations.setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <AudioRecorder
        durationSec={scenario.targetSec}
        targetVocab={scenario.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <div className="speak-incident-situation">
              <b>Talk about:</b>
              <p>{scenario.prompt}</p>
            </div>
            <div className="speak-story-anchors">
              {scenario.beats.map((b, i) => (
                <div key={i} className="speak-anchor-pill">
                  {i + 1}. {b}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">
              Speak for ~{scenario.targetSec}s. Keep it measured and executive-ready.
            </small>
          </div>
        }
      />
    </div>
  );
}
