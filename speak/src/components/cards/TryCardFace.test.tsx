import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TryCardFace from './TryCardFace';
import CardFace from './CardFace';
import type { TeachCard, WordCard } from '../../types/contract';

const tryCard: TeachCard = {
  id: 'try-clearly-1',
  type: 'teach',
  lang: 'en',
  tags: [],
  source: 'seed',
  status: 'active',
  createdAt: 0,
  track: 'clearly',
  level: 2,
  kind: 'try',
  category: 'Answer first',
  title: 'Point, Reason, Example, Point',
  rule: 'Say the answer first, then one reason, then the answer again.',
  examples: { work: 'One week late. The partner changed their API.', everyday: 'Rain, so we left early.' },
  analogy: 'Like a cricket scoreboard: the result first, then the overs.',
  tryPrompt: 'Your manager stops by: "Why did the launch slip?"',
  register: 'office',
  answer: "One week late. The payment partner changed their API on Monday. We'll launch on the 17th.",
};

describe('TryCardFace (v5)', () => {
  it('shows the moment, the shape and the chips, with the answer hidden', () => {
    render(<TryCardFace card={tryCard} />);
    expect(screen.getByText('Try')).toBeDefined();
    const chip = screen.getByText('🎯 Speak clearly · L2');
    expect(chip.getAttribute('data-track')).toBe('clearly');
    expect(screen.getByText('The moment')).toBeDefined();
    expect(screen.getByText(/Why did the launch slip/)).toBeDefined();
    expect(screen.getByText('Use the shape')).toBeDefined();
    expect(screen.getByText('Point, Reason, Example, Point')).toBeDefined();
    expect(screen.getByText(/Say the answer first/)).toBeDefined();
    expect(screen.getByText(/Think of your answer, then tap/)).toBeDefined();
    // The answer is not on the page until the tap.
    expect(screen.queryByText(/payment partner changed their API/)).toBeNull();
    expect(screen.queryByTestId('try-great')).toBeNull();
  });

  it('reveals the great answer on tap, and the button goes away', () => {
    render(<TryCardFace card={tryCard} />);
    fireEvent.click(screen.getByRole('button', { name: /Show a great answer/i }));
    expect(screen.getByTestId('try-great').textContent).toContain('payment partner changed their API');
    expect(screen.queryByRole('button', { name: /Show a great answer/i })).toBeNull();
  });

  it('falls back to the work example when no answer is stored', () => {
    render(<TryCardFace card={{ ...tryCard, answer: undefined }} />);
    fireEvent.click(screen.getByRole('button', { name: /Show a great answer/i }));
    expect(screen.getByTestId('try-great').textContent).toBe(tryCard.examples.work);
  });

  it('has no buttons beyond the reveal unless handlers are given; Say mine is optional', () => {
    const { rerender } = render(<TryCardFace card={tryCard} />);
    expect(screen.queryByText('Next ✓')).toBeNull();
    expect(screen.queryByText(/Say mine/)).toBeNull();

    const onNext = vi.fn();
    rerender(<TryCardFace card={tryCard} onNext={onNext} />);
    expect(screen.getByText('Next ✓')).toBeDefined();
    expect(screen.queryByText(/Say mine/)).toBeNull();

    const onSayMine = vi.fn();
    rerender(<TryCardFace card={tryCard} onNext={onNext} onSayMine={onSayMine} />);
    fireEvent.click(screen.getByRole('button', { name: /Say my answer/i }));
    fireEvent.click(screen.getByRole('button', { name: /Advance to next card/i }));
    expect(onSayMine).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('CardFace sends a Try teach card here, with Got it as Next and the mic wired', () => {
    const onGotIt = vi.fn();
    const onSayMine = vi.fn();
    render(<CardFace card={tryCard} onGotIt={onGotIt} onAgain={() => {}} onSave={() => {}} onSayMine={onSayMine} />);
    expect(screen.getByText('The moment')).toBeDefined();
    expect(screen.getByText('Next ✓')).toBeDefined();
    expect(screen.queryByText('Got it ✓')).toBeNull();
    expect(screen.queryByText('Again ↻')).toBeNull();
    fireEvent.click(screen.getByText('Next ✓'));
    fireEvent.click(screen.getByText(/Say mine/));
    expect(onGotIt).toHaveBeenCalledTimes(1);
    expect(onSayMine).toHaveBeenCalledTimes(1);
  });

  it('other kinds keep the teach face', () => {
    render(<CardFace card={{ ...tryCard, kind: 'learn' }} />);
    expect(screen.queryByText('The moment')).toBeNull();
    expect(screen.getByText('Learn')).toBeDefined();
  });
});

describe('old cards show their work and everyday examples and analogy (v5)', () => {
  const base: WordCard = {
    id: 'w-flag',
    type: 'word',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 0,
    term: 'flag',
    pos: 'verb',
    meaning: 'to point out a problem early',
    examples: ['I flagged the risk.', 'Flag it early.'],
    say: 'Flag a risk.',
  };

  it('shows them under the card, with small-talk labels on small talk', () => {
    const card: WordCard = {
      ...base,
      skill: {
        track: 'words',
        level: 1,
        kind: 'learn',
        work: "I'd like to flag a risk on the release.",
        everyday: 'Flag it if the milk smells off.',
        analogy: 'Like a linesman raising his flag at a cricket match.',
      },
    };
    const { rerender } = render(<CardFace card={card} />);
    expect(screen.getByTestId('skill-parts')).toBeDefined();
    expect(screen.getByText('At work')).toBeDefined();
    expect(screen.getByText("I'd like to flag a risk on the release.")).toBeDefined();
    expect(screen.getByText('In daily life')).toBeDefined();
    expect(screen.getByText('Flag it if the milk smells off.')).toBeDefined();
    expect(screen.getByText(/linesman raising his flag/)).toBeDefined();
    expect(screen.getByTestId('track-chip').textContent).toBe('🔤 Words · L1');

    rerender(<CardFace card={{ ...card, skill: { ...card.skill!, track: 'smalltalk' } }} />);
    expect(screen.getByText('They ask · work')).toBeDefined();
  });

  it('shows only the parts the tag has, and nothing for an untouched card', () => {
    const { rerender } = render(<CardFace card={base} />);
    expect(screen.queryByTestId('skill-parts')).toBeNull();

    rerender(<CardFace card={{ ...base, skill: { track: 'words', kind: 'learn', analogy: 'Like a flag.' } }} />);
    expect(screen.getByText(/Like a flag/)).toBeDefined();
    expect(screen.queryByText('At work')).toBeNull();
    expect(screen.queryByText('In daily life')).toBeNull();
  });
});

describe('TryCardFace with nothing to reveal', () => {
  it('no answer and no work example: no reveal button, no empty box, Say mine stays', () => {
    const bare = { ...tryCard, answer: undefined, examples: { work: '  ', everyday: 'e' } };
    const onSayMine = vi.fn();
    render(<TryCardFace card={bare} onSayMine={onSayMine} />);
    expect(screen.queryByRole('button', { name: /Show a great answer/i })).toBeNull();
    expect(screen.queryByTestId('try-great')).toBeNull();
    expect(screen.queryByText(/Think of your answer, then tap/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Say my answer out loud' }));
    expect(onSayMine).toHaveBeenCalledTimes(1);
  });
});
