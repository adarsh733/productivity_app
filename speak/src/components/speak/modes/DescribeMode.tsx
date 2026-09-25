import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import { useDescribeCards } from '../../../features/speak/useModeCards';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

export interface DescribeModeProps {
  onClose: () => void;
}

export default function DescribeMode({ onClose }: DescribeModeProps) {
  const describe = useDescribeCards();
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const scene = describe.current;

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
    describe.next();
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.describeRep}
        drillTitle={scene ? `Describe: ${scene.title ?? 'this scene'}` : 'Describe This'}
        promptText={scene?.prompt ?? 'Describe what you see.'}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        isDescribe
        targetVocab={scene?.targetVocab}
        targetVocabMatches={completed.result?.targetVocabMatches?.matched}
        onDone={onClose}
        onRedo={handleRedo}
      />
    );
  }

  if (!describe.ready) {
    return (
      <div className="speak-drill-runner">
        <p className="sub">Loading scenes…</p>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="speak-drill-runner">
        <header className="speak-drill-header">
          <div className="speak-drill-title-group">
            <span className="badge b-verb">Describe This</span>
            <h2>No prompts yet</h2>
          </div>
          <button type="button" className="deck-modal-close-btn tap" onClick={onClose} aria-label="Close drill">✕</button>
        </header>
        <p className="sub">Scene prompts are on their way — check back soon.</p>
        <button type="button" className="prim tap" onClick={onClose}>Back</button>
      </div>
    );
  }

  const hasImage = Boolean(scene.imagePath && scene.imagePath.trim() !== '');

  return (
    <div className="speak-drill-runner">
      <header className="speak-drill-header">
        <div className="speak-drill-title-group">
          <span className="badge b-verb">Describe This ({describe.count})</span>
          <h2>{scene.title ?? 'Describe this scene'}</h2>
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
        durationSec={scene.targetSec}
        targetVocab={scene.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            {hasImage ? (
              <img src={scene.imagePath} alt={scene.alt} className="speak-scene-image" />
            ) : (
              <div className="speak-scene-text" role="img" aria-label={scene.alt}>
                {scene.title && <b>{scene.title}</b>}
                {scene.scene && <p>{scene.scene}</p>}
              </div>
            )}
            <p className="speak-prompt-content compact">{scene.prompt}</p>
            <div className="speak-story-anchors">
              {scene.beats.map((h, i) => (
                <div key={i} className="speak-anchor-pill">
                  • {h}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">
              Paint the details using concrete sensory words. (+25 XP)
            </small>
          </div>
        }
      />
    </div>
  );
}
