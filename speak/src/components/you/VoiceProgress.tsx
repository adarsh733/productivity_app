import { useMemo } from 'react';
import type { VoiceSample } from '../../types/contract';

/**
 * Headline voice numbers over time — plain SVG, no chart library.
 * Each chart seeds the Aug 2026 baseline as the first point ("Aug 2026 self-test")
 * with a target line. Only measured points are shown.
 */
const BASELINES: Array<{
  kinds: Array<VoiceSample['kind']>;
  label: string;
  baseline: number;
  baselineLabel: string;
  target: number;
  unit: string;
}> = [
  { kinds: ['mpt_habitual'], label: 'MPT at normal volume', baseline: 15.5, baselineLabel: 'Aug 2026 self-test', target: 24.5, unit: 's' },
  { kinds: ['mpt_soft'], label: 'MPT soft', baseline: 25, baselineLabel: 'Aug 2026 self-test', target: 25, unit: 's' },
  { kinds: ['session_db'], label: 'Session loudness', baseline: 0, baselineLabel: '', target: 0, unit: 'dB' },
  { kinds: ['level1_hold'], label: 'Level-1 hold', baseline: 0, baselineLabel: '', target: 60, unit: 's' },
];

function Chart({ label, points, target, unit }: { label: string; points: Array<{ x: string; y: number }>; target: number; unit: string }) {
  const W = 280;
  const H = 64;
  const allY = [...points.map((p) => p.y), target].filter((v) => Number.isFinite(v));
  if (allY.length === 0) {
    return (
      <div className="you-section">
        <b>{label}</b>
        <p className="sub">— no measurements yet</p>
      </div>
    );
  }
  const min = Math.min(...allY);
  const max = Math.max(...allY);
  const span = Math.max(1, max - min);
  const px = (i: number) => (points.length <= 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4);
  const py = (v: number) => H - 6 - ((v - min) / span) * (H - 12);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(p.y)}`).join(' ');

  return (
    <div className="you-section">
      <b>{label}</b>
      <svg width={W} height={H} role="img" aria-label={`${label} over time`}>
        <line x1={0} y1={py(target)} x2={W} y2={py(target)} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="4 3" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(p.y)} r={3} fill="currentColor">
            <title>{`${p.x}: ${p.y}${unit}`}</title>
          </circle>
        ))}
      </svg>
      <p className="sub">
        {points.map((p) => `${p.x} ${p.y}${unit}`).join(' · ')} · target {target}{unit}
      </p>
    </div>
  );
}

export default function VoiceProgress({ samples }: { samples: VoiceSample[] }) {
  const charts = useMemo(() => {
    return BASELINES.map((b) => {
      const pts: Array<{ x: string; y: number }> = [];
      if (b.baselineLabel) pts.push({ x: b.baselineLabel, y: b.baseline });
      const rows = samples
        .filter((s) => b.kinds.includes(s.kind))
        .sort((x, y) => x.at - y.at)
        .slice(-12);
      for (const r of rows) pts.push({ x: r.date, y: Math.round(r.value * 10) / 10 });
      // Session loudness has no absolute baseline — show only measured points.
      const points = b.kinds[0] === 'session_db' || b.kinds[0] === 'level1_hold' ? pts.filter((p) => !p.x.startsWith('Aug')) : pts;
      return { ...b, points };
    });
  }, [samples]);

  // Loud-to-soft gap as text (deficit — smaller is better).
  const habitual = samples.filter((s) => s.kind === 'mpt_habitual').sort((a, b) => b.at - a.at)[0];
  const soft = samples.filter((s) => s.kind === 'mpt_soft').sort((a, b) => b.at - a.at)[0];
  const gap = habitual && soft ? Math.round((soft.value - habitual.value) * 10) / 10 : null;

  return (
    <section aria-label="Voice progress">
      <div className="sechd"><b>Voice progress</b></div>
      {charts.map((c) => (
        <Chart key={c.label} label={c.label} points={c.points} target={c.target} unit={c.unit} />
      ))}
      <p className="sub">
        Loud-to-soft gap: {gap !== null ? `${gap}s (target under 3s; smaller is better)` : '— measure both holds in the weekly check'}
      </p>
    </section>
  );
}
