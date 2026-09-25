import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

/** Explain an idea in 60 s. Stage 5 replaces the hard-coded fallback with explain cards. */
export default function ExplainMode({ onClose }: { onClose: () => void }) {
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
        drillTitle="Explain an idea"
        promptText="Explain one idea in 60 seconds."
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
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
          <span className="badge b-verb">Explain (60s)</span>
          <h2>Explain an idea</h2>
        </div>
        <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
      </header>
      <AudioRecorder
        durationSec={60}
        onComplete={(audio, elapsedSec, transcript, result) => setCompleted({ audio, elapsedSec, transcript, result })}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content">No prompts yet — pick any idea you learned this week and explain it in 60 seconds.</p>
          </div>
        }
      />
    </div>
  );
}
