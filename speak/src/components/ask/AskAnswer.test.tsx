import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Card, TeachDraft } from '../../types/contract';
import AskAnswer from './AskAnswer';
import { ASK_LINES, type AskView } from '../../features/ask/askPipeline';

const LIB_CARD = {
  lang: 'en',
  tags: [],
  source: 'seed',
  status: 'active',
  createdAt: 0,
  id: 'lib-1',
  type: 'word',
  term: 'discuss',
} as unknown as Card;

function draft(kind: TeachDraft['kind'], title: string): TeachDraft {
  return {
    type: 'teach',
    track: 'clearly',
    level: 1,
    kind,
    category: 'c',
    title,
    rule: `Rule for ${title}.`,
    examples: { work: 'w', everyday: 'e' },
    analogy: 'a',
    tryPrompt: 'p',
    register: 'both',
  } as TeachDraft;
}

function view(over: Partial<AskView> = {}): AskView {
  return {
    text: 'discuss about',
    library: [{ card: LIB_CARD, title: 'discuss', line: 'talk about something', score: 10 }],
    line: null,
    failure: null,
    answer: 'Say "discuss it".',
    askKind: 'mistake',
    fresh: [draft('learn', 'Discuss, no about'), draft('fix', 'Drop about')],
    droppedCount: 0,
    ...over,
  };
}

describe('AskAnswer', () => {
  it('shows the rule line, "From library" and "New · checked"', () => {
    render(<AskAnswer view={view()} added={null} />);
    expect(screen.getByText('Say "discuss it".')).toBeInTheDocument();
    expect(screen.getByText('From library')).toBeInTheDocument();
    expect(screen.getByText('talk about something')).toBeInTheDocument();
    expect(screen.getByText('New · checked')).toBeInTheDocument();
    expect(screen.getByText('Discuss, no about')).toBeInTheDocument();
  });

  it('the add button says how many cards, and calls back once tapped', () => {
    const onAdd = vi.fn();
    render(<AskAnswer view={view()} added={null} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 cards to my feed' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('says "1 card" for one, and swaps the button for a note once added', () => {
    const { rerender } = render(<AskAnswer view={view({ fresh: [draft('learn', 'Only one')] })} added={null} />);
    expect(screen.getByRole('button', { name: 'Add 1 card to my feed' })).toBeInTheDocument();
    rerender(<AskAnswer view={view({ fresh: [draft('learn', 'Only one')] })} added={1} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Added 1 card');
    expect(screen.getByRole('status').textContent).toContain('Use, then Fix, then Try');
  });

  it('the Fix my sentence view shows Crisp, Confident, Polite with chunks marked', () => {
    const v = view({
      askKind: 'fix_sentence',
      versions: {
        crisp: '[[Send me]] the file today.',
        confident: 'I need the file today.',
        polite: '[[Could you]] send the file today?',
      },
      chunks: ['[[Send me]]', 'Could you'],
      fresh: [],
    });
    const { container } = render(<AskAnswer view={v} added={null} />);
    expect(screen.getByRole('heading', { name: 'Fix my sentence' })).toBeInTheDocument();
    for (const name of ['Crisp', 'Confident', 'Polite']) expect(screen.getByText(name)).toBeInTheDocument();
    const marks = [...container.querySelectorAll('mark.ask-chunk')].map((m) => m.textContent);
    expect(marks).toEqual(['Send me', 'Could you']);
    // Brackets never reach the screen.
    expect(container.textContent).not.toContain('[[');
    expect(container.querySelectorAll('.ask-chunk-item')).toHaveLength(2);
  });

  it('a normal answer does not show the Fix my sentence view', () => {
    render(<AskAnswer view={view()} added={null} />);
    expect(screen.queryByRole('heading', { name: 'Fix my sentence' })).toBeNull();
  });

  it('every failure shows its one plain line and still lists the library', () => {
    for (const failure of ['offline', 'no_key', 'bad_answer', 'budget'] as const) {
      const { unmount } = render(
        <AskAnswer view={view({ failure, line: ASK_LINES[failure], answer: null, askKind: null, fresh: [] })} added={null} />,
      );
      expect(screen.getByRole('status').textContent).toBe(ASK_LINES[failure]);
      expect(screen.getByText('From library')).toBeInTheDocument();
      expect(screen.getByText('talk about something')).toBeInTheDocument();
      expect(screen.queryByText('New · checked')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      unmount();
    }
  });

  it('shows the weak spot it saved, but not one that was too long to save', () => {
    const { rerender } = render(<AskAnswer view={view({ weakSpot: { wrong: 'discuss about', right: 'discuss' } })} added={null} />);
    expect(screen.getByText(/Saved to My weak spots/)).toBeInTheDocument();
    rerender(<AskAnswer view={view({ weakSpot: { wrong: 'x'.repeat(70), right: 'discuss' } })} added={null} />);
    expect(screen.queryByText(/Saved to My weak spots/)).toBeNull();
  });
});
