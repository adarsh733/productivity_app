import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from './52-say-it-better.json';
import { checkModuleSeedFile } from '../../db/moduleSeedCheck';
import { tagProblems } from '../../features/cards/cardTags';

describe('v7 say it better seed', () => {
  it('passes the shared shape, unique situation and slide-length checks', () => {
    expect(checkModuleSeedFile(cards, 'better')).toEqual([]);
    expect(cards.every((card) => card.lang === 'en')).toBe(true);
  });

  it('includes at least five thinking pairs and teaches each requested Indian-English fix once', () => {
    expect(cards.filter((card) => card.thinking).length).toBeGreaterThanOrEqual(5);
    for (const phrase of ['revert', 'do the needful', 'prepone']) {
      expect(cards.filter((card) => card.mightSay.includes(phrase))).toHaveLength(1);
      expect(cards.some((card) => card.better.includes(phrase))).toBe(false);
    }
  });

  it('preserves every teaching line and chip from the plan delay sample', () => {
    const sample = cards[0]!;
    expect(sample).toMatchObject({
      id: 'v7-better-01', situation: 'Explaining a delay', thinking: false,
      mightSay: 'Actually what happened is, the server was down, so because of that we could not do the release yesterday.',
      better: "Yesterday's release slipped because the server went down.",
      changes: ['point first', 'cut "actually what happened is"', '19 words → 8'],
      next: {
        title: 'Even better',
        lines: [{ label: 'Add the next step', text: "Yesterday's release slipped because the server went down. We'll ship it today by 4." }],
        note: 'Answer their next question before they ask it.',
      },
    });
    const plan = readFileSync(resolve(__dirname, '../../../../docs/REDESIGN-V7.html'), 'utf8');
    const sampleHtml = plan.slice(plan.indexOf('  clear:['), plan.indexOf('  think:['));
    for (const text of [sample.situation, sample.mightSay, sample.better, ...sample.changes,
      sample.next.title, sample.next.lines[0]!.label, sample.next.lines[0]!.text, sample.next.note]) {
      expect(sampleHtml).toContain(text);
    }
  });
  it('gives every card a topic from the fixed list and a level of 1, 2 or 3', () => {
    const bad = cards.flatMap((card) => tagProblems(card).map((p) => `${card.id}: ${p}`));
    expect(bad).toEqual([]);
  });
});
