import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import type { TellAppResult } from '../../types/contract';
import {
  ADDED_THEMES_MAX,
  ASK_TURNS_MAX,
  addedThemes,
  askLearnedLines,
  askTurns,
  askWishes,
  removeAskLearned,
  saveAskTurn,
  themeBoosts,
} from './askLearned';

const T0 = 1_762_700_000_000;

async function wordsLevel() {
  return (await db.profile.get('me'))?.moduleLevels?.words;
}

beforeEach(async () => {
  await Promise.all([db.meta.clear(), db.profile.clear(), db.outbox.clear()]);
});

describe('saveAskTurn', () => {
  it('stores the turn with its reply and learned lines', async () => {
    const result: TellAppResult = {
      reply: 'Got it. More money cards coming.',
      learned: [{ kind: 'more', theme: 'Money' }, { kind: 'wish', note: 'Cards for client calls' }],
    };
    const turn = await saveAskTurn('more about money please', result, T0);
    expect(turn.said).toBe('more about money please');
    expect(turn.learned.map((l) => l.kind)).toEqual(['more', 'wish']);
    const turns = await askTurns();
    expect(turns).toHaveLength(1);
    expect(turns[0]!.reply).toBe('Got it. More money cards coming.');
    const lines = await askLearnedLines();
    expect(lines.map((l) => l.text)).toEqual(['More cards about Money.', 'Cards for client calls']);
    expect(lines.every((l) => l.id.startsWith('ask-'))).toBe(true);
  });

  it('drops bad items and keeps at most 4', async () => {
    const learned = [
      { kind: 'more', theme: '' },
      { kind: 'level', module: 'cooking', delta: 1 },
      { kind: 'level', module: 'words', delta: 2 },
      { kind: 'shout', theme: 'Money' },
      { kind: 'more', theme: 'Food' },
    ] as unknown as TellAppResult['learned'];
    const turn = await saveAskTurn('x', { reply: 'ok', learned }, T0);
    expect(turn.learned).toEqual([]);
    expect(await askLearnedLines()).toEqual([]);
  });

  it('the thread keeps the last 10 messages, oldest first', async () => {
    for (let i = 0; i < 12; i++) await saveAskTurn(`m${i}`, { reply: 'ok', learned: [] }, T0 + i);
    const turns = await askTurns();
    expect(turns).toHaveLength(ASK_TURNS_MAX);
    expect(turns[0]!.said).toBe('m2');
    expect(turns.at(-1)!.said).toBe('m11');
    expect((await askTurns(3)).map((t) => t.said)).toEqual(['m9', 'm10', 'm11']);
  });
});

describe('level items', () => {
  it('a level item moves the module at once and Remove moves it back', async () => {
    expect(await wordsLevel()).toBeUndefined(); // start level 2
    const turn = await saveAskTurn('words are too easy', {
      reply: 'Words gets harder now.',
      learned: [{ kind: 'level', module: 'words', delta: 1 }],
    }, T0);
    expect(await wordsLevel()).toBe(3);
    const [line] = await askLearnedLines();
    expect(line!.text).toBe('Words: harder cards.');
    await removeAskLearned(turn.learned[0]!.id);
    expect(await wordsLevel()).toBe(2);
    expect(await askLearnedLines()).toEqual([]);
    // the thread shows it removed, and a second Remove does nothing
    expect((await askTurns())[0]!.learned[0]!.removed).toBe(true);
    await removeAskLearned(turn.learned[0]!.id);
    expect(await wordsLevel()).toBe(2);
  });

  it('an easier item moves down and its Remove moves back up', async () => {
    const turn = await saveAskTurn('stories too hard', {
      reply: 'Easier stories now.',
      learned: [{ kind: 'level', module: 'stories', delta: -1 }],
    }, T0);
    expect((await db.profile.get('me'))?.moduleLevels?.stories).toBe(1);
    await removeAskLearned(turn.learned[0]!.id);
    expect((await db.profile.get('me'))?.moduleLevels?.stories).toBe(2);
  });
});

describe('what steers the feed and the next batch', () => {
  it('boosts: more = 2, fewer = 0.5, newest wins, removed ones gone', async () => {
    await saveAskTurn('a', { reply: 'ok', learned: [{ kind: 'fewer', theme: 'Money' }, { kind: 'more', theme: 'Food' }] }, T0);
    expect(await themeBoosts()).toEqual({ Money: 0.5, Food: 2 });
    const t2 = await saveAskTurn('b', { reply: 'ok', learned: [{ kind: 'more', theme: 'Money' }] }, T0 + 1);
    expect(await themeBoosts()).toEqual({ Money: 2, Food: 2 });
    await removeAskLearned(t2.learned[0]!.id);
    expect(await themeBoosts()).toEqual({ Money: 0.5, Food: 2 });
  });

  it('added themes: newest first, no repeats, max 10', async () => {
    for (let i = 0; i < 12; i++) {
      await saveAskTurn(`t${i}`, { reply: 'ok', learned: [{ kind: 'new_theme', theme: `Topic ${i}` }] }, T0 + i);
    }
    await saveAskTurn('again', { reply: 'ok', learned: [{ kind: 'new_theme', theme: 'topic 11' }] }, T0 + 20);
    const themes = await addedThemes();
    expect(themes).toHaveLength(ADDED_THEMES_MAX);
    expect(themes[0]).toBe('topic 11');
    expect(themes[1]).toBe('Topic 10');
    expect(themes).not.toContain('Topic 11');
  });

  it('wishes: newest first, capped', async () => {
    for (let i = 0; i < 8; i++) {
      await saveAskTurn(`w${i}`, { reply: 'ok', learned: [{ kind: 'wish', note: `wish ${i}` }] }, T0 + i);
    }
    expect(await askWishes()).toEqual(['wish 7', 'wish 6', 'wish 5', 'wish 4', 'wish 3', 'wish 2']);
    expect(await askWishes(2)).toEqual(['wish 7', 'wish 6']);
  });

  it('Me lines come newest first across turns', async () => {
    await saveAskTurn('a', { reply: 'ok', learned: [{ kind: 'more', theme: 'Travel' }] }, T0);
    await saveAskTurn('b', { reply: 'ok', learned: [{ kind: 'new_theme', theme: 'Cricket' }] }, T0 + 1);
    expect((await askLearnedLines()).map((l) => l.text)).toEqual(['New topic: Cricket.', 'More cards about Travel.']);
  });
});
