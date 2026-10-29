import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AskScreen from './AskScreen';
import { db } from '../../db/db';
import { ASK_MAX_CHARS, ASK_NEED_LETTER } from '../../features/ask/askPipeline';

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.asks.clear(), db.lessonProgress.clear(), db.meta.clear()]);
});

function box(): HTMLTextAreaElement {
  return screen.getByLabelText('Ask anything') as HTMLTextAreaElement;
}

describe('AskScreen input', () => {
  it('is a textarea capped at 1000 characters', () => {
    render(<AskScreen />);
    expect(box().tagName).toBe('TEXTAREA');
    expect(box().maxLength).toBe(ASK_MAX_CHARS);
  });

  it('shows the counter only near the limit', () => {
    render(<AskScreen />);
    fireEvent.change(box(), { target: { value: 'What does bandwidth mean?' } });
    expect(screen.queryByTestId('ask-counter')).toBeNull();
    fireEvent.change(box(), { target: { value: 'a'.repeat(950) } });
    expect(screen.getByTestId('ask-counter').textContent).toBe(`950 / ${ASK_MAX_CHARS}`);
  });

  it('emoji only: the Ask button stays off and a plain hint shows', () => {
    render(<AskScreen />);
    fireEvent.change(box(), { target: { value: '🙂🙂' } });
    expect(screen.getByText(ASK_NEED_LETTER)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: 'What is jugaad?' } });
    expect(screen.queryByText(ASK_NEED_LETTER)).toBeNull();
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
