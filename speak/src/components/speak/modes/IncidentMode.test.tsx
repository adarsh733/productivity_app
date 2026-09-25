import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import IncidentMode from './IncidentMode';
import { db } from '../../../db/db';

describe('IncidentMode Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.cards.put({
      id: 'sit-test',
      type: 'situation',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      kind: 'incident',
      title: 'The missed flight',
      prompt: 'Tell a friend how you missed a flight.',
      beats: ['a', 'b', 'c'],
      targetVocab: ['hectic'],
      targetSec: 60,
    } as never);
  });

  it('renders situation title and start button from database cards', async () => {
    render(<IncidentMode onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/The missed flight/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('shows a friendly empty state when content is missing', async () => {
    await db.cards.clear();
    render(<IncidentMode onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/i)).toBeInTheDocument();
    });
  });

  it('invokes onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<IncidentMode onClose={onClose} />);

    const closeBtn = await screen.findByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
