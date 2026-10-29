import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import type { ChatTurn } from '../../types/contract';
import {
  MIN_MOMENT_WORDS,
  pickBestMoment,
  readStoryBank,
  saveBestMoment,
  saveMoment,
  storyBankId,
} from './storyBank';

const long = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const turn = (transcript: string): ChatTurn => ({ question: 'q', transcript });

describe('pickBestMoment', () => {
  it('returns null when no answer is long enough to keep', () => {
    expect(pickBestMoment([turn('fine'), turn(long(MIN_MOMENT_WORDS - 1))])).toBeNull();
    expect(pickBestMoment([])).toBeNull();
  });

  it('picks the longest real answer', () => {
    const best = pickBestMoment([turn(long(14)), turn(long(60, 'long')), turn(long(30))]);
    expect(best?.turnIndex).toBe(1);
  });

  it('gives the "one moment" question (first) a head start', () => {
    const best = pickBestMoment([turn(long(30, 'moment')), turn(long(40, 'other'))]);
    expect(best?.turnIndex).toBe(0);
  });

  it('keeps his words, tidied for spaces, and caps the length', () => {
    const best = pickBestMoment([turn(`  ${long(200, 'abcdef')}  `)]);
    expect(best?.text.length).toBeLessThanOrEqual(600);
    expect(best?.text.startsWith('abcdef abcdef')).toBe(true);
  });
});

describe('saving to the story bank', () => {
  beforeEach(async () => {
    await db.storyBank.clear();
  });

  it('stores one entry per day', async () => {
    const entry = await saveMoment('2026-10-29', long(20), 1000);
    expect(entry?.id).toBe(storyBankId('2026-10-29'));
    expect(await db.storyBank.count()).toBe(1);
  });

  it('keeps the longer one when the same day is saved twice', async () => {
    await saveMoment('2026-10-29', long(30, 'first'), 1000);
    const kept = await saveMoment('2026-10-29', long(15, 'shorter'), 2000);
    expect(kept?.text.startsWith('first')).toBe(true);
    const replaced = await saveMoment('2026-10-29', long(50, 'second'), 3000);
    expect(replaced?.text.startsWith('second')).toBe(true);
    expect(await db.storyBank.count()).toBe(1);
  });

  it('does not store a too-short moment', async () => {
    expect(await saveMoment('2026-10-29', 'ok good', 1000)).toBeNull();
    expect(await db.storyBank.count()).toBe(0);
  });

  it('saveBestMoment stores the best turn of a chat and returns it newest first', async () => {
    await saveMoment('2026-10-28', long(20, 'older'), 1);
    const saved = await saveBestMoment('2026-10-29', [turn('hi'), turn(long(25, 'today'))], 2);
    expect(saved?.text.startsWith('today')).toBe(true);
    const all = await readStoryBank();
    expect(all.map((e) => e.day)).toEqual(['2026-10-29', '2026-10-28']);
  });

  it('saveBestMoment is quiet when nothing is worth keeping', async () => {
    expect(await saveBestMoment('2026-10-29', [turn('nope')], 1)).toBeNull();
  });
});
