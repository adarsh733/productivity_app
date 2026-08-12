import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { currentStreak } from '../../features/session/day';
import { todayKey } from '../../lib/date';
import { syncConfigured } from '../../sync/supabase';

/**
 * Four numbers.
 *
 * `urgesRedirected` is the headline and is deliberately the largest thing on
 * the screen — it is the only number here that measures what the app is
 * actually for. Charts arrive in Phase 5, when there is history worth drawing.
 */
export default function ProgressScreen() {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const today = todayKey();
  const rows = days ?? [];
  const todayRow = rows.find((d) => d.date === today);

  const streak = currentStreak(new Map(rows.map((d) => [d.date, d])), today);
  const urges = rows.reduce((n, d) => n + d.urgesRedirected, 0);
  const cards = rows.reduce((n, d) => n + d.cardsCompleted, 0);
  const bestMpt = rows.reduce((n, d) => Math.max(n, d.bestMptSec ?? 0), 0);
  const activeDays = rows.filter((d) => d.coreThreeDone).length;

  return (
    <div className="screen progress">
      <section className="hero-stat">
        <span className="hero-value">{urges}</span>
        <span className="hero-label">urges redirected</span>
        <p className="hint">
          Every time you felt the pull and did a card instead. This is the number
          that matters.
        </p>
      </section>

      <ul className="stats">
        <Stat label="Day streak" value={streak} />
        <Stat label="Days done" value={activeDays} />
        <Stat label="Cards" value={cards} />
        <Stat label="Best hold" value={bestMpt ? `${bestMpt.toFixed(1)}s` : '—'} />
      </ul>

      <section className="today-row">
        <span className={`dot${todayRow?.coreThreeDone ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="meta">
          Today · {todayRow?.cardsCompleted ?? 0} cards ·{' '}
          {todayRow?.coreThreeDone ? 'Core 3 done' : 'Core 3 not done yet'}
        </span>
      </section>

      <p className="meta footnote">
        {syncConfigured()
          ? 'Backup configured.'
          : 'Local only — no backup configured yet. Everything lives on this device.'}
      </p>
      <p className="meta footnote">Breath, pace and volume measurement arrive in Phase 1.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <li className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </li>
  );
}
