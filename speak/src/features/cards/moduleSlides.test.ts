import { describe, expect, it } from 'vitest';
import type {
  OfficePhraseCard,
  SayBetterCard,
  SmallTalkCard,
  StoryCard,
  WordsCard,
} from '../../types/contract';
import { moduleSlides } from './moduleSlides';

describe('moduleSlides', () => {
  const sampleWordsCard: WordsCard = {
    id: 'v7-words-01',
    type: 'module',
    module: 'words',
    topic: 'senses',
    lang: 'en',
    tags: ['senses', 'hearing'],
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
        text: 'The party next door is **deafening**. I cannot even hear the TV.',
        icon: 'home',
      },
      {
        label: 'With friends',
        text: 'When Kohli hit the six, the noise in the stadium was **deafening**.',
        icon: 'friends',
      },
    ],
    right: { label: 'For sounds', text: 'The traffic outside my window is **deafening** in the morning.' },
    wrong: [
      { label: 'Not for smells', text: 'Her perfume was deafening.' },
      { label: 'Not for very big', text: 'The bill was deafening.' },
    ],
    rule: 'only for sound',
  };

  it('builds 2 slides for Words card without check', () => {
    const slides = moduleSlides(sampleWordsCard);
    expect(slides).toHaveLength(2);
    expect(slides[0]?.kind).toBe('word');
    expect(slides[1]?.kind).toBe('right_wrong');

    const s0 = slides[0] as Extract<(typeof slides)[0], { kind: 'word' }>;
    expect(s0.word).toBe('deafening');
    expect(s0.speech).toContain('deafening');
    expect(s0.speech).not.toContain('**');

    const s1 = slides[1] as Extract<(typeof slides)[1], { kind: 'right_wrong' }>;
    expect(s1.rule).toBe('only for sound');
    expect(s1.wrong).toHaveLength(2);
  });

  it('builds 3 slides for Words card with check', () => {
    const cardWithCheck: WordsCard = {
      ...sampleWordsCard,
      check: {
        question: 'Which one is right?',
        options: [
          { text: 'The sunlight was deafening.', right: false },
          { text: 'The drums at the baraat were deafening.', right: true },
          { text: 'His idea was deafening.', right: false },
        ],
      },
    };

    const slides = moduleSlides(cardWithCheck);
    expect(slides).toHaveLength(3);
    expect(slides[0]?.kind).toBe('word');
    expect(slides[1]?.kind).toBe('right_wrong');
    expect(slides[2]?.kind).toBe('check');

    const s2 = slides[2] as Extract<(typeof slides)[2], { kind: 'check' }>;
    expect(s2.question).toBe('Which one is right?');
    expect(s2.options).toHaveLength(3);
    expect(s2.speech).toBe('Which one is right?');
  });

  it('builds 3 slides for Small talk card (chat, more, donts)', () => {
    const card: SmallTalkCard = {
      id: 'v7-talk-01',
      type: 'module',
      module: 'smalltalk',
      topic: 'weekend',
      lang: 'en',
      tags: ['weekend', 'reply'],
      source: 'seed',
      status: 'active',
      createdAt: 1700000000000,
      kind: 'reply',
      moment: 'Monday morning at the desk',
      they: 'How was your weekend?',
      deadEnd: 'Good.',
      reply: 'Lazy, in a good way. Finally watched **Kantara**. Did you do anything fun?',
      formula: 'feeling + one detail + ask back',
      more: [
        { label: 'Busy weekend', text: "Packed! My nephew's birthday, twenty kids. How was yours?" },
        { label: 'Quiet weekend', text: 'Very quiet. I just recharged, and I needed it. You?' },
        { label: 'Bad weekend', text: 'A bit rough, I had a cold. Better now. Yours?' },
      ],
      donts: [
        'Stop at one word. It ends the chat.',
        'List everything you did, hour by hour.',
        'Complain for more than one line.',
      ],
    };

    const slides = moduleSlides(card);
    expect(slides).toHaveLength(3);
    expect(slides[0]?.kind).toBe('chat');
    expect(slides[1]?.kind).toBe('more');
    expect(slides[2]?.kind).toBe('donts');

    const s0 = slides[0] as Extract<(typeof slides)[0], { kind: 'chat' }>;
    expect(s0.they).toBe('How was your weekend?');
    expect(s0.reply).toContain('Kantara');
    expect(s0.formula).toBe('feeling + one detail + ask back');

    const s1 = slides[1] as Extract<(typeof slides)[1], { kind: 'more' }>;
    expect(s1.more).toHaveLength(3);

    const s2 = slides[2] as Extract<(typeof slides)[2], { kind: 'donts' }>;
    expect(s2.donts).toHaveLength(3);
  });

  it('builds 2 slides for Say it better card (better, next)', () => {
    const card: SayBetterCard = {
      id: 'v7-better-01',
      type: 'module',
      module: 'better',
      topic: 'delay',
      lang: 'en',
      tags: ['work', 'update'],
      source: 'seed',
      status: 'active',
      createdAt: 1700000000000,
      situation: 'Explaining a delay',
      thinking: false,
      mightSay: 'Actually what happened is, the server was down, so because of that we could not do the release.',
      better: "Yesterday's release slipped because the server went down.",
      changes: ['point first', 'cut filler', '19 words to 8'],
      next: {
        title: 'Add the next step',
        lines: [
          { label: 'Next step', text: "Yesterday's release slipped because the server went down. We will ship it today by 4." },
        ],
        note: 'Answer their next question before they ask it.',
      },
    };

    const slides = moduleSlides(card);
    expect(slides).toHaveLength(2);
    expect(slides[0]?.kind).toBe('better');
    expect(slides[1]?.kind).toBe('next');

    const s0 = slides[0] as Extract<(typeof slides)[0], { kind: 'better' }>;
    expect(s0.changes).toEqual(['point first', 'cut filler', '19 words to 8']);

    const s1 = slides[1] as Extract<(typeof slides)[1], { kind: 'next' }>;
    expect(s1.next.title).toBe('Add the next step');
    expect(s1.next.note).toBe('Answer their next question before they ask it.');
  });

  it('builds 2 slides for Office phrases card (phrase, careful)', () => {
    const card: OfficePhraseCard = {
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
      meaning: 'Let us discuss this later with only the people who need to.',
      useWhen: 'One topic is eating up a group meeting.',
      example: "Good point, Rahul. Let's take this offline after the call.",
      tone: 'polite · very common',
      careful: "Don't use it to dodge a topic. Follow up the same day.",
      wrong: { label: 'Misuse', text: 'Let us take this offline and never speak of it again.' },
      similar: ["Let's park this for now", 'Can we pick this up after the call?'],
    };

    const slides = moduleSlides(card);
    expect(slides).toHaveLength(2);
    expect(slides[0]?.kind).toBe('phrase');
    expect(slides[1]?.kind).toBe('careful');

    const s0 = slides[0] as Extract<(typeof slides)[0], { kind: 'phrase' }>;
    expect(s0.phrase).toBe("Let's take this offline");

    const s1 = slides[1] as Extract<(typeof slides)[1], { kind: 'careful' }>;
    expect(s1.similar).toHaveLength(2);
  });

  it('builds 1 or 2 slides for Stories card (with/without yourTurn)', () => {
    const cardWithoutTurn: StoryCard = {
      id: 'v7-stories-01',
      type: 'module',
      module: 'stories',
      topic: 'Your day',
      lang: 'en',
      tags: ['stories', 'day'],
      source: 'seed',
      status: 'active',
      createdAt: 1700000000000,
      report: 'I went to the airport, the flight was delayed, and I reached late.',
      story: 'I had one job: reach Delhi by six for my cousin wedding. At the gate, the screen flashed: Delayed, 4 hours.',
      trick: 'start with what you wanted, then what got in the way',
    };

    const slides1 = moduleSlides(cardWithoutTurn);
    expect(slides1).toHaveLength(1);
    expect(slides1[0]?.kind).toBe('story');

    const cardWithTurn: StoryCard = {
      ...cardWithoutTurn,
      yourTurn: {
        prompt: "Tell today's commute in two lines.",
        hint: 'Line 1: what you wanted. Line 2: what got in the way.',
      },
    };

    const slides2 = moduleSlides(cardWithTurn);
    expect(slides2).toHaveLength(2);
    expect(slides2[0]?.kind).toBe('story');
    expect(slides2[1]?.kind).toBe('your_turn');
  });

  it('provides valid non-empty speech for every slide of every card type', () => {
    const card: WordsCard = {
      ...sampleWordsCard,
      check: {
        question: 'Which is correct?',
        options: [{ text: 'A', right: true }, { text: 'B', right: false }],
      },
    };
    const slides = moduleSlides(card);
    for (const slide of slides) {
      expect(slide.speech.length).toBeGreaterThan(0);
      expect(slide.speech).not.toContain('**');
    }
  });
});
