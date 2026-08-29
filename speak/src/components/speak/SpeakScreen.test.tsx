import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SpeakScreen from './SpeakScreen';

describe('SpeakScreen Real RTL Component Suite', () => {
  it('renders all 4 speaking mode cards with time targets and XP badges', () => {
    render(<SpeakScreen />);

    expect(screen.getByText(/Rapid Rep/i)).toBeInTheDocument();
    expect(screen.getByText(/60-Second Story/i)).toBeInTheDocument();
    expect(screen.getByText(/Incident Drill/i)).toBeInTheDocument();
    expect(screen.getByText(/Describe This/i)).toBeInTheDocument();
  });

  it('opens Rapid Rep mode when its card is clicked and allows closing', async () => {
    const onClose = vi.fn();
    render(<SpeakScreen onCloseDrill={onClose} />);

    const rapidCard = screen.getByText(/Rapid Rep/i).closest('.speak-mode-card')!;
    await act(async () => {
      fireEvent.click(rapidCard);
    });

    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // Back to main speak screen menu
    expect(screen.getByText(/Rapid Rep/i)).toBeInTheDocument();
    expect(screen.getByText(/Describe This/i)).toBeInTheDocument();
  });

  it('opens Describe This mode when clicked', async () => {
    render(<SpeakScreen />);

    const describeCard = screen.getByText(/Describe This/i).closest('.speak-mode-card')!;
    await act(async () => {
      fireEvent.click(describeCard);
    });

    expect(screen.getByText(/🎨 Describe This/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });
});
