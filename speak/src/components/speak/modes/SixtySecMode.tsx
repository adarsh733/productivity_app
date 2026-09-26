import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import { useStoryMoveCards, useTryWords } from '../../../features/speak/useModeCards';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

export interface SixtySecModeProps {
  onClose: () => void;
}

export default function SixtySecMode({ onClose }: SixtySecModeProps) {
  const moves = useStoryMoveCards();
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const story = moves.current;
  const tryWords = useTryWords();

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
    moves.next();
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={story ? `Story: ${story.move}` : '60-Second Story'}
        promptText={story ? `${story.move} — ${story.why}` : 'Tell a 60-second story.'}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        onDone={onClose}
        onRedo={handleRedo}
      />
    );
  }

  if (!moves.ready) {
    return (
      <div className="speak-drill-runner">
        <p className="sub">Loading story moves…</p>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="speak-drill-runner">
        <header className="speak-drill-header">
          <div className="speak-drill-title-group">
            <span className="badge b-verb">60s Story</span>
            <h2>No prompts yet</h2>
          </div>
          <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
        </header>
        <p className="sub">Story prompts are on their way — check back soon.</p>
        <button type="button" className="prim tap" onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-verb">60s Story ({moves.count})</span>
          <h2>{story.move}</h2>
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
        durationSec={60}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content compact">
              Apply this move in a 60 s story: {story.move}
            </p>
            <p className="sub">{story.why}</p>
            {tryWords.length > 0 && (
              <p className="sub">Try to use: {tryWords.join(', ')}</p>
            )}
            {story.example && <p className="sub">Heard in: {story.example}</p>}
            <small className="speak-prompt-hint">
              15s Hook → 30s Turning Point → 15s Punchy Landing.
            </small>
          </div>
        }
      />
    </div>
  );
}
