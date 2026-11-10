import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TabBar from './TabBar';

describe('TabBar (Feed · Favorites · Ask · Me)', () => {
  it('renders exactly four tabs in the set order and no old ones', () => {
    render(<TabBar active="feed" onChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Feed tab',
      'Favorites tab',
      'Ask tab',
      'Me tab',
    ]);
    expect(screen.queryByRole('button', { name: /Browse/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Speak/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /You/i })).toBeNull();
  });

  it('keeps all tabs the same: an icon and a label, nothing raised', () => {
    render(<TabBar active="feed" onChange={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelectorAll('svg')).toHaveLength(1);
      expect(button.querySelector('.tab-ask-btn')).toBeNull();
    }
  });

  it('marks the active tab with aria-current and calls onChange when tapped', async () => {
    const onChange = vi.fn();
    render(<TabBar active="ask" onChange={onChange} />);

    const favBtn = screen.getByRole('button', { name: 'Favorites tab' });
    expect(screen.getByRole('button', { name: 'Ask tab' })).toHaveAttribute('aria-current', 'page');
    expect(favBtn).not.toHaveAttribute('aria-current');

    for (const [name, tab] of [
      ['Favorites tab', 'favorites'],
      ['Ask tab', 'ask'],
      ['Me tab', 'me'],
      ['Feed tab', 'feed'],
    ] as const) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
      });
      expect(onChange).toHaveBeenLastCalledWith(tab);
    }
  });
});
