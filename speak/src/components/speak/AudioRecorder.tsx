import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedAudio } from '../../features/reset/useMissionAudio';
import { useSpeakingAttempt, type SpeakingAttemptResult } from '../../features/speak/useSpeakingAttempt';

export interface AudioRecorderProps {
  durationSec: number;
  targetVocab?: string[];
  promptNode?: React.ReactNode;
  cardLang?: 'en' | 'hi';
  onComplete: (
    audio: CapturedAudio | null,
    elapsedSec: number,
    transcript?: string,
    result?: SpeakingAttemptResult,
  ) => void;
  onCancel: () => void;
}

export type RecorderState = 'idle' | 'recording' | 'processing' | 'cancelled' | 'error';

export default function AudioRecorder({
  durationSec,
  targetVocab,
  promptNode,
  cardLang,
  onComplete,
  onCancel,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [volumePercent, setVolumePercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const attempt = useSpeakingAttempt({
    durationSec,
    targetVocab,
    cardLang,
    onComplete: (result: SpeakingAttemptResult) => {
      setState('processing');
      onComplete(result.audio, result.durationSec, result.transcript, result);
    },
  });

  const timerRef = useRef<number | null>(null);

  // Sync state
  useEffect(() => {
    if (attempt.state === 'recording') {
      setState('recording');
      setElapsedSec(attempt.elapsedSec);
      setVolumePercent(attempt.volumePercent);
    } else if (attempt.state === 'error') {
      setState('error');
      setError(attempt.error ?? 'Microphone is blocked.');
    }
  }, [attempt.state, attempt.elapsedSec, attempt.volumePercent, attempt.error]);

  const handleStart = async () => {
    setError(null);
    const ok = await attempt.start();
    if (!ok) {
      setError(attempt.error ?? 'Could not access microphone.');
      setState('error');
    }
  };

  const handleStop = useCallback(async () => {
    setState('processing');
    if (timerRef.current) clearInterval(timerRef.current);
    await attempt.stop();
  }, [attempt]);

  const handleCancel = () => {
    setState('cancelled');
    if (timerRef.current) clearInterval(timerRef.current);
    attempt.cancel();
    onCancel();
  };

  const remaining = Math.max(0, durationSec - elapsedSec);

  return (
    <div className="audio-recorder-container">
      {/* Always keep prompt and target words visible while recording */}
      {promptNode && <div className="audio-recorder-prompt">{promptNode}</div>}

      {targetVocab && targetVocab.length > 0 && (
        <div className="audio-recorder-target-vocab">
          <span className="audio-recorder-vocab-label">
            Target words:
          </span>
          <div className="audio-recorder-vocab-list">
            {targetVocab.map((word) => (
              <span
                key={word}
                className="badge b-word audio-recorder-vocab-chip"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="audio-recorder-controls">
        {(state === 'idle' || state === 'cancelled') && (
          <div className="audio-recorder-ready">
            <div className="audio-recorder-guide">
              <span className="g" aria-hidden="true">
                🎙️
              </span>
              <p>
                Speak naturally when ready. Timer runs for <b>{durationSec}s</b>.
              </p>
            </div>
            {error && <p className="audio-recorder-error">{error}</p>}
            <button
              type="button"
              className="prim tap audio-recorder-start-btn"
              onClick={() => void handleStart()}
              aria-label="Start speaking and recording"
            >
              Start speaking
            </button>
            <button
              type="button"
              className="audio-recorder-cancel-btn tap"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="audio-recorder-ready">
            <p className="audio-recorder-error" role="alert">
              {error ?? 'Microphone is blocked.'}
            </p>
            <p className="sub">
              You can keep browsing — the mic is never required. To enable it: iOS
              Settings › Safari › Microphone › Allow.
            </p>
            <button
              type="button"
              className="prim tap audio-recorder-start-btn"
              onClick={() => void handleStart()}
            >
              Try again
            </button>
            <button
              type="button"
              className="audio-recorder-cancel-btn tap"
              onClick={handleCancel}
            >
              Back
            </button>
          </div>
        )}

        {state === 'recording' && (
          <div className="audio-recorder-active">
            <div className="audio-recorder-timer-display">
              <span className="audio-recorder-pulse-dot" aria-hidden="true" />
              <span className="audio-recorder-remaining">{remaining}s</span>
              <span className="audio-recorder-elapsed">({elapsedSec}s elapsed)</span>
            </div>

            {/* Real audio meter driven by Web Audio analyser */}
            <div className="audio-recorder-meter" role="progressbar" aria-label="Microphone volume level" aria-valuenow={volumePercent} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="audio-recorder-meter-bar"
                style={{ width: `${Math.max(volumePercent, 2)}%` }}
              />
            </div>

            {/* Live speech transcription display */}
            {attempt.transcript ? (
              <div className="audio-recorder-transcript-live">
                <span className="audio-recorder-transcript-label">Transcribed so far:</span>
                <p className="audio-recorder-transcript-text">"{attempt.transcript}"</p>
              </div>
            ) : (
              <small className="audio-recorder-standby-hint">
                <span>ℹ️ Browser speech recognition standby</span>
              </small>
            )}

            <button
              type="button"
              className="prim tap audio-recorder-finish-btn"
              onClick={() => void handleStop()}
              aria-label="Finish speaking early"
            >
              Done speaking →
            </button>
            <button
              type="button"
              className="audio-recorder-cancel-btn tap"
              onClick={handleCancel}
            >
              Cancel rep
            </button>
          </div>
        )}

        {state === 'processing' && (
          <div className="audio-recorder-loading">
            <div className="ai-loading-spinner" aria-hidden="true" />
            <p className="audio-recorder-loading-text">
              Analyzing delivery metrics…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
