import { useEffect } from 'react';
import type { ResetAction, ResetSnapshot, SessionAttempt } from '../../features/reset/sessionState';
import { SESSION_BLOCKS } from '../../features/reset/sessionState';
import { useMissionMeter } from '../../features/reset/useMissionMeter';
import { useMissionAudio } from '../../features/reset/useMissionAudio';
import { useSessionBlocks } from '../../features/reset/useSessionBlocks';
import { useSessionRecordings } from '../../features/reset/useResetProgress';
import { missionById } from '../../content/missions';
import type { SaveAttemptInput } from '../../features/reset/useResetProduct';
import { CloseIcon, MicrophoneIcon } from '../shell/Icons';
import AttemptPlayer from './AttemptPlayer';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function averageLabel(value: number | undefined): string {
  return value === undefined ? 'No local volume sample' : `${value.toFixed(1)} dBFS average`;
}

export default function SessionRunner({
  snapshot,
  dispatch,
  saveAttemptAudio,
  finishLoop,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
  saveAttemptAudio: (input: SaveAttemptInput) => Promise<void>;
  finishLoop: () => Promise<void>;
}) {
  const { session } = snapshot;
  const meter = useMissionMeter();
  const audio = useMissionAudio();
  const { blocks } = useSessionBlocks();
  const recordings = useSessionRecordings(session.id);
  const mission = missionById(session.missionId);
  const stage = session.stage;
  const blockIndex = session.blockPlan[session.blockPlanPosition];
  const currentBlock = blockIndex === undefined ? null : SESSION_BLOCKS[blockIndex];
  const copy = blockIndex === undefined ? null : blocks[blockIndex];
  const chosenFocus = mission?.focus.find((option) => option.id === session.focusId) ?? null;

  useEffect(() => {
    if (session.status !== 'active' && meter.micState === 'live') meter.stop();
  }, [meter.micState, meter.stop, session.status]);

  const leave = () => {
    audio.cancel();
    meter.stop();
    if (session.status === 'active') dispatch({ type: 'pause-session' });
    dispatch({ type: 'close-overlay' });
  };

  const startRecording = async (attempt: 1 | 2) => {
    await meter.start();
    // The recorder is best-effort: a denied mic still gets a timed rep, it just
    // has nothing to play back.
    audio.start(meter.stream());
    dispatch({ type: 'begin-recording', attempt });
  };

  const stopRecording = async (attemptNumber: 1 | 2) => {
    const durationSec = Math.max(1, session.recordingElapsedSec);
    const captured = await audio.stop();
    const averageDb = meter.stop();
    const attempt: SessionAttempt = {
      number: attemptNumber,
      durationSec,
      averageDb,
      completedAt: Date.now(),
    };
    dispatch({ type: 'stop-recording', attempt });
    await saveAttemptAudio({ attempt: attemptNumber, durationSec, avgDb: averageDb, audio: captured });
  };

  return (
    <main className="reset-session-screen">
      <header className="reset-session-head">
        <button type="button" className="reset-icon-button tap" aria-label="Leave session" onClick={leave}><CloseIcon /></button>
        <div>
          <span className="reset-kicker">{snapshot.duration === 20 ? 'Daily coaching' : mission?.laneLabel ?? 'Short practice'}</span>
          <strong>{stage === 'block' && currentBlock ? currentBlock.title : mission?.laneLabel ?? 'Mission'}</strong>
        </div>
        <span className={`reset-mic-state${meter.micState === 'live' ? ' is-live' : ''}`}>{meter.micState === 'live' ? 'MIC LIVE' : meter.micState === 'denied' ? 'MIC DENIED' : 'MIC OFF'}</span>
      </header>
      <div className="reset-session-rail" aria-label="Six coaching blocks">
        {SESSION_BLOCKS.map((block, index) => {
          const isNow = stage === 'block' ? index === blockIndex : index === 4 || stage === 'feedback' || stage === 'recording-2' || stage === 'comparison';
          const done = stage !== 'overview' && (index < (blockIndex ?? 5) || (index === 4 && ['feedback', 'recording-2', 'comparison', 'complete'].includes(stage)));
          return <span key={block.shortTitle} className={`${done ? 'is-done' : ''}${isNow ? ' is-now' : ''}`} title={block.title} />;
        })}
      </div>

      <section className="reset-session-body">
        {session.interrupted && (
          <div className="reset-note is-warning">SPEAK saved your completed work and paused when the app left the foreground. If a live recording was interrupted, that attempt will restart safely.</div>
        )}

        {stage === 'overview' && (
          <>
            <span className="reset-kicker">{snapshot.duration === 20 ? 'Six connected blocks' : mission?.laneLabel}</span>
            <h1>{snapshot.duration === 20 ? 'Today’s communication workout' : 'A focused speaking rep'}</h1>
            <p className="reset-lead">Everything prepares the same final mission: {mission?.headline.toLowerCase() ?? 'one spoken rep'}.</p>
            {snapshot.duration === 20 && (
              <ol className="reset-block-list">
                {SESSION_BLOCKS.map((block, index) => <li key={block.title}><span>{index + 1}</span><strong>{block.title}</strong><small>{Math.round(block.durationSec / 60)} min</small></li>)}
              </ol>
            )}
            <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'begin-session' })}>{snapshot.environment === 'silent' ? 'Prepare this session' : 'Begin'}</button>
          </>
        )}

        {stage === 'block' && currentBlock && copy && (
          <>
            <span className="reset-kicker">Block {(blockIndex ?? 0) + 1} of 6</span>
            <h1>{currentBlock.title}</h1>
            <div className="reset-session-timer">{formatTime(session.remainingSec)}</div>
            <p className="reset-lead">{copy.cue}</p>
            <div className="reset-prompt"><span>Say</span><strong>{copy.prompt}</strong></div>
            {blockIndex === 1 && (
              <div className="reset-live-meter">
                <div><span>Relative volume</span><strong>{meter.db === null ? '—' : `${Math.round(meter.db)} dBFS`}</strong></div>
                <div className="reset-meter-track"><span className={`is-${meter.bandStatus}`} /></div>
                <small>{meter.micState === 'live' ? (meter.bandStatus === 'high' ? 'Ease down and let the pause carry emphasis.' : meter.bandStatus === 'target' ? 'Inside today’s live band.' : 'Silence is neutral; speak when ready.') : 'Start the microphone for calm rolling-average guidance.'}</small>
                {meter.micState !== 'live' && <button type="button" className="reset-secondary tap" onClick={() => void meter.start()}><MicrophoneIcon /> Start microphone</button>}
              </div>
            )}
            {session.status === 'active' && (
              <>
                <button type="button" className="reset-primary tap" onClick={() => {
                  meter.stop();
                  dispatch({ type: 'complete-block' });
                }}>{session.remainingSec === 0 ? 'Complete this block' : 'I completed the rep'}</button>
                <button type="button" className="reset-text-action tap" onClick={() => {
                  meter.stop();
                  dispatch({ type: 'pause-session' });
                }}>Pause session</button>
              </>
            )}
          </>
        )}

        {stage === 'mission' && mission && (
          <>
            <span className="reset-kicker">Block 5 of 6 · {mission.targetSec} seconds</span>
            <h1>{mission.headline}</h1>
            <p className="reset-lead">{mission.brief}</p>
            <div className="reset-meta-chips">{mission.meta.map((chip) => <span key={chip}>{chip}</span>)}</div>
            <div className="reset-prompt"><span>Structure</span><strong>{mission.structure}</strong></div>
            {snapshot.environment === 'silent' ? (
              <>
                <div className="reset-note">Save the outline now. This preparation will not count as a completed spoken loop.</div>
                <button type="button" className="reset-primary tap" onClick={leave}>Save preparation and leave</button>
              </>
            ) : (
              <button type="button" className="reset-primary tap" onClick={() => void startRecording(1)}><MicrophoneIcon /> Start attempt 1</button>
            )}
          </>
        )}

        {(stage === 'recording-1' || stage === 'recording-2') && mission && (
          <>
            <span className="reset-kicker">{stage === 'recording-1' ? 'Attempt 1' : 'Redo · Attempt 2'}</span>
            <h1>{stage === 'recording-1' ? mission.headline : 'Same meaning, one change'}</h1>
            <div className="reset-recording-timer"><span className="reset-recording-dot" />{formatTime(session.recordingElapsedSec)}</div>
            <div className="reset-prompt">
              <span>{stage === 'recording-1' ? 'Structure' : 'Redo target'}</span>
              <strong>{stage === 'recording-1' ? mission.structure : chosenFocus?.redoTarget ?? mission.structure}</strong>
            </div>
            <div className="reset-live-meter">
              <div><span>Rolling volume</span><strong>{meter.db === null ? 'Local timer only' : `${Math.round(meter.db)} dBFS`}</strong></div>
              <div className="reset-meter-track"><span className={`is-${meter.bandStatus}`} /></div>
              {meter.micState === 'denied' && <small>Microphone permission is unavailable. The timed speaking rep still continues, but there will be nothing to play back.</small>}
              {meter.micState === 'live' && !audio.capturing && <small>Recording the audio is unavailable on this browser. The rep and the volume average are still saved.</small>}
              {audio.capturing && <small>Saving this attempt to the device so you can hear it back.</small>}
            </div>
            <button type="button" className="reset-record-button tap" onClick={() => void stopRecording(stage === 'recording-1' ? 1 : 2)}>Stop recording</button>
          </>
        )}

        {stage === 'feedback' && mission && (
          <>
            <span className="reset-kicker">Block 6 of 6 · one change</span>
            <h1>Listen back, then pick one thing</h1>
            <AttemptPlayer recording={recordings.find((item) => item.attempt === 1)} label="Attempt 1" />
            <p className="reset-lead">
              {/*
                No transcript and no model has run on this audio, so the app does
                not tell him what it heard. He listens; the authored line tells
                him how to fix whatever he picks.
              */}
              You completed a full spoken rep on a real scenario. Now play it back and choose the one thing worth fixing.
            </p>
            <div className="reset-focus-list" role="group" aria-label="Choose one correction">
              {mission.focus.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`reset-focus-option tap${session.focusId === option.id ? ' is-selected' : ''}`}
                  aria-pressed={session.focusId === option.id}
                  onClick={() => dispatch({ type: 'choose-focus', focusId: option.id })}
                >
                  <strong>{option.label}</strong>
                  {session.focusId === option.id && <small>{option.correction}</small>}
                </button>
              ))}
            </div>
            {chosenFocus && (
              <div className="reset-feedback-list">
                <div className="is-focus"><span>Redo target</span><p>{chosenFocus.redoTarget}</p></div>
              </div>
            )}
            <button
              type="button"
              className="reset-primary tap"
              disabled={!chosenFocus}
              onClick={() => void startRecording(2)}
            >
              <MicrophoneIcon /> {chosenFocus ? 'Record attempt 2' : 'Pick one thing first'}
            </button>
          </>
        )}

        {stage === 'comparison' && (
          <>
            <span className="reset-kicker">Hear the difference</span>
            <h1>Attempt 1 against attempt 2</h1>
            {chosenFocus && <p className="reset-lead">You were working on: {chosenFocus.redoTarget}</p>}
            <div className="reset-attempt-compare">
              {[1, 2].map((number) => {
                const attempt = session.attempts.find((item) => item.number === number);
                return (
                  <div key={number}>
                    <div className="reset-attempt-meta">
                      <span>Attempt {number}</span>
                      <strong>{attempt ? `${attempt.durationSec} sec` : '—'}</strong>
                      <small>{averageLabel(attempt?.averageDb)}</small>
                    </div>
                    <AttemptPlayer recording={recordings.find((item) => item.attempt === number)} label={`Attempt ${number}`} compact />
                  </div>
                );
              })}
            </div>
            <div className="reset-note is-success">Saving keeps both attempts in your archive so Day 1 can be compared with today.</div>
            <button type="button" className="reset-primary tap" onClick={() => void finishLoop()}>Save this loop</button>
          </>
        )}

        {stage === 'complete' && (
          <>
            <span className="reset-kicker">Speak → feedback → repeat</span>
            <h1>One complete coaching loop</h1>
            <p className="reset-lead">Both attempts, the correction you chose and the local volume evidence are saved.</p>
            <div className="reset-note is-success">Leaving now will not lose this progress.</div>
            <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'reset-session' })}>Finish session</button>
          </>
        )}

        {session.status === 'paused' && stage !== 'overview' && !['feedback', 'comparison', 'complete', 'mission'].includes(stage) && (
          <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'resume-session' })}>Resume saved step</button>
        )}
      </section>
    </main>
  );
}
