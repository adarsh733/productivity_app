import type { AnyCard, SkillTag, TeachCard } from '../../types/contract';
import { trackOf } from '../skills/trackOf';

/**
 * Turns any card into short slides, one idea each, so a card reads like an
 * Instagram carousel instead of a page of text. Pure: no database, no network.
 *
 * Nothing here writes new English. Every line comes from the card, so the
 * content checks that already ran on the card still hold.
 */

export interface ChatLine {
  who: string;
  text: string;
  /** Said by him, so it sits on the right. */
  mine: boolean;
}

export interface ExampleItem {
  label: string;
  text: string;
  /** Set when the text is a real back-and-forth: drawn as chat bubbles. */
  chat?: ChatLine[];
}

export interface PickOption {
  text: string;
  right: boolean;
}

export type Slide =
  | { kind: 'idea'; headline: string; sub?: string; speech: string }
  | { kind: 'examples'; items: ExampleItem[]; speech: string }
  | { kind: 'picture'; headline: string; speech: string }
  | { kind: 'pick'; question: string; options: PickOption[]; why?: string; speech: string }
  | {
      kind: 'tapword';
      before: string[];
      weak: string;
      after: string[];
      strong: string;
      why?: string;
      speech: string;
    }
  | { kind: 'try'; prompt: string; shape?: string; answer?: string; speech: string };

/** Two short examples can share a slide; anything longer gets its own. */
const SHARE_SLIDE_MAX_CHARS = 130;
/** A game option has to fit on a big button. */
const OPTION_MAX_CHARS = 90;
const MAX_CHANGED_WORDS = 4;
const MIN_SHARED_WORDS = 2;

export function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function stripQuotes(text: string): string {
  return text.trim().replace(/^["“]/, '').replace(/["”]$/, '').trim();
}

/** `Rahul: "Good luck!"` lines become bubbles. All lines must fit, or none are. */
export function parseChat(text: string): ChatLine[] | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;
  const out: ChatLine[] = [];
  for (const line of lines) {
    const m = /^([^:"]{1,30}):\s*"(.+)"$/.exec(line);
    if (!m) return undefined;
    const who = (m[1] as string).trim();
    out.push({ who, text: m[2] as string, mine: /^you\b/i.test(who) });
  }
  return out;
}

function exampleItem(label: string, text: string): ExampleItem {
  return { label, text, chat: parseChat(text) };
}

const wordKey = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * The tap-the-weak-word game needs two sentences that differ in one small
 * place: "We have a very big backlog" / "We have a huge backlog".
 */
export function wordDiff(
  weak: string,
  strong: string,
): { before: string[]; weak: string; after: string[]; strong: string } | null {
  const a = weak.trim().split(/\s+/);
  const b = strong.trim().split(/\s+/);
  let start = 0;
  while (start < a.length && start < b.length && wordKey(a[start] as string) === wordKey(b[start] as string)) {
    start++;
  }
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    wordKey(a[a.length - 1 - end] as string) === wordKey(b[b.length - 1 - end] as string)
  ) {
    end++;
  }
  const weakMid = a.slice(start, a.length - end);
  const strongMid = b.slice(start, b.length - end);
  if (weakMid.length < 1 || weakMid.length > MAX_CHANGED_WORDS) return null;
  if (strongMid.length < 1 || strongMid.length > MAX_CHANGED_WORDS) return null;
  if (start + end < MIN_SHARED_WORDS) return null;
  return {
    before: b.slice(0, start),
    weak: weakMid.join(' '),
    after: b.slice(b.length - end),
    strong: strongMid.join(' '),
  };
}

function gameSlide(
  id: string,
  weak: string,
  strong: string,
  question: string | undefined,
  why: string | undefined,
): Slide | null {
  const w = stripQuotes(weak);
  const s = stripQuotes(strong);
  if (!w || !s || w === s) return null;
  if (w.length > OPTION_MAX_CHARS || s.length > OPTION_MAX_CHARS) return null;
  const diff = question ? null : wordDiff(w, s);
  if (diff) return { kind: 'tapword', ...diff, why, speech: s };
  const options: PickOption[] = [
    { text: w, right: false },
    { text: s, right: true },
  ];
  // The better answer must not always sit in the same place. Same card, same order.
  if (hashOf(id) % 2 === 0) options.reverse();
  return { kind: 'pick', question: question ?? 'Which sounds better?', options, why, speech: s };
}

/** What he would say: his own line from a chat, or the whole example. */
function ownLine(example: string): string {
  const chat = parseChat(example);
  return chat?.find((l) => l.mine)?.text ?? (chat ? '' : example);
}

/** `"How was your day?" — "Fine."` holds the question and the weak answer. */
function askedAndWeak(insteadOf: string): { asked: string; weak: string } | null {
  const m = /^"(.+?)"\s*[—–-]\s*"(.+)"$/.exec(insteadOf.trim());
  return m ? { asked: m[1] as string, weak: m[2] as string } : null;
}

function gameFromParts(
  id: string,
  track: string,
  insteadOf: string | undefined,
  work: string | undefined,
  why: string | undefined,
): Slide | null {
  if (!insteadOf || !work) return null;
  const strong = ownLine(work);
  if (!strong) return null;
  const pair = askedAndWeak(insteadOf);
  if (pair) return gameSlide(id, pair.weak, strong, pair.asked, why);
  // A small-talk "instead of" is often a thought, not a line anyone would say.
  if (track === 'smalltalk') return null;
  return gameSlide(id, insteadOf, strong, undefined, why);
}

function examplesSlides(work?: string, everyday?: string): Slide[] {
  const items: ExampleItem[] = [];
  if (work) items.push(exampleItem('At work', work));
  if (everyday) items.push(exampleItem('In daily life', everyday));
  if (items.length === 0) return [];
  const anyChat = items.some((i) => i.chat);
  const total = (work?.length ?? 0) + (everyday?.length ?? 0);
  if (items.length === 2 && !anyChat && total <= SHARE_SLIDE_MAX_CHARS) {
    return [{ kind: 'examples', items, speech: `${work} ${everyday}` }];
  }
  return items.map((item) => ({ kind: 'examples' as const, items: [item], speech: item.text }));
}

function pictureSlide(analogy?: string): Slide[] {
  return analogy ? [{ kind: 'picture', headline: analogy, speech: analogy }] : [];
}

function teachSlides(card: TeachCard): Slide[] {
  if (card.kind === 'try') {
    return [
      {
        kind: 'try',
        prompt: card.tryPrompt,
        shape: card.title,
        answer: card.answer?.trim() || card.examples?.work?.trim() || undefined,
        speech: card.tryPrompt,
      },
    ];
  }
  const game = gameFromParts(card.id, card.track, card.insteadOf, card.examples?.work, card.rule);
  return [
    { kind: 'idea', headline: card.title, sub: card.rule, speech: `${card.title}. ${card.rule}` },
    ...(game ? [game] : []),
    ...examplesSlides(card.examples?.work, card.examples?.everyday),
    ...pictureSlide(card.analogy),
    { kind: 'try', prompt: card.tryPrompt, answer: card.answer?.trim() || undefined, speech: card.tryPrompt },
  ];
}

/** The extra parts an old card carries in its skill tag. */
function skillTail(skill: SkillTag, work?: string, everyday?: string): Slide[] {
  return [
    ...examplesSlides(skill.work ?? work, skill.everyday ?? everyday),
    ...pictureSlide(skill.analogy),
  ];
}

export function slidesFor(card: AnyCard): Slide[] {
  if (card.type === 'teach') return teachSlides(card);
  const skill = trackOf(card);
  switch (card.type) {
    case 'word':
      return [
        { kind: 'idea', headline: card.term, sub: card.meaning, speech: card.term },
        ...skillTail(skill, card.examples?.[0], card.examples?.[1]),
      ];
    case 'idiom':
      return [
        { kind: 'idea', headline: card.phrase, sub: card.meaning, speech: card.phrase },
        ...skillTail(skill, card.example),
      ];
    case 'swap': {
      const best = card.answers[0] ?? '';
      const game =
        gameFromParts(card.id, skill.track, skill.insteadOf, skill.work, undefined) ??
        gameSlide(card.id, card.weak, best, undefined, undefined);
      const others = card.answers.slice(1);
      return [
        ...(game ? [game] : []),
        {
          kind: 'idea' as const,
          headline: best,
          sub: others.length > 0 ? `Also: ${others.join(', ')}` : undefined,
          speech: best,
        },
        ...skillTail(skill),
      ];
    }
    case 'phrase': {
      const game = gameSlide(card.id, card.weak, card.strong, undefined, undefined);
      return [
        ...(game ? [game] : []),
        { kind: 'idea', headline: card.strong, sub: card.why, speech: card.strong },
        ...skillTail(skill),
      ];
    }
    case 'feeling':
      return [
        { kind: 'idea', headline: card.term, sub: card.meaning, speech: card.term },
        ...skillTail(skill, card.example),
      ];
    case 'action_verb':
      return [
        { kind: 'idea', headline: card.verb, sub: card.meaning, speech: card.verb },
        ...skillTail(skill, card.examples[0], card.examples[1]),
      ];
    case 'story_move':
      return [
        { kind: 'idea', headline: card.move, sub: card.why, speech: card.move },
        ...skillTail(skill, card.example),
      ];
    case 'situation':
      return [{ kind: 'try', prompt: card.prompt, shape: card.title, speech: card.prompt }];
    case 'pronounce':
      return [{ kind: 'idea', headline: card.term, sub: card.syllables, speech: card.term }];
    case 'say_it':
      return [{ kind: 'idea', headline: card.line, speech: card.line }];
    case 'breath':
      return [{ kind: 'idea', headline: card.title, sub: card.instructions[0], speech: card.title }];
    case 'describe':
    case 'teach_back':
      return [{ kind: 'try', prompt: card.prompt, speech: card.prompt }];
    case 'explain':
      return [{ kind: 'try', prompt: card.topic, shape: card.angle, speech: card.topic }];
    default: {
      const _exhaustive: never = card;
      throw new Error(`Unhandled card type in slidesFor: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
