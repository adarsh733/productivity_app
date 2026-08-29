import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
