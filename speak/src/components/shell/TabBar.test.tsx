import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TabBar from './TabBar';

describe('TabBar (v5: Feed · Ask · Me)', () => {
  it('renders exactly three tabs and no old ones', () => {
    render(<TabBar active="feed" onChange={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Feed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Me/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Browse/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Speak/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /You/i })).toBeNull();
  });

  it('keeps all three tabs the same: an icon and a label, nothing raised', () => {
    render(<TabBar active="feed" onChange={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelectorAll('svg')).toHaveLength(1);
      expect(button.querySelector('.tab-ask-btn')).toBeNull();
    }
  });

  it('marks the active tab with aria-current and calls onChange when tapped', async () => {
    const onChange = vi.fn();
    render(<TabBar active="feed" onChange={onChange} />);

    const askBtn = screen.getByRole('button', { name: /Ask/i });
    expect(screen.getByRole('button', { name: /Feed/i })).toHaveAttribute('aria-current', 'page');
    expect(askBtn).not.toHaveAttribute('aria-current');

    await act(async () => {
      fireEvent.click(askBtn);
    });
    expect(onChange).toHaveBeenCalledWith('ask');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Me/i }));
    });
    expect(onChange).toHaveBeenCalledWith('me');
  });
});
