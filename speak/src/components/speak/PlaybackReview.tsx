import { useEffect, useMemo, useRef, useState } from 'react';
import type { CapturedAudio } from '../../features/reset/useMissionAudio';
import { useAiFeedback } from '../../features/ai/useAiFeedback';
import { currentStreak, emptyDay } from '../../features/session/day';
import { db, enqueue, saveRecording } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { DayRecord, ProductionEvent, Recording } from '../../types/contract';

export interface PlaybackReviewProps {
  audio: CapturedAudio | null;
  elapsedSec: number;
  xpReward: number;
  drillTitle?: string;
  promptText?: string;
  transcript?: string;
  wpm?: number;
  pauseCount?: number;
  targetVocab?: string[];
  targetVocabMatches?: string[];
  onDone: () => void;
  onRedo?: () => void;
}

export default function PlaybackReview({
  audio,
  elapsedSec,
  xpReward,
  drillTitle = 'Speaking Rep',
  promptText,
  transcript,
  wpm,
  pauseCount,
  targetVocab,
  targetVocabMatches = [],
  onDone,
  onRedo,
}: PlaybackReviewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [streakCount, setStreakCount] = useState<number>(0);

  const {
    loading: aiLoading,
    error: aiError,
    feedback: aiFeedback,
    requestFeedback,
  } = useAiFeedback();

  const isSavingRef = useRef(false);

  // Generate object URL for playback
  useEffect(() => {
    if (audio?.blob) {
      const url = URL.createObjectURL(audio.blob);
      setAudioUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [audio]);

  // Save attempt and award XP once
  useEffect(() => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    async function persist() {
      const date = todayKey();
      const now = Date.now();
      const id = `rec-${now}-${Math.random().toString(36).slice(2, 6)}`;

      if (audio?.blob) {
        const rec: Recording = {
          id,
          sessionId: id,
          attempt: 1,
          missionId: 'drill',
          missionTitle: drillTitle,
          date,
          at: now,
          durationSec: elapsedSec,
          mimeType: audio.mimeType,
          blob: audio.blob,
          transcript,
        };
        await saveRecording(rec);
      }

      // Record spoken rep credit & XP in day record
      if (elapsedSec >= 2) {
        const existingDay = (await db.days.get(date)) ?? emptyDay(date);
        const nextDay: DayRecord = {
          ...existingDay,
          spokenReps: (existingDay.spokenReps || 0) + 1,
          secondsActive: existingDay.secondsActive + elapsedSec,
          xp: (existingDay.xp || 0) + xpReward,
        };
        await db.days.put(nextDay);
        await enqueue('days', date);

        const prodEvent: ProductionEvent = {
          id: `evt-speak-${now}`,
          type: 'spoken_rep_completed',
          at: now,
          date,
          recordingId: id,
          drillTitle,
          durationSec: elapsedSec,
          xpEarned: xpReward,
          transcript,
        };
        await db.events.put(prodEvent as any);
        await enqueue('events', prodEvent.id);

        const allDays = await db.days.toArray();
        const dayMap = new Map(allDays.map((d) => [d.date, d]));
        setStreakCount(currentStreak(dayMap, date));
      }

      setSaved(true);
    }

    void persist();
  }, [audio, elapsedSec, xpReward, drillTitle, transcript, wpm]);

  const handleGetAiFeedback = () => {
    if (!transcript) return;
    void requestFeedback({
      transcript,
      promptText: promptText || drillTitle,
      drillTitle,
      targetVocab,
    });
  };

  const wordCount = useMemo(() => {
    return transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  }, [transcript]);

  const hasTranscript = Boolean(transcript && transcript.trim().length > 0);

  return (
    <div className="playback-review-card">
      <header className="playback-review-header">
        <span className="badge b-pace">
          ⚡ Rep Complete (+{xpReward} XP)
        </span>
        <h2>{drillTitle}</h2>
      </header>

      {/* Tier 0 Honest On-Device Metrics */}
      <div className="playback-review-stats">
        <div className="stat-pill highlight">
          <b>{elapsedSec}s</b>
          <small>Duration</small>
        </div>

        {wpm !== undefined && wpm > 0 ? (
          <div className="stat-pill">
            <b>{Math.round(wpm)}</b>
            <small>Words / min (Pace)</small>
          </div>
        ) : (
          <div className="stat-pill">
            <b>{wordCount}</b>
            <small>Words spoken</small>
          </div>
        )}

        {pauseCount !== undefined && (
          <div className="stat-pill">
            <b>{pauseCount}</b>
            <small>Natural pauses</small>
          </div>
        )}

        <div className="stat-pill">
          <b>🔥 {streakCount > 0 ? streakCount : 1}</b>
          <small>Day streak</small>
        </div>
      </div>

      {/* Real Audio Player */}
      {audioUrl && (
        <div className="playback-review-player">
          <label htmlFor="playback-audio-player">
            Listen back:
          </label>
          <audio
            id="playback-audio-player"
            controls
            src={audioUrl}
            className="playback-audio-element"
            aria-label="Recorded audio playback"
          />
        </div>
      )}

      {/* Target Vocab Usage Verification */}
      {targetVocab && targetVocab.length > 0 && (
        <div className="playback-vocab-feedback">
          <div className="playback-vocab-header">
            Target vocabulary checked:
          </div>
          <div className="playback-vocab-chips">
            {targetVocab.map((w) => {
              const matched = targetVocabMatches.includes(w.toLowerCase());
              return (
                <span
                  key={w}
                  className={`badge ${matched ? 'b-good' : 'b-weak'}`}
                >
                  {matched ? `✓ ${w}` : `○ ${w}`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Transcript Text */}
      {hasTranscript && (
        <div className="playback-transcript-box">
          <div className="playback-transcript-header">
            On-device Speech Transcript:
          </div>
          <p className="playback-transcript-content">"{transcript}"</p>
        </div>
      )}

      {/* Tier 1 AI Feedback via Proxy */}
      <div className="ai-feedback-section">
        {!hasTranscript && (
          <div className="ai-feedback-no-transcript">
            <p className="ai-feedback-hint-text">
              AI feedback needs a transcript. Listen back to your recording.
            </p>
          </div>
        )}

        {hasTranscript && wordCount < 5 && !aiFeedback && (
          <div className="ai-feedback-too-short">
            <p className="ai-feedback-hint-text">
              AI feedback requires at least 5 words spoken. Keep practicing!
            </p>
          </div>
        )}

        {hasTranscript && wordCount >= 5 && !aiFeedback && !aiLoading && !aiError && (
          <button
            type="button"
            className="prim tap ai-feedback-trigger-btn"
            onClick={handleGetAiFeedback}
          >
            <span>🤖 Get 1-Win / 1-Polish AI Coach Feedback</span>
          </button>
        )}

        {aiLoading && (
          <div className="ai-feedback-loading-card">
            <div className="ai-loading-spinner" aria-hidden="true" />
            <p className="sub">
              Analyzing transcript against executive delivery standards…
            </p>
          </div>
        )}

        {aiError && (
          <div className="ai-feedback-error-card">
            <p className="ai-feedback-error-text">
              {aiError}
            </p>
          </div>
        )}

        {aiFeedback && (
          <div className="ai-feedback-result-card">
            <div className="ai-feedback-badge">
              <span aria-hidden="true">🤖</span> Coach Feedback
            </div>
            <p className="ai-summary">{aiFeedback.summary}</p>
            <div className="ai-points-grid">
              <div className="ai-point-box positive">
                <b>💡 1 Key Win</b>
                <p>{aiFeedback.strongPoint}</p>
              </div>
              <div className="ai-point-box correction">
                <b>🎯 1 Polish Opportunity</b>
                <p>{aiFeedback.oneCorrection}</p>
              </div>
            </div>
            {aiFeedback.suggestedAlternative && (
              <div className="ai-alternative-box">
                <b>Crisper Phrasing:</b>
                <p>"{aiFeedback.suggestedAlternative}"</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="playback-review-note">
        <p>
          Recorded attempt saved locally on this device. Speaking reps count towards your daily habit goal.
        </p>
      </div>

      <footer className="playback-review-actions">
        {onRedo && (
          <button
            type="button"
            className="prim tap"
            style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' }}
            onClick={onRedo}
          >
            Try again
          </button>
        )}
        <button
          type="button"
          className="prim tap"
          onClick={onDone}
          disabled={!saved}
        >
          {saved ? 'Save & Done ✓' : 'Saving…'}
        </button>
      </footer>
    </div>
  );
}
