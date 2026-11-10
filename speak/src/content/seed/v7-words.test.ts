import plan from '../../../../docs/REDESIGN-V7.html?raw';
import { describe, expect, it } from 'vitest';
import cards from './50-words.json';
import { tagProblems } from '../../features/cards/cardTags';
import { checkModuleSeedFile } from '../../db/moduleSeedCheck';

describe('v7 Words seed', () => {
  it('passes the shared shape, sequence, uniqueness, highlight and slide checks', () => {
    expect(checkModuleSeedFile(cards, 'words')).toEqual([]);
  });

  it('preserves every teaching line of the plan sample word for word', () => {
    const sample = plan.split('const CARDS = {')[1]!.split('  talk:')[0]!
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    const card = cards[0]!;
    expect(card.word).toBe('deafening');
    expect(card.pos).toBe('adjective');
    for (const text of [card.word, card.pos, card.say, card.meaning, card.rule,
      ...card.examples.flatMap(l => [l.label, l.text]), card.right.label, card.right.text,
      ...card.wrong.flatMap(l => [l.label, l.text]), card.check!.question,
      ...card.check!.options.map(o => o.text)]) {
      expect(sample).toContain(text.replace(/\*\*/g, ''));
    }
    expect(card.check!.options.map(o => o.right)).toEqual([false, true, false]);
  });

  it('keeps the English deck varied, with visible wrong-use labels and scheduled checks', () => {
    expect(cards.map(c => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `v7-words-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(cards.map(c => c.level)).size).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(card.lang).toBe('en');
      expect(card.wrong.every(l => l.label.startsWith('✗'))).toBe(true);
      if (card.check) {
        expect(card.check.options).toHaveLength(3);
        expect(card.check.options.filter(o => o.right)).toHaveLength(1);
      }
    }
    expect(cards.flatMap((c, i) => c.check ? [i + 1] : [])).toEqual([1, 3, 6, 9, 12, 15, 18]);
    expect(new Set(cards.flatMap(c => c.examples.map(l => l.icon))))
      .toEqual(new Set(['home', 'friends', 'thinking']));
  });

  it('gives every card a topic from the fixed list and a level 1-3', () => {
    expect(cards.flatMap((c) => tagProblems(c))).toEqual([]);
  });
});
