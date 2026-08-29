import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RapidRepMode from './RapidRepMode';
import type { WordCard } from '../../../types/contract';

describe('RapidRepMode Real RTL Component Suite', () => {
  const sampleCard: WordCard = {
    id: 'w-tangible',
    type: 'word',
    lang: 'en',
    tags: ['office'],
    source: 'seed',
    status: 'active',
    createdAt: 0,
    term: 'tangible',
    pos: 'adjective',
    meaning: 'Perceptible by touch; clear and definite.',
    examples: ['tangible progress', 'tangible results'],
    say: 'Say this to emphasize concrete results.',
  };

  it('renders card context when provided', () => {
    render(<RapidRepMode initialCard={sampleCard} onClose={vi.fn()} />);

    expect(screen.getAllByText(/tangible/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('renders default quick cue when no card is provided', () => {
    render(<RapidRepMode onClose={vi.fn()} />);

    expect(screen.getByText(/Rapid Speaking Rep/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<RapidRepMode onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
