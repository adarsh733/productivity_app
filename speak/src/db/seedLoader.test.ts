import { describe, expect, it } from 'vitest';
import { readSeedFiles, retiredIds } from './seedLoader';
import type { BreathCard } from '../types/contract';

const { cards, report } = readSeedFiles();
const breath = cards.filter((c): c is BreathCard => c.type === 'breath');

describe('the seed deck', () => {
  it('loads with nothing skipped', () => {
    // A duplicate id is silently dropped, and which copy survives depends on
    // filename order — that is how a rewritten card can be replaced by an old
    // one from the exemplar file without anything appearing to go wrong.
    expect(report.skipped).toEqual([]);
    expect(cards.length).toBeGreaterThan(300);
  });

  it('has no duplicate ids across files', () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the breath deck, corrected against the measurements', () => {
  it('has exactly one drill that logs seconds', () => {
    // `useFeed` writes every `seconds` measure into `DayRecord.bestMptSec`, so
    // a second seconds-drill at a different volume would quietly redefine the
    // headline metric — a soft hold is longer by nature and would inflate it.
    const timed = breath.filter((c) => c.logUnit === 'seconds');
    expect(timed.map((c) => c.id)).toEqual(['br-mpt-open']);
  });

  it('measures the habitual volume, not a comfortable one', () => {
    const mpt = breath.find((c) => c.id === 'br-mpt-open')!;
    expect(mpt.instructions.join(' ')).toMatch(/normal speaking volume/i);
  });

  it('retired every capacity drill', () => {
    // Count on one breath is 28 and s/z is 0.72 — both normal. Capacity was
    // ruled out by measurement, so a drill training it trains nothing.
    for (const c of breath) {
      expect(c.tags, c.id).not.toContain('capacity');
    }
    for (const id of ['br-ladder-back', 'br-phrase-hold', 'br-stairs', 'br-ladder']) {
      expect(breath.map((c) => c.id)).not.toContain(id);
    }
  });

  it('ends every drill with a transfer rep', () => {
    // PLAN.md §1: straw-then-speak, hum-then-speak. Without it, straw work is
    // a pleasant ritual that changes nothing.
    for (const c of breath) {
      if (c.logUnit === 'seconds') continue; // the measurement, not a drill
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
