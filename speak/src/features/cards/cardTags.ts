import type { CardLevel, ModuleLevel } from '../../types/contract';
import { THEMES } from '../../types/contract';

/**
 * v8 (2026-11-10): the two tags every module card carries — a topic label
 * (`theme`, called "topic" on screen) and a card level 1-3. AI cards stored
 * before v8 lack both, so every reader goes through these helpers.
 */

interface Tagged {
  theme?: string;
  level?: CardLevel;
}

/** The card's topic label; `'General'` when it has none. */
export function themeOf(card: Tagged): string {
  return typeof card.theme === 'string' && card.theme.trim() ? card.theme : 'General';
}

/** The card's level; 2 (the middle) when it has none. */
export function levelOf(card: Tagged): CardLevel {
  return isCardLevel(card.level) ? card.level : 2;
}

function isCardLevel(v: unknown): v is CardLevel {
  return v === 1 || v === 2 || v === 3;
}

/**
 * The lowest card level the Feed serves for a module level:
 * 1 → every card, 2 → levels 2 and 3, 3-5 → level 3 only.
 */
export function floorFor(level: ModuleLevel): CardLevel {
  return Math.min(3, level) as CardLevel;
}

/**
 * The module level after one "Know it" tap (answer 1 = A, Adarsh 2026-11-10):
 * one tap drops that card's level and every easier one at once. So the module
 * rises to at least one above the card (Know it on a level-2 Word → module 3 →
 * only level-3 Words). Never lowers, never above 5; a second tap on the same
 * level changes nothing.
 */
export function knowItLevel(current: ModuleLevel, card: CardLevel): ModuleLevel {
  return Math.min(5, Math.max(current, card + 1)) as ModuleLevel;
}

/**
 * What is wrong with a card's tags; empty = fine. The theme must be one of
 * THEMES or of `extraThemes` (topics added via the Ask box); the level must be
 * 1, 2 or 3.
 */
export function tagProblems(card: unknown, extraThemes: readonly string[] = []): string[] {
  if (!card || typeof card !== 'object') return ['not a card'];
  const { theme, level } = card as { theme?: unknown; level?: unknown };
  const problems: string[] = [];
  const allowed: readonly string[] = [...THEMES, ...extraThemes];
  if (typeof theme !== 'string' || !theme) problems.push('no theme');
  else if (!allowed.includes(theme)) problems.push(`unknown theme "${theme}"`);
  if (level === undefined) problems.push('no level');
  else if (!isCardLevel(level)) problems.push(`level must be 1, 2 or 3 (got ${String(level)})`);
  return problems;
}
