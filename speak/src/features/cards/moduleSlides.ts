import type {
  LabeledLine,
  ModuleCard,
  OfficePhraseCard,
  SayBetterCard,
  SmallTalkCard,
  StoryCard,
  WordsCard,
} from '../../types/contract';

/**
 * Strips markdown highlights (**word**) and cleans punctuation for TTS speech.
 */
function cleanSpeech(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

export interface BaseModuleSlide {
  kind: string;
  speech: string;
}

export interface WordsWordSlide extends BaseModuleSlide {
  kind: 'word';
  word: string;
  pos: string;
  say: string;
  meaning: string;
  examples: [LabeledLine, LabeledLine];
}

export interface WordsRightWrongSlide extends BaseModuleSlide {
  kind: 'right_wrong';
  right: LabeledLine;
  wrong: LabeledLine[];
  rule: string;
}

export interface WordsCheckSlide extends BaseModuleSlide {
  kind: 'check';
  question: string;
  options: { text: string; right: boolean }[];
}

export interface SmallTalkChatSlide extends BaseModuleSlide {
  kind: 'chat';
  moment: string;
  chatKind: SmallTalkCard['kind'];
  they?: string;
  deadEnd: string;
  reply: string;
  formula: string;
}

export interface SmallTalkMoreSlide extends BaseModuleSlide {
  kind: 'more';
  more: LabeledLine[];
}

export interface SmallTalkDontsSlide extends BaseModuleSlide {
  kind: 'donts';
  donts: string[];
}

export interface SayBetterBeforeAfterSlide extends BaseModuleSlide {
  kind: 'better';
  situation: string;
  thinking: boolean;
  mightSay: string;
  better: string;
  changes: string[];
}

export interface SayBetterNextSlide extends BaseModuleSlide {
  kind: 'next';
  next: { title: string; lines: LabeledLine[]; note?: string };
}

export interface OfficePhrasesPhraseSlide extends BaseModuleSlide {
  kind: 'phrase';
  group: OfficePhraseCard['group'];
  phrase: string;
  meaning: string;
  useWhen: string;
  example: string;
  tone: string;
}

export interface OfficePhrasesCarefulSlide extends BaseModuleSlide {
  kind: 'careful';
  careful: string;
  wrong: LabeledLine;
  similar: [string, string];
}

export interface StoriesStorySlide extends BaseModuleSlide {
  kind: 'story';
  topic: string;
  report: string;
  story: string;
  trick: string;
}

export interface StoriesYourTurnSlide extends BaseModuleSlide {
  kind: 'your_turn';
  yourTurn: { prompt: string; hint: string };
}

export type ModuleSlide =
  | WordsWordSlide
  | WordsRightWrongSlide
  | WordsCheckSlide
  | SmallTalkChatSlide
  | SmallTalkMoreSlide
  | SmallTalkDontsSlide
  | SayBetterBeforeAfterSlide
  | SayBetterNextSlide
  | OfficePhrasesPhraseSlide
  | OfficePhrasesCarefulSlide
  | StoriesStorySlide
  | StoriesYourTurnSlide;

function wordsSlides(card: WordsCard): ModuleSlide[] {
  const slides: ModuleSlide[] = [
    {
      kind: 'word',
      word: card.word,
      pos: card.pos,
      say: card.say,
      meaning: card.meaning,
      examples: card.examples,
      speech: cleanSpeech(`${card.word}. ${card.meaning}. ${card.examples[0].text} ${card.examples[1].text}`),
    },
    {
      kind: 'right_wrong',
      right: card.right,
      wrong: card.wrong,
      rule: card.rule,
      speech: cleanSpeech(
        `${card.right.label}: ${card.right.text}. ${card.wrong.map((w) => `${w.label}: ${w.text}`).join('. ')}. Rule: ${card.rule}`,
      ),
    },
  ];

  if (card.check && card.check.options.length > 0) {
    slides.push({
      kind: 'check',
      question: card.check.question,
      options: card.check.options,
      speech: cleanSpeech(card.check.question),
    });
  }

  return slides;
}

function smallTalkSlides(card: SmallTalkCard): ModuleSlide[] {
  return [
    {
      kind: 'chat',
      moment: card.moment,
      chatKind: card.kind,
      they: card.they,
      deadEnd: card.deadEnd,
      reply: card.reply,
      formula: card.formula,
      speech: cleanSpeech(`${card.they ? card.they + '. ' : ''}${card.reply}`),
    },
    {
      kind: 'more',
      more: card.more,
      speech: cleanSpeech(card.more.map((m) => `${m.label}: ${m.text}`).join('. ')),
    },
    {
      kind: 'donts',
      donts: card.donts,
      speech: cleanSpeech(`Don't: ${card.donts.join('. ')}`),
    },
  ];
}

function sayBetterSlides(card: SayBetterCard): ModuleSlide[] {
  return [
    {
      kind: 'better',
      situation: card.situation,
      thinking: card.thinking,
      mightSay: card.mightSay,
      better: card.better,
      changes: card.changes,
      speech: cleanSpeech(`Better: ${card.better}`),
    },
    {
      kind: 'next',
      next: card.next,
      speech: cleanSpeech(
        `${card.next.title}. ${card.next.lines.map((l) => `${l.label ? l.label + ': ' : ''}${l.text}`).join('. ')}${card.next.note ? '. ' + card.next.note : ''}`,
      ),
    },
  ];
}

function officePhraseSlides(card: OfficePhraseCard): ModuleSlide[] {
  return [
    {
      kind: 'phrase',
      group: card.group,
      phrase: card.phrase,
      meaning: card.meaning,
      useWhen: card.useWhen,
      example: card.example,
      tone: card.tone,
      speech: cleanSpeech(`${card.phrase}. ${card.meaning}. Example: ${card.example}`),
    },
    {
      kind: 'careful',
      careful: card.careful,
      wrong: card.wrong,
      similar: card.similar,
      speech: cleanSpeech(
        `Careful: ${card.careful}. Don't: ${card.wrong.text}. Similar: ${card.similar.join(', ')}`,
      ),
    },
  ];
}

function storySlides(card: StoryCard): ModuleSlide[] {
  const slides: ModuleSlide[] = [
    {
      kind: 'story',
      topic: card.topic,
      report: card.report,
      story: card.story,
      trick: card.trick,
      speech: cleanSpeech(`Story: ${card.story}`),
    },
  ];

  if (card.yourTurn) {
    slides.push({
      kind: 'your_turn',
      yourTurn: card.yourTurn,
      speech: cleanSpeech(`${card.yourTurn.prompt}. ${card.yourTurn.hint}`),
    });
  }

  return slides;
}

/**
 * Builds 1 to 3 slides for any ModuleCard.
 *
 * Words: word, right/wrong, and optional check
 * Small talk: chat, more replies, don'ts
 * Say it better: before/after, next
 * Office phrases: phrase, careful
 * Stories: report/story, optional yourTurn
 */
export function moduleSlides(card: ModuleCard): ModuleSlide[] {
  switch (card.module) {
    case 'words':
      return wordsSlides(card);
    case 'smalltalk':
      return smallTalkSlides(card);
    case 'better':
      return sayBetterSlides(card);
    case 'phrases':
      return officePhraseSlides(card);
    case 'stories':
      return storySlides(card);
  }
}
