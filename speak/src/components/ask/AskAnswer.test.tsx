import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Card, TeachDraft } from '../../types/contract';
import AskAnswer from './AskAnswer';
import { ASK_ANSWER_UNSURE, ASK_CHECK_LINES, ASK_LINES, type AskView } from '../../features/ask/askPipeline';

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

  it('says "Saved to My weak spots" only when it was saved, "Already in" for a repeat, nothing otherwise', () => {
    const spot = { wrong: 'discuss about', right: 'discuss' };
    const { rerender } = render(<AskAnswer view={view({ weakSpot: spot, weakSpotSaved: 'saved' })} added={null} />);
    expect(screen.getByText('Saved to My weak spots: "discuss about" → "discuss"')).toBeInTheDocument();
    rerender(<AskAnswer view={view({ weakSpot: spot, weakSpotSaved: 'duplicate' })} added={null} />);
    expect(screen.getByText(/Already in My weak spots/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved to My weak spots/)).toBeNull();
    // Not saved (e.g. the check rejected the answer): no claim at all.
    rerender(<AskAnswer view={view({ weakSpot: spot })} added={null} />);
    expect(screen.queryByText(/weak spots/)).toBeNull();
  });
});

describe('AskAnswer: the check', () => {
  it('a rejected answer shows the plain warning under it', () => {
    render(<AskAnswer view={view({ answerCheck: 'rejected' })} added={null} />);
    expect(screen.getByTestId('ask-unsure').textContent).toBe(ASK_ANSWER_UNSURE);
  });

  it('a passed or unchecked answer shows no warning', () => {
    const { rerender } = render(<AskAnswer view={view({ answerCheck: 'passed' })} added={null} />);
    expect(screen.queryByTestId('ask-unsure')).toBeNull();
    rerender(<AskAnswer view={view({ answerCheck: 'unchecked' })} added={null} />);
    expect(screen.queryByTestId('ask-unsure')).toBeNull();
  });

  it('a check that could not run: the answer stays, no add button, and the line is the retry', () => {
    const onRetry = vi.fn();
    const v = view({ fresh: [], checkLine: ASK_CHECK_LINES.retryCards, canRetryCheck: true, answerCheck: 'unchecked' });
    const { rerender } = render(<AskAnswer view={v} added={null} onRetryCheck={onRetry} />);
    expect(screen.getByText('Say "discuss it".')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to my feed/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ASK_CHECK_LINES.retryCards }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<AskAnswer view={v} added={null} onRetryCheck={onRetry} checking />);
    expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('needs a second key: a plain line, no retry button', () => {
    const v = view({ fresh: [], checkLine: ASK_CHECK_LINES.noKey, canRetryCheck: false });
    render(<AskAnswer view={v} added={null} onRetryCheck={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe(ASK_CHECK_LINES.noKey);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a wish shows the confirmation and "What I\'ll change", with no cards and no error', () => {
    const v = view({
      askKind: 'preference',
      answer: 'Got it — more cricket small talk.',
      changes: 'More: Small talk · Topics: cricket',
      fresh: [],
      library: [],
    });
    render(<AskAnswer view={v} added={null} />);
    expect(screen.getByText('Got it — more cricket small talk.')).toBeInTheDocument();
    expect(screen.getByTestId('ask-changes').textContent).toContain("What I'll change");
    expect(screen.getByTestId('ask-changes').textContent).toContain('More: Small talk · Topics: cricket');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Nothing found yet.')).toBeNull();
  });
});
