import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  OfficePhraseCard,
  SayBetterCard,
  SmallTalkCard,
  StoryCard,
  WordsCard,
} from '../../types/contract';
import ModuleCardView from './ModuleCardView';

describe('ModuleCardView', () => {
  const wordsCard: WordsCard = {
    id: 'v7-words-01',
    type: 'module',
    module: 'words',
    topic: 'senses',
    lang: 'en',
    tags: ['senses'],
    source: 'seed',
    status: 'active',
    createdAt: 1700000000000,
    word: 'deafening',
    pos: 'adjective',
    say: 'DEF-uh-ning',
    meaning: "So loud you can't hear anything else.",
    examples: [
      {
        label: 'At home',
        text: 'The party next door is **deafening**.',
        icon: 'home',
      },
      {
        label: 'With friends',
        text: 'The stadium noise was **deafening**.',
        icon: 'friends',
      },
    ],
    right: { label: 'For sounds', text: 'Traffic was **deafening**.' },
    wrong: [{ label: 'Not for smells', text: 'Her perfume was deafening.' }],
    rule: 'only for sound',
    check: {
      question: 'Which one is right?',
      options: [
        { text: 'Sunlight was deafening.', right: false },
        { text: 'The drums were deafening.', right: true },
        { text: 'His idea was deafening.', right: false },
      ],
    },
  };

  const smallTalkCard: SmallTalkCard = {
    id: 'v7-talk-01',
    type: 'module',
    module: 'smalltalk',
    topic: 'weekend',
    lang: 'en',
    tags: ['weekend'],
    source: 'seed',
    status: 'active',
    createdAt: 1700000000000,
    kind: 'reply',
    moment: 'Monday morning at the desk',
    they: 'How was your weekend?',
    deadEnd: 'Good.',
    reply: 'Lazy, in a good way. Finally watched **Kantara**.',
    formula: 'feeling + one detail + ask back',
    more: [
      { label: 'Busy weekend', text: 'Packed with family.' },
      { label: 'Quiet weekend', text: 'Very quiet, just recharged.' },
      { label: 'Bad weekend', text: 'A bit rough, had a cold.' },
    ],
    donts: ['Stop at one word.', 'List everything you did.'],
  };

  const sayBetterCard: SayBetterCard = {
    id: 'v7-better-01',
    type: 'module',
    module: 'better',
    topic: 'delay',
    lang: 'en',
    tags: ['delay'],
    source: 'seed',
    status: 'active',
    createdAt: 1700000000000,
    situation: 'Explaining a delay',
    thinking: true,
    mightSay: 'Actually what happened is, the server was down.',
    better: "Yesterday's release slipped because the server went down.",
    changes: ['point first', 'cut filler'],
    next: {
      title: 'Add the next step',
      lines: [{ label: 'Next', text: 'We will ship today by 4.' }],
      note: 'Answer their next question early.',
    },
  };

  const phrasesCard: OfficePhraseCard = {
    id: 'v7-phrases-01',
    type: 'module',
    module: 'phrases',
    topic: 'meetings',
    lang: 'en',
    tags: ['meetings'],
    source: 'seed',
    status: 'active',
    createdAt: 1700000000000,
    group: 'meetings',
    phrase: "Let's take this offline",
    meaning: 'Discuss later with only those needed.',
    useWhen: 'One topic is eating up a meeting.',
    example: "Good point. **Let's take this offline** after the call.",
    tone: 'polite · very common',
    careful: "Don't use it to dodge a topic.",
    wrong: { label: 'Misuse', text: "Let's take this offline and forget it." },
    similar: ["Let's park this", 'Pick this up later'],
  };

  const storyCard: StoryCard = {
    id: 'v7-stories-01',
    type: 'module',
    module: 'stories',
    topic: 'Commute',
    lang: 'en',
    tags: ['commute'],
    source: 'seed',
    status: 'active',
    createdAt: 1700000000000,
    report: 'The train was late and I reached late.',
    story: 'I needed to make the 9 AM kickoff. Then the signal died outside Dadar.',
    trick: 'start with the goal, then what broke it',
    yourTurn: {
      prompt: 'Tell your morning in two lines.',
      hint: 'Goal first, then obstacle.',
    },
  };

  it('renders Words card with night glass classes and glowing highlighted word', () => {
    const { container } = render(<ModuleCardView card={wordsCard} />);

    const cardEl = container.querySelector('.v7-card');
    expect(cardEl).not.toBeNull();
    expect(cardEl?.getAttribute('data-module')).toBe('words');

    const hero = screen.getByRole('heading', { level: 1, name: 'deafening' });
    expect(hero).toBeInTheDocument();
    expect(screen.getByText('DEF-uh-ning')).toBeInTheDocument();
    expect(screen.getByText("So loud you can't hear anything else.")).toBeInTheDocument();

    const highlighted = container.querySelectorAll('.v7-hl');
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted[0]?.textContent).toBe('deafening');

    // 3 slides (word, right_wrong, check)
    const slides = container.querySelectorAll('.v7-slide');
    expect(slides).toHaveLength(3);

    // Dots indicator has 3 dots
    const dots = container.querySelectorAll('.v7-dots i');
    expect(dots).toHaveLength(3);
    expect(dots[0]?.classList.contains('is-on')).toBe(true);
  });

  it('shows the topic label and carries data-theme and data-level', () => {
    const { container } = render(
      <ModuleCardView card={{ ...wordsCard, theme: 'Money', level: 3 }} />,
    );
    const root = container.querySelector('.v7-card')!;
    expect(root.getAttribute('data-theme')).toBe('Money');
    expect(root.getAttribute('data-level')).toBe('3');
    const label = screen.getByTestId('card-theme');
    expect(label.classList.contains('v7-theme')).toBe(true);
    expect(label.textContent).toBe('Money');
  });

  it('a card with no tags reads General and level 2', () => {
    const { container } = render(<ModuleCardView card={wordsCard} />);
    const root = container.querySelector('.v7-card')!;
    expect(root.getAttribute('data-theme')).toBe('General');
    expect(root.getAttribute('data-level')).toBe('2');
    expect(screen.getByTestId('card-theme').textContent).toBe('General');
  });

  it('draws the label once per card, on every module', () => {
    for (const card of [smallTalkCard, sayBetterCard, phrasesCard, storyCard]) {
      const { unmount } = render(<ModuleCardView card={{ ...card, theme: 'Work', level: 1 }} />);
      expect(screen.getAllByTestId('card-theme')).toHaveLength(1);
      expect(document.querySelector('.v7-card')?.getAttribute('data-level')).toBe('1');
      unmount();
    }
  });

  it('interacts with the quick check options', () => {
    render(<ModuleCardView card={wordsCard} />);

    const rightBtn = screen.getByRole('button', { name: 'The drums were deafening.' });
    expect(rightBtn).toBeInTheDocument();
    expect(rightBtn.classList.contains('is-right')).toBe(false);

    fireEvent.click(rightBtn);
    expect(rightBtn.classList.contains('is-right')).toBe(true);

    const wrongBtn = screen.getByRole('button', { name: 'Sunlight was deafening.' });
    fireEvent.click(wrongBtn);
    expect(wrongBtn.classList.contains('is-wrong')).toBe(true);
  });

  it('renders Small talk card with chat bubbles and formula pill', () => {
    const { container } = render(<ModuleCardView card={smallTalkCard} />);

    expect(container.querySelector('.v7-card')?.getAttribute('data-module')).toBe('smalltalk');
    const themBubble = screen.getByText('How was your weekend?');
    expect(themBubble.classList.contains('v7-bubble')).toBe(true);
    expect(themBubble.classList.contains('them')).toBe(true);

    const weakBubble = screen.getByText('Good.');
    expect(weakBubble.classList.contains('v7-bubble')).toBe(true);
    expect(weakBubble.classList.contains('is-weak')).toBe(true);

    const meBubble = screen.getByText(/Lazy, in a good way/);
    expect(meBubble.classList.contains('v7-bubble')).toBe(true);
    expect(meBubble.classList.contains('me')).toBe(true);

    const formulaPill = screen.getByText('feeling + one detail + ask back');
    expect(formulaPill.classList.contains('v7-pill')).toBe(true);

    const dontsPanels = container.querySelectorAll('.v7-panel.is-weak');
    expect(dontsPanels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Say it better card with weak mightSay and strong better panel', () => {
    const { container } = render(<ModuleCardView card={sayBetterCard} />);

    expect(container.querySelector('.v7-card')?.getAttribute('data-module')).toBe('better');
    expect(screen.getByText(/EXPLAIN YOUR THINKING/i)).toBeInTheDocument();

    const weakPanel = container.querySelector('.v7-panel.is-weak');
    expect(weakPanel).not.toBeNull();
    expect(weakPanel?.textContent).toContain('Actually what happened is');

    const strongPanel = container.querySelector('.v7-panel.is-strong');
    expect(strongPanel).not.toBeNull();
    expect(strongPanel?.textContent).toContain("Yesterday's release slipped");

    expect(screen.getByText('point first').classList.contains('v7-pill')).toBe(true);
    expect(screen.getByText('cut filler').classList.contains('v7-pill')).toBe(true);
  });

  it('renders Office phrases card with hero phrase and careful panel', () => {
    const { container } = render(<ModuleCardView card={phrasesCard} />);

    expect(container.querySelector('.v7-card')?.getAttribute('data-module')).toBe('phrases');
    expect(screen.getByText(/"Let's take this offline"/i)).toBeInTheDocument();
    expect(screen.getByText('polite · very common').classList.contains('v7-pill')).toBe(true);
    expect(screen.getByText(/Pick this up later/)).toBeInTheDocument();
  });

  it('renders Stories card with report, story and your turn', () => {
    const { container } = render(<ModuleCardView card={storyCard} />);

    expect(container.querySelector('.v7-card')?.getAttribute('data-module')).toBe('stories');
    expect(screen.getByText(/The train was late/)).toBeInTheDocument();
    expect(screen.getByText(/Dadar/)).toBeInTheDocument();
    expect(screen.getByText('start with the goal, then what broke it').classList.contains('v7-pill')).toBe(true);
    expect(screen.getByText('Tell your morning in two lines.')).toBeInTheDocument();
  });

  it('renders custom rail content inside the rail container', () => {
    const railContent = (
      <>
        <button type="button" className="v7-rail-btn" aria-label="Like">👍</button>
        <button type="button" className="v7-rail-btn" aria-label="Dislike">👎</button>
      </>
    );

    const { container } = render(
      <ModuleCardView card={wordsCard} rail={railContent} />
    );

    const railEl = container.querySelector('.v7-rail');
    expect(railEl).not.toBeNull();
    expect(screen.getByLabelText('Like')).toBeInTheDocument();
    expect(screen.getByLabelText('Dislike')).toBeInTheDocument();
  });

  it('calls onSlideChange when horizontal carousel scrolls', () => {
    const onSlideChange = vi.fn();
    const { container } = render(
      <ModuleCardView card={wordsCard} onSlideChange={onSlideChange} />
    );

    const row = container.querySelector('.v7-hrow') as HTMLDivElement;
    expect(row).not.toBeNull();

    Object.defineProperty(row, 'clientWidth', { value: 375, configurable: true });
    Object.defineProperty(row, 'scrollLeft', { value: 375, configurable: true });

    fireEvent.scroll(row);

    expect(onSlideChange).toHaveBeenCalledWith(1);
  });
});
