import type { DayKey, DayRecord } from '../../types/contract';
import { addDays, parseDayKey } from '../../lib/date';

export interface WeeklyDotsProps {
  days: DayRecord[];
  today: DayKey;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeeklyDots({ days, today }: WeeklyDotsProps) {
  const dayMap = new Map<string, DayRecord>(days.map((d) => [d.date, d]));

  // Calculate past 7 days up to today
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    last7Days.push(addDays(today, -i));
  }

  const completedCount = last7Days.filter((date) => {
    const rec = dayMap.get(date);
    return rec ? (rec.cardsCompleted || 0) >= 5 || (rec.spokenReps || 0) >= 1 : false;
  }).length;

  return (
    <div className="weekly-dots-container" aria-label="7-day activity visualizer">
      <div className="sechd">
        <b>Past 7 Days Activity</b>
      </div>
      <div className="weekly-dots-row">
        {last7Days.map((date) => {
          const isToday = date === today;
          const rec = dayMap.get(date);
          const isDone = rec ? (rec.cardsCompleted || 0) >= 5 || (rec.spokenReps || 0) >= 1 : false;
          const dow = parseDayKey(date).getDay();
          const label = DAY_LABELS[dow] ?? '';

          return (
            <div
              key={date}
              className={`weekly-dot-col${isToday ? ' today' : ''}`}
            >
              <span className="weekly-dot-label">{label}</span>
              <div
                className={`weekly-dot-circle${isDone ? ' done' : ''}${isToday ? ' current' : ''}`}
                aria-label={`${label} (${date}): ${isDone ? 'Completed' : 'Missed or incomplete'}`}
              >
                {isDone ? '✓' : isToday ? '○' : '·'}
              </div>
            </div>
          );
        })}
      </div>
      <div className="weekly-freeze-footer">
        <span aria-hidden="true">🛡️</span>
        <small>{completedCount} of 7 days completed this week</small>
      </div>
    </div>
  );
}
