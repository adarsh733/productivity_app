import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULEBOOK, RULEBOOK_PARTS, rulebookFor, type RulebookTask } from '../rulebook';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', '..', 'scripts', 'build-rulebook.mjs');
const SOURCE = join(here, '..', '..', '..', 'docs', 'AI-RULEBOOK.md');

const TASKS = Object.keys(RULEBOOK_PARTS) as RulebookTask[];

/** Groq's free tier reads 8,000 tokens a minute. ~3.9 characters a token, and room for the answer. */
const MAX_SLICE_CHARS = 18_000;

describe('rulebook.ts is the rulebook, sliced per job', () => {
  it('is in step with docs/AI-RULEBOOK.md (build-rulebook --check exits 0)', () => {
    expect(() => execFileSync(process.execPath, [SCRIPT, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('carries the whole rulebook word for word', () => {
    const md = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
    expect(RULEBOOK).toBe(md);
  });

  it('has a slice for exactly the four server jobs', () => {
    expect([...TASKS].sort()).toEqual(['expand_seed', 'plan_week', 'tell_app', 'verify_batch']);
  });

  it('the jobs removed on 2026-11-10 have no slice any more', () => {
    for (const gone of ['answer_ask', 'coach_chat', 'review_recording', 'classify_inbox']) {
      expect(Object.keys(RULEBOOK_PARTS)).not.toContain(gone);
    }
  });

  it.each(TASKS)('%s: a real slice, smaller than the whole book and under the Groq-sized cap', (task) => {
    const part = rulebookFor(task);
    expect(part).toBe(RULEBOOK_PARTS[task]);
    expect(part.length).toBeGreaterThan(1000);
    expect(part.length).toBeLessThan(RULEBOOK.length);
    expect(part.length).toBeLessThanOrEqual(MAX_SLICE_CHARS);
    expect(part).not.toContain('**Gold card');
  });

  // Each job carries the chapters it needs, and not the ones it does not.
  const MUST_CARRY: Record<RulebookTask, string[]> = {
    expand_seed: [
      '## 0. Purpose',
      '## 1. Universal card rules',
      '### 2.4 STORIES',
      '### 3.3 Dedupe',
      '## 9. v7 module cards (Adarsh, 2026-11-08)',
      '### 9.1 The five shapes',
      '### 9.2 Rules on every module card',
      '### 9.3 How his feedback steers a batch',
    ],
    verify_batch: [
      'R1 INVENTED',
      'R17 MEANING',
      '### 2.3 SMALL TALK',
      '### 7.2 Never state as fact',
      '## 9. v7 module cards (Adarsh, 2026-11-08)',
      '### 9.2 Rules on every module card',
    ],
    plan_week: ['### 3.1 How much is new', '### 3.4 Steering by his asks and weak spots'],
    // v8 Ask box (2026-11-10): who he is, how feedback steers a batch, and chapter 10.
    tell_app: [
      '## 0. Purpose',
      '### 9.3 How his feedback steers a batch',
      '## 10. The Ask box (Adarsh, 2026-11-10)',
      '### 10.1 What it is for',
      '### 10.2 The reply',
      '### 10.3 What you may learn',
    ],
  };
  const MUST_NOT_CARRY: Partial<Record<RulebookTask, string[]>> = {
    expand_seed: ['## 6. Verification rules', '## 5. Voice practice chat'],
    // 9.1 and 9.3 are left out of the checker to stay under the Groq cap; its job lines name the shapes.
    verify_batch: ['## 5. Voice practice chat', '### 1.7 Fitting the app', '### 9.1 The five shapes', '### 9.3 How his feedback'],
    plan_week: ['## 6. Verification rules', '## 5. Voice practice chat'],
    tell_app: ['## 6. Verification rules', '## 5. Voice practice chat', '### 9.1 The five shapes', '### 1.2 Anatomy'],
  };
  // Only the Ask box needs chapter 10.
  for (const task of ['expand_seed', 'verify_batch', 'plan_week'] as const) {
    (MUST_NOT_CARRY[task] ??= []).push('## 10. The Ask box');
  }

  it.each(TASKS)('%s: carries the chapters this job needs', (task) => {
    for (const marker of MUST_CARRY[task]) {
      expect(rulebookFor(task), `${task} should contain "${marker}"`).toContain(marker);
    }
  });

  it.each(TASKS)('%s: leaves out the chapters it does not need', (task) => {
    for (const marker of MUST_NOT_CARRY[task] ?? []) {
      expect(rulebookFor(task), `${task} should not contain "${marker}"`).not.toContain(marker);
    }
  });

  it('the checker slice holds all seventeen reject codes', () => {
    const part = rulebookFor('verify_batch');
    for (let n = 1; n <= 17; n++) expect(part).toMatch(new RegExp(`\\| R${n} [A-Z-]+ \\|`));
  });

  it('9.3 holds the fixed level map and the v8 topic labels (2026-11-10)', () => {
    const at93 = RULEBOOK.indexOf('### 9.3 How his feedback steers a batch');
    const ch93 = RULEBOOK.slice(at93, RULEBOOK.indexOf('## 10.', at93));
    expect(ch93).toContain('batch level 1 → 1, 2 → 2, 3 → 3, 4-5 → 3 and harder than the library\'s level 3');
    expect(ch93).not.toContain('1-2 → 1');
    for (const s of ['`themes`', '`likedThemes`', '`wishes`', '"General" when none fits']) expect(ch93).toContain(s);
  });

  it('chapter 10 (the Ask box) comes after chapter 9: feedback and wishes only, short replies, no Hindi', () => {
    const at9 = RULEBOOK.indexOf('## 9. v7 module cards (Adarsh, 2026-11-08)');
    const at10 = RULEBOOK.indexOf('## 10. The Ask box (Adarsh, 2026-11-10)');
    expect(at10).toBeGreaterThan(at9);
    const ch10 = RULEBOOK.slice(at10);
    for (const rule of ['feedback and wishes only', 'at most 240 characters', 'No Hindi', 'At most 4 items', '"kind":"new_theme"', '"kind":"level"']) {
      expect(ch10).toContain(rule);
    }
  });

  it('chapter 9 (v7 module cards) comes after the frozen chapter 8 and carries the module rules', () => {
    const at8 = RULEBOOK.indexOf('## 8. Frozen additions (Adarsh, 2026-10-29)');
    const at9 = RULEBOOK.indexOf('## 9. v7 module cards (Adarsh, 2026-11-08)');
    expect(at8).toBeGreaterThan(0);
    expect(at9).toBeGreaterThan(at8);
    const ch9 = RULEBOOK.slice(at9);
    for (const rule of ['40 words on a slide', '✗ wrong-use line', 'No Hindi on screen', 'no analogy', 'Never repeat a head']) {
      expect(ch9).toContain(rule);
    }
    for (const shape of ['**Words**', '**Small talk**', '**Say it better**', '**Office phrases**', '**Stories**']) {
      expect(ch9).toContain(shape);
    }
  });
});
