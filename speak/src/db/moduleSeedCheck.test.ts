import { describe, expect, it } from 'vitest';
import { checkModuleSeedFile, countWords, slideTexts } from './moduleSeedCheck';
import type { ModuleId } from '../types/contract';

type Raw = Record<string, unknown>;
const pad = (n: number) => String(n).padStart(2, '0');
const base = (id: string, module: ModuleId) => ({ id, type: 'module', lang: 'en', module, topic: 'everyday', tags: [] });

/** Card 01 is the deafening example from docs/REDESIGN-V7.html. */
function wordsCard(n: number): Raw {
  const word = n === 1 ? 'deafening' : `word${pad(n)}`;
  const card: Raw = {
    ...base(`v7-words-${pad(n)}`, 'words'),
    word,
    pos: 'adjective',
    say: n === 1 ? 'DEF-uh-ning' : 'WORD',
    meaning: n === 1 ? "So loud you can't hear anything else." : 'A short plain meaning.',
    examples: [
      { label: 'At home', icon: 'home', text: n === 1 ? 'The party next door is **deafening**. I can\'t even hear the TV.' : `The room was **${word}** today.` },
      { label: 'With friends', icon: 'friends', text: n === 1 ? 'When Kohli hit the six, the noise in the stadium was **deafening**.' : `My friend said it was **${word}**.` },
    ],
    right: { label: 'For sounds', text: 'The traffic outside my window is **deafening** in the morning.' },
    wrong: [
      { label: 'Not for smells, light or people', text: 'Her perfume was deafening.' },
      { label: 'Not for "very big"', text: 'The bill was deafening.' },
    ],
    rule: 'only for sound',
  };
  if (n % 3 === 0) {
    card.check = {
      question: 'Which one is right?',
      options: [
        { text: 'The sunlight was deafening.', right: false },
        { text: 'The drums at the baraat were deafening.', right: true },
        { text: 'His idea was deafening.', right: false },
      ],
    };
  }
  return card;
}

function talkCard(n: number): Raw {
  return {
    ...base(`v7-talk-${pad(n)}`, 'smalltalk'),
    kind: 'reply',
    moment: 'Monday morning at the coffee machine',
    they: 'How was your weekend?',
    deadEnd: 'Good.',
    reply: 'Lazy, in a good way. Finally watched **Kantara**. Did you do anything fun?',
    formula: 'feeling + one detail + ask back',
    more: [
      { label: 'Busy weekend', text: "Packed! My nephew's birthday, twenty kids. How was yours?" },
      { label: 'Quiet weekend', text: 'Very quiet. I just recharged, and I needed it. You?' },
      { label: 'Bad weekend', text: 'A bit rough, I had a cold. Better now. Yours?' },
    ],
    donts: ['Stop at one word. It ends the chat.', 'List everything you did, hour by hour.', 'Complain for more than one line.'],
  };
}

function betterCard(n: number): Raw {
  return {
    ...base(`v7-better-${pad(n)}`, 'better'),
    situation: n === 1 ? 'Explaining a delay' : `Situation ${pad(n)}`,
    thinking: n <= 5,
    mightSay: 'Actually what happened is, the server was down, so because of that we could not do the release yesterday.',
    better: "Yesterday's release slipped because the server went down.",
    changes: ['point first', 'cut "actually what happened is"', '19 words → 8'],
    next: {
      title: 'Even better',
      lines: [{ label: 'Add the next step', text: "Yesterday's release slipped because the server went down. We'll ship it today by 4." }],
      note: 'Answer their next question before they ask it.',
    },
  };
}

function phraseCard(n: number): Raw {
  return {
    ...base(`v7-phrases-${pad(n)}`, 'phrases'),
    group: 'meetings',
    phrase: n === 1 ? "Let's take this offline." : `Phrase number ${pad(n)}.`,
    meaning: "Let's discuss this later, with only the people who need to.",
    useWhen: 'One topic is eating up a group meeting.',
    example: "Good point, Rahul. **Let's take this offline** after the call.",
    tone: 'polite · very common',
    careful: "Don't use it to dodge a topic. Follow up the same day.",
    wrong: { label: 'Not for a private chat', text: "Let's take this offline, said on a one-to-one call." },
    similar: ["Let's park this for now.", 'Can we pick this up after the call?'],
  };
}

function storyCard(n: number): Raw {
  return {
    ...base(`v7-stories-${pad(n)}`, 'stories'),
    report: 'I went to the airport, the flight was delayed, and I reached late.',
    story: "I had one job: reach Delhi by six for my cousin's sangeet. At the gate, the screen flashed: **Delayed, 4 hours.**",
    trick: 'start with what you wanted, then what got in the way',
    yourTurn: { prompt: "Tell today's commute in two lines.", hint: 'Line 1: what you wanted. Line 2: what got in the way.' },
  };
}

const MAKERS: Record<ModuleId, (n: number) => Raw> = {
  words: wordsCard,
  smalltalk: talkCard,
  better: betterCard,
  phrases: phraseCard,
  stories: storyCard,
};
const file = (m: ModuleId) => Array.from({ length: 20 }, (_, i) => MAKERS[m](i + 1));

describe('checkModuleSeedFile — a good file passes', () => {
  for (const m of Object.keys(MAKERS) as ModuleId[]) {
    it(`accepts 20 good ${m} cards`, () => {
      expect(checkModuleSeedFile(file(m), m)).toEqual([]);
    });
  }

  it('accepts ids in any order', () => {
    expect(checkModuleSeedFile(file('stories').reverse(), 'stories')).toEqual([]);
  });
});

describe('checkModuleSeedFile — file rules', () => {
  it('needs exactly 20 cards', () => {
    expect(checkModuleSeedFile(file('stories').slice(0, 19), 'stories').join('\n')).toMatch(/exactly 20 cards, found 19/);
    const extra = [...file('stories'), storyCard(20)];
    expect(checkModuleSeedFile(extra, 'stories').join('\n')).toMatch(/exactly 20 cards, found 21/);
  });

  it('needs ids v7-<part>-01 to -20, each once', () => {
    const cards = file('smalltalk');
    cards[4] = { ...cards[4], id: 'v7-smalltalk-05' };
    expect(checkModuleSeedFile(cards, 'smalltalk').join('\n')).toMatch(/v7-smalltalk-05: id must be v7-talk-01 to v7-talk-20/);

    const twice = file('stories');
    twice[1] = { ...twice[1], id: 'v7-stories-01' };
    expect(checkModuleSeedFile(twice, 'stories').join('\n')).toMatch(/v7-stories-01: id used twice/);

    const high = file('stories');
    high[19] = { ...high[19], id: 'v7-stories-21' };
    expect(checkModuleSeedFile(high, 'stories').join('\n')).toMatch(/v7-stories-21: id must be/);
  });

  it('runs every card through validateSeedCard', () => {
    const cards = file('phrases');
    delete cards[2]!.careful;
    cards[3] = { ...cards[3], group: 'gossip' };
    const out = checkModuleSeedFile(cards, 'phrases').join('\n');
    expect(out).toMatch(/v7-phrases-03: missing careful/);
    expect(out).toMatch(/v7-phrases-04: unknown phrase group gossip/);
  });

  it('refuses a card from another module or an old card type', () => {
    const cards = file('stories');
    cards[0] = { ...cards[0], module: 'words' };
    cards[1] = { ...cards[1], type: 'word' };
    const out = checkModuleSeedFile(cards, 'stories').join('\n');
    expect(out).toMatch(/v7-stories-01: module must be "stories"/);
    expect(out).toMatch(/v7-stories-02: type must be "module"/);
  });

  it('refuses a repeated word, phrase or situation (any case)', () => {
    const w = file('words');
    w[1] = { ...wordsCard(2), word: 'Deafening', examples: wordsCard(1).examples };
    expect(checkModuleSeedFile(w, 'words').join('\n')).toMatch(/v7-words-02: word "Deafening" repeats v7-words-01/);

    const p = file('phrases');
    p[5] = { ...p[5], phrase: "let's take this offline." };
    expect(checkModuleSeedFile(p, 'phrases').join('\n')).toMatch(/v7-phrases-06: phrase .* repeats v7-phrases-01/);

    const b = file('better');
    b[7] = { ...b[7], situation: 'Explaining a delay' };
    expect(checkModuleSeedFile(b, 'better').join('\n')).toMatch(/v7-better-08: situation .* repeats v7-better-01/);
  });

  it('caps every slide at 40 words', () => {
    const long = Array.from({ length: 41 }, () => 'word').join(' ');
    const cards = file('stories');
    cards[0] = { ...cards[0], story: long, report: 'Short.' };
    cards[1] = { ...cards[1], yourTurn: { prompt: long, hint: 'ok' } };
    const out = checkModuleSeedFile(cards, 'stories').join('\n');
    expect(out).toMatch(/v7-stories-01: slide 1 has 42 words \(max 40\)/);
    expect(out).toMatch(/v7-stories-02: slide 2 has 42 words/);
  });

  it('refuses analogy, credit or research fields, nested ones too', () => {
    const cards = file('better');
    cards[0] = { ...cards[0], analogy: 'Like a train.' };
    cards[1] = { ...cards[1], next: { ...(cards[1]!.next as Raw), research: 'A study.' } };
    cards[2] = { ...cards[2], credit: 'Minto' };
    const out = checkModuleSeedFile(cards, 'better').join('\n');
    expect(out).toMatch(/v7-better-01: field "analogy" is not allowed/);
    expect(out).toMatch(/v7-better-02: field "next.research" is not allowed/);
    expect(out).toMatch(/v7-better-03: field "credit" is not allowed/);
  });
});

describe('checkModuleSeedFile — module rules', () => {
  it('Words: both examples mark the word as **word**', () => {
    const cards = file('words');
    const ex = (cards[0]!.examples as Raw[]).slice();
    ex[1] = { ...ex[1], text: 'The stadium was deafening.' };
    cards[0] = { ...cards[0], examples: ex };
    expect(checkModuleSeedFile(cards, 'words').join('\n')).toMatch(/v7-words-01: example 2 must mark the word as \*\*deafening\*\*/);
  });

  it('Words: at least one wrong line', () => {
    const cards = file('words');
    cards[0] = { ...cards[0], wrong: [] };
    expect(checkModuleSeedFile(cards, 'words').join('\n')).toMatch(/v7-words-01: (needs at least one wrong line|wrong must be 1-2)/);
  });

  it('Words: cards 3, 6, 9, 12, 15 and 18 carry a quick check', () => {
    const cards = file('words');
    delete cards[8]!.check; // card 09
    const out = checkModuleSeedFile(cards, 'words');
    expect(out).toEqual(['v7-words-09: card 9 needs a quick check']);
  });

  it('Words: a check has three options and exactly one right', () => {
    const cards = file('words');
    const check = cards[2]!.check as { question: string; options: { text: string; right: boolean }[] };
    cards[2] = { ...cards[2], check: { ...check, options: check.options.map((o) => ({ ...o, right: true })) } };
    expect(checkModuleSeedFile(cards, 'words').join('\n')).toMatch(/v7-words-03: check must have exactly one right option/);
  });

  it('Office phrases: needs a wrong line', () => {
    const cards = file('phrases');
    delete cards[0]!.wrong;
    expect(checkModuleSeedFile(cards, 'phrases').join('\n')).toMatch(/v7-phrases-01: missing wrong/);
  });

  it('Say it better: at least 5 of 20 are "Explain your thinking"', () => {
    const cards = file('better');
    cards[0] = { ...cards[0], thinking: false };
    expect(checkModuleSeedFile(cards, 'better')).toEqual(['only 4 cards have thinking: true (at least 5)']);
  });
});

describe('word count and slides', () => {
  it('counts words, not ** marks or lone symbols', () => {
    expect(countWords('The **deafening** noise · 19 words → 8')).toBe(6);
    expect(countWords('')).toBe(0);
  });

  it('splits each module into its slides; the check slide only when there is one', () => {
    expect(slideTexts(wordsCard(1))).toHaveLength(2);
    expect(slideTexts(wordsCard(3))).toHaveLength(3);
    expect(slideTexts(talkCard(1))).toHaveLength(3);
    expect(slideTexts(betterCard(1))).toHaveLength(2);
    expect(slideTexts(phraseCard(1))).toHaveLength(2);
    expect(slideTexts(storyCard(1))).toHaveLength(2);
    const { yourTurn: _drop, ...noTurn } = storyCard(1);
    expect(slideTexts(noTurn)).toHaveLength(1);
  });
});
