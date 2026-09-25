import { useEffect, useState } from 'react';
import type { Card } from '../../types/contract';
import { db } from '../../db/db';
import { todayKey } from '../../lib/date';
import RapidRepMode from './modes/RapidRepMode';
import SixtySecMode from './modes/SixtySecMode';
import IncidentMode from './modes/IncidentMode';
import DescribeMode from './modes/DescribeMode';
import ExplainMode from './modes/ExplainMode';
import TeachBackMode from './modes/TeachBackMode';
import SessionRunner from '../lab/SessionRunner';
import WeeklyCheck from '../lab/WeeklyCheck';
import {
  Level1HoldDrill,
  MicCalibrationRow,
  PacerDrill,
  PaletteDrill,
  PauseDrill,
  QuietVoiceDrill,
  VolumeLadderDrill,
} from '../lab/Drills';

export interface SpeakScreenProps {
  initialCard?: Card | null;
  onCloseDrill?: () => void;
}

export type SpeakModeId =
  | 'rapid'
  | 'story'
  | 'incident'
  | 'describe'
  | 'explain'
  | 'teachback'
  | 'routine';

export default function SpeakScreen({ initialCard, onCloseDrill }: SpeakScreenProps) {
  const [activeMode, setActiveMode] = useState<SpeakModeId | null>(
    initialCard ? 'rapid' : null,
  );
  const [routineDays, setRoutineDays] = useState(0);
  const [doneToday, setDoneToday] = useState(false);

  useEffect(() => {
    if (initialCard) {
      setActiveMode('rapid');
    }
  }, [initialCard]);

  useEffect(() => {
    void db.days.toArray().then((days) => {
      const done = days.filter((d) => d.labSessionDone).length;
      setRoutineDays(done);
      setDoneToday(days.some((d) => d.date === todayKey() && d.labSessionDone));
    });
  }, [activeMode]);

  const handleClose = () => {
    setActiveMode(null);
    onCloseDrill?.();
  };

  if (activeMode === 'rapid') {
    return <RapidRepMode initialCard={initialCard} onClose={handleClose} />;
  }
  if (activeMode === 'story') {
    return <SixtySecMode onClose={handleClose} />;
  }
  if (activeMode === 'incident') {
    return <IncidentMode onClose={handleClose} />;
  }
  if (activeMode === 'describe') {
    return <DescribeMode onClose={handleClose} />;
  }
  if (activeMode === 'explain') {
    return <ExplainMode onClose={handleClose} />;
  }
  if (activeMode === 'teachback') {
    return <TeachBackMode onClose={handleClose} />;
  }
  if (activeMode === 'routine') {
    return <SessionRunner onClose={handleClose} />;
  }

  const MODES: Array<{ id: SpeakModeId; icon: string; title: string; time: string; desc: string; xp: number }> = [
    { id: 'rapid', icon: '⚡', title: 'Rapid Rep', time: '30s', desc: 'One prompt. Continuous speech without hesitation.', xp: 10 },
    { id: 'story', icon: '📚', title: '60-Second Story', time: '60s', desc: 'Hook, turning point, landing in one minute.', xp: 10 },
    { id: 'incident', icon: '🚨', title: 'Situations', time: '45s', desc: 'Incidents, office calls, feelings, opinions, life stories.', xp: 10 },
    { id: 'describe', icon: '🎨', title: 'Describe This', time: '45s', desc: 'Paint a scene with sensory, concrete words.', xp: 25 },
    { id: 'explain', icon: '💡', title: 'Explain an idea', time: '60s', desc: 'Read the primer, then explain the angle.', xp: 10 },
    { id: 'teachback', icon: '🎓', title: 'Teach it back', time: '60s', desc: 'Explain back something you learned.', xp: 10 },
  ];

  return (
    <div className="screen speak-screen">
      <header className="speak-header">
        <h1 className="h1s">Speak</h1>
        <p className="sub speak-header-sub">
          Timed speaking reps. Always measured with real audio.
        </p>
      </header>

      <section className="you-section">
        <div
          className="row tap"
          role="button"
          tabIndex={0}
          onClick={() => setActiveMode('routine')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveMode('routine');
            }
          }}
          aria-label={`12-minute voice routine, day ${routineDays + 1}`}
        >
          <span className="g" aria-hidden="true">🎙️</span>
          <div className="t">
            <b>12-minute voice routine · Day {routineDays + 1} {doneToday && <span aria-label="done">✓</span>}</b>
            <small>Release → straw work + transfer → volume ladder → resonance → pause and tone.</small>
          </div>
          <span className="arw" aria-hidden="true">›</span>
        </div>
      </section>

      <section className="you-section">
        <b>Quick voice drills</b>
        <QuietVoiceDrill />
        <VolumeLadderDrill />
        <Level1HoldDrill />
        <PauseDrill />
        <PacerDrill />
        <PaletteDrill />
      </section>

      <WeeklyCheck />

      <section className="you-section">
        <b>Talk it out</b>
        <div className="speak-modes-list">
          {MODES.map((m) => (
            <div
              key={m.id}
              className="row tap speak-mode-card"
              role="button"
              tabIndex={0}
              onClick={() => setActiveMode(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveMode(m.id);
                }
              }}
              aria-label={`${m.title}, ${m.time}, +${m.xp} XP`}
            >
              <span className="g" aria-hidden="true">{m.icon}</span>
              <div className="t">
                <div className="speak-mode-row-top">
                  <b>{m.title}</b>
                  <span className="badge b-pace speak-time-badge">{m.time}</span>
                  <span className="speak-xp-reward-tag">+{m.xp} XP</span>
                </div>
                <small className="speak-mode-desc">{m.desc}</small>
              </div>
              <span className="arw" aria-hidden="true">›</span>
            </div>
          ))}
        </div>
      </section>

      <MicCalibrationRow />
    </div>
  );
}
