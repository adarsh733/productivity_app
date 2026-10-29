import type { AnyCard } from '../../types/contract';

/**
 * Ask tab, instant search. Looks through the cards already on the phone as he
 * types. Pure: no network, no database, no AI.
 *
 * Build the index once per card list (`buildLibraryIndex`), then call
 * `searchLibrary` on every keystroke.
 */

export interface LibraryHit {
  card: AnyCard;
  /** The card's headline: the word, phrase or lesson title. */
  title: string;
  /** One short line that says what it is. */
  line: string;
  score: number;
}

interface IndexRow {
  card: AnyCard;
  title: string;
  line: string;
  titleLower: string;
  bodyLower: string;
}

export type LibraryIndex = readonly IndexRow[];

/** Words that carry no meaning for a search, plus the Ask chips' own openers. */
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or',
  'it', 'its', 'this', 'that', 'my', 'me', 'i', 'you', 'do', 'does', 'did', 'what', 'whats', 'how', 'can',
  'say', 'mean', 'means', 'meaning', 'word', 'phrase', 'fix', 'sentence', 'reply', 'slip', 'make', 'with',
  'about', 'by', 'as', 'so', 'if', 'not', 'no', 'ok', 'okay', 'heard', 'between', 'difference', 'vs',
]);

export const MIN_QUERY_CHARS = 2;
export const DEFAULT_LIBRARY_LIMIT = 5;

/** Lower-case words of a query with filler removed. */
export function queryTokens(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w) && w.length >= 2);
  // "what does it mean" has nothing left: fall back to the raw words so a
  // short word like "go" still finds itself.
  return meaningful.length > 0 ? meaningful : words.filter((w) => w.length >= MIN_QUERY_CHARS);
}

function clip(s: string, n = 90): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Headline, one-line gist and every searchable word of a card; null = not searchable. */
function describe(card: AnyCard): { title: string; line: string; body: string[] } | null {
  switch (card.type) {
    case 'teach':
      return {
        title: card.title,
        line: card.rule,
        body: [
          card.rule,
          card.examples?.work ?? '',
          card.examples?.everyday ?? '',
          card.insteadOf ?? '',
          card.answer ?? '',
          card.analogy ?? '',
          card.category ?? '',
        ],
      };
    case 'word':
      return { title: card.term, line: card.meaning, body: [card.meaning, ...(card.examples ?? [])] };
    case 'idiom':
      return { title: card.phrase, line: card.meaning, body: [card.meaning, card.scenario, card.example] };
    case 'action_verb':
      return { title: card.verb, line: card.meaning, body: [card.meaning, card.contrast, ...(card.examples ?? [])] };
    case 'feeling':
      return { title: card.term, line: card.meaning, body: [card.meaning, card.contrast, card.example] };
    case 'swap':
      return {
        title: card.weak,
        line: `Say instead: ${(card.answers ?? []).slice(0, 2).join(' / ')}`,
        body: [...(card.answers ?? [])],
      };
    case 'phrase':
      return { title: card.strong, line: `Instead of "${card.weak}"`, body: [card.weak, card.why] };
    case 'story_move':
      return { title: card.move, line: card.why, body: [card.why, card.example] };
    default:
      return null;
  }
}

/** Index the English, active cards that teach something. Hindi, rejected and drill cards are left out. */
export function buildLibraryIndex(cards: readonly AnyCard[]): LibraryIndex {
  const rows: IndexRow[] = [];
  for (const card of cards) {
    if (card.status !== 'active' || card.lang === 'hi') continue;
    const d = describe(card);
    if (!d || !d.title.trim()) continue;
    rows.push({
      card,
      title: d.title,
      line: clip(d.line),
      titleLower: d.title.toLowerCase(),
      bodyLower: d.body.join(' ').toLowerCase(),
    });
  }
  return rows;
}

/**
 * Best matches for what he has typed so far. A headline match beats a match in
 * the body. A word that is only started ("ubiq") still finds "ubiquitous".
 */
export function searchLibrary(
  query: string,
  index: LibraryIndex,
  limit: number = DEFAULT_LIBRARY_LIMIT,
): LibraryHit[] {
  if (query.trim().length < MIN_QUERY_CHARS) return [];
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const whole = tokens.join(' ');

  const hits: LibraryHit[] = [];
  for (const row of index) {
    let score = 0;
    let matched = 0;
    if (row.titleLower === whole) score += 20;
    else if (row.titleLower.includes(whole) && whole.length >= 3) score += 8;
    for (const t of tokens) {
      const inTitle = new RegExp(`\\b${escapeRe(t)}`).test(row.titleLower);
      const inBody = !inTitle && new RegExp(`\\b${escapeRe(t)}`).test(row.bodyLower);
      if (inTitle) {
        score += 6;
        matched++;
      } else if (inBody) {
        score += 2;
        matched++;
      }
    }
    // Every meaningful word must land somewhere, or it is just noise.
    if (matched < tokens.length || score === 0) continue;
    hits.push({ card: row.card, title: row.title, line: row.line, score });
  }
  hits.sort((a, b) => b.score - a.score || a.title.length - b.title.length || a.title.localeCompare(b.title));
  return hits.slice(0, Math.max(0, limit));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
