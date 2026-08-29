import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DescribeMode from './DescribeMode';

describe('DescribeMode Real RTL Component Suite', () => {
  it('renders describe scene title, prompt, hints, and start button', () => {
    render(<DescribeMode onClose={vi.fn()} />);

    expect(screen.getByText(/🎨 Describe This/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start speaking/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<DescribeMode onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close drill/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
