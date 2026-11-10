import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import FeedbackSheet from './FeedbackSheet';
import { db } from '../../db/db';
import type { WordsCard } from '../../types/contract';

const sampleWordsCard: WordsCard = {
  id: 'v7-words-01',
  type: 'module',
  module: 'words',
  topic: 'deafening',
  word: 'deafening',
  pos: 'adjective',
  say: 'DEF-uh-ning',
  meaning: "So loud you can't hear anything else.",
  examples: [
    { label: 'AT HOME', text: 'The party next door is **deafening**.', icon: 'home' },
    { label: 'WITH FRIENDS', text: 'The noise in the stadium was **deafening**.', icon: 'friends' },
  ],
  right: { label: 'SOUND ONLY', text: 'The applause was **deafening**.' },
  wrong: [{ label: 'NOT LIGHT', text: 'The sunlight was **deafening**.' }],
  rule: 'Only use deafening for sound.',
  lang: 'en',
  tags: [],
  source: 'seed',
  status: 'active',
  createdAt: 1,
};

describe('FeedbackSheet Component Suite', () => {
  beforeEach(async () => {
    cleanup();
    await db.feedback.clear();
  });

  afterEach(async () => {
    cleanup();
    await db.feedback.clear();
  });

  it('renders title, thumb buttons, reason chips, and comment input', () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'What did you think?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thumbs up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thumbs down' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Too easy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Too hard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confusing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wrong English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loved this' })).toBeInTheDocument();

    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it('initializes with startThumb prop when provided', async () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} startThumb="down" onClose={onClose} />);

    const thumbDownBtn = screen.getByRole('button', { name: 'Thumbs down' });
    expect(thumbDownBtn).toHaveAttribute('aria-pressed', 'true');
    expect(thumbDownBtn.className).toContain('is-active');

    // Shows reply line for thumbs down
    await waitFor(() => {
      expect(
        screen.getByText('Got it: Fewer cards like this in Words from the next batch.'),
      ).toBeInTheDocument();
    });
  });

  it('clicking thumbs up sets thumb to up and updates reply', async () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    const thumbUpBtn = screen.getByRole('button', { name: 'Thumbs up' });
    await act(async () => {
      fireEvent.click(thumbUpBtn);
    });

    await waitFor(() => {
      expect(thumbUpBtn).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByText('Got it: More like this in Words from the next batch.'),
      ).toBeInTheDocument();
    });

    // Check DB row was written
    const fb = await db.feedback.get('fb-v7-words-01');
    expect(fb?.thumb).toBe('up');
  });

  it('clicking a reason chip toggles it and saves feedback', async () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    const tooEasyChip = screen.getByRole('button', { name: 'Too easy' });
    await act(async () => {
      fireEvent.click(tooEasyChip);
    });

    await waitFor(() => {
      expect(tooEasyChip).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByText('Got it: Words gets harder now.'),
      ).toBeInTheDocument();
    });

    const fb = await db.feedback.get('fb-v7-words-01');
    expect(fb?.reasons).toContain('too_easy');
  });

  it('entering a comment and clicking send saves feedback with custom comment', async () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: 'Comment' });
    fireEvent.change(input, { target: { value: 'Already know this word' } });

    const sendBtn = screen.getByRole('button', { name: 'Send feedback' });
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    await waitFor(async () => {
      const fb = await db.feedback.get('fb-v7-words-01');
      expect(fb?.comment).toBe('Already know this word');
    });

    // The reply shows once send() has finished (it saves first, then answers).
    expect(
      await screen.findByText('Got it: Feedback noted for the next Words batch.'),
    ).toBeInTheDocument();
  });

  it('pressing Enter in comment field sends feedback', async () => {
    const onClose = vi.fn();
    render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: 'Comment' });
    fireEvent.change(input, { target: { value: 'Nice example' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(async () => {
      const fb = await db.feedback.get('fb-v7-words-01');
      expect(fb?.comment).toBe('Nice example');
    });
  });

  it('clicking backdrop, handle, or pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    const { unmount } = render(<FeedbackSheet card={sampleWordsCard} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('feedback-sheet-handle'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('feedback-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);

    unmount();
  });
});
