import { describe, expect, it } from 'vitest';
import outlineJson from '../library/outline.json';
import {
  LIBRARY_FILES,
  checkLibrary,
  checkLibraryFile,
  type LibraryKey,
  type OutlineItem,
} from '../../db/libraryCheck';

// v7 steps 4-6, pass 21 (final review): the whole launch library at once.
// Each lib-<key>.test.ts checks its own file; this one checks every file
// against every other (no id used twice, no head repeated inside a module
// across the 50-54 samples and the 60-77 library), and the 1,500 total.
const outline = outlineJson as unknown as Record<string, OutlineItem[]>;

const ALL_SEED = import.meta.glob<unknown[]>('./*.json', { eager: true, import: 'default' });
const byName = Object.fromEntries(
  Object.entries(ALL_SEED).map(([p, cards]) => [p.replace('./', ''), cards]),
) as Record<string, unknown[]>;
const fileOf = (name: string): unknown[] => byName[name] ?? [];

const SAMPLE_FILES = ['50-words.json', '51-small-talk.json', '52-say-it-better.json', '53-office-phrases.json', '54-stories.json'];
const V7_FILES = [...SAMPLE_FILES, ...Object.values(LIBRARY_FILES).map((f) => f.file)];

describe('library: every v7 file together', () => {
  it('has every library file on disk', () => {
    for (const f of V7_FILES) expect(byName[f], f).toBeDefined();
  });

  it('passes the cross-file check: no repeated id, no repeated head inside a module', () => {
    const files = Object.fromEntries(V7_FILES.map((f) => [f, fileOf(f)]));
    expect(checkLibrary(files)).toEqual([]);
  });

  it('passes every per-file check against the outline', () => {
    const problems = (Object.keys(LIBRARY_FILES) as LibraryKey[]).flatMap((key) =>
      checkLibraryFile(fileOf(LIBRARY_FILES[key].file), key, outline[key]),
    );
    expect(problems).toEqual([]);
  });

  it('adds up to 1,500 cards: Words 600, Small talk 250, Say it better 250, Office phrases 300, Stories 100', () => {
    const per: Record<string, number> = {};
    for (const f of V7_FILES) {
      for (const c of fileOf(f) as { module: string }[]) per[c.module] = (per[c.module] ?? 0) + 1;
    }
    expect(per).toEqual({ words: 600, smalltalk: 250, better: 250, phrases: 300, stories: 100 });
  });

  it('uses no card id twice across every seed file, old and new', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [file, cards] of Object.entries(byName)) {
      if (!Array.isArray(cards)) continue;
      for (const c of cards as { id?: string }[]) {
        if (!c.id) continue;
        const first = seen.get(c.id);
        if (first) dupes.push(`${c.id}: ${first} and ${file}`);
        else seen.set(c.id, file);
      }
    }
    expect(dupes).toEqual([]);
  });
});
