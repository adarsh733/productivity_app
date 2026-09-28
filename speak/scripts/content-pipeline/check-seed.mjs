// AG-006 structural check: validates every seed file against the §2 shapes
// (contract.ts + SituationCard + ExplainCard.primer + text-scene DescribeCard).
// Throwaway verification script — exits non-zero on any failure.
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
};

const SITUATION_KINDS = new Set(['incident', 'office_call', 'feeling', 'opinion', 'life_story']);
const SITUATION_SECS = new Set([30, 45, 60, 90]);
const wordsOf = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

let errors = [];
let counts = {};

const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort();
const seenIds = new Map();

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
console.log('total cards (excl. exemplars from validation):', [...seenIds.keys()].length);
if (errors.length) {
  console.log(`FAILURES (${errors.length}):`);
  for (const e of errors) console.log(' -', e);
  process.exit(1);
} else {
  console.log('PASS: all seed files structurally valid.');
}
