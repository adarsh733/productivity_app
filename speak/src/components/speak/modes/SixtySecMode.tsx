import { useState } from 'react';
import type { CapturedAudio } from '../../../features/reset/useMissionAudio';
import type { SpeakingAttemptResult } from '../../../features/speak/useSpeakingAttempt';
import { GAMIFICATION } from '../../../types/contract';
import AudioRecorder from '../AudioRecorder';
import PlaybackReview from '../PlaybackReview';

const STORIES = [
  {
    id: 'first-production-bug',
    title: 'Your First Production Outage',
    hook: 'The moment you realized a change you pushed took down production.',
    anchors: ['The sinking feeling when alarms went off', 'How you isolated the issue', 'The lesson that changed how you test code'],
    targetVocab: ['catastrophic', 'mitigation', 'root cause', 'retrospective'],
  },
  {
    id: 'disagree-and-commit',
    title: 'A Technical Disagreement That Paid Off',
    hook: 'A time you strongly disagreed on a technical choice but aligned with the team.',
    anchors: ['The core tradeoff at stake', 'Why you decided to commit', 'How the outcome proved or changed your mind'],
    targetVocab: ['compromise', 'consensus', 'compounding', 'alignment'],
  },
  {
    id: 'underestimated-task',
    title: 'The "One Line Change" That Took Two Weeks',
    hook: 'A task that looked trivial on Monday and consumed the entire sprint.',
    anchors: ['Initial misleading simplicity', 'The rabbit hole of hidden complexity', 'The clean resolution in the end'],
    targetVocab: ['unravel', 'deceptively', 'legacy', 'modular'],
  },
];

export interface SixtySecModeProps {
  onClose: () => void;
}

export default function SixtySecMode({ onClose }: SixtySecModeProps) {
  const [storyIndex, setStoryIndex] = useState(0);
  const [completed, setCompleted] = useState<{
    audio: CapturedAudio | null;
    elapsedSec: number;
    transcript?: string;
    result?: SpeakingAttemptResult;
  } | null>(null);

  const story = STORIES[storyIndex % STORIES.length]!;

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
    setStoryIndex((i) => i + 1);
  };

  if (completed) {
    return (
      <PlaybackReview
        audio={completed.audio}
        elapsedSec={completed.elapsedSec}
        xpReward={GAMIFICATION.XP.spokenRep}
        drillTitle={`Story: ${story.title}`}
        promptText={story.hook}
        transcript={completed.transcript}
        wpm={completed.result?.wpm}
        pauseCount={completed.result?.pauseCount}
        avgDb={completed.result?.avgDb}
        voicedSec={completed.result?.voicedSec}
        pctAboveBand={completed.result?.pctAboveBand}
        recordingId={completed.result?.id}
        targetVocab={story.targetVocab}
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
          <span className="badge b-verb">📚 60s Story Structure</span>
          <h2>{story.title}</h2>
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
        targetVocab={story.targetVocab}
        onComplete={handleComplete}
        onCancel={onClose}
        promptNode={
          <div className="speak-prompt-box">
            <p className="speak-prompt-content compact">
              {story.hook}
            </p>
            <div className="speak-story-anchors">
              {story.anchors.map((a, i) => (
                <div key={i} className="speak-anchor-pill">
                  {i + 1}. {a}
                </div>
              ))}
            </div>
            <small className="speak-prompt-hint">
              15s Hook → 30s Turning Point → 15s Punchy Landing.
            </small>
          </div>
        }
      />
    </div>
  );
}
