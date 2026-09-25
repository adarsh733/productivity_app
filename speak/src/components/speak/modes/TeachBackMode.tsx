import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

/** Teach it back. Stage 5 replaces the fallback with teach_back cards. */
export default function TeachBackMode({ onClose }: { onClose: () => void }) {
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle="Teach it back"
        promptText="Teach back something you learned, in your own words."
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        recordingId={completed.result?.id}
        onDone={onClose}
        onRedo={() => setCompleted(null)}
      />
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-verb">Teach-back</span>
          <h2>Teach it back</h2>
        </div>
        <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
      </header>
      <AudioRecorder
        durationSec={60}
        onComplete={(audio, elapsedSec, transcript, result) => setCompleted({ audio, elapsedSec, transcript, result })}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content">No prompts yet — teach back one thing you learned recently, as if to a friend.</p>
          </div>
        }
      />
    </div>
  );
}
