import type { AnyCard, Track } from '../../types/contract';
import { trackOf } from '../skills/trackOf';
import { hashOf } from './slides';

/**
 * Which picture a card shows. Pictures are shared by topic: each topic has two,
 * and a card always gets the same one. Files live in `public/art/` and are
 * cached for offline use, so a card never waits on the network for its picture.
 */

const VARIANTS = 2;

const TOPICS_BY_CATEGORY: Record<string, string> = {
  Mindset: 'smalltalk-mindset',
  'Answer well': 'smalltalk-answer',
  'Hand it back': 'smalltalk-handback',
  'Follow-ups': 'smalltalk-followups',
  'Listening moves': 'smalltalk-listening',
  'Story basics': 'stories-basics',
  'Telling it': 'stories-telling',
  'Everyday stories': 'stories-everyday',
  Endings: 'stories-endings',
  'Vivid detail': 'stories-vivid',
  'Answer first': 'clearly-first',
  'Plain words': 'clearly-plain',
  'Cut the clutter': 'clearly-clutter',
  Delivery: 'clearly-delivery',
  'Precise verbs': 'words-verbs',
  Collocations: 'words-collocations',
  'Indian-English fixes': 'words-fixes',
  'Phrasal verbs': 'words-phrasal',
  'Office phrases': 'words-office',
};

const TOPICS_BY_TYPE: Partial<Record<AnyCard['type'], string>> = {
  word: 'words-vocab',
  idiom: 'words-office',
  swap: 'words-fixes',
  phrase: 'words-fixes',
  feeling: 'words-feelings',
  action_verb: 'words-verbs',
  story_move: 'stories-basics',
};

const TOPICS_BY_TRACK: Record<Track, readonly string[]> = {
  smalltalk: ['smalltalk-answer', 'smalltalk-followups', 'smalltalk-handback', 'smalltalk-listening'],
  stories: ['stories-basics', 'stories-telling', 'stories-everyday', 'stories-vivid'],
  clearly: ['clearly-first', 'clearly-plain', 'clearly-clutter', 'clearly-delivery'],
  words: ['words-vocab', 'words-office', 'words-fixes', 'words-verbs'],
};

export const RING_ART: Record<Track, string> = {
  smalltalk: '/art/ring-smalltalk.webp',
  stories: '/art/ring-stories.webp',
  clearly: '/art/ring-clearly.webp',
  words: '/art/ring-words.webp',
};

export function artFor(card: AnyCard): string {
  const { track } = trackOf(card);
  const named = card.type === 'teach' ? TOPICS_BY_CATEGORY[card.category] : TOPICS_BY_TYPE[card.type];
  const hash = hashOf(card.id);
  const pool = TOPICS_BY_TRACK[track];
  // The picture's background is the skill's colour, so it must be the same skill.
  const topic = named?.startsWith(track) ? named : (pool[hash % pool.length] as string);
  return `/art/${topic}-${(hash % VARIANTS) + 1}.webp`;
}
