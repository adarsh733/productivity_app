import plan from '../../../../docs/REDESIGN-V7.html?raw';
import { describe, expect, it } from 'vitest';
import cards from './53-office-phrases.json';
import { checkModuleSeedFile } from '../../db/moduleSeedCheck';

describe('v7 Office phrases seed', () => {
  it('passes the shared shape, sequence, uniqueness and slide checks', () => {
    expect(checkModuleSeedFile(cards, 'phrases')).toEqual([]);
  });

  it('preserves every existing teaching line of the plan sample word for word', () => {
    const sample = plan.split('  phrase:[')[1]!.split('  story:')[0]!
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    const card = cards[0]!;
    expect(card.phrase).toBe("Let's take this offline.");
    expect(card.group).toBe('meetings');
    for (const text of [card.phrase, card.meaning, card.useWhen, card.example,
      card.tone, card.careful, ...card.similar]) {
      expect(sample).toContain(text.replace(/\*\*/g, ''));
    }
    // The approved brief adds this line; the original plan sample has none.
    expect(card.wrong).toEqual({ label: '✗ Not about internet access', text: "The Wi-Fi stopped. Let's take this offline." });
  });

  it('covers all six groups and marks wrong uses explicitly', () => {
    expect(cards.map(c => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `v7-phrases-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(cards.map(c => c.group)))
      .toEqual(new Set(['meetings', 'email', 'pushback', 'praise', 'deadlines', 'idioms']));
    for (const card of cards) {
      expect(card.lang).toBe('en');
      expect(card.wrong.label.startsWith('✗')).toBe(true);
      expect(card.wrong.text.trim().length).toBeGreaterThan(0);
      expect(card.similar).toHaveLength(2);
    }
    expect(new Set(cards.map(c => c.level)).size).toBeGreaterThanOrEqual(2);
  });
});
