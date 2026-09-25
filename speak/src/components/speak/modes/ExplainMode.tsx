import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import { useExplainCards } from '../../../features/speak/useModeCards';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

/** Explain an idea in 60 s — primer first (read it), then angle, beats, timer. */
export default function ExplainMode({ onClose }: { onClose: () => void }) {
  const explains = useExplainCards();
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const card = explains.current;

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
    explains.next();
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={card ? `Explain: ${card.topic}` : 'Explain an idea'}
        promptText={card?.angle ?? 'Explain one idea in 60 seconds.'}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        targetVocab={card?.targetVocab}
        targetVocabMatches={completed.result?.targetVocabMatches?.matched}
        onDone={onClose}
        onRedo={handleRedo}
      />
    );
  }

  if (!explains.ready) {
    return (
      <div className="speak-drill-runner">
        <p className="sub">Loading ideas…</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="speak-drill-runner">
        <header className="speak-drill-header">
          <div className="speak-drill-title-group">
            <span className="badge b-verb">Explain</span>
            <h2>No prompts yet</h2>
          </div>
          <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
        </header>
        <p className="sub">No prompts yet — pick any idea you learned this week and explain it in 60 seconds.</p>
        <button type="button" className="prim tap" onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-verb">Explain ({explains.count})</span>
          <h2>{card.topic}</h2>
        </div>
        <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
      </header>
      <AudioRecorder
        durationSec={60}
        targetVocab={card.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            {card.primer && (
              <div className="speak-incident-situation">
                <b>Read first:</b>
                <p>{card.primer}</p>
              </div>
            )}
            <p className="speak-prompt-content compact">{card.angle}</p>
            <div className="speak-story-anchors">
              {card.beats.map((b, i) => (
                <div key={i} className="speak-anchor-pill">
                  {i + 1}. {b}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">60 s timer. Cover the three beats.</small>
          </div>
        }
      />
    </div>
  );
}
