import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

const SCENES = [
  {
    id: 'rainy-cafe',
    title: 'Bengaluru Monsoon Cafe',
    focus: 'A warm, crowded coffee shop during a sudden monsoon downpour. Laptop screens glowing, steam rising, rain drumming on the glass.',
    hints: ['Sound of torrential rain on glass', 'Rich aroma of roasted coffee', 'Engineers huddled over laptop screens'],
    targetVocab: ['torrential', 'aroma', 'ambient', 'huddled'],
  },
  {
    id: 'midnight-dc',
    title: 'Midnight Data Center',
    focus: 'Cold aisle in a server farm. Blinking green LEDs, freezing blast from HVAC cooling vents, hum of thousands of hard drives.',
    hints: ['Bone-chilling air current', 'Hypnotic pulse of green fiber LEDs', 'Mechanical hum of cooling blowers'],
    targetVocab: ['rhythmic', 'chilled', 'hypnotic', 'hum'],
  },
  {
    id: 'airport-dawn',
    title: 'Airport Terminal at Dawn',
    focus: 'Terminal 2 at 5:30 AM. Polished stone floors reflecting orange dawn light, soft chime of gate announcements, hurried footsteps.',
    hints: ['Golden morning light through floor-to-ceiling glass', 'Distant chime of flight calls', 'Quiet choreography of sleepy travelers'],
    targetVocab: ['choreography', 'golden', 'stride', 'echoing'],
  },
];

export interface DescribeModeProps {
  onClose: () => void;
}

export default function DescribeMode({ onClose }: DescribeModeProps) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const scene = SCENES[sceneIndex % SCENES.length]!;

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
    setSceneIndex((i) => i + 1);
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.describeRep}
        drillTitle={`Describe: ${scene.title}`}
        promptText={scene.focus}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        isDescribe
        targetVocab={scene.targetVocab}
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
          <span className="badge b-verb">🎨 Describe This</span>
          <h2>{scene.title}</h2>
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
        targetVocab={scene.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content compact">
              {scene.focus}
            </p>
            <div className="speak-story-anchors">
              {scene.hints.map((h, i) => (
                <div key={i} className="speak-anchor-pill">
                  • {h}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">
              Paint the visual details using concrete sensory words. (+25 XP)
            </small>
          </div>
        }
      />
    </div>
  );
}
