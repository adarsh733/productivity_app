import type { ChallengeResult, DailyChallenge } from '../../types/contract';

export interface ChallengeResultProps {
  challenge: DailyChallenge;
  result: ChallengeResult;
}

interface Row {
  key: string;
  label: string;
  state: boolean | null;
  why: string;
}

function mark(state: boolean | null): string {
  if (state === true) return '✓';
  if (state === false) return '✗';
  return '—';
}

function voiceWhy(voiceGoal: DailyChallenge['voiceGoal'], state: boolean | null): string {
  if (state === null) {
    if (voiceGoal === 'softer') return 'No loudness data — could not check softness.';
    if (voiceGoal === 'slower') return 'No speed data — could not check pace.';
    return 'No pause data — could not check pauses.';
  }
  if (voiceGoal === 'softer') return state ? 'You stayed soft.' : 'It came out loud — try softer.';
  if (voiceGoal === 'slower') return state ? 'Slow and clear — nice.' : 'A bit fast — slow down.';
  return state ? 'You left real pauses.' : 'No clear pauses — leave gaps.';
}

/**
 * Challenge result screen. Every check shows ✓ / ✗ / — plus one plain
 * why-line. Null (unmeasurable) always shows "—" — no measured claim is
 * ever shown unmeasured.
 */
export default function ChallengeResult({ challenge, result }: ChallengeResultProps) {
  const rows: Row[] = [
    {
      key: 'long',
      label: 'Spoke long enough',
      state: result.longEnough,
      why: result.longEnough
        ? 'You kept going past the target time.'
        : 'It stopped short — try the full time.',
    },
    {
      key: 'word',
      label: challenge.useWord ? `Used "${challenge.useWord}"` : 'Used the word',
      state: result.usedWord,
      why:
        result.usedWord === null
          ? challenge.useWord
            ? 'No transcript — could not check the word.'
            : 'No word set today.'
          : result.usedWord
            ? `You used "${challenge.useWord}".`
            : `"${challenge.useWord}" was not heard — try it next time.`,
    },
    {
      key: 'avoid',
      label: challenge.avoidPhrase ? `Avoided "${challenge.avoidPhrase}"` : 'Avoided the phrase',
      state: result.avoidedPhrase,
      why:
        result.avoidedPhrase === null
          ? challenge.avoidPhrase
            ? 'No transcript — could not check.'
            : 'Nothing to avoid today.'
          : result.avoidedPhrase
            ? `You avoided "${challenge.avoidPhrase}".`
            : `"${challenge.avoidPhrase}" slipped in — try again without it.`,
    },
    {
      key: 'voice',
      label:
        challenge.voiceGoal === 'softer'
          ? 'Kept it soft'
          : challenge.voiceGoal === 'slower'
            ? 'Slowed down'
            : 'Paused between ideas',
      state: result.voiceGoalMet,
      why: voiceWhy(challenge.voiceGoal, result.voiceGoalMet),
    },
  ];

  return (
    <section className="card" aria-label="Challenge result">
      <p className="kicker">Challenge result</p>
      <h2>{challenge.title}</h2>
      <p className="sub" role="status">
        {result.done ? '✓ Challenge done.' : 'Not yet — one more try counts.'}
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <span aria-hidden="true">{mark(row.state)} </span>
            <b>{row.label}</b>
            <br />
            <span className="sub">{row.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
