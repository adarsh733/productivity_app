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

  it('has a slice for every job, including the Ask and chat jobs that arrive later', () => {
    expect([...TASKS].sort()).toEqual(
      [
        'answer_ask',
        'classify_inbox',
        'coach_chat',
        'expand_seed',
        'plan_week',
        'review_recording',
        'verify_batch',
      ].sort(),
    );
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
    expand_seed: ['## 0. Purpose', '## 1. Universal card rules', '### 2.4 STORIES', '### 3.3 Dedupe'],
    classify_inbox: ['## 1. Universal card rules', '### 2.1 WORDS', '### 4.1 Classify first'],
    verify_batch: ['R1 INVENTED', 'R17 MEANING', '### 2.3 SMALL TALK', '### 7.2 Never state as fact'],
    review_recording: ['## 5. Voice practice chat', 'Never quote words not in the transcript', '### 1.4 Indian English'],
    plan_week: ['### 3.1 How much is new', '### 3.4 Steering by his asks and weak spots'],
    answer_ask: ['## 4. Answering "Ask" questions', '### 4.3 When to add to weak spots', 'Everything he asks comes back'],
    coach_chat: ['### 5.4 Shape: at most 3 points', '### 5.3 What you can and cannot judge', 'The four tracks are woven together'],
  };
  const MUST_NOT_CARRY: Partial<Record<RulebookTask, string[]>> = {
    expand_seed: ['## 6. Verification rules', '## 5. Voice practice chat'],
    classify_inbox: ['## 6. Verification rules', '## 5. Voice practice chat'],
    verify_batch: ['## 5. Voice practice chat', '### 1.7 Fitting the app'],
    review_recording: ['## 6. Verification rules', '### 2.1 WORDS'],
    plan_week: ['## 6. Verification rules', '## 5. Voice practice chat'],
    answer_ask: ['## 6. Verification rules', '## 5. Voice practice chat'],
  };

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
});
