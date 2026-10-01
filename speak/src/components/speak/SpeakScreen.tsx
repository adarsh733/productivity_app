import { useState } from 'react';
import type { Card, ChallengeResult as ChallengeResultData } from '../../types/contract';
import { useDailyChallenge } from '../../features/challenge/useDailyChallenge';
import type { ChallengeInputs } from '../../features/challenge/buildDailyChallenge';
import { useWeekPlan } from '../../features/auto/useWeekPlan';
import {
  saveChallengeResult,
  useSpeakOverview,
} from '../../features/speak/useSpeakOverview';
import type { SpeakingAttemptResult } from '../../features/speak/useSpeakingAttempt';
import type { CapturedAudio } from '../../features/reset/useMissionAudio';
import ChallengeCard from './ChallengeCard';
import ChallengeResultView from './ChallengeResult';
import AudioRecorder from './AudioRecorder';
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

type SpeakView =
  | 'rapid'
  | 'story'
  | 'incident'
  | 'describe'
  | 'explain'
  | 'teachback'
  | 'routine'
  | 'challenge'
  | 'soft'
  | 'ladder'
  | 'hold'
  | 'pause'
  | 'pacer'
  | 'palette'
  | 'weekly'
  | 'normvoice';

interface TalkRow {
  view: SpeakView;
  title: string;
  time: string;
  xp: number;
  help: string;
}

interface PracticeRow {
  view: SpeakView;
  title: string;
  time: string;
  help: string;
}

/** Plain words only — no MPT, dB, calibrate, ms, or WPM anywhere here. */
const TELL_A_STORY: TalkRow[] = [
  {
    view: 'incident',
    title: 'Situations',
    time: '45s',
    xp: 10,
    help: 'Talk through a real-life moment: a call, a feeling, or your view.',
  },
  {
    view: 'story',
    title: '60-second story',
    time: '60s',
    xp: 10,
    help: 'A tiny story with a start, a turn, and an ending — in one minute.',
  },
  {
    view: 'describe',
    title: 'Describe what you see',
    time: '45s',
    xp: 25,
    help: 'Describe a scene in words so someone else can picture it.',
  },
];

const EXPLAIN: TalkRow[] = [
  {
    view: 'explain',
    title: 'Explain an idea',
    time: '60s',
    xp: 10,
    help: 'Read a short primer, then explain the idea in simple words.',
  },
  {
    view: 'teachback',
    title: 'Teach it back',
    time: '60s',
    xp: 10,
    help: 'Explain something you learned, like teaching a friend.',
  },
];

const QUICK_TALK: TalkRow[] = [
  {
    view: 'rapid',
    title: 'Rapid rep',
    time: '30s',
    xp: 10,
    help: 'One short prompt. Keep talking without stopping.',
  },
];

/** Plain-words doors to the six voice drills + breath test + normal-voice setup. */
const QUICK_DRILLS: PracticeRow[] = [
  { view: 'soft', title: 'Speak softly', time: '2 min', help: 'Hold a soft voice for four short lines.' },
  { view: 'ladder', title: 'Loud-to-soft ladder', time: '3 min', help: 'Say one line five times, from loud down to soft and back.' },
  { view: 'hold', title: 'Long soft hold', time: 'up to 60 sec', help: 'Hold a soft voiced sound as long as you can. Never whisper.' },
  { view: 'pause', title: 'Pause, don\u2019t push', time: '2 min', help: 'Stress one word with a short pause (a third of a second), not loudness.' },
  { view: 'pacer', title: 'Steady speed reader', time: '2 min', help: 'Read as words light up at your target speed in words per minute.' },
  { view: 'palette', title: 'Say it two ways', time: '1 min', help: 'One line in two moods. No score — just listen back.' },
  { view: 'weekly', title: 'Weekly breath-hold test', time: 'once a week', help: 'Say \u201Caaah\u201D at normal volume, then soft. Best of three.' },
  { view: 'normvoice', title: 'Set your normal voice', time: 'one time', help: 'Teach the app how loud your normal voice is, so meters match you.' },
];

function challengeHint(voiceGoal: 'softer' | 'slower' | 'pause_first'): string {
  if (voiceGoal === 'softer') return 'Keep it soft.';
  if (voiceGoal === 'slower') return 'Slow and clear.';
  return 'Pause between ideas.';
}

function RowButton({
  title,
  time,
  xp,
  help,
  onOpen,
}: {
  title: string;
  time: string;
  xp?: number;
  help: string;
  onOpen: () => void;
}) {
  const label = xp === undefined ? `${title}, ${time}` : `${title}, ${time}, +${xp} XP`;
  return (
    <div
      className="row tap speak-mode-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={label}
    >
      <div className="t">
        <div className="speak-mode-row-top">
          <b>{title}</b>
          <span className="badge b-pace speak-time-badge">{time}</span>
          {xp !== undefined && <span className="speak-xp-reward-tag">+{xp} XP</span>}
        </div>
        <small className="speak-mode-desc">{help}</small>
      </div>
      <span className="arw" aria-hidden="true">
        ›
      </span>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="tap" onClick={onBack} aria-label="Back to Speak">
      ← Back
    </button>
  );
}

export default function SpeakScreen({ initialCard, onCloseDrill }: SpeakScreenProps) {
  const [active, setActive] = useState<SpeakView | null>(initialCard ? 'rapid' : null);
  const overview = useSpeakOverview();
  const { plan, undo } = useWeekPlan();
  const challengeInputs: ChallengeInputs = {
    ...(plan?.focusWords ? { coachWords: plan.focusWords } : {}),
    ...(plan?.challengeFocus ? { coachFocus: plan.challengeFocus } : {}),
  };
  const { challenge, loading: challengeLoading } = useDailyChallenge(challengeInputs);
  const [savedResult, setSavedResult] = useState<ChallengeResultData | null>(null);
  const [saving, setSaving] = useState(false);

  const backToMenu = () => {
    setActive(null);
  };

  const handleCloseMode = () => {
    setActive(null);
    onCloseDrill?.();
  };

  const handleChallengeComplete = (
    _audio: CapturedAudio | null,
    _elapsedSec: number,
    _transcript?: string,
    result?: SpeakingAttemptResult,
  ) => {
    if (!challenge || !result) return;
    setSaving(true);
    void saveChallengeResult(challenge, result)
      .then((graded) => {
        setSavedResult(graded);
        overview.refresh();
      })
      .catch(() => {
        setSavedResult(null);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  // ── Drill / mode detail views ─────────────────────────────────────────────
  if (active === 'rapid') {
    return <RapidRepMode initialCard={initialCard} onClose={handleCloseMode} />;
  }
  if (active === 'story') {
    return <SixtySecMode onClose={handleCloseMode} />;
  }
  if (active === 'incident') {
    return <IncidentMode onClose={handleCloseMode} />;
  }
  if (active === 'describe') {
    return <DescribeMode onClose={handleCloseMode} />;
  }
  if (active === 'explain') {
    return <ExplainMode onClose={handleCloseMode} />;
  }
  if (active === 'teachback') {
    return <TeachBackMode onClose={handleCloseMode} />;
  }
  if (active === 'routine') {
    return <SessionRunner onClose={handleCloseMode} />;
  }

  if (active === 'challenge' && challenge) {
    return (
      <div className="screen speak-screen">
        <BackButton onBack={backToMenu} />
        <header className="speak-header">
          <p className="kicker">Today&apos;s challenge</p>
          <h1 className="h1s">{challenge.title}</h1>
          <p className="sub speak-header-sub">
            {challengeHint(challenge.voiceGoal)} About {challenge.targetSec} seconds. One try
            counts.
          </p>
        </header>
        {savedResult ? (
          <>
            <ChallengeResultView challenge={challenge} result={savedResult} />
            <button type="button" className="prim tap" onClick={backToMenu}>
              Done — back to Speak
            </button>
          </>
        ) : saving ? (
          <p className="sub">Saving your try…</p>
        ) : (
          <AudioRecorder
            durationSec={challenge.targetSec}
            targetVocab={challenge.useWord ? [challenge.useWord] : undefined}
            onComplete={handleChallengeComplete}
            onCancel={backToMenu}
          />
        )}
      </div>
    );
  }

  const drillDetail: Record<string, { title: string; help: string; node: React.ReactNode }> = {
    soft: { title: 'Speak softly', help: 'Hold a soft voice for four short lines.', node: <QuietVoiceDrill /> },
    ladder: { title: 'Loud-to-soft ladder', help: 'Say one line five times, from loud down to soft and back.', node: <VolumeLadderDrill /> },
    hold: { title: 'Long soft hold', help: 'Hold a soft voiced sound as long as you can. Never whisper.', node: <Level1HoldDrill /> },
    pause: { title: 'Pause, don\u2019t push', help: 'Stress one word with a short pause (a third of a second), not loudness.', node: <PauseDrill /> },
    pacer: { title: 'Steady speed reader', help: 'Read as words light up at your target speed in words per minute.', node: <PacerDrill /> },
    palette: { title: 'Say it two ways', help: 'One line in two moods. No score — just listen back.', node: <PaletteDrill /> },
    weekly: { title: 'Weekly breath-hold test', help: 'Say \u201Caaah\u201D at normal volume, then soft. Best of three.', node: <WeeklyCheck /> },
    normvoice: { title: 'Set your normal voice', help: 'Teach the app how loud your normal voice is, so meters match you.', node: <MicCalibrationRow /> },
  };
  const detail = active !== null ? drillDetail[active] : undefined;
  if (detail) {
    return (
      <div className="screen speak-screen">
        <BackButton onBack={backToMenu} />
        <header className="speak-header">
          <h1 className="h1s">{detail.title}</h1>
          <p className="sub speak-header-sub">{detail.help}</p>
        </header>
        {detail.node}
      </div>
    );
  }

  // ── Main menu: Today card + 3 groups ──────────────────────────────────────
  return (
    <div className="screen speak-screen">
      <header className="speak-header">
        <h1 className="h1s">Speak</h1>
        <p className="sub speak-header-sub">
          Short speaking reps. The mic is optional — everything here works silent too.
        </p>
      </header>

      {plan && (
        <section className="you-section" aria-label="This week's plan">
          <div className="row">
            <div className="t">
              <b>This week</b>
              <small>{plan.note}</small>
            </div>
            <button type="button" className="tap" onClick={() => void undo()}>
              Undo
            </button>
          </div>
        </section>
      )}

      <section className="you-section" aria-label="Today">
        {challengeLoading || !challenge ? (
          <div className="card" aria-label="Today's challenge">
            <p className="kicker">Today</p>
            <p className="sub">Loading today&apos;s challenge…</p>
          </div>
        ) : (
          <>
            <ChallengeCard
              challenge={challenge}
              done={overview.challengeDone}
              onStart={() => {
                setSavedResult(overview.challengeResult);
                setActive('challenge');
              }}
            />
            {(savedResult ?? overview.challengeResult) && (
              <ChallengeResultView
                challenge={challenge}
                result={(savedResult ?? overview.challengeResult)!}
              />
            )}
          </>
        )}
        <div
          className="row tap"
          role="button"
          tabIndex={0}
          onClick={() => setActive('routine')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActive('routine');
            }
          }}
          aria-label={`12-minute voice routine, day ${overview.routineDays + 1}`}
        >
          <span className="g" aria-hidden="true">
            🎙️
          </span>
          <div className="t">
            <b>
              12-minute voice routine · Day {overview.routineDays + 1}{' '}
              {overview.routineDoneToday && <span aria-label="done">✓</span>}
            </b>
            <small>Loosen up, hum, glide loud to soft, then pause and tone.</small>
          </div>
          <span className="arw" aria-hidden="true">
            ›
          </span>
        </div>
      </section>

      <section className="you-section" aria-label="Tell a story">
        <b>Tell a story</b>
        <div className="speak-modes-list">
          {TELL_A_STORY.map((m) => (
            <RowButton
              key={m.view}
              title={m.title}
              time={m.time}
              xp={m.xp}
              help={m.help}
              onOpen={() => setActive(m.view)}
            />
          ))}
        </div>
      </section>

      <section className="you-section" aria-label="Explain an idea">
        <b>Explain an idea</b>
        <div className="speak-modes-list">
          {EXPLAIN.map((m) => (
            <RowButton
              key={m.view}
              title={m.title}
              time={m.time}
              xp={m.xp}
              help={m.help}
              onOpen={() => setActive(m.view)}
            />
          ))}
        </div>
      </section>

      <section className="you-section" aria-label="Quick practice">
        <b>Quick practice</b>
        <div className="speak-modes-list">
          {QUICK_TALK.map((m) => (
            <RowButton
              key={m.view}
              title={m.title}
              time={m.time}
              xp={m.xp}
              help={m.help}
              onOpen={() => setActive(m.view)}
            />
          ))}
          {QUICK_DRILLS.map((d) => (
            <RowButton
              key={d.view}
              title={d.title}
              time={d.time}
              help={d.help}
              onOpen={() => setActive(d.view)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
