import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TabBar from './TabBar';

describe('TabBar Real RTL Component Suite', () => {
  it('renders all four primary navigation tabs', () => {
    render(<TabBar active="feed" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Feed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Browse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Speak/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /You/i })).toBeInTheDocument();
  });

  it('marks active tab with aria-current and calls onChange when tab is tapped', async () => {
    const onChange = vi.fn();
    render(<TabBar active="feed" onChange={onChange} />);

    const browseBtn = screen.getByRole('button', { name: /Browse/i });
    expect(screen.getByRole('button', { name: /Feed/i })).toHaveAttribute('aria-current', 'page');
    expect(browseBtn).not.toHaveAttribute('aria-current');

    await act(async () => {
      fireEvent.click(browseBtn);
    });

    expect(onChange).toHaveBeenCalledWith('browse');
  });
});
