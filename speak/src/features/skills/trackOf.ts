import type { AnyCard, CardKind, SkillTag, TeachCard, Track } from '../../types/contract';

/**
 * Which of the four skills a card belongs to (v5).
 *
 * Order of truth:
 *  1. a `teach` card carries its own track, level and kind;
 *  2. an old card that was reshaped carries a `skill` tag;
 *  3. otherwise by type — word / swap / idiom / feeling / action_verb → Words,
 *     phrase → Speak clearly, story_move → Stories, situation → a Try card whose
 *     track follows the situation's kind.
 *
 * Pure. No database, no network.
 */

export const TRACK_LABELS: Record<Track, string> = {
  smalltalk: '💬 Small talk',
  stories: '📖 Stories',
  clearly: '🎯 Speak clearly',
  words: '🔤 Words',
};

export const KIND_LABELS: Record<CardKind, string> = {
  learn: 'Learn',
  use: 'Use',
  fix: 'Fix',
  try: 'Try',
  ask_them: 'Ask them',
};

/** The four skills in feed order. */
export const TRACKS: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];

/** True for a v5 teach card. Works on `Card` too, which does not list `teach` yet. */
export function isTeachCard(card: AnyCard): card is TeachCard {
  return card.type === 'teach';
}

/** A situation prompt is practice (Try); its track follows what it is about. */
function situationTrack(kind: string): Track {
  switch (kind) {
    case 'incident':
    case 'life_story':
      return 'stories';
    case 'office_call':
      return 'smalltalk';
    case 'feeling':
      return 'words';
    case 'opinion':
    default:
      return 'clearly';
  }
}

export function trackOf(card: AnyCard): SkillTag {
  if (card.type === 'teach') {
    return {
      track: card.track,
      level: card.level,
      kind: card.kind,
      work: card.examples?.work,
      everyday: card.examples?.everyday,
      analogy: card.analogy,
      insteadOf: card.insteadOf,
      answer: card.answer,
    };
  }

  if (card.skill) return card.skill;

  switch (card.type) {
    case 'word':
    case 'idiom':
    case 'feeling':
    case 'action_verb':
      return { track: 'words', kind: 'learn' };
    case 'swap':
      return { track: 'words', kind: 'fix', insteadOf: card.weak };
    case 'phrase':
      return { track: 'clearly', kind: 'fix', insteadOf: card.weak };
    case 'story_move':
      return { track: 'stories', kind: 'learn' };
    case 'situation':
      return { track: situationTrack(card.kind), kind: 'try' };
    default:
      // pronounce, say_it, breath, describe, explain, teach_back: delivery work.
      return { track: 'clearly', kind: 'learn' };
  }
}

/** "🔤 Words" or "💬 Small talk · L2" when the level is known. */
export function trackChipText(tag: SkillTag): string {
  return tag.level ? `${TRACK_LABELS[tag.track]} · L${tag.level}` : TRACK_LABELS[tag.track];
}
