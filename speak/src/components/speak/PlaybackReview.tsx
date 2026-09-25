import { useEffect, useMemo, useRef, useState } from 'react';
import type { CapturedAudio } from '../../features/reset/useMissionAudio';
import { useAiFeedback } from '../../features/ai/useAiFeedback';
import { useSpokenRepCredit } from '../../features/session/useSpokenRep';
import { currentStreak } from '../../features/session/day';
import { db } from '../../db/db';
import { todayKey } from '../../lib/date';
import { isCalibrated } from '../../features/lab/calibration';
import { appendPaceSample, paceBaseline, paceTarget } from '../../features/speak/pace';
import { classifyLadderLevel } from '../../features/lab/drills';
import { useReview } from '../../features/srs/useReview';
import type { CardType } from '../../types/contract';

export interface PlaybackReviewProps {
  audio: CapturedAudio | null;
  elapsedSec: number;
  xpReward: number;
  drillTitle?: string;
  promptText?: string;
  transcript?: string;
  wpm?: number;
  pauseCount?: number;
  avgDb?: number;
  voicedSec?: number;
  pctAboveBand?: number;
  recordingId?: string;
  isDescribe?: boolean;
  cardId?: string;
  cardType?: CardType;
  targetVocab?: string[];
  targetVocabMatches?: string[];
  onDone: () => void;
  onRedo?: () => void;
}

function levelLabel(deltaDb: number): string {
  const lvl = classifyLadderLevel(deltaDb);
  return `level ${lvl}`;
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
  avgDb,
  voicedSec,
  pctAboveBand,
  recordingId,
  isDescribe,
  cardId,
  cardType,
  targetVocab,
  targetVocabMatches = [],
  onDone,
  onRedo,
}: PlaybackReviewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [streakCount, setStreakCount] = useState<number | null>(null);
  const [baselineDb, setBaselineDb] = useState<number | undefined>(undefined);
  const [calibrated, setCalibrated] = useState(false);
  const [paceTargetWpm, setPaceTargetWpm] = useState(140);
  const [paceStarter, setPaceStarter] = useState(true);

  const {
    loading: aiLoading,
    error: aiError,
    feedback: aiFeedback,
    requestFeedback,
  } = useAiFeedback();
  const { credited, credit } = useSpokenRepCredit();
  const { gradeEasy } = useReview();

  const isSavingRef = useRef(false);

  // Generate object URL for playback
  useEffect(() => {
    if (audio?.blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(audio.blob);
      setAudioUrl(url);
      return () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      };
    }
  }, [audio]);

  // Honest crediting via hook: ≥2 s AND ≥1.5 s voiced. Idempotent by recordingId.
  useEffect(() => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    async function persist() {
      const profile = await db.profile.get('me');
      setBaselineDb(profile?.baselineDb);
      setCalibrated(isCalibrated({ baselineDb: profile?.baselineDb, calibrationSamples: profile?.calibrationSamples }));

      // Pace: record valid attempts (≥20 s), recompute baseline weekly from stored samples.
      let target = { target: 140, starter: true };
      if (wpm !== undefined && wpm > 0 && elapsedSec >= 20) {
        const all = appendPaceSample({ wpm, durationSec: elapsedSec, at: Date.now() });
        const baseline = paceBaseline(all);
        target = paceTarget(baseline ?? profile?.baselineWpm);
        const nextBaseline = baseline ?? profile?.baselineWpm;
        if (nextBaseline !== profile?.baselineWpm || target.target !== profile?.targetWpm) {
          await db.profile.put({
            ...(profile ?? { id: 'me' as const, createdAt: Date.now() }),
            baselineWpm: nextBaseline,
            targetWpm: target.target,
          });
        }
      } else {
        target = paceTarget(profile?.baselineWpm);
      }
      setPaceTargetWpm(target.target);
      setPaceStarter(target.starter);

      const id = recordingId ?? audio?.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const didCredit = await credit({
        recordingId: id,
        audio,
        elapsedSec,
        voicedSec,
        avgDb,
        xpReward,
        drillTitle,
        isDescribe,
        transcript,
      });

      // Using a word out loud counts: target word detected → grade `easy`.
      if (
        didCredit &&
        cardId &&
        cardType &&
        (cardType === 'word' || cardType === 'idiom' || cardType === 'phrase' || cardType === 'feeling' || cardType === 'action_verb') &&
        targetVocabMatches &&
        targetVocabMatches.length > 0
      ) {
        await gradeEasy(cardId);
      }

      if (didCredit) {
        const date = todayKey();
        const allDays = await db.days.toArray();
        const dayMap = new Map(allDays.map((d) => [d.date, d]));
        setStreakCount(currentStreak(dayMap, date));
      } else {
        setStreakCount(null);
      }
      setSaved(true);
    }

    void persist();
  }, [audio, elapsedSec, voicedSec, avgDb, wpm, xpReward, drillTitle, isDescribe, transcript, recordingId, cardId, cardType, targetVocabMatches, credit, gradeEasy]);

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
  const tooShort = elapsedSec < 2;
  const notVoiced = !tooShort && typeof voicedSec === 'number' && voicedSec < 1.5;
  const counted = credited === true;

  return (
    <div className="playback-review-card">
      <header className="playback-review-header">
        {counted ? (
          <span className="badge b-pace">
            Rep counted (+{xpReward} XP)
          </span>
        ) : saved ? (
          <span className="badge b-weak">
            Not counted — {tooShort ? 'under 2 seconds' : notVoiced ? 'no clear voice detected' : 'already saved'}
          </span>
        ) : (
          <span className="badge b-pace">Saving…</span>
        )}
        <h2>{drillTitle}</h2>
      </header>

      {/* Measured numbers only — each labelled "measured on this phone" */}
      <div className="playback-review-stats">
        <div className="stat-pill highlight">
          <b>{elapsedSec}s</b>
          <small>Duration · measured on this phone</small>
        </div>

        {wpm !== undefined && wpm > 0 ? (
          <div className="stat-pill">
            <b>{Math.round(wpm)} vs {paceTargetWpm}</b>
            <small>Words / min vs your {paceStarter ? 'starter target' : 'target'} · measured on this phone</small>
          </div>
        ) : (
          <div className="stat-pill">
            <b>—</b>
            <small>Words / min · no recognition</small>
          </div>
        )}

        {pauseCount !== undefined && (
          <div className="stat-pill">
            <b>{pauseCount}</b>
            <small>Natural pauses · measured on this phone</small>
          </div>
        )}

        {avgDb !== undefined && baselineDb !== undefined ? (
          <div className="stat-pill">
            <b>{avgDb > baselineDb ? '+' : ''}{Math.round((avgDb - baselineDb) * 10) / 10} dB{calibrated ? ` · ${levelLabel(avgDb - baselineDb)}` : ''}</b>
            <small>Avg loudness vs your normal · measured on this phone</small>
          </div>
        ) : avgDb !== undefined ? (
          <div className="stat-pill">
            <b>{avgDb} dB</b>
            <small>Avg loudness · measured on this phone (not calibrated)</small>
          </div>
        ) : (
          <div className="stat-pill">
            <b>—</b>
            <small>Avg loudness · mic unavailable</small>
          </div>
        )}

        {pctAboveBand !== undefined ? (
          <div className="stat-pill">
            <b>{pctAboveBand}%</b>
            <small>Time above target zone · measured on this phone</small>
          </div>
        ) : (
          <div className="stat-pill">
            <b>—</b>
            <small>Time above zone · {calibrated ? 'no meter data' : 'not calibrated'}</small>
          </div>
        )}

        <div className="stat-pill">
          {streakCount !== null && streakCount > 0 ? (
            <>
              <b>{streakCount}</b>
              <small>Day streak</small>
            </>
          ) : (
            <>
              <b>—</b>
              <small>{counted ? 'Streak · first day' : 'Streak · no rep counted'}</small>
            </>
          )}
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
            <span>Get 1-Win / 1-Polish AI Coach Feedback</span>
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
              <span aria-hidden="true">Coach Feedback</span>
            </div>
            <p className="ai-summary">{aiFeedback.summary}</p>
            <div className="ai-points-grid">
              <div className="ai-point-box positive">
                <b>1 Key Win</b>
                <p>{aiFeedback.strongPoint}</p>
              </div>
              <div className="ai-point-box correction">
                <b>1 Polish Opportunity</b>
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
          Recorded attempt saved locally on this device. Only attempts with at least
          2 seconds and clear voice count towards your daily habit goal.
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
