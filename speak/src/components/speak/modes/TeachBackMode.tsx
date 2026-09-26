import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import { useTeachBackCards, useTryWords } from '../../../features/speak/useModeCards';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

/** Teach it back — teach_back cards from the database. */
export default function TeachBackMode({ onClose }: { onClose: () => void }) {
  const teach = useTeachBackCards();
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const card = teach.current;
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
    teach.next();
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle="Teach it back"
        promptText={card?.prompt ?? 'Teach back something you learned.'}
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

  if (!teach.ready) {
    return (
      <div className="speak-drill-runner">
        <p className="sub">Loading teach-backs…</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="speak-drill-runner">
        <header className="speak-drill-header">
          <div className="speak-drill-title-group">
            <span className="badge b-verb">Teach-back</span>
            <h2>No prompts yet</h2>
          </div>
          <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
        </header>
        <p className="sub">No prompts yet — teach back one thing you learned recently, as if to a friend.</p>
        <button type="button" className="prim tap" onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-verb">Teach-back ({teach.count})</span>
          <h2>Teach it back</h2>
        </div>
        <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
      </header>
      <AudioRecorder
        durationSec={card.targetSec}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content">{card.prompt}</p>
            {tryWords.length > 0 && (
              <p className="sub">Try to use: {tryWords.join(', ')}</p>
            )}
            <div className="speak-story-anchors">
              {card.beats.map((b, i) => (
                <div key={i} className="speak-anchor-pill">
                  {i + 1}. {b}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">~{card.targetSec}s. Cover the three beats.</small>
          </div>
        }
      />
    </div>
  );
}
