import { useMptTest } from '../../features/lab/useMptTest';

/**
 * Weekly check: "aaah" at normal volume (best of 3 spirit — we bank each hold),
 * then soft. Uses useMptTest + PhonationDetector; the gap verdict comes from
 * readMpt (smaller is better). Saves VoiceSample rows.
 */
export default function WeeklyCheck() {
  const mpt = useMptTest();

  if (!mpt.ready) return <p className="sub">Checking weekly due…</p>;

  if (!mpt.started) {
    return (
      <section className="you-section">
        <b>Weekly check {mpt.due && <span className="badge b-pace">due</span>}</b>
        <p className="sub">Breath-length test: “aaah” at normal volume, then soft. Best of 3 spirit — the mic stops the clock.</p>
        <button type="button" className="prim tap" onClick={() => void mpt.start()}>Start weekly check</button>
        <button type="button" className="tap" onClick={() => {}}>Skip this week</button>
      </section>
    );
  }

  if (mpt.finished) {
    return (
      <section className="you-section">
        <b>Weekly check — done</b>
        <p className="sub">
          Normal: {mpt.habitualSec !== null ? `${mpt.habitualSec}s` : '—'} · Soft:{' '}
          {mpt.softSec !== null ? `${mpt.softSec}s` : '—'}
          {mpt.reading && (
            <> · Gap {mpt.reading.gapSec}s — {mpt.reading.message}</>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="you-section">
      <b>{mpt.step?.title ?? 'Weekly check'}</b>
      <p className="sub">{mpt.step?.cue}</p>
      <p className="sub">
        Held: {mpt.heldSec}s · {mpt.remainingSec}s left
        {mpt.micState === 'denied' && ' · Mic off — timed cue only.'}
        {mpt.autoStopped && ' · Voice stopped — tap Next.'}
      </p>
      <div className="playback-review-actions">
        <button type="button" className="prim tap" onClick={() => void mpt.next()}>Next →</button>
        <button type="button" className="tap" onClick={mpt.abort}>Leave</button>
      </div>
    </section>
  );
}
