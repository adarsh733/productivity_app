import type { Card, Review } from '../../types/contract';

export interface CategoryDeck {
  id: string;
  name: string;
  icon: string;
  badge: string;
  description: string;
  match: (card: Card) => boolean;
}

export const CATEGORY_DECKS: CategoryDeck[] = [
  {
    id: 'office',
    name: 'Office English',
    icon: '💼',
    badge: 'Office English',
    description: 'Meetings, updates, polite pushback & slack',
    match: (c) =>
      (c.type === 'idiom' && Boolean((c as Extract<Card, { type: 'idiom' }>).corporate)) ||
      (c.type === 'phrase' && (c as Extract<Card, { type: 'phrase' }>).register === 'office') ||
      c.type === 'swap' ||
      c.tags.some((t) => ['office', 'meetings', 'decisions', 'slack', 'pushback'].includes(t)),
  },
  {
    id: 'vocab',
    name: 'Everyday Words',
    icon: '📖',
    badge: 'Vocabulary',
    description: 'Precision words without jargon or stiffness',
    match: (c) => (c.type === 'word' || c.type === 'feeling') && c.lang === 'en',
  },
  {
    id: 'hindi',
    name: 'Practical Hindi',
    icon: '🇮🇳',
    badge: 'Practical Hindi',
    description: 'Natural conversational Hindi for daily fluency',
    match: (c) => c.lang === 'hi',
  },
  {
    id: 'story',
    name: 'Story Craft',
    icon: '📚',
    badge: 'Story Craft',
    description: 'Narrative moves, structures, and hooks',
    match: (c) =>
      c.type === 'story_move' ||
      c.tags.some((t) => ['story', 'narrative', 'impact', 'meeting', 'decisions'].includes(t)),
  },
  {
    id: 'verbs',
    name: 'Action Verbs',
    icon: '🏃',
    badge: 'Action Verb',
    description: 'Dynamic replacements for weak, passive verbs',
    match: (c) => c.type === 'action_verb',
  },
  {
    id: 'phrases',
    name: 'Say This Instead',
    icon: '💭',
    badge: 'Say This Instead',
    description: 'Clearer upgrades for common conversational phrases',
    match: (c) => c.type === 'phrase' || c.type === 'swap',
  },
  {
    id: 'pronounce',
    name: 'Pronunciation',
    icon: '🗣️',
    badge: 'Pronunciation',
    description: 'Syllable stress and clean articulation',
    match: (c) => c.type === 'pronounce',
  },
  {
    id: 'pace',
    name: 'Speech Pace',
    icon: '🎙️',
    badge: 'Speech Pace',
    description: 'Phrasing cadence, emphasis, and pause marks',
    match: (c) => c.type === 'say_it',
  },
];

export function getDeckCards(cards: Card[], deckId: string): Card[] {
  const deck = CATEGORY_DECKS.find((d) => d.id === deckId);
  if (!deck) return [];
  return cards.filter((c) => c.status === 'active' && deck.match(c));
}

export function getDeckProgress(
  deckCards: Card[],
  reviews: Map<string, Review> | Review[],
): { total: number; seen: number; percent: number } {
  const total = deckCards.length;
  if (total === 0) return { total: 0, seen: 0, percent: 0 };

  const reviewMap =
    reviews instanceof Map
      ? reviews
      : new Map(reviews.map((r) => [r.cardId, r]));

  let seen = 0;
  for (const c of deckCards) {
    const rev = reviewMap.get(c.id);
    if (rev && (rev.reps > 0 || rev.state !== 'new')) {
      seen++;
    }
  }

  const percent = Math.round((seen / total) * 100);
  return { total, seen, percent };
}

export function searchCards(cards: Card[], query: string): Card[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return cards.filter((c) => {
    if (c.status !== 'active') return false;
    if (c.id.toLowerCase().includes(q)) return true;
    if (c.tags.some((t) => t.toLowerCase().includes(q))) return true;

    switch (c.type) {
      case 'word':
        return (
          c.term.toLowerCase().includes(q) ||
          c.meaning.toLowerCase().includes(q) ||
          (c.examples && c.examples.some((ex) => ex.toLowerCase().includes(q)))
        );
      case 'idiom':
        return (
          c.phrase.toLowerCase().includes(q) ||
          c.meaning.toLowerCase().includes(q) ||
          c.scenario.toLowerCase().includes(q) ||
          c.example.toLowerCase().includes(q)
        );
      case 'swap':
        return (
          c.weak.toLowerCase().includes(q) ||
          c.answers.some((a) => a.toLowerCase().includes(q))
        );
      case 'phrase':
        return (
          c.weak.toLowerCase().includes(q) ||
          c.strong.toLowerCase().includes(q) ||
          c.why.toLowerCase().includes(q)
        );
      case 'action_verb':
        return (
          c.verb.toLowerCase().includes(q) ||
          c.meaning.toLowerCase().includes(q) ||
          c.contrast.toLowerCase().includes(q)
        );
      case 'feeling':
        return (
          c.term.toLowerCase().includes(q) ||
          c.meaning.toLowerCase().includes(q) ||
          c.contrast.toLowerCase().includes(q)
        );
      case 'story_move':
        return (
          c.move.toLowerCase().includes(q) ||
          c.why.toLowerCase().includes(q) ||
          c.example.toLowerCase().includes(q)
        );
      case 'pronounce':
        return (
          c.term.toLowerCase().includes(q) ||
          c.syllables.toLowerCase().includes(q)
        );
      case 'say_it':
        return c.line.toLowerCase().includes(q) || c.marked.toLowerCase().includes(q);
      case 'describe':
        return (
          c.prompt.toLowerCase().includes(q) ||
          c.beats.some((b) => b.toLowerCase().includes(q)) ||
          c.targetVocab.some((v) => v.toLowerCase().includes(q))
        );
      case 'explain':
        return (
          c.topic.toLowerCase().includes(q) ||
          c.angle.toLowerCase().includes(q) ||
          c.beats.some((b) => b.toLowerCase().includes(q)) ||
          c.targetVocab.some((v) => v.toLowerCase().includes(q))
        );
      case 'teach_back':
        return (
          c.prompt.toLowerCase().includes(q) ||
          c.beats.some((b) => b.toLowerCase().includes(q))
        );
      case 'breath':
        return (
          c.title.toLowerCase().includes(q) ||
          c.drill.toLowerCase().includes(q) ||
          c.instructions.some((ins) => ins.toLowerCase().includes(q))
        );
      default:
        return false;
    }
  });
}
