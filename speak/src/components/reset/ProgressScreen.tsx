import { useResetProgress } from '../../features/reset/useResetProgress';
import { ScreenHeader } from './ResetControls';
import AttemptPlayer from './AttemptPlayer';

function minutes(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.round(seconds / 60)} min`;
}

function when(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ProgressScreen() {
  const evidence = useResetProgress();
  const dayOne = evidence.completedLoops === 0;
  const delta =
    evidence.firstAverageDb !== null && evidence.latestAverageDb !== null
      ? evidence.latestAverageDb - evidence.firstAverageDb
      : null;

  return (
    <div className="reset-screen">
      <ScreenHeader eyebrow="Evidence in your own voice" title="Progress" />
      {!evidence.ready ? (
        <div className="reset-note">Loading local evidence…</div>
      ) : dayOne ? (
        <section className="reset-starting-state">
          <span className="reset-kicker">Day 1</span>
          <h2>No trend yet—and nothing is wrong</h2>
          <p>Complete one feedback-redo loop to create the first comparison.</p>
          <div className="reset-stat-row"><span>Comparable baseline</span><strong>{evidence.calibrationSamples} of 7</strong></div>
          <div className="reset-stat-row"><span>Captures waiting</span><strong>{evidence.capturesWaiting}</strong></div>
        </section>
      ) : (
        <>
          <section className="reset-progress-hero">
            <span className="reset-kicker">Completed Speak → Feedback → Repeat loops</span>
            <strong>{evidence.completedLoops}</strong>
            <p>Your archive grows only when the second attempt is completed.</p>
          </section>
          <div className="reset-progress-grid">
            <div><span>Deliberate practice</span><strong>{minutes(evidence.totalPracticeSeconds)}</strong></div>
            <div><span>Urges redirected</span><strong>{evidence.urgesRedirected}</strong></div>
            <div><span>Latest session average</span><strong>{evidence.latestAverageDb === null ? 'Local only' : `${evidence.latestAverageDb.toFixed(1)} dBFS`}</strong></div>
            <div><span>Baseline samples</span><strong>{evidence.calibrationSamples} / 7</strong></div>
          </div>
          {delta !== null && (
            <div className="reset-note">
              {/*
                Relative, never absolute — a phone mic cannot claim an SPL
                (PRODUCT-RESET-PLAN §6.1).
              */}
              Session average is {Math.abs(delta).toFixed(1)} dB {delta < 0 ? 'quieter' : 'louder'} than your first
              comparable session.
              {evidence.baselineDb !== null && ` Your personal baseline is ${evidence.baselineDb.toFixed(1)} dBFS.`}
            </div>
          )}
        </>
      )}

      <section className="reset-section-block">
        <div className="reset-section-heading">
          <div><span className="reset-kicker">Voice archive</span><h2>Your own recordings</h2></div>
        </div>
        {evidence.recordings.length === 0 ? (
          <p>Attempts you record are saved here so Day 1 can be played against today.</p>
        ) : (
          <div className="reset-archive-list">
            {evidence.recordings.map((recording) => (
              <article key={recording.id}>
                <div className="reset-archive-meta">
                  <strong>{recording.missionTitle}</strong>
                  <small>
                    {when(recording.at)} · Attempt {recording.attempt} · {recording.durationSec} sec
                    {recording.avgDb === undefined ? '' : ` · ${recording.avgDb.toFixed(1)} dBFS`}
                  </small>
                </div>
                <AttemptPlayer recording={recording} label={`Attempt ${recording.attempt}`} compact />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="reset-section-block is-quiet">
        <span className="reset-kicker">Backup</span>
        <h2>{evidence.syncConfigured ? 'Cloud backup is configured' : 'This device only'}</h2>
        <p>
          {evidence.syncConfigured
            ? `${evidence.pendingSync} change${evidence.pendingSync === 1 ? '' : 's'} waiting to upload${
                evidence.lastSyncAt ? ` · last sync ${when(evidence.lastSyncAt)}` : ' · sign in to start syncing'
              }.`
            : 'Your practice history lives in this browser. Clearing site data will remove it. Recordings always stay on the device.'}
        </p>
      </section>
    </div>
  );
}
