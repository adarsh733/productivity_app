import { describe, expect, it } from 'vitest';
import { readSeedFiles } from '../../db/seedLoader';
import type { AnyCard, PhraseCard, SwapCard, TeachCard } from '../../types/contract';
import { artFor } from './art';
import { parseChat, slidesFor, wordDiff } from './slides';
import { isBackTap } from './usePosterDeck';

const base = { lang: 'en' as const, tags: [] as string[], source: 'seed' as const, status: 'active' as const, createdAt: 0 };

const teach = (over: Partial<TeachCard>): TeachCard => ({
  ...base,
  id: 't-1',
  type: 'teach',
  track: 'words',
  level: 1,
  kind: 'learn',
  category: 'Plain words',
  title: 'A title',
  rule: 'A rule.',
  examples: { work: 'At work.', everyday: 'At home.' },
  analogy: 'Like a bus.',
  tryPrompt: 'Try it.',
  register: 'both',
  ...over,
});

describe('slidesFor', () => {
  it('gives a teach card one idea per slide: idea, examples, picture, try', () => {
    expect(slidesFor(teach({})).map((s) => s.kind)).toEqual(['idea', 'examples', 'picture', 'try']);
  });

  it('keeps two short examples on one slide and splits long ones', () => {
    const long = 'x'.repeat(90);
    const short = slidesFor(teach({}))[1];
    expect(short?.kind === 'examples' && short.items).toHaveLength(2);
    const split = slidesFor(teach({ examples: { work: long, everyday: long } }));
    expect(split.filter((s) => s.kind === 'examples')).toHaveLength(2);
  });

  it('draws a real back-and-forth as chat bubbles, with his lines marked', () => {
    const chat = parseChat('Rahul: "How was it?"\nYou (later): "Long, but good."');
    expect(chat).toEqual([
      { who: 'Rahul', text: 'How was it?', mine: false },
      { who: 'You (later)', text: 'Long, but good.', mine: true },
    ]);
    expect(parseChat('Just one sentence.')).toBeUndefined();
    expect(parseChat('Rahul: "Hi"\nA plain line')).toBeUndefined();
  });

  it('a Try card is one slide holding the prompt and the answer', () => {
    const slides = slidesFor(teach({ kind: 'try', answer: 'A great answer.' }));
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ kind: 'try', prompt: 'Try it.', answer: 'A great answer.' });
  });

  it('a swap in a sentence becomes tap-the-weak-word', () => {
    const swap: SwapCard = {
      ...base,
      id: 'sw-1',
      type: 'swap',
      weak: 'very big',
      answers: ['huge', 'massive'],
      timerSec: 5,
      skill: {
        track: 'words',
        kind: 'fix',
        insteadOf: 'We have a very big backlog.',
        work: 'We have a huge backlog.',
      },
    };
    expect(slidesFor(swap)[0]).toMatchObject({
      kind: 'tapword',
      before: ['We', 'have', 'a'],
      weak: 'very big',
      strong: 'huge',
      after: ['backlog.'],
    });
  });

  it('a phrase rewrite becomes a two-way pick with exactly one right answer', () => {
    const phrase: PhraseCard = {
      ...base,
      id: 'ph-1',
      type: 'phrase',
      weak: 'I will revert back to you by end of day.',
      strong: 'I will get back to you by 5 PM.',
      why: 'Why.',
      register: 'office',
    };
    const game = slidesFor(phrase)[0];
    expect(game?.kind).toBe('pick');
    if (game?.kind !== 'pick') return;
    expect(game.options.filter((o) => o.right).map((o) => o.text)).toEqual(['I will get back to you by 5 PM.']);
  });

  it('a small-talk question with a one-word answer becomes a reply game', () => {
    const card = teach({
      track: 'smalltalk',
      insteadOf: '"How was your day?" — "Fine."',
      examples: { work: 'Arjun: "How was your day?"\nYou: "Long, but we fixed the bug."', everyday: 'At home.' },
    });
    expect(slidesFor(card)[1]).toMatchObject({ kind: 'pick', question: 'How was your day?' });
  });

  it('skips the game when a small-talk "instead of" is only a thought', () => {
    const card = teach({ track: 'smalltalk', insteadOf: 'Nobody wants to hear about my weekend.' });
    expect(slidesFor(card).some((s) => s.kind === 'pick' || s.kind === 'tapword')).toBe(false);
  });

  it('no two sentences that differ everywhere pass as a word swap', () => {
    expect(wordDiff('I left at six today', 'We all met for chai afterwards')).toBeNull();
  });

  it('every seed card gives slides, none empty, and a game always has one right answer', () => {
    const { cards } = readSeedFiles();
    expect(cards.length).toBeGreaterThan(100);
    for (const card of cards as AnyCard[]) {
      const slides = slidesFor(card);
      expect(slides.length, card.id).toBeGreaterThan(0);
      for (const s of slides) {
        expect(s.speech.trim().length, card.id).toBeGreaterThan(0);
        if (s.kind === 'pick') expect(s.options.filter((o) => o.right), card.id).toHaveLength(1);
      }
    }
  });
});

describe('artFor', () => {
  it('uses the card topic, in the card skill, and always the same picture', () => {
    const card = teach({ track: 'clearly', category: 'Delivery' });
    expect(artFor(card)).toMatch(/^\/art\/clearly-delivery-[12]\.webp$/);
    expect(artFor(card)).toBe(artFor(card));
  });

  it('falls back to the skill when the topic is unknown, as on new AI cards', () => {
    expect(artFor(teach({ track: 'stories', category: 'Something new' }))).toMatch(/^\/art\/stories-/);
  });
});

describe('isBackTap', () => {
  it('only the left third goes back', () => {
    expect(isBackTap(50, { left: 0, width: 375 })).toBe(true);
    expect(isBackTap(200, { left: 0, width: 375 })).toBe(false);
    expect(isBackTap(0, { left: 0, width: 0 })).toBe(false);
  });
});
