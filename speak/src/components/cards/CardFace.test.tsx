import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CardFace from './CardFace';
import type {
  ActionVerbCard,
  BreathCard,
  DescribeCard,
  ExplainCard,
  FeelingCard,
  IdiomCard,
  PhraseCard,
  PronounceCard,
  SayItCard,
  StoryMoveCard,
  SwapCard,
  TeachBackCard,
  TeachCard,
  WordCard,
} from '../../types/contract';

describe('CardFace Exhaustive Rendering Suite', () => {
  it('renders word card correctly and toggles detail', () => {
    const card: WordCard = {
      id: 'w-ubiquitous',
      type: 'word',
      lang: 'en',
      tags: ['vocab'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'ubiquitous',
      pos: 'adjective',
      meaning: 'Present, appearing, or found everywhere',
      examples: ['Smartphones have become ubiquitous.', 'Cloud infrastructure is ubiquitous in modern tech.'],
      say: 'Use ubiquitous when describing widespread tech adoption',
    };

    const { rerender } = render(<CardFace card={card} isDetail={false} />);
    expect(screen.getByText('ubiquitous')).toBeDefined();
    expect(screen.getByText('Present, appearing, or found everywhere')).toBeDefined();
    expect(screen.getByText(/Vocabulary/)).toBeDefined();

    rerender(<CardFace card={card} isDetail={true} />);
    expect(screen.getByText(/Smartphones have become ubiquitous/)).toBeDefined();
    expect(screen.getByText('Use ubiquitous when describing widespread tech adoption')).toBeDefined();
  });

  it('renders practical Hindi card with Hindi badge', () => {
    const card: WordCard = {
      id: 'hi-jugaad',
      type: 'word',
      lang: 'hi',
      tags: ['hindi'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'जुगाड़ (Jugaad)',
      pos: 'noun',
      meaning: 'A flexible, innovative hack or workaround to solve a problem',
      examples: ['Usne server room me jugaad lagakar switch chalu kiya.', 'India runs on jugaad and resilience.'],
      say: 'Use when discussing unconventional quick fixes in engineering',
    };

    render(<CardFace card={card} isDetail={false} />);
    expect(screen.getByText(/Practical Hindi/)).toBeDefined();
    expect(screen.getByText('जुगाड़ (Jugaad)')).toBeDefined();
  });

  it('renders swap card correctly', () => {
    const card: SwapCard = {
      id: 'sw-tired',
      type: 'swap',
      lang: 'en',
      tags: ['swap'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      weak: 'very tired',
      answers: ['exhausted', 'depleted', 'drained'],
      timerSec: 5,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('"very tired"')).toBeDefined();
    expect(screen.getByText('"exhausted"')).toBeDefined();
    expect(screen.getByText('depleted, drained')).toBeDefined();
  });

  it('renders idiom card correctly', () => {
    const card: IdiomCard = {
      id: 'id-needle',
      type: 'idiom',
      lang: 'en',
      tags: ['idiom'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      phrase: 'move the needle',
      meaning: 'Make a noticeable or measurable difference',
      scenario: 'Quarterly review when debating priority metrics',
      example: 'This migration will actually move the needle on latency.',
      corporate: true,
    };

    render(<CardFace card={card} isDetail={true} />);
    expect(screen.getByText('move the needle')).toBeDefined();
    expect(screen.getByText('Quarterly review when debating priority metrics')).toBeDefined();
  });

  it('renders phrase card correctly', () => {
    const card: PhraseCard = {
      id: 'ph-pushback',
      type: 'phrase',
      lang: 'en',
      tags: ['phrase'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      weak: 'I think maybe we should delay',
      strong: "I'd move the date. Here's the trade-off.",
      why: 'Removes tentative qualifiers to sound executive.',
      register: 'office',
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('"I think maybe we should delay"')).toBeDefined();
    expect(screen.getByText('"I\'d move the date. Here\'s the trade-off."')).toBeDefined();
    expect(screen.getByText('Removes tentative qualifiers to sound executive.')).toBeDefined();
  });

  it('renders action verb card correctly', () => {
    const card: ActionVerbCard = {
      id: 'av-stumble',
      type: 'action_verb',
      lang: 'en',
      tags: ['verb'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      verb: 'stumbled',
      meaning: 'Tripped or momentarily lost balance while walking or speaking',
      contrast: 'fell / paused',
      examples: ['He stumbled over the complex architecture explanation.', 'The speaker stumbled briefly.'],
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('stumbled')).toBeDefined();
    expect(screen.getByText('fell / paused')).toBeDefined();
  });

  it('renders pronounce card with stressed syllables', () => {
    const card: PronounceCard = {
      id: 'pr-comfortable',
      type: 'pronounce',
      lang: 'en',
      tags: ['pronounce'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'comfortable',
      syllables: 'COMF·ter·bl',
      stressIndex: 0,
      commonError: 'Avoid saying com-for-TA-ble with 4 syllables',
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('comfortable')).toBeDefined();
    expect(screen.getByText(/COMF/)).toBeDefined();
    expect(screen.getByText('Avoid saying com-for-TA-ble with 4 syllables')).toBeDefined();
  });

  it('renders say_it card with cadence pace', () => {
    const card: SayItCard = {
      id: 'si-scope',
      type: 'say_it',
      lang: 'en',
      tags: ['pace'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      line: 'We can ship on Friday or take another week.',
      marked: 'We can ship on Friday / or take another week // to add search.',
      targetWpm: 130,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText(/"We can ship on Friday \/ or take another week \/\/ to add search\."/)).toBeDefined();
    expect(screen.getByText(/~130 words per minute/)).toBeDefined();
  });

  it('renders feeling card with emotional contrast', () => {
    const card: FeelingCard = {
      id: 'fe-apprehensive',
      type: 'feeling',
      lang: 'en',
      tags: ['feeling'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      term: 'apprehensive',
      meaning: 'Anxious or fearful that something bad or unpleasant will happen',
      contrast: 'scared / nervous',
      example: 'The team was apprehensive about deploying the migration on Friday.',
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('apprehensive')).toBeDefined();
    expect(screen.getByText('scared / nervous')).toBeDefined();
  });

  it('renders story_move card with heardIn reference', () => {
    const card: StoryMoveCard = {
      id: 'sm-short-landing',
      type: 'story_move',
      lang: 'en',
      tags: ['story'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      move: 'Land the ending on a short sentence.',
      why: 'Short punchy sentences establish certainty and narrative resolution.',
      example: 'We had three weeks. We shipped in two.',
      heardIn: 'Radio hosts closing a prime-time segment',
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('Land the ending on a short sentence.')).toBeDefined();
    expect(screen.getByText('Radio hosts closing a prime-time segment')).toBeDefined();
  });

  it('renders breath card with calm step cues and drill format', () => {
    const card: BreathCard = {
      id: 'br-straw',
      type: 'breath',
      lang: 'en',
      tags: ['breath'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      drill: 'straw',
      title: 'Straw Phonation Warm-Up',
      instructions: [
        'Place an imaginary straw between your lips.',
        'Glide pitch gently up and down on a steady exhale.',
        'Notice abdominal support engaging without neck tension.',
      ],
      logUnit: 'seconds',
      durationSec: 45,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('Straw Phonation Warm-Up')).toBeDefined();
    expect(screen.getByText('Format: STRAW Drill')).toBeDefined();
    expect(screen.getByText('Place an imaginary straw between your lips.')).toBeDefined();
    expect(screen.getByText('45 seconds')).toBeDefined();
  });

  it('renders describe card with image, prompt, observation beats and target vocab', () => {
    const card: DescribeCard = {
      id: 'dsc-cafe',
      type: 'describe',
      lang: 'en',
      tags: ['describe'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      imagePath: '/assets/scenes/monsoon_cafe.jpg',
      alt: 'Filter coffee by rain-streaked window',
      prompt: 'Paint the sensory atmosphere of a cozy tech cafe during a heavy downpour.',
      beats: ['Drumming of rain on glass', 'Warm aroma of filter coffee', 'Quiet murmur of engineers'],
      targetVocab: ['torrential', 'aroma', 'ambient', 'steaming'],
      targetSec: 45,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('Paint the sensory atmosphere of a cozy tech cafe during a heavy downpour.')).toBeDefined();
    expect(screen.getByText('Drumming of rain on glass')).toBeDefined();
    expect(screen.getByText('torrential')).toBeDefined();
    expect(screen.getByText('aroma')).toBeDefined();
  });

  it('renders explain card with structural beats and terms', () => {
    const card: ExplainCard = {
      id: 'exp-cap-theorem',
      type: 'explain',
      lang: 'en',
      tags: ['explain'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      topic: 'The CAP Theorem',
      angle: 'Why distributed systems must choose between Consistency and Availability during network partitions.',
      beats: ['Define the 3 properties', 'Explain why network partitions are unavoidable', 'Give real examples (Dynamo vs Postgres)'],
      targetVocab: ['partition', 'consistency', 'trade-off', 'latency'],
      targetSec: 60,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText('The CAP Theorem')).toBeDefined();
    expect(screen.getByText(/Why distributed systems must choose/)).toBeDefined();
    expect(screen.getByText('Define the 3 properties')).toBeDefined();
  });

  it('renders teach_back card with recall structure', () => {
    const card: TeachBackCard = {
      id: 'tb-event-loop',
      type: 'teach_back',
      lang: 'en',
      tags: ['teach_back'],
      source: 'seed',
      status: 'active',
      createdAt: 0,
      prompt: 'Explain how the JavaScript event loop handles microtasks vs macrotasks to a junior colleague.',
      beats: ['Call stack execution', 'Microtask queue priority (Promises)', 'Macrotask execution (setTimeout)'],
      targetSec: 45,
    };

    render(<CardFace card={card} />);
    expect(screen.getByText(/Explain how the JavaScript event loop/)).toBeDefined();
    expect(screen.getByText('Call stack execution')).toBeDefined();
  });

  it('shows each old card its skill chip (trackOf) next to the type badge', () => {
    const word: WordCard = {
      id: 'w-chip', type: 'word', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0,
      term: 'ubiquitous', pos: 'adjective', meaning: 'everywhere', examples: ['a', 'b'], say: 's',
    };
    const { rerender } = render(<CardFace card={word} />);
    expect(screen.getByTestId('track-chip').textContent).toBe('🔤 Words');
    expect(screen.getByTestId('track-chip').getAttribute('data-track')).toBe('words');

    const tb: TeachBackCard = {
      id: 'tb-chip', type: 'teach_back', lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0,
      prompt: 'p', beats: ['a', 'b', 'c'], targetSec: 45,
    };
    rerender(<CardFace card={tb} />);
    expect(screen.getByTestId('track-chip').textContent).toBe('🎯 Speak clearly');
  });
});

describe('TeachCardFace (v5)', () => {
  const teach: TeachCard = {
    id: 'gold-words-revert-reply',
    type: 'teach',
    lang: 'en',
    tags: [],
    source: 'seed',
    status: 'active',
    createdAt: 0,
    track: 'words',
    level: 1,
    kind: 'fix',
    category: 'Indian-English fixes',
    title: '"Revert" → "reply"',
    rule: 'In global English, say "reply" or "get back to you", not "revert".',
    examples: { work: 'Could you reply by Thursday?', everyday: 'Let me check and get back to you.' },
    insteadOf: 'Please revert by Thursday.',
    analogy: 'Outside India, "revert" sounds like pressing Undo, not Reply.',
    tryPrompt: "A vendor sent a quote. How do you say you'll answer tomorrow?",
    register: 'both',
    answer: "Thanks for the quote. I'll get back to you tomorrow.",
  };

  it('shows the kind chip, the track and level chip in the track colour, and every part', () => {
    render(<CardFace card={teach} />);
    expect(screen.getByText('Fix')).toBeDefined();
    const chip = screen.getByText('🔤 Words · L1');
    expect(chip.getAttribute('data-track')).toBe('words');
    expect(screen.getByText('Instead of')).toBeDefined();
    expect(screen.getByText('Please revert by Thursday.')).toBeDefined();
    expect(screen.getByText('Could you reply by Thursday?')).toBeDefined();
    expect(screen.getByText(/pressing Undo/)).toBeDefined();
    expect(screen.getByText('Try')).toBeDefined();
    // No buttons unless handlers are given.
    expect(screen.queryByRole('button', { name: /Advance to next card/i })).toBeNull();
  });

  it('labels small talk examples "They ask" and hides Instead of when there is none', () => {
    const st: TeachCard = { ...teach, id: 'st', track: 'smalltalk', kind: 'learn', insteadOf: undefined };
    render(<CardFace card={st} />);
    expect(screen.getByText('They ask · work')).toBeDefined();
    expect(screen.queryByText('Instead of')).toBeNull();
  });

  it('wires Again, Save and Got it to the handlers, and reveals a great answer on demand', () => {
    const onAgain = vi.fn();
    const onGotIt = vi.fn();
    const onSave = vi.fn();
    render(<CardFace card={teach} saved={false} onAgain={onAgain} onGotIt={onGotIt} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Show again soon/i }));
    fireEvent.click(screen.getByRole('button', { name: /Bookmark card/i }));
    fireEvent.click(screen.getByRole('button', { name: /Advance to next card/i }));
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onGotIt).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Again ↻')).toBeDefined();
    expect(screen.getByText('Got it ✓')).toBeDefined();

    expect(screen.queryByText(/I'll get back to you tomorrow/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show a great answer/i }));
    expect(screen.getByText(/I'll get back to you tomorrow/)).toBeDefined();
  });

  it('shows a Saved state when the card is bookmarked', () => {
    render(<CardFace card={teach} saved onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /Saved/i }).getAttribute('aria-pressed')).toBe('true');
  });
});
