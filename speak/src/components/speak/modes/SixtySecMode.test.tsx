import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import SixtySecMode from './SixtySecMode';
import { db } from '../../../db/db';

describe('SixtySecMode Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.cards.put({
      id: 'sm-test',
      type: 'story_move',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      move: 'Land the ending on a short sentence.',
      why: 'Short landings stick.',
      example: 'Radio hosts closing a segment.',
    } as never);
  });

  it('renders story move from database cards and audio recorder', async () => {
    render(<SixtySecMode onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Land the ending/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('shows a friendly empty state when content is missing', async () => {
    await db.cards.clear();
    render(<SixtySecMode onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SixtySecMode onClose={onClose} />);

    const closeBtn = await screen.findByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
