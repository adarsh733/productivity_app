import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SixtySecMode from './SixtySecMode';

describe('SixtySecMode Real RTL Component Suite', () => {
  it('renders story structure prompt, guidance beats, and audio recorder', () => {
    render(<SixtySecMode onClose={vi.fn()} />);

    expect(screen.getByText(/60s Story Structure/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
    expect(screen.getByText(/Speak naturally when ready/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SixtySecMode onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
