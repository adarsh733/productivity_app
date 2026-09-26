import type { DailyChallenge } from '../../types/contract';

export interface ChallengeCardProps {
  challenge: DailyChallenge;
  done?: boolean;
  onStart?: () => void;
}

function voiceLine(voiceGoal: DailyChallenge['voiceGoal']): string {
  if (voiceGoal === 'softer') return 'Keep it soft.';
  if (voiceGoal === 'slower') return 'Slow and clear.';
  return 'Pause between ideas.';
}

/**
 * "Today" challenge card. Big Start button, check mark when done.
 * Mic never gates: the card renders with the mic denied.
 */
export default function ChallengeCard({ challenge, done = false, onStart }: ChallengeCardProps) {
  return (
    <section className="card" aria-label="Today's challenge">
      <p className="kicker">Today</p>
      <h2>{challenge.title}</h2>
      <p className="sub">{voiceLine(challenge.voiceGoal)}</p>
      {challenge.useWord && (
        <p className="sub">
          Use: <b>{challenge.useWord}</b>
        </p>
      )}
      {challenge.avoidPhrase && (
        <p className="sub">
          Avoid: <b>{challenge.avoidPhrase}</b>
        </p>
      )}
      <p className="sub">About {challenge.targetSec} seconds. One try counts.</p>
      {onStart && (
        <button type="button" className="prim tap" onClick={onStart}>
          {done ? 'Done — try again' : 'Start'}
        </button>
      )}
      {done && (
        <p className="sub" role="status">
          ✓ Done today.
        </p>
      )}
    </section>
  );
}
