import type { ResetAction, ResetSnapshot } from '../../features/reset/sessionState';
import { LANES, missionById, pickMission } from '../../content/missions';
import { todayKey } from '../../lib/date';
import { ScreenHeader } from './ResetControls';

export default function PracticeScreen({
  snapshot,
  dispatch,
}: {
  snapshot: ResetSnapshot;
  dispatch: (action: ResetAction) => void;
}) {
  const date = todayKey();
  const selected = missionById(snapshot.missionId);

  // Every lane used to dispatch straight into the same hardcoded office
  // mission — tapping "Hindi vocabulary" opened an English office prompt. The
  // lane now selects its own mission before the session starts.
  const startLane = (lane: (typeof LANES)[number]['lane']) => {
    const mission = pickMission(lane, date);
    dispatch({ type: 'set-mission', lane, missionId: mission.id });
    dispatch({ type: 'set-duration', duration: 1 });
    dispatch({ type: 'start-session' });
  };

  return (
    <div className="reset-screen">
      <ScreenHeader eyebrow="Recommended because volume rose at your recommendation" title="Practise a firm but polite recommendation" />
      <section className="reset-recommendation">
        <p>Keep the meaning. Begin quietly and pause before the recommendation instead of making it louder.</p>
        <button type="button" className="reset-primary tap" onClick={() => startLane('office')}>
          Start recommended practice
        </button>
      </section>

      <section className="reset-section-block reset-practice-list">
        <div className="reset-section-heading"><div><span className="reset-kicker">All practice lanes</span><h2>Choose what matters now</h2></div></div>
        {LANES.map(({ lane, label, detail }) => {
          const next = pickMission(lane, date);
          return (
            <button
              key={lane}
              type="button"
              className={`reset-practice-row tap${selected?.lane === lane ? ' is-selected' : ''}`}
              onClick={() => startLane(lane)}
            >
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
                <small className="reset-practice-next">Today: {next.headline}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
