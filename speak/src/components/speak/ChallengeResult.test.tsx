import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChallengeResult from './ChallengeResult';
import type { DailyChallenge } from '../../types/contract';

const challenge: DailyChallenge = {
  date: '2026-09-26',
  title: 'Give a 45-second update — keep it soft',
  voiceGoal: 'softer',
  targetSec: 45,
  useWord: 'nuance',
  avoidPhrase: 'revert back',
};

describe('ChallengeResult', () => {
  it('lists each check with mark and one plain why-line', () => {
    render(
      <ChallengeResult
        challenge={challenge}
        result={{
          recordingId: 'r1',
          longEnough: true,
          usedWord: true,
          avoidedPhrase: false,
          voiceGoalMet: true,
          done: false,
        }}
      />,
    );
    expect(screen.getByText(/Spoke long enough/)).toBeInTheDocument();
    expect(screen.getByText(/Used "nuance"/)).toBeInTheDocument();
    expect(screen.getByText(/Avoided "revert back"/)).toBeInTheDocument();
    expect(screen.getByText(/Kept it soft/)).toBeInTheDocument();
    // Marks present: ✓ for passes, ✗ for the slipped phrase
    expect(screen.getByText(/slipped in/)).toBeInTheDocument();
  });

  it('shows dash for unmeasurable checks, never a guessed claim', () => {
    const { container } = render(
      <ChallengeResult
        challenge={challenge}
        result={{
          recordingId: 'r2',
          longEnough: false,
          usedWord: null,
          avoidedPhrase: null,
          voiceGoalMet: null,
          done: false,
        }}
      />,
    );
    expect(screen.getByText(/could not check the word/)).toBeInTheDocument();
    expect(screen.getByText(/No loudness data/)).toBeInTheDocument();
    expect(container.textContent).toContain('—');
  });
});
