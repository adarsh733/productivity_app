import { describe, expect, it } from 'vitest';
import { LIBRARY_FILES, checkLibrary, checkLibraryFile, headOf, type LibraryKey, type OutlineItem } from './libraryCheck';
import type { ModuleId } from '../types/contract';

const pad3 = (n: number) => String(n).padStart(3, '0');

/** A good Words card, numbered `n` in file `key`. Every 3rd carries a check. */
function wordsCard(key: LibraryKey, n: number, word = `glimmer${n}`): Record<string, unknown> {
  const card: Record<string, unknown> = {
    id: `v7-${key}-${pad3(n)}`,
    type: 'module',
    module: 'words',
    topic: 'money and time',
    lang: 'en',
    track: 'words',
    level: 2,
    kind: 'learn',
    category: 'Words',
    tags: ['words'],
    word,
    pos: 'adjective',
    say: 'GLIM-er',
    meaning: 'A faint, small light.',
    examples: [
      { label: 'At home', text: `I saw a **${word}** under the door.`, icon: 'home' },
      { label: 'At work', text: `There is a **${word}** of hope on the deal.`, icon: 'work' },
    ],
    right: { label: '✓ Use it right', text: `A **${word}** of light.` },
    wrong: [{ label: '✗ Wrong use', text: `The sun ${word} loudly.` }],
    rule: `a ${word} of`,
  };
  if (n % 3 === 0) {
    card.check = {
      question: 'Which one is a faint light?',
      options: [
        { text: 'A flood.', right: false },
        { text: `A ${word}.`, right: true },
        { text: 'A wall.', right: false },
      ],
    };
  }
  return card;
}

function wordsFile(key: LibraryKey = 'words-money'): Record<string, unknown>[] {
  return Array.from({ length: LIBRARY_FILES[key].cards }, (_, i) => wordsCard(key, i + 1));
}

function phraseCard(n: number, phrase: string, group = 'meetings'): Record<string, unknown> {
  return {
    id: `v7-phrases-meetings-${pad3(n)}`,
    type: 'module',
    module: 'phrases',
    topic: 'Keeping a meeting focused',
    lang: 'en',
    level: 2,
    group,
    phrase,
    meaning: 'Let us discuss this later.',
    useWhen: 'One topic eats the meeting.',
    example: `Good point. **${phrase}**`,
    tone: 'polite',
    careful: 'Follow up the same day.',
    wrong: { label: '✗ Not about the internet', text: 'The Wi-Fi stopped.' },
    similar: ['Park this for now.', 'Pick this up later.'],
  };
}

const has = (problems: string[], part: string) => problems.some((p) => p.includes(part));

describe('LIBRARY_FILES', () => {
  it('adds 1,400 cards that, with the 100 samples, make 1,500 split as planned', () => {
    const per: Record<ModuleId, number> = { words: 20, smalltalk: 20, better: 20, phrases: 20, stories: 20 };
    for (const f of Object.values(LIBRARY_FILES)) per[f.module] += f.cards;
    expect(per).toEqual({ words: 600, smalltalk: 250, better: 250, phrases: 300, stories: 100 });
    expect(Object.keys(LIBRARY_FILES)).toHaveLength(14);
    expect(LIBRARY_FILES['words-money'].file).toBe('65-words-money-time.json');
  });
});

describe('headOf', () => {
  it('reads the head field of each module', () => {
    expect(headOf({ module: 'words', word: ' relieved ' })).toBe('relieved');
    expect(headOf({ module: 'phrases', phrase: "Let's take this offline." })).toBe("Let's take this offline.");
    expect(headOf({ module: 'smalltalk', moment: 'How was your weekend?' })).toBe('How was your weekend?');
    expect(headOf({ module: 'better', mightSay: 'I am having a doubt.' })).toBe('I am having a doubt.');
    expect(headOf({ module: 'stories', report: 'The lift stopped.' })).toBe('The lift stopped.');
    expect(headOf({ module: 'nope', word: 'x' })).toBe('');
    expect(headOf(null)).toBe('');
  });
});

describe('checkLibraryFile', () => {
  it('passes a good file', () => {
    expect(checkLibraryFile(wordsFile(), 'words-money')).toEqual([]);
  });

  it('flags a wrong card count', () => {
    const cards = wordsFile().slice(0, 95);
    expect(checkLibraryFile(cards, 'words-money')).toEqual(['expected exactly 96 cards, found 95']);
  });

  it('flags a wrong line without ✗', () => {
    const cards = wordsFile();
    cards[0]!.wrong = [{ label: 'Wrong use', text: 'The sun glimmer1 loudly.' }];
    expect(checkLibraryFile(cards, 'words-money')).toEqual([
      'v7-words-money-001: wrong line 1 label must start with ✗',
    ]);
  });

  it('flags a phrase wrong line without ✗', () => {
    const cards = [phraseCard(1, 'Let us take this offline.')];
    (cards[0]!.wrong as { label: string }).label = 'Not about the internet';
    expect(has(checkLibraryFile(cards, 'phrases-meetings'), 'v7-phrases-meetings-001: wrong line label must start with ✗')).toBe(true);
  });

  it('flags a Hindi word in visible text, as a whole word only', () => {
    const cards = wordsFile();
    (cards[1]!.examples as { text: string }[])[0]!.text = 'Arre, I saw a **glimmer2** under the door.';
    expect(checkLibraryFile(cards, 'words-money')).toEqual(['v7-words-money-002: Hindi word "Arre" in text']);

    const ok = wordsFile();
    (ok[1]!.examples as { text: string }[])[0]!.text = 'My Jio phone showed a **glimmer2** of signal.';
    expect(checkLibraryFile(ok, 'words-money')).toEqual([]);
  });

  it('flags Devanagari anywhere', () => {
    const cards = wordsFile();
    cards[4]!.meaning = 'A faint light (चमक).';
    expect(checkLibraryFile(cards, 'words-money')).toEqual(['v7-words-money-005: Devanagari in meaning']);
  });

  it('flags a head repeated inside the file', () => {
    const cards = wordsFile();
    cards[9] = wordsCard('words-money', 10, 'glimmer1');
    expect(checkLibraryFile(cards, 'words-money')).toEqual(['v7-words-money-010: "glimmer1" repeats v7-words-money-001']);
  });

  it('flags a missing quick check on card 3', () => {
    const cards = wordsFile();
    delete cards[2]!.check;
    expect(checkLibraryFile(cards, 'words-money')).toEqual(['v7-words-money-003: card 3 needs a quick check']);
  });

  it('flags a check that is not 3 options with one right', () => {
    const cards = wordsFile();
    const check = cards[5]!.check as { options: { text: string; right: boolean }[] };
    check.options[0]!.right = true;
    expect(has(checkLibraryFile(cards, 'words-money'), 'v7-words-money-006: the quick check needs 3 options')).toBe(true);
  });

  it('flags ids out of order, wrong module, wrong lang, level and the word marks', () => {
    const cards = wordsFile();
    cards[0]!.id = 'v7-words-money-002';
    cards[1]!.lang = 'hi';
    cards[3]!.level = 4;
    (cards[6]!.examples as { text: string }[])[1]!.text = 'There is hope on the deal.';
    const problems = checkLibraryFile(cards, 'words-money');
    expect(has(problems, 'card 1 must have id v7-words-money-001')).toBe(true);
    expect(has(problems, 'v7-words-money-002: lang must be "en"')).toBe(true);
    expect(has(problems, 'v7-words-money-004: level must be 1, 2 or 3')).toBe(true);
    expect(has(problems, 'v7-words-money-007: example 2 must mark the word as **glimmer7**')).toBe(true);
    expect(has(checkLibraryFile(wordsFile('words-money'), 'words-senses'), 'module')).toBe(false);
    expect(has(checkLibraryFile(wordsFile('words-money'), 'talk-home'), 'module must be "smalltalk"')).toBe(true);
  });

  it('flags the 40-word slide cap and banned fields', () => {
    const cards = wordsFile();
    cards[7]!.meaning = Array.from({ length: 41 }, () => 'light').join(' ');
    cards[8]!.analogy = 'Like a candle.';
    const problems = checkLibraryFile(cards, 'words-money');
    expect(has(problems, 'v7-words-money-008: slide 1 has')).toBe(true);
    expect(has(problems, 'v7-words-money-009: field "analogy" is not allowed')).toBe(true);
  });

  it('with an outline, checks heads card by card and the phrase group', () => {
    const outline: OutlineItem[] = wordsFile().map((c) => ({ id: String(c.id), head: String(c.word), level: 2, note: 'money' }));
    expect(checkLibraryFile(wordsFile(), 'words-money', outline)).toEqual([]);
    outline[3] = { ...outline[3]!, head: 'shimmer' };
    expect(checkLibraryFile(wordsFile(), 'words-money', outline)).toEqual([
      'v7-words-money-004: head "glimmer4" must be "shimmer" (outline item 4)',
    ]);

    const phrases = [phraseCard(1, 'Let us take this offline.', 'praise')];
    const pOutline: OutlineItem[] = [{ id: 'v7-phrases-meetings-001', head: 'Let us take this offline.', level: 2, note: 'meetings' }];
    expect(has(checkLibraryFile(phrases, 'phrases-meetings', pOutline), 'group must be "meetings" (outline)')).toBe(true);
  });
});

describe('checkLibrary', () => {
  it('passes files with no shared ids or heads', () => {
    expect(checkLibrary({ 'a.json': wordsFile('words-money'), 'b.json': wordsFile('words-work').map((c, i) => ({ ...c, word: `other${i}` })) })).toEqual([]);
  });

  it('flags a head repeated across files inside one module, and a shared id', () => {
    const sample = [{ id: 'v7-words-01', type: 'module', module: 'words', word: 'Glimmer5' }];
    const talk = [{ id: 'v7-talk-01', type: 'module', module: 'smalltalk', moment: 'glimmer6' }];
    const problems = checkLibrary({
      '50-words.json': sample,
      '51-small-talk.json': talk,
      '65-words-money-time.json': wordsFile('words-money'),
      'dupe.json': [{ id: 'v7-words-01', type: 'module', module: 'stories', report: 'A new story.' }],
    });
    expect(problems).toEqual([
      '65-words-money-time.json v7-words-money-005: "glimmer5" repeats 50-words.json v7-words-01 (words)',
      'dupe.json v7-words-01: id also used in 50-words.json v7-words-01',
    ]);
  });
});
