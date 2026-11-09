import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from './51-small-talk.json';
import { checkModuleSeedFile } from '../../db/moduleSeedCheck';

describe('v7 small talk seed', () => {
  it('passes the shared shape, ID and slide-length checks', () => {
    expect(checkModuleSeedFile(cards, 'smalltalk')).toEqual([]);
    expect(cards.every((card) => card.lang === 'en')).toBe(true);
  });

  it('covers each of the five kinds with four different moments', () => {
    for (const kind of ['reply', 'open', 'keep_going', 'exit', 'save_it']) {
      expect(cards.filter((card) => card.kind === kind)).toHaveLength(4);
    }
    expect(new Set(cards.map((card) => card.moment)).size).toBe(20);
  });

  it('preserves every teaching line of the plan sample, including highlighting', () => {
    const sample = cards[0]!;
    expect(sample).toMatchObject({
      id: 'v7-talk-01', kind: 'reply',
      they: 'How was your weekend?',
      deadEnd: 'Good.',
      reply: 'Lazy, in a good way. Finally watched **Kantara**. Did you do anything fun?',
      formula: 'feeling + one detail + ask back',
      more: [
        { label: 'Busy weekend', text: "Packed! My nephew's birthday, twenty kids. How was yours?" },
        { label: 'Quiet weekend', text: 'Very quiet. I just recharged, and I needed it. You?' },
        { label: 'Bad weekend', text: 'A bit rough, I had a cold. Better now. Yours?' },
      ],
      donts: ['Stop at one word. It ends the chat.', 'List everything you did, hour by hour.', 'Complain for more than one line.'],
    });
    const plan = readFileSync(resolve(__dirname, '../../../../docs/REDESIGN-V7.html'), 'utf8');
    const sampleHtml = plan.slice(plan.indexOf('  talk:['), plan.indexOf('  clear:['));
    for (const text of [sample.they!, sample.deadEnd, sample.reply, sample.formula,
      ...sample.more.flatMap((item) => [item.label, item.text]), ...sample.donts]) {
      expect(sampleHtml).toContain(text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
    }
  });
});
