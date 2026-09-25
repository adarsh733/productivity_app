import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import DescribeMode from './DescribeMode';
import { db } from '../../../db/db';

describe('DescribeMode Real RTL Component Suite', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.cards.put({
      id: 'dsc-test',
      type: 'describe',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      title: 'Test Scene',
      scene: 'A quiet room with one chair.',
      alt: 'A quiet room.',
      prompt: 'Describe the quiet room.',
      beats: ['a', 'b', 'c'],
      targetVocab: ['quiet'],
      targetSec: 45,
    } as never);
  });

  it('renders describe scene title, prompt, hints, and start button', async () => {
    render(<DescribeMode onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Test Scene/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<DescribeMode onClose={onClose} />);

    const closeBtn = await screen.findByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
