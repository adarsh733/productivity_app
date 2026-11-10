import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from './54-stories.json';
import { checkModuleSeedFile } from '../../db/moduleSeedCheck';
import { tagProblems } from '../../features/cards/cardTags';

describe('v7 stories seed', () => {
  it('passes the shared shape, ID and slide-length checks', () => {
    expect(checkModuleSeedFile(cards, 'stories')).toEqual([]);
    expect(cards.every((card) => card.lang === 'en')).toBe(true);
  });

  it('offers distinct everyday stories with and without an optional turn', () => {
    expect(new Set(cards.map((card) => card.report)).size).toBe(20);
    expect(new Set(cards.map((card) => card.story)).size).toBe(20);
    expect(cards.some((card) => card.yourTurn)).toBe(true);
    expect(cards.some((card) => !card.yourTurn)).toBe(true);
    expect(cards.every((card) => !card.trick.includes('\n'))).toBe(true);
  });

  it('preserves every teaching line of the plan airport sample, including highlighting', () => {
    const sample = cards[0]!;
    expect(sample).toMatchObject({
      id: 'v7-stories-01',
      report: 'I went to the airport, the flight was delayed, and I reached late.',
      story: "I had one job: reach Delhi by six for my cousin's sangeet. At the gate, the screen flashed: **Delayed, 4 hours.**",
      trick: 'start with what you wanted, then what got in the way',
      yourTurn: {
        prompt: "Tell today's commute in two lines.",
        hint: 'Line 1: what you wanted. Line 2: what got in the way.',
      },
    });
    const plan = readFileSync(resolve(__dirname, '../../../../docs/REDESIGN-V7.html'), 'utf8');
    const sampleHtml = plan.slice(plan.indexOf('  story:['), plan.indexOf('\n};', plan.indexOf('  story:[')));
    for (const text of [sample.report, sample.story, sample.trick, sample.yourTurn!.prompt, sample.yourTurn!.hint]) {
      expect(sampleHtml).toContain(text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
    }
  });

  it('gives every card a topic from the fixed list and a level of 1, 2 or 3 (v8)', () => {
    const problems = (cards as unknown[]).flatMap((c) => tagProblems(c).map((p) => `${(c as { id: string }).id}: ${p}`));
    expect(problems).toEqual([]);
  });
});
