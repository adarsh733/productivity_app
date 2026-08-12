import { useState } from 'react';

const LADDER_STEPS = [
  { level: 1, label: 'Level 1: Soft Whisper', desc: 'Minimal air pressure, close range' },
  { level: 2, label: 'Level 2: Quiet Conversational', desc: 'Relaxed 1-on-1 office tone' },
  { level: 3, label: 'Level 3: Target Resonant', desc: 'Default clear professional register' },
  { level: 4, label: 'Level 4: Projecting', desc: 'Addressing a 10-person meeting table' },
  { level: 5, label: 'Level 5: Full Projection', desc: 'Auditorium tone without strain' },
];

const SAMPLE_SENTENCES = [
  'We can review the release metrics during tomorrow morning call.',
  'Let us summarize the key points before moving to the next item.',
  'I will send the revised documentation by the end of the day.',
];

export default function VolumeLadder() {
  const [stepIndex, setStepIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [loggedLevel, setLoggedLevel] = useState<number | null>(null);

  const currentStep = LADDER_STEPS[stepIndex]!;
  const currentSentence = SAMPLE_SENTENCES[sentenceIndex]!;

  const handleNext = () => {
    setLoggedLevel(null);
    setStepIndex((i) => (i + 1) % LADDER_STEPS.length);
  };

  const handleNextSentence = () => {
    setSentenceIndex((i) => (i + 1) % SAMPLE_SENTENCES.length);
  };

  return (
    <div className="ladder-card">
      <header className="ladder-header">
        <h2 className="ladder-title">Volume Ladder Trainer</h2>
        <span className="ladder-badge">Step {currentStep.level} / 5</span>
      </header>

      <p className="ladder-desc">
        Practice dynamic volume modulation without falling back into habitual over-drive.
      </p>

      <div className="ladder-prompt-box">
        <div className="ladder-level-label">{currentStep.label}</div>
        <p className="ladder-level-desc">{currentStep.desc}</p>
        <blockquote className="ladder-sentence">&ldquo;{currentSentence}&rdquo;</blockquote>
      </div>

      <div className="ladder-actions">
        <button
          type="button"
          className="btn btn-ghost tap"
          onClick={handleNextSentence}
        >
          New Line
        </button>

        <button
          type="button"
          className="btn btn-primary tap"
          onClick={() => setLoggedLevel(currentStep.level)}
        >
          I Spoke Level {currentStep.level}
        </button>
      </div>

      {loggedLevel !== null && (
        <div className="ladder-feedback">
          <p className="feedback-text">
            Level {loggedLevel} recorded! Move to Level {(loggedLevel % 5) + 1}.
          </p>
          <button type="button" className="btn btn-ghost tap" onClick={handleNext}>
            Next Level →
          </button>
        </div>
      )}
    </div>
  );
}
