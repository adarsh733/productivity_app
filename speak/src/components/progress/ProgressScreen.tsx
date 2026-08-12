import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { currentStreak } from '../../features/session/day';
import { todayKey } from '../../lib/date';
import { syncConfigured } from '../../sync/supabase';

export default function ProgressScreen() {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const today = todayKey();
  const rows = days ?? [];
  const todayRow = rows.find((d) => d.date === today);

  const streak = currentStreak(new Map(rows.map((d) => [d.date, d])), today);
  const urges = rows.reduce((n, d) => n + d.urgesRedirected, 0);
  const cardsToday = todayRow?.cardsCompleted ?? 0;
  const totalCards = rows.reduce((n, d) => n + d.cardsCompleted, 0);
  const bestMpt = rows.reduce((n, d) => Math.max(n, d.bestMptSec ?? 0), 0);
  const hasHistory = totalCards > 0 || rows.length > 1;

  return (
    <div className="screen progress">
      <header className="screen-head">
        <h1 className="screen-title">You</h1>
      </header>

      {!hasHistory && cardsToday === 0 ? (
        <section className="starting-state">
          <p className="starting-title">Day one.</p>
          <p className="starting-desc">The numbers start after your first Core 3.</p>

          <div className="stat-grid">
            <StatTile label="Streak" value="—" />
            <StatTile label="Cards today" value="—" />
            <StatTile label="Core 3" value="—" />
            <StatTile label="Best hold" value="—" />
          </div>
        </section>
      ) : (
        <>
          <section className="stat-hero">
            <span className="stat-value">{urges}</span>
            <span className="stat-label">urges redirected</span>
          </section>

          <div className="stat-grid">
            <StatTile label="Streak" value={`${streak} d`} />
            <StatTile label="Cards today" value={cardsToday} />
            <StatTile label="Core 3" value={todayRow?.coreThreeDone ? 'Done' : 'Pending'} />
            <StatTile label="Best hold" value={bestMpt > 0 ? `${bestMpt.toFixed(1)}s` : '—'} />
          </div>
        </>
      )}

      <footer className="progress-footer">
        <p className="meta">
          {syncConfigured()
            ? 'Backup configured.'
            : 'Local only — no backup configured yet.'}
        </p>
      </footer>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
