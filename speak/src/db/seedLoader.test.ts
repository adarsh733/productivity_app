import { describe, expect, it } from 'vitest';
import { readSeedFiles, retiredIds } from './seedLoader';
import type { BreathCard, CardType } from '../types/contract';

const { cards, report } = readSeedFiles();
const breath = cards.filter((c): c is BreathCard => c.type === 'breath');

describe('the seed deck', () => {
  it('loads with nothing skipped', () => {
    expect(report.skipped).toEqual([]);
    expect(cards.length).toBeGreaterThan(200);
  });

  it('has no duplicate ids across files', () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains valid cards for all 13 card contract types', () => {
    const types: CardType[] = [
      'word',
      'swap',
      'idiom',
      'action_verb',
      'pronounce',
      'say_it',
      'breath',
      'phrase',
      'feeling',
      'story_move',
      'describe',
      'explain',
      'teach_back',
    ];

    for (const t of types) {
      const matching = cards.filter((c) => c.type === t);
      expect(matching.length, `Expected seed cards for type: ${t}`).toBeGreaterThan(0);
    }
  });

  it('every card has an active status, seed source, and non-empty ID', () => {
    for (const c of cards) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.status).toBe('active');
      expect(c.source).toBe('seed');
      expect(Array.isArray(c.tags)).toBe(true);
    }
  });
});

describe('the breath deck, corrected against the measurements', () => {
  it('has exactly one drill that logs seconds', () => {
    const timed = breath.filter((c) => c.logUnit === 'seconds');
    expect(timed.map((c) => c.id)).toEqual(['br-mpt-open']);
  });

  it('measures the habitual volume, not a comfortable one', () => {
    const mpt = breath.find((c) => c.id === 'br-mpt-open')!;
    expect(mpt.instructions.join(' ')).toMatch(/normal speaking volume/i);
  });

  it('retired every capacity drill', () => {
    for (const c of breath) {
      expect(c.tags, c.id).not.toContain('capacity');
    }
    for (const id of ['br-ladder-back', 'br-phrase-hold', 'br-stairs', 'br-ladder']) {
      expect(breath.map((c) => c.id)).not.toContain(id);
    }
  });

  it('ends every drill with a transfer rep', () => {
    for (const c of breath) {
      if (c.logUnit === 'seconds') continue;
      expect(
        c.instructions.some((i) => i.startsWith('TRANSFER:')),
        `${c.id} has no transfer rep`,
      ).toBe(true);
    }
  });

  it('keeps a majority of the deck on semi-occluded work', () => {
    const sovt = breath.filter((c) => c.tags.includes('sovt'));
    expect(sovt.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps every instruction short enough to read mid-drill', () => {
    for (const c of breath) {
      expect(c.instructions.length, `${c.id} step count`).toBeLessThanOrEqual(4);
      for (const line of c.instructions) {
        expect(line.length, `${c.id}: ${line}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it('still supplies enough breath cards for the Core 3 to have one every day', () => {
    expect(breath.length).toBeGreaterThanOrEqual(7);
  });
});

describe('retiredIds', () => {
  it('names the cards on the device that the files no longer author', () => {
    expect(retiredIds(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b']);
  });

  it('is empty when the device matches the files', () => {
    expect(retiredIds(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });

  it('does not retire a card the device has never seen', () => {
    expect(retiredIds([], new Set(['a']))).toEqual([]);
  });
});
