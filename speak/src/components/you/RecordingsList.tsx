import { useEffect, useState } from 'react';
import type { Recording } from '../../types/contract';
import { addDays, todayKey } from '../../lib/date';

/** Saved attempts with playback, prompt, date and measured numbers. */
export default function RecordingsList({ recordings }: { recordings: Recording[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const yesterday = addDays(todayKey(), -1);

  useEffect(() => {
    const next: Record<string, string> = {};
    let dead = false;
    for (const r of recordings.slice(0, 10)) {
      try {
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          next[r.id] = URL.createObjectURL(r.blob);
        }
      } catch {}
    }
    if (!dead) setUrls(next);
    return () => {
      dead = true;
      for (const u of Object.values(next)) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
    };
  }, [recordings]);

  if (recordings.length === 0) {
    return (
      <section aria-label="Recordings">
        <div className="sechd"><b>Recordings</b></div>
        <p className="sub">— no saved attempts yet</p>
      </section>
    );
  }

  return (
    <section aria-label="Recordings">
      <div className="sechd"><b>Recordings</b></div>
      {recordings.slice(0, 10).map((r) => (
        <div key={r.id} className="you-section">
          <b>{r.missionTitle}</b> <small>{r.date}</small>
          {r.date === yesterday && <span className="badge b-pace">Listen back tomorrow</span>}
          <p className="sub">
            {r.durationSec}s
            {r.avgDb !== undefined && ` · ${r.avgDb} dB avg · measured on this phone`}
            {r.transcript && ` · “${r.transcript.slice(0, 80)}”`}
          </p>
          {urls[r.id] && (
            <audio controls src={urls[r.id]} aria-label={`Playback of ${r.missionTitle}`} />
          )}
        </div>
      ))}
    </section>
  );
}
