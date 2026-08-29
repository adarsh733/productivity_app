import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import IncidentMode from './IncidentMode';

describe('IncidentMode Real RTL Component Suite', () => {
  it('renders incident scenario, narrative anchors, and audio recorder', () => {
    render(<IncidentMode onClose={vi.fn()} />);

    expect(screen.getByText(/Incident Rep/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('invokes onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<IncidentMode onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
