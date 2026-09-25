import { useEffect, useState } from 'react';
import type { Card } from '../../types/contract';
import RapidRepMode from './modes/RapidRepMode';
import SixtySecMode from './modes/SixtySecMode';
import IncidentMode from './modes/IncidentMode';
import DescribeMode from './modes/DescribeMode';

export interface SpeakScreenProps {
  initialCard?: Card | null;
  onCloseDrill?: () => void;
}

export type SpeakModeId = 'rapid' | 'story' | 'incident' | 'describe';

export default function SpeakScreen({ initialCard, onCloseDrill }: SpeakScreenProps) {
  const [activeMode, setActiveMode] = useState<SpeakModeId | null>(
    initialCard ? 'rapid' : null,
  );

  useEffect(() => {
    if (initialCard) {
      setActiveMode('rapid');
    }
  }, [initialCard]);

  const handleClose = () => {
    setActiveMode(null);
    onCloseDrill?.();
  };

  const MODES: Array<{
    id: SpeakModeId;
    icon: string;
    title: string;
    time: string;
    desc: string;
    xp: number;
    badge: string;
  }> = [
    {
      id: 'rapid',
      icon: '⚡',
      title: 'Rapid Rep',
      time: '30s',
      desc: 'One prompt. Continuous stream of speech without hesitation.',
      xp: 10,
      badge: 'Drill',
    },
    {
      id: 'story',
      icon: '📚',
      title: '60-Second Story',
      time: '60s',
      desc: 'Structure a hook, turning point, and landing in one minute.',
      xp: 10,
      badge: 'Structure',
    },
    {
      id: 'incident',
      icon: '🚨',
      title: 'Incident Drill',
      time: '45s',
      desc: 'High-stakes workplace scenarios, trade-off framing & polite pushback.',
      xp: 10,
      badge: 'Presence',
    },
    {
      id: 'describe',
      icon: '🎨',
      title: 'Describe This',
      time: '45s',
      desc: 'Paint a scene using sensory, concrete, and expressive vocabulary.',
      xp: 25,
      badge: 'Expressive',
    },
  ];

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

  return (
    <div className="screen speak-screen">
      <header className="speak-header">
        <h1 className="h1s">Speak</h1>
        <p className="sub speak-header-sub">
          Timed speaking reps. Always measured with real audio.
        </p>
      </header>

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
                <span className="badge b-pace speak-time-badge">
                  {m.time}
                </span>
                <span className="speak-xp-reward-tag">
                  +{m.xp} XP
                </span>
              </div>
              <small className="speak-mode-desc">{m.desc}</small>
            </div>
            <span className="arw" aria-hidden="true">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}
