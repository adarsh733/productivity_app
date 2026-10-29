#!/usr/bin/env node
/**
 * Builds `netlify/rulebook.ts` from `../docs/AI-RULEBOOK.md`.
 *
 *   node speak/scripts/build-rulebook.mjs          write netlify/rulebook.ts
 *   node speak/scripts/build-rulebook.mjs --check  exit 1 when the file on disk
 *                                                  differs from what the .md produces
 *
 * Why a generated file: the Netlify function cannot read ../docs at run time,
 * so the rulebook is copied into a TypeScript module. It lives in `netlify/`
 * (NOT `netlify/functions/`) so Netlify never deploys it as a function.
 *
 * Why slices (Adarsh's answer 2A): the whole rulebook is ~9k tokens, more than
 * Groq's free 8,000 tokens a minute, and Groq is the usual checker. So each AI
 * job gets only the chapters it needs. The job -> chapters table is `SLICES`
 * below; `rulebookFor(task)` returns the slice.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', '..', 'docs', 'AI-RULEBOOK.md');
const TARGET = join(here, '..', 'netlify', 'rulebook.ts');

/**
 * Which chapters each job receives.
 *   include  section ids: 'intro' (title block), 'N' (a whole chapter), 'N.M' (one sub-chapter)
 *   exclude  sub-chapter ids dropped from an included chapter
 *   gold     keep the "Gold card" worked examples (they are large, so off by default)
 */
const SLICES = {
  // Writing cards: who he is, universal rules, the four tracks, dedupe + steering.
  expand_seed: { include: ['intro', '0', '1', '2', '3.3', '3.4', '8.3'], exclude: [], gold: false },
  // Sorting a one-line thought: the same, plus how Ask questions are classified.
  classify_inbox: { include: ['intro', '0', '1', '2', '3.3', '3.4', '4.1'], exclude: [], gold: false },
  // The second model: everything it judges against, and the reject codes.
  verify_batch: { include: ['intro', '0', '1', '2', '6', '7.2'], exclude: ['1.7'], gold: false },
  // Voice feedback on a recording.
  review_recording: { include: ['intro', '0', '1.3', '1.4', '5'], exclude: [], gold: false },
  // Weekly plan: who he is and how new items are paced.
  plan_week: { include: ['intro', '0', '3.1', '3.4'], exclude: [], gold: false },
  // Ask (added in step 3): classify, answer shape, cards, "everything comes back".
  // 8.3 (learning from him) is left out to stay under the Groq cap; its rule rides in DATA_RULE in ai.ts.
  answer_ask: { include: ['intro', '0', '1', '2', '4', '8'], exclude: ['1.7', '8.3'], gold: false },
  // Evening chat coach (added in step 5): feedback rules and what it may judge.
  coach_chat: { include: ['intro', '0', '1.3', '1.4', '5', '8'], exclude: [], gold: false },
};

const HEADER = 'SPEAK AI RULEBOOK. These are the parts of it that apply to this job. Section numbers match the full rulebook.';

/** Split the markdown into { intro, chapters: { '1': { head, subs: [{id, text}] } } }. */
function parse(md) {
  const lines = md.split('\n');
  const intro = [];
  const chapters = new Map();
  let chapter = null;
  let target = intro;
  let sub = null;
  for (const line of lines) {
    const h2 = /^## (\d+)\./.exec(line);
    const h3 = /^### (\d+\.\d+)/.exec(line);
    if (h2) {
      chapter = { head: [line], subs: [] };
      chapters.set(h2[1], chapter);
      target = chapter.head;
      sub = null;
    } else if (h3 && chapter) {
      sub = { id: h3[1], lines: [line] };
      chapter.subs.push(sub);
      target = sub.lines;
    } else {
      target.push(line);
    }
  }
  return { intro: intro.join('\n'), chapters };
}

function chapterText(chapter, exclude) {
  const parts = [chapter.head.join('\n')];
  for (const s of chapter.subs) {
    if (!exclude.includes(s.id)) parts.push(s.lines.join('\n'));
  }
  return parts.join('\n');
}

function stripGold(text) {
  return text.replace(/\*\*Gold card \d+\*\*\n```[\s\S]*?```\n?/g, '');
}

function tidy(text) {
  return (
    text
      .split('\n')
      .filter((l) => l.trim() !== '---')
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function buildSlice(parsed, spec) {
  const out = [HEADER];
  for (const id of spec.include) {
    if (id === 'intro') {
      out.push(parsed.intro);
    } else if (id.includes('.')) {
      const sub = [...parsed.chapters.values()].flatMap((c) => c.subs).find((s) => s.id === id);
      if (!sub) throw new Error(`rulebook slice: no sub-chapter ${id}`);
      out.push(sub.lines.join('\n'));
    } else {
      const chapter = parsed.chapters.get(id);
      if (!chapter) throw new Error(`rulebook slice: no chapter ${id}`);
      out.push(chapterText(chapter, spec.exclude));
    }
  }
  let text = out.join('\n\n');
  if (!spec.gold) text = stripGold(text);
  return tidy(text);
}

export function generate(md) {
  const text = md.replace(/\r\n/g, '\n');
  const parsed = parse(text);
  const parts = {};
  for (const [task, spec] of Object.entries(SLICES)) parts[task] = buildSlice(parsed, spec);

  const entries = Object.entries(parts)
    .map(([task, body]) => `  ${task}: ${JSON.stringify(body)},`)
    .join('\n');

  return `// GENERATED by speak/scripts/build-rulebook.mjs from docs/AI-RULEBOOK.md. DO NOT EDIT BY HAND.
// Change the markdown, then run: node speak/scripts/build-rulebook.mjs
// Lives outside netlify/functions so Netlify never deploys it as a function.
import type { AiTask } from '../src/types/contract';

/** Every job that gets a slice of the rulebook (Ask and chat arrive in later steps). */
export type RulebookTask = AiTask | 'answer_ask' | 'coach_chat';

/** The whole rulebook, word for word. Too long to send to the free Groq tier whole. */
export const RULEBOOK: string = ${JSON.stringify(text)};

/** The chapters each job needs (see SLICES in scripts/build-rulebook.mjs). */
export const RULEBOOK_PARTS: Record<RulebookTask, string> = {
${entries}
};

/** The part of the rulebook this job sends to the model as its standing instructions. */
export function rulebookFor(task: RulebookTask): string {
  return RULEBOOK_PARTS[task];
}
`;
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`build-rulebook: cannot find ${SOURCE}`);
    process.exit(2);
  }
  const next = generate(readFileSync(SOURCE, 'utf8'));
  if (process.argv.includes('--check')) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== next) {
      console.error('build-rulebook: netlify/rulebook.ts is out of date with docs/AI-RULEBOOK.md. Run: node speak/scripts/build-rulebook.mjs');
      process.exit(1);
    }
    console.log('build-rulebook: netlify/rulebook.ts matches docs/AI-RULEBOOK.md');
    return;
  }
  writeFileSync(TARGET, next);
  console.log(`build-rulebook: wrote ${TARGET}`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
