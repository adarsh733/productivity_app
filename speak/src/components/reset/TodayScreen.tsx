import { useEffect } from 'react';
import type { ResetAction, ResetSnapshot } from '../../features/reset/sessionState';
import { missionById, pickMission, recommendedLane } from '../../content/missions';
import { todayKey } from '../../lib/date';
import { DurationSelector, EnvironmentSelector, ResumePanel, ScreenHeader } from './ResetControls';

export default function TodayScreen({
  snapshot,
  dispatch,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
}) {
  const date = todayKey();
  const lane = recommendedLane(date);
  const recommended = pickMission(lane, date);
  const mission = missionById(snapshot.missionId) ?? recommended;
  const silent = snapshot.environment === 'silent';

  // Today rotates the lane by date, so the headline mission is a different kind
  // of speaking each day rather than the same office prompt forever. Only
  // adopts it while nothing is mid-session — a resume must keep its own prompt.
  useEffect(() => {
    if (snapshot.session.status !== 'idle') return;
    if (snapshot.missionId === recommended.id) return;
    dispatch({ type: 'set-mission', lane, missionId: recommended.id });
  }, [dispatch, lane, recommended.id, snapshot.missionId, snapshot.session.status]);

  return (
    <div className="reset-screen reset-today">
      <ScreenHeader eyebrow={`Today’s focus · ${mission.laneLabel}`} title={mission.headline} />

      <section className="reset-mission-brief">
        <div className="reset-mission-meta">
          {mission.meta.map((chip) => <span key={chip}>{chip}</span>)}
        </div>
        <p>{mission.brief}</p>
      </section>

      <ResumePanel
        snapshot={snapshot}
        onResume={() => {
          dispatch({ type: 'open-overlay', overlay: 'session' });
          dispatch({ type: 'resume-session' });
        }}
      />

      <EnvironmentSelector snapshot={snapshot} dispatch={dispatch} />
      <DurationSelector value={snapshot.duration} dispatch={dispatch} />

      {silent && (
        <div className="reset-note">
          Silent mode will save an outline and preparation. It will not count as a completed spoken coaching loop.
        </div>
      )}

      <div className="reset-sticky-actions">
        <button type="button" className="reset-primary tap" onClick={() => dispatch({ type: 'start-session' })}>
          {silent ? 'Prepare this mission' : `Start ${snapshot.duration === 1 ? '60-second' : `${snapshot.duration}-minute`} practice`}
        </button>
        <button type="button" className="reset-text-action tap" onClick={() => {
          dispatch({ type: 'set-rescue-step', step: 0 });
          dispatch({ type: 'open-overlay', overlay: 'rescue' });
        }}>
          I came here instead
        </button>
      </div>
    </div>
  );
}
