import { useState } from 'react';
import type { Card } from '../../types/contract';
import { useYou, type WeekPoint } from '../../features/you/useYou';
import BookmarksDrawer from './BookmarksDrawer';
import GoalSelector from './GoalSelector';
import InterestsManager from './InterestsManager';
import RecordingsList from './RecordingsList';
import CoachList from './CoachList';
import CoachBoxRow from './CoachBoxRow';

export interface YouScreenProps {
  onOpenSpeakWithCard?: (card: Card) => void;
}

type ChartMode = 'loud' | 'breath';

/**
 * Plain-words SVG trend over 8 weeks. Loudness compares session averages
 * against HIS OWN normal voice (dashed line) — there is no absolute 0 dB
 * target, so none is drawn. Breath mode shows weekly best hold in seconds.
 */
function TrendChart({
  title,
  ariaLabel,
  points,
  unit,
  reference,
  emptyText,
}: {
  title: string;
  ariaLabel: string;
  points: WeekPoint[];
  unit: string;
  reference?: { value: number; label: string } | null;
  emptyText: string;
}) {
  const W = 300;
  const H = 84;
  const PAD = 6;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const all = [...vals, ...(reference ? [reference.value] : [])];
  if (all.length === 0) {
    return (
      <div className="you-section">
        <b>{title}</b>
        <p className="sub">{emptyText}</p>
      </div>
    );
  }
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(min === max ? 1 : max - min, 0.5);
  const px = (i: number) => PAD + (i / Math.max(points.length - 1, 1)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - 8 - ((v - min) / span) * (H - PAD * 2 - 8);
  const linePts = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null);
  const line = linePts.map((p, k) => `${k === 0 ? 'M' : 'L'}${px(p.i)},${py(p.value as number)}`).join(' ');

  return (
    <div className="you-section">
      <b>{title}</b>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel}>
        {reference && (
          <line
            x1={0}
            y1={py(reference.value)}
            x2={W}
            y2={py(reference.value)}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeDasharray="4 3"
          />
        )}
        {linePts.length > 1 && <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />}
        {linePts.map((p) => (
          <circle key={p.i} cx={px(p.i)} cy={py(p.value as number)} r={3.5} fill="currentColor">
            <title>{`${p.label}: ${p.value}${unit}`}</title>
          </circle>
        ))}
      </svg>
      <p className="sub">
        {linePts.map((p) => `${p.label} ${p.value}${unit}`).join(' · ')}
        {reference ? ` · ${reference.label} ${reference.value}${unit}` : ''}
      </p>
    </div>
  );
}

export default function YouScreen({ onOpenSpeakWithCard }: YouScreenProps) {
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('loud');
  const {
    profile,
    streak,
    cardsLearned,
    minutesSpokenWeek,
    voiceVsNormal,
    normalDb,
    loudnessWeeks,
    breathWeeks,
    bookmarkCount,
    recordings,
  } = useYou();

  const latestLoud = [...loudnessWeeks].reverse().find((p) => p.value !== null)?.value ?? null;
  const loudVerdict =
    latestLoud === null
      ? 'No session loudness measured yet.'
      : normalDb === null
        ? 'No normal-voice sample yet — the dashed comparison line appears after your first calibration.'
        : `Lately your sessions run about ${Math.abs(Math.round(normalDb - latestLoud))} dB ${
            normalDb - latestLoud >= 0 ? 'softer' : 'louder'
          } than your normal voice.`;

  return (
    <div className="screen you-screen">
      <header className="you-header">
        <div className="you-header-top">
          <div>
            <h1 className="h1s">You</h1>
            <p className="you-header-sub">Total Progress &amp; Preferences</p>
          </div>
        </div>
      </header>

      {/* 4 headline numbers, each shown exactly once */}
      <div className="stat3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat">
          <b data-testid="stat-streak">{streak}</b>
          <small>Day streak</small>
        </div>
        <div className="stat">
          <b data-testid="stat-cards">{cardsLearned}</b>
          <small>Cards learned</small>
        </div>
        <div className="stat">
          <b data-testid="stat-minutes">{minutesSpokenWeek}</b>
          <small>Minutes spoken · this week</small>
        </div>
        <div className="stat">
          <b data-testid="stat-voice">{voiceVsNormal}</b>
          <small>Voice vs normal</small>
        </div>
      </div>

      {/* 1 chart: 8 weeks, toggle loudness / breath hold */}
      <div className="you-section-spacer">
        <section aria-label="Voice over 8 weeks">
          <div className="sechd"><b>Voice over 8 weeks</b></div>
          <div className="chips" role="group" aria-label="Choose what the chart shows">
            <button
              type="button"
              className={`chip tap${chartMode === 'loud' ? ' on' : ''}`}
              aria-pressed={chartMode === 'loud'}
              onClick={() => setChartMode('loud')}
            >
              Loudness
            </button>
            <button
              type="button"
              className={`chip tap${chartMode === 'breath' ? ' on' : ''}`}
              aria-pressed={chartMode === 'breath'}
              onClick={() => setChartMode('breath')}
            >
              Breath hold
            </button>
          </div>
          {chartMode === 'loud' ? (
            <>
              <TrendChart
                title="Session loudness vs your normal"
                ariaLabel="Session loudness over 8 weeks"
                points={loudnessWeeks}
                unit=" dB"
                reference={normalDb === null ? null : { value: normalDb, label: 'your normal' }}
                emptyText="— no session loudness measured yet"
              />
              <p className="sub">{loudVerdict}</p>
            </>
          ) : (
            <TrendChart
              title="Longest breath hold each week"
              ariaLabel="Breath hold over 8 weeks"
              points={breathWeeks}
              unit="s"
              emptyText="— no breath-hold checks yet"
            />
          )}
        </section>
      </div>

      {/* Coach rows: words / mistakes / topics become cards */}
      <div className="you-section-spacer">
        <CoachBoxRow />
      </div>

      <div className="you-section-spacer">
        <CoachList />
      </div>

      {/* Saved row */}
      <div className="you-section">
        <div className="sechd">
          <b>Saved</b>
        </div>
        <div
          className="row tap saved-bookmarks-trigger-row"
          role="button"
          tabIndex={0}
          onClick={() => setShowBookmarks(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowBookmarks(true);
            }
          }}
          aria-label={`View bookmarked cards (${bookmarkCount} saved)`}
        >
          <span className="g" aria-hidden="true">🔖</span>
          <div className="t">
            <b>Bookmarked Cards</b>
            <small>{bookmarkCount} saved cards</small>
          </div>
          <span className="arw" aria-hidden="true">›</span>
        </div>
      </div>

      {/* Recordings row */}
      <div className="you-section-spacer">
        <RecordingsList recordings={recordings} />
      </div>

      {/* Settings rows: goal + interests */}
      <div className="you-section-spacer">
        <section aria-label="Settings">
          <div className="sechd"><b>Settings</b></div>
          <div className="you-section-spacer">
            <GoalSelector currentGoal={profile?.dailyGoal} />
          </div>
          <div className="you-section-spacer you-bottom-spacer">
            <InterestsManager interests={profile?.interests ?? []} />
          </div>
        </section>
      </div>

      {/* Bookmarks Drawer Modal */}
      {showBookmarks && (
        <BookmarksDrawer
          onClose={() => setShowBookmarks(false)}
          onOpenSpeakWithCard={onOpenSpeakWithCard}
        />
      )}
    </div>
  );
}
