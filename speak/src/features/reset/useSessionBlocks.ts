/**
 * The four drill blocks, fed from the seeded deck instead of four hardcoded
 * strings.
 *
 * 368 reviewed cards were sitting in IndexedDB with nothing reading them after
 * the product reset — every session showed the same four lines forever, which
 * is the fastest way to make a daily habit boring. This pulls a real card per
 * block and rotates it by date.
 *
 * Content problems degrade to the authored fallback rather than blocking the
 * session: an empty block would break the loop the app exists for.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { todayKey } from '../../lib/date';
import type { Card, CardType, Lang } from '../../types/contract';

export interface BlockContent {
  cue: string;
  prompt: string;
  /** Set when the line came from the deck, so the session can log what it served. */
  cardId?: string;
}

const FALLBACK: readonly BlockContent[] = [
  {
    cue: 'Hum gently, then carry that ease into one ordinary sentence.',
    prompt: '“I’ll give you the clearest update I can.”',
  },
  {
    cue: 'Use a quiet conversational register. Let the pause carry the emphasis.',
    prompt: '“My recommendation is to delay the launch.”',
  },
  {
    cue: 'Finish the final consonants without pushing more air.',
    prompt: 'premature · risk · launched · trust',
  },
  {
    cue: 'Retrieve before reading a model sentence.',
    prompt: 'premature · trade-off · uljhan',
  },
];

function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) >>> 0;
  return out;
}

/** Deterministic per-day pick, so leaving and returning shows the same drill. */
function rotate<T>(pool: T[], dateKey: string, salt: string): T | undefined {
  if (pool.length === 0) return undefined;
  return pool[hash(dateKey + salt) % pool.length];
}

function pool(cards: Card[], type: CardType, lang: Lang = 'en'): Card[] {
  return cards.filter((card) => card.type === type && card.lang === lang && card.status === 'active');
}

function toContent(card: Card | undefined, index: number): BlockContent {
  const fallback = FALLBACK[index]!;
  if (!card) return fallback;

  switch (card.type) {
    case 'breath':
      return {
        // The transfer rep is the line that matters; the drill itself is the setup.
        cue: card.instructions[0] ?? fallback.cue,
        prompt: card.title,
        cardId: card.id,
      };
    case 'say_it':
      return {
        cue: 'Quiet conversational register. `/` is a short pause, `//` a long one.',
        prompt: card.marked || card.line,
        cardId: card.id,
      };
    case 'pronounce':
      return {
        cue: card.commonError
          ? `Watch the ending. Common slip: ${card.commonError}`
          : 'Land every syllable. Stress is marked in capitals.',
        prompt: card.syllables,
        cardId: card.id,
      };
    case 'word':
      return {
        cue: `${card.term} (${card.pos}) — ${card.meaning}`,
        prompt: card.say,
        cardId: card.id,
      };
    default:
      return fallback;
  }
}

export interface SessionBlockContent {
  ready: boolean;
  blocks: BlockContent[];
}

export function useSessionBlocks(dateKey: string = todayKey()): SessionBlockContent {
  const blocks = useLiveQuery(async () => {
    const cards = await db.cards.toArray();

    const breath = rotate(pool(cards, 'breath'), dateKey, 'breath');
    const sayIt = rotate(pool(cards, 'say_it'), dateKey, 'say_it');
    const pronounce = rotate(pool(cards, 'pronounce'), dateKey, 'pronounce');
    const word = rotate(pool(cards, 'word'), dateKey, 'word');
    const hindi = rotate(pool(cards, 'word', 'hi'), dateKey, 'hindi');

    const vocabulary = toContent(word, 3);
    // Hindi gets its 1-2 minutes inside the normal day (PRODUCT-RESET-PLAN §9.3)
    // rather than living in a carousel nobody opens.
    const withHindi: BlockContent =
      hindi && hindi.type === 'word'
        ? { ...vocabulary, cue: `${vocabulary.cue}  ·  Then in Hindi: ${hindi.term} — ${hindi.meaning}` }
        : vocabulary;

    return [toContent(breath, 0), toContent(sayIt, 1), toContent(pronounce, 2), withHindi];
  }, [dateKey]);

  return { ready: blocks !== undefined, blocks: blocks ?? [...FALLBACK] };
}
