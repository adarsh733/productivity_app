import type { ResetAction, ResetSnapshot } from '../../features/reset/sessionState';
import { pickMission, recommendedLane } from '../../content/missions';
import { todayKey } from '../../lib/date';
import { ResumePanel, ScreenHeader } from './ResetControls';

export default function CoachScreen({
  snapshot,
  dispatch,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
}) {
  const date = todayKey();
  const blocks = ['Voice reset', 'Volume and delivery', 'Precision', 'Vocabulary', 'Main mission', 'Feedback and redo'];

  const start = (duration: 3 | 20) => {
    const lane = recommendedLane(date);
    const mission = pickMission(lane, date);
    dispatch({ type: 'set-mission', lane, missionId: mission.id });
    dispatch({ type: 'set-duration', duration });
    dispatch({ type: 'start-session' });
  };

  return (
    <div className="reset-screen">
      <ScreenHeader eyebrow="Calm delivery, built deliberately" title="Coach" />
      <ResumePanel snapshot={snapshot} onResume={() => {
        dispatch({ type: 'open-overlay', overlay: 'session' });
        dispatch({ type: 'resume-session' });
      }} />

      <section className="reset-section-block">
        <div className="reset-section-heading">
          <div><span className="reset-kicker">Daily structure</span><h2>Twenty minutes, six connected blocks</h2></div>
          <span className="reset-time">20:00</span>
        </div>
        <ol className="reset-block-list">
          {blocks.map((block, index) => <li key={block}><span>{index + 1}</span><strong>{block}</strong></li>)}
        </ol>
        <button type="button" className="reset-primary tap" onClick={() => start(20)}>Start daily coaching session</button>
      </section>

      <section className="reset-section-block is-quiet">
        <span className="reset-kicker">Comparable voice sample</span>
        <h2>Use the same phone and approximate distance</h2>
        <p>Weekly—not daily. Anywhere practice remains available when the room is not comparable.</p>
        <button type="button" className="reset-secondary tap" onClick={() => start(3)}>Start a short coached sample</button>
      </section>
    </div>
  );
}
