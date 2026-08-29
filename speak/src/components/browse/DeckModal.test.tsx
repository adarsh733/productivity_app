import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeckModal from './DeckModal';
import type { Card } from '../../types/contract';
import type { CategoryDeck } from '../../features/browse/categories';

describe('DeckModal Component & Navigation Suite', () => {
  const sampleDeck: CategoryDeck = {
    id: 'vocab',
    name: 'Everyday Words',
    icon: '📖',
    badge: 'Vocabulary',
    description: 'Precision words without jargon',
    match: () => true,
  };

  const sampleCards: Card[] = [
    {
      id: 'w1',
      type: 'word',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'abrupt',
      pos: 'adjective',
      meaning: 'Sudden and curt',
      examples: ['ex1', 'ex2'],
      say: '',
    },
    {
      id: 'w2',
      type: 'word',
      lang: 'en',
      tags: [],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'candid',
      pos: 'adjective',
      meaning: 'Frank and outspoken',
      examples: ['ex1', 'ex2'],
      say: '',
    },
  ];

  it('renders deck modal with title, card counter, and active card', () => {
    const onClose = vi.fn();
    render(<DeckModal deck={sampleDeck} cards={sampleCards} onClose={onClose} />);

    expect(screen.getByText('Everyday Words')).toBeDefined();
    expect(screen.getByText(/1 of 2/)).toBeDefined();
    expect(screen.getByText('abrupt')).toBeDefined();
  });

  it('navigates next and previous cards cleanly', () => {
    const onClose = vi.fn();
    render(<DeckModal deck={sampleDeck} cards={sampleCards} onClose={onClose} />);

    const nextBtn = screen.getByRole('button', { name: 'Next card in deck' });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/2 of 2/)).toBeDefined();
    expect(screen.getByText('candid')).toBeDefined();

    const prevBtn = screen.getByRole('button', { name: 'Previous card in deck' });
    fireEvent.click(prevBtn);

    expect(screen.getByText(/1 of 2/)).toBeDefined();
    expect(screen.getByText('abrupt')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DeckModal deck={sampleDeck} cards={sampleCards} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Close deck' });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
