// AG-006 structural check: validates every seed file against the §2 shapes
// (contract.ts + SituationCard + ExplainCard.primer + text-scene DescribeCard),
// plus v5 teach cards and the optional skill tag against AI-RULEBOOK.md §1.2.
// Exits non-zero on any failure.
//   node check-seed.mjs                 → every seed file
//   node check-seed.mjs --only <file>   → one seed file (exit 1 if missing or failing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.resolve(here, '../../src/content/seed');

const BASE = ['id', 'type', 'tags'];
const REQUIRED = {
  word: [...BASE, 'term', 'pos', 'meaning', 'examples', 'say'],
  swap: [...BASE, 'weak', 'answers', 'timerSec'],
  idiom: [...BASE, 'phrase', 'meaning', 'scenario', 'example', 'corporate'],
  action_verb: [...BASE, 'verb', 'meaning', 'contrast', 'examples'],
  pronounce: [...BASE, 'term', 'syllables', 'stressIndex'],
  say_it: [...BASE, 'line', 'marked', 'targetWpm'],
  breath: [...BASE, 'drill', 'title', 'instructions', 'logUnit'],
  phrase: [...BASE, 'weak', 'strong', 'why', 'register'],
  feeling: [...BASE, 'term', 'meaning', 'contrast', 'example'],
  story_move: [...BASE, 'move', 'why', 'example'],
  describe: [...BASE, 'alt', 'prompt', 'beats', 'targetVocab', 'targetSec'],
  explain: [...BASE, 'topic', 'angle', 'beats', 'targetVocab', 'targetSec'],
  teach_back: [...BASE, 'prompt', 'beats', 'targetSec'],
  situation: [...BASE, 'kind', 'title', 'prompt', 'beats', 'targetVocab', 'targetSec'],
  // v5 teach cards — rulebook 1.2 required parts.
  teach: [...BASE, 'track', 'level', 'kind', 'category', 'title', 'rule', 'examples', 'analogy', 'tryPrompt', 'register'],
};

const SITUATION_KINDS = new Set(['incident', 'office_call', 'feeling', 'opinion', 'life_story']);
const SITUATION_SECS = new Set([30, 45, 60, 90]);
const wordsOf = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

// v5 (docs/AI-RULEBOOK.md §1.2)
const TRACKS = new Set(['smalltalk', 'stories', 'clearly', 'words']);
const KINDS = new Set(['learn', 'use', 'fix', 'try', 'ask_them']);
const REGISTERS = new Set(['casual', 'office', 'both']);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isLevel = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const linesOf = (s) => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean).length;

/** Rulebook 1.2 limits for one teach card. Pushes into `out`. */
function checkTeach(c, where, out) {
  if (!TRACKS.has(c.track)) out.push(`${where}: unknown track ${String(c.track)}`);
  if (!isLevel(c.level)) out.push(`${where}: level must be 1-5`);
  if (!KINDS.has(c.kind)) out.push(`${where}: unknown kind ${String(c.kind)}`);
  if (c.kind === 'ask_them' && c.track !== 'smalltalk') out.push(`${where}: ask_them cards are small talk only`);
  if (!isStr(c.category)) out.push(`${where}: category must be a non-empty string`);
  if (!REGISTERS.has(c.register)) out.push(`${where}: register must be casual|office|both`);

  if (!isStr(c.title) || c.title.length > 40) out.push(`${where}: title must be 1-40 chars (${c.title?.length})`);

  const tight = c.track === 'words' || c.track === 'clearly';
  const ruleCap = tight ? 12 : 15;
  if (!isStr(c.rule)) out.push(`${where}: rule must be a non-empty string`);
  else if (wordsOf(c.rule) > ruleCap) out.push(`${where}: rule >${ruleCap} words (${wordsOf(c.rule)})`);

  const ex = c.examples;
  if (!ex || typeof ex !== 'object' || Array.isArray(ex) || !isStr(ex.work) || !isStr(ex.everyday)) {
    out.push(`${where}: examples must be two strings { work, everyday }`);
  } else {
    for (const side of ['work', 'everyday']) {
      const e = ex[side];
      if (tight && wordsOf(e) > 15) out.push(`${where}: ${side} example >15 words (${wordsOf(e)})`);
      if (c.track === 'smalltalk' && linesOf(e) > 4) out.push(`${where}: ${side} example >4 lines (${linesOf(e)})`);
      if (c.track === 'stories' && wordsOf(e) > 90) out.push(`${where}: ${side} example >90 words (${wordsOf(e)})`);
    }
  }

  if (c.kind === 'fix' && !isStr(c.insteadOf)) out.push(`${where}: fix cards need insteadOf`);
  if (c.insteadOf !== undefined) {
    if (!isStr(c.insteadOf)) out.push(`${where}: insteadOf must be a non-empty string`);
    else if (wordsOf(c.insteadOf) > 20) out.push(`${where}: insteadOf >20 words (${wordsOf(c.insteadOf)})`);
  }
  if (!isStr(c.analogy)) out.push(`${where}: analogy must be a non-empty string`);
  else {
    if (wordsOf(c.analogy) > 20) out.push(`${where}: analogy >20 words (${wordsOf(c.analogy)})`);
    if (linesOf(c.analogy) > 1) out.push(`${where}: analogy must be one line`);
  }
  if (!isStr(c.tryPrompt)) out.push(`${where}: tryPrompt must be a non-empty string`);
  else if (wordsOf(c.tryPrompt) > 25) out.push(`${where}: tryPrompt >25 words (${wordsOf(c.tryPrompt)})`);

  for (const f of ['answer', 'credit']) {
    if (c[f] !== undefined && !isStr(c[f])) out.push(`${where}: ${f} must be a non-empty string`);
  }
  if (c.lesson !== undefined) {
    const l = c.lesson;
    if (!l || typeof l !== 'object' || !isStr(l.id) || !isStr(l.title) || !isLevel(l.step) || typeof l.order !== 'number') {
      out.push(`${where}: lesson must be { id, title, step 1-5, order }`);
    }
  }
  if (c.links !== undefined && !(Array.isArray(c.links) && c.links.every(isStr))) {
    out.push(`${where}: links must be lesson id strings`);
  }

  // Whole card ≤ 120 words; Stories ≤ 170 (rulebook 1.2). `answer` is the
  // revealed reply, not part of the teaching card, so it is not counted.
  const total = [c.title, c.rule, ex?.work, ex?.everyday, c.insteadOf, c.analogy, c.tryPrompt]
    .reduce((n, s) => n + wordsOf(s), 0);
  const cap = c.track === 'stories' ? 170 : 120;
  if (total > cap) out.push(`${where}: whole card >${cap} words (${total})`);
}

/** The optional v5 skill tag any card may carry. */
function checkSkill(s, where, out) {
  if (s === undefined) return;
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    out.push(`${where}: skill must be an object`);
    return;
  }
  if (!TRACKS.has(s.track)) out.push(`${where}: skill has unknown track ${String(s.track)}`);
  if (!KINDS.has(s.kind)) out.push(`${where}: skill has unknown kind ${String(s.kind)}`);
  if (s.level !== undefined && !isLevel(s.level)) out.push(`${where}: skill level must be 1-5`);
  for (const f of ['work', 'everyday', 'analogy', 'insteadOf', 'answer']) {
    if (s[f] !== undefined && !isStr(s[f])) out.push(`${where}: skill ${f} must be a non-empty string`);
  }
  const tight = s.track === 'words' || s.track === 'clearly';
  for (const f of ['work', 'everyday']) {
    if (tight && isStr(s[f]) && wordsOf(s[f]) > 15) out.push(`${where}: skill ${f} example >15 words (${wordsOf(s[f])})`);
  }
  for (const f of ['analogy', 'insteadOf']) {
    if (isStr(s[f]) && wordsOf(s[f]) > 20) out.push(`${where}: skill ${f} >20 words (${wordsOf(s[f])})`);
  }
}

// --only <file name>: check one seed file. Exit 1 when it is missing or fails.
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
let only = null;
if (onlyAt !== -1) {
  const name = argv[onlyAt + 1];
  if (!name || name.startsWith('--')) {
    console.log('FAIL: --only needs a seed file name, e.g. --only 40-lessons-smalltalk.json');
    process.exit(1);
  }
  only = path.basename(name);
  if (!fs.existsSync(path.join(seedDir, only))) {
    console.log(`FAIL: ${only} not found in src/content/seed/`);
    process.exit(1);
  }
}

let errors = [];
let counts = {};

const allFiles = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort();
const files = only ? [only] : allFiles;
const seenIds = new Map();

// With --only, ids already used by the other (readable) files still count as
// taken, so a duplicate across files is caught by the per-file check too.
if (only) {
  for (const f of allFiles) {
    if (f === only) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
      const list = Array.isArray(raw) ? raw : raw?.cards;
      if (!Array.isArray(list) || f === '00-exemplars.json') continue;
      for (const c of list) if (typeof c?.id === 'string' && c.id && !seenIds.has(c.id)) seenIds.set(c.id, f);
    } catch {
      // another pass may be mid-write; that file is its own check's problem
    }
  }
}
let checkedIds = 0;

for (const f of files) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
  } catch (e) {
    errors.push(`${f}: invalid JSON (${e.message})`);
    continue;
  }
  const list = Array.isArray(raw) ? raw : raw.cards;
  if (!Array.isArray(list)) {
    errors.push(`${f}: not an array or {cards:[]}`);
    continue;
  }
  counts[f] = list.length;
  if (f === '00-exemplars.json') continue; // reference set, not validated
  for (const c of list) {
    const id = c?.id ?? '(missing id)';
    if (typeof c?.id !== 'string' || !c.id) {
      errors.push(`${f}: card with missing id`);
      continue;
    }
    checkedIds++;
    if (seenIds.has(c.id)) {
      errors.push(`duplicate id ${c.id} in ${f} and ${seenIds.get(c.id)}`);
    } else seenIds.set(c.id, f);

    const req = REQUIRED[c.type];
    if (!req) {
      errors.push(`${f} ${id}: unknown type ${String(c.type)}`);
      continue;
    }
    for (const field of req) {
      if (c[field] === undefined) errors.push(`${f} ${id}: missing ${field}`);
    }
    if (c.type === 'teach') checkTeach(c, `${f} ${id}`, errors);
    checkSkill(c.skill, `${f} ${id}`, errors);
    // beats length where required
    if (['describe', 'explain', 'teach_back', 'situation'].includes(c.type)) {
      if (!Array.isArray(c.beats) || c.beats.length !== 3) {
        errors.push(`${f} ${id}: beats must be exactly 3`);
      } else if (!c.beats.every((b) => typeof b === 'string' && b.trim())) {
        errors.push(`${f} ${id}: beats must be non-empty strings`);
      }
    }
    // word examples: exactly 2, each <= 25 words
    if (c.type === 'word' || c.type === 'action_verb') {
      if (!Array.isArray(c.examples) || c.examples.length !== 2) {
        errors.push(`${f} ${id}: examples must be exactly 2`);
      } else {
        for (const e of c.examples) {
          if (wordsOf(e) > 25) errors.push(`${f} ${id}: example >25 words (${wordsOf(e)}): ${String(e).slice(0, 60)}…`);
        }
      }
    }
    // situation caps
    if (c.type === 'situation') {
      if (!SITUATION_KINDS.has(c.kind)) errors.push(`${f} ${id}: bad kind ${String(c.kind)}`);
      if (typeof c.title !== 'string' || c.title.length > 40) errors.push(`${f} ${id}: title >40 chars (${c.title?.length})`);
      if (typeof c.prompt !== 'string' || c.prompt.length > 200) errors.push(`${f} ${id}: prompt >200 chars (${c.prompt?.length})`);
      if (!Array.isArray(c.targetVocab) || c.targetVocab.length > 4) errors.push(`${f} ${id}: targetVocab must be 0-4`);
      if (!SITUATION_SECS.has(c.targetSec)) errors.push(`${f} ${id}: bad targetSec ${String(c.targetSec)}`);
    }
    // explain primer cap
    if (c.type === 'explain' && c.primer !== undefined) {
      if (typeof c.primer !== 'string' || c.primer.length > 300) errors.push(`${f} ${id}: primer >300 chars (${c.primer?.length})`);
    }
    // describe text-scene caps + image-or-scene rule
    if (c.type === 'describe') {
      if (c.title !== undefined && (typeof c.title !== 'string' || c.title.length > 40)) errors.push(`${f} ${id}: title >40 chars`);
      if (c.scene !== undefined && (typeof c.scene !== 'string' || c.scene.length > 280)) errors.push(`${f} ${id}: scene >280 chars (${c.scene?.length})`);
      if (!c.imagePath && !c.scene) errors.push(`${f} ${id}: needs imagePath or scene`);
      if (!Array.isArray(c.targetVocab) || c.targetVocab.length < 3 || c.targetVocab.length > 5) errors.push(`${f} ${id}: describe targetVocab must be 3-5`);
    }
    if (c.type === 'explain') {
      if (!Array.isArray(c.targetVocab) || c.targetVocab.length < 3) errors.push(`${f} ${id}: explain targetVocab must be >=3`);
    }
  }
}

console.log('counts:', JSON.stringify(counts));
console.log('total cards (excl. exemplars from validation):', checkedIds);
if (errors.length) {
  console.log(`FAILURES (${errors.length}):`);
  for (const e of errors) console.log(' -', e);
  process.exit(1);
} else {
  console.log(only ? `PASS: ${only} structurally valid.` : 'PASS: all seed files structurally valid.');
}
