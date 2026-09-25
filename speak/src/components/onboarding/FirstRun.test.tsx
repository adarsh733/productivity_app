import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FirstRun, { isFirstRunCompleted, setFirstRunCompleted } from './FirstRun';

describe('FirstRun Onboarding Component Suite', () => {
  it('detects and sets completion flag', () => {
    localStorage.clear();
    expect(isFirstRunCompleted()).toBe(false);
    setFirstRunCompleted();
    expect(isFirstRunCompleted()).toBe(true);
  });

  it('renders onboarding questions, chips, and goal pills', () => {
    const onComplete = vi.fn();
    render(<FirstRun onComplete={onComplete} />);

    expect(screen.getByText(/What do you want/)).toBeDefined();
    expect(screen.getByText('Office English')).toBeDefined();
    expect(screen.getByText('Practical Hindi')).toBeDefined();
    expect(screen.getByText(/Casual/)).toBeDefined();
    expect(screen.getByText(/Regular/)).toBeDefined();
    expect(screen.getByText(/Serious/)).toBeDefined();
    expect(screen.getByText(/Start scrolling/)).toBeDefined();
  });

  it('toggles interests when tapped', () => {
    const onComplete = vi.fn();
    render(<FirstRun onComplete={onComplete} />);

    const hindiChip = screen.getByRole('button', { name: 'Practical Hindi' });
    expect(hindiChip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(hindiChip);
    expect(hindiChip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(hindiChip);
    expect(hindiChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('allows selecting daily goal pill', () => {
    const onComplete = vi.fn();
    render(<FirstRun onComplete={onComplete} />);

    const seriousPill = screen.getByRole('button', { name: /Serious/ });
    expect(seriousPill.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(seriousPill);
    expect(seriousPill.getAttribute('aria-pressed')).toBe('true');
  });
});
