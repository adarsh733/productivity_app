import type {
  AiRequest,
  AiResponse,
  AiTask,
  AnswerAskResult,
  AskKind,
  CardKind,
  TeachDraft,
  Track,
  TrackLevel,
} from '../../src/types/contract';
import { rulebookFor } from '../rulebook';

/**
 * The only path from the browser to a model.
 *
 * Enforces:
 * 1. API keys never reach the client.
 * 2. Only strictly allowed tasks are accepted.
 * 3. Payload schema validated server-side.
 * 4. Provider output validated against exact schema with failover.
 * 5. Timeouts with AbortController per provider and total deadline.
 * 6. In-memory rate limiting against abuse.
 * 7. Never turns an AI failure into fake/generic coaching.
 * 8. Every task's standing instructions start with its slice of the AI rulebook
 *    (`netlify/rulebook.ts`, generated from `docs/AI-RULEBOOK.md`).
 */

/** Tasks this function can run today. A later step adds coach_chat. */
const CONFIGURED_TASKS = [
  'expand_seed',
  'verify_batch',
  'classify_inbox',
  'review_recording',
  'plan_week',
  'answer_ask',
] as const;
type ConfiguredTask = (typeof CONFIGURED_TASKS)[number];

const ALLOWED_TASKS: readonly AiTask[] = CONFIGURED_TASKS;

/** Card types AI may ever draft (AG-008 §0.3) — mirrors `DraftCardType`. */
const DRAFT_TYPES = [
  'word',
  'swap',
  'idiom',
  'phrase',
  'feeling',
  'story_move',
  'describe',
  'explain',
  'teach_back',
  'situation',
] as const;

/** Card shapes shared by the `classify_inbox` and `expand_seed` prompts. */
const CARD_SHAPES = [
  'word {type:"word",term,pos,meaning,examples:[two everyday sentences],say} — a Hindi word only: add "lang":"hi";',
  'swap {type:"swap",weak,answers:[1-5 single words],timerSec:5-60};',
  'idiom {type:"idiom",phrase,meaning,scenario,example,corporate:true|false};',
  'phrase {type:"phrase",weak,strong,why,register:"office"|"friends"|"presenting"};',
  'feeling {type:"feeling",term,meaning,contrast,example};',
  'story_move {type:"story_move",move,why,example};',
  'describe {type:"describe",title (max 40 chars),scene (max 280 chars),alt,prompt,beats:[3 short steps],targetVocab:[3-5 words],targetSec:15-120};',
  'explain {type:"explain",topic,angle,beats:[3],targetVocab:[3 or more],targetSec:15-180,primer? (max 300 chars)};',
  'teach_back {type:"teach_back",prompt,beats:[3],targetSec:15-180};',
  'situation {type:"situation",kind:"incident"|"office_call"|"feeling"|"opinion"|"life_story",title (max 40),prompt (max 200),beats:[3],targetVocab:[0-4],targetSec:30|45|60|90}.',
];
const NEVER_PRODUCE = 'Never produce types: breath, pronounce, say_it, action_verb.';
const AVOID_RULE =
  'If the input contains an "avoid" list, never produce any card whose headline term matches, or closely paraphrases, an entry in it.';

// ── answer_ask limits (rulebook §4 and §1.2) ───────────────────────────────
/** Longest question the Ask box sends. */
export const ASK_TEXT_MAX = 1000;
/** The short plain answer: 1-3 sentences. Longer is cut at a sentence end. */
export const ASK_ANSWER_MAX = 600;
/** One fix-my-sentence version. Longer fails over (cutting would break [[chunks]]). */
export const ASK_VERSION_MAX = 400;
export const ASK_CARDS_MIN = 3;
export const ASK_CARDS_MAX = 8;
export const ASK_CHUNKS_MAX = 8;
/** Weak-spot halves and chunks (rulebook §4.3). */
export const ASK_SHORT_MAX = 60;

/**
 * Per-task generation settings. `verify_batch` is deliberately cold.
 * `shape` is the job-specific part (what to return, exact JSON shape). It goes
 * AFTER the rulebook slice in the system prompt — see `systemFor`.
 */
const TASK_CONFIG: Record<
  ConfiguredTask,
  { temperature: number; maxTokens: number; shape: string; timeoutMs?: number }
> = {
  expand_seed: {
    temperature: 1.0,
    maxTokens: 2048,
    shape: [
      'You generate vocabulary and delivery drill cards for one Indian English speaker',
      'working in a corporate setting. Return ONLY JSON: {"cards":[...]}.',
      'Produce siblings of the SAME type and skill as the seed card, but different wording —',
      'fresh angles, never paraphrases of the seed or of each other.',
      'When no seed card is given, produce fresh, standard cards of the requested type, grounded in the given topics when present.',
      AVOID_RULE,
      'Everyday register, not literary. No rare or archaic words.',
      'Examples must be sentences a colleague would actually say out loud.',
      'Allowed card types and exact shapes:',
      ...CARD_SHAPES,
      NEVER_PRODUCE,
    ].join(' '),
  },
  verify_batch: {
    temperature: 0,
    maxTokens: 2048,
    shape: [
      'You are the checker: a different model wrote these items. Run cold and strict. Do not repair; judge. When in doubt, reject.',
      'Check every item in "items" against the rulebook above, using every section 6 reject code (R1 to R17).',
      'Items come in the app\'s own card shapes (word, swap, idiom, phrase, feeling, story_move, situation, describe, explain, teach_back, or a teach card).',
      'An app shape carries only its own fields, so judge R4 MISSING against the fields that shape has; only a teach card needs the full anatomy (examples, analogy, try, register, track, level, category, kind).',
      'Also reject slurs and words with an offensive second meaning, and any claim that is contested, outdated, or medically or legally risky.',
      'Return ONLY JSON: {"results":[{"key":string,"ok":boolean,"reason":string}]} with one result per item, using the same "key" you were given.',
      'ok true when no code applies (reason "pass"). ok false when any code applies: the reason starts with the code and its name, for example "R2 GRAMMAR: ...", then one short line saying why.',
    ].join(' '),
  },
  classify_inbox: {
    temperature: 0.4,
    maxTokens: 2048,
    shape: [
      'You turn a raw one-line thought into grounded drill cards for one Indian English speaker in a corporate setting.',
      'Return ONLY JSON: {"kind":"word"|"mistake"|"topic"|"other","subject":string,"fix"?:string,"cards":[...]}.',
      'Allowed card types and exact shapes:',
      ...CARD_SHAPES,
      NEVER_PRODUCE,
      AVOID_RULE,
      'Prefer 1-2 cards. Preserve what the user was actually curious about. Everyday register, never literary.',
    ].join(' '),
  },
  review_recording: {
    temperature: 0.3,
    maxTokens: 1024,
    shape: [
      'You are an executive speech and communication coach for an Indian English speaker in tech.',
      'Review the user transcript, prompt context, and performance duration.',
      'Provide concise, high-signal, actionable feedback grounded strictly in what was said.',
      'Return ONLY a valid JSON object matching this exact schema: {"summary": string, "strongPoint": string, "oneCorrection": string, "suggestedAlternative": string, "mistake": {"wrong": string, "right": string} | null}.',
      'Rules:',
      '1. "summary": One crisp sentence evaluating the overall rep.',
      '2. "strongPoint": What worked well. You MUST quote or reference specific words or phrases that appear in the transcript.',
      '3. "oneCorrection": One high-leverage delivery or phrasing tweak for next time.',
      '4. "suggestedAlternative": An upgraded sentence showing better executive presence or phrasing.',
      '5. "mistake": if the transcript contains ONE clear standard-English error (a non-native slip, not a style choice), set "wrong" to the exact phrase the speaker said and "right" to the fix — both max 60 chars. One error only; if none, null.',
      'Never invent quotes. Never comment on accent or pronunciation quirks. Focus on pacing, executive presence, and word precision.',
      'If a "watch" list of known mistakes is provided, check the transcript for each watched phrase first;',
      'when the transcript contains one, the correction must address it.',
    ].join(' '),
  },
  plan_week: {
    temperature: 0.2,
    maxTokens: 1024,
    shape: [
      'You plan one week of speaking practice for one Indian English speaker in a corporate setting.',
      'You get last week\'s per-type numbers (views, again rate, skips), voice numbers, and his recent coach subjects.',
      'Return ONLY JSON: {"typeWeights":{...},"challengeFocus":"softer"|"slower"|"pause_first","focusWords":[...],"note":"..."}.',
      `typeWeights keys must come only from: ${DRAFT_TYPES.join(', ')}. Any subset.`,
      'Each weight is between 0.5 and 1.5. Raise a type whose numbers show he struggles with it (high again rate) or skips it; lower a type he already does well, so fresh practice gets room.',
      'challengeFocus: exactly one of the three strings above. Choose by the voice numbers — "softer" when his recent level is above his normal, "slower" when his recent speed is above his target, "pause_first" otherwise.',
      'focusWords: up to 5 items copied EXACTLY from the coach subjects list. Never invent words; omit the field when unsure.',
      'note: ONE plain sentence, at most 90 characters, saying what to practice this week.',
      'No jargon, no numbers-only notes, no emoji, no quotes, no markdown.',
    ].join(' '),
  },
  answer_ask: {
    temperature: 0.4,
    maxTokens: 6144,
    // 3-8 full cards take longer than the other jobs; two tries still fit the deadline.
    timeoutMs: 11_000,
    shape: [
      'You answer ONE question he typed in the Ask tab, following section 4 of the rulebook above, and every card follows sections 1-2.',
      'Return ONLY JSON: {"askKind":"word"|"phrase_idiom"|"mistake"|"fix_sentence"|"topic"|"how_say"|"difference"|"other","answer":string,"versions"?:{"crisp":string,"confident":string,"polite":string},"chunks"?:[string],"weakSpot"?:{"wrong":string,"right":string},"cards":[...]}.',
      'askKind: classify first (4.1). phrase-idiom is "phrase_idiom", fix-my-sentence is "fix_sentence", how-do-I-say is "how_say", difference-between is "difference". A sentence that contains a mistake is "fix_sentence".',
      `answer: the short plain answer first, 1-3 sentences, at most ${ASK_ANSWER_MAX} characters, no markdown. For fix_sentence it is the 1-2 lines on what changed, tied to a rule.`,
      'versions and chunks: ONLY when askKind is "fix_sentence", and then required. crisp = shortest clear version, point first; confident = no hedges, active voice, clear ask or next step; polite = warm and respectful, still direct. Mark every reusable chunk inside the versions with [[double brackets]] (never nested) and list the same chunks, without brackets, in "chunks" (at most 8).',
      'weakSpot: only per 4.3 (a mistake he made himself, or a known pattern in his sentence); "wrong" is his exact phrase and "right" the global form, each at most 60 characters. Otherwise leave it out.',
      'cards: 3 to 8 teach cards, never more; 3 strong cards beat 8 thin ones. Each card is exactly',
      '{"type":"teach","track":"smalltalk"|"stories"|"clearly"|"words","level":1-5,"kind":"learn"|"use"|"fix"|"try"|"ask_them","category":string,"title":string,"rule":string,"examples":{"work":string,"everyday":string},"insteadOf"?:string,"analogy":string,"tryPrompt":string,"register":"casual"|"office"|"both","answer"?:string,"credit"?:string}.',
      'The section 1.2 limits are hard: a card over any limit is thrown away. title at most 40 characters. insteadOf is required on fix cards. ask_them is small talk only. credit names the framework (appendix), if any.',
      'Use the "levels" input, when given, as his current level per track.',
      AVOID_RULE,
    ].join(' '),
  },
};

type Provider = 'gemini' | 'groq' | 'anthropic';

/** Model names, pinned by a test. Change them here and in `ai.test.ts` together. */
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'; // stable code on Google's model page, 2026-10-29
export const GROQ_MODEL = 'openai/gpt-oss-120b';

/**
 * The full system prompt for a task: its slice of the rulebook (the content
 * rules), then the job-specific shape lines (what exactly to return).
 */
export function systemFor(task: ConfiguredTask): string {
  return `${rulebookFor(task)}\n\n=== THIS JOB ===\n${TASK_CONFIG[task].shape}`;
}

const PER_PROVIDER_TIMEOUT_MS = 8000;
const TOTAL_FUNCTION_DEADLINE_MS = 24000;

// Basic in-memory rate limiter: max 30 requests per minute per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerMin = 30): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMin) {
    return false;
  }
  entry.count++;
  return true;
}

export interface ReviewRecordingResponse {
  summary: string;
  strongPoint: string;
  oneCorrection: string;
  suggestedAlternative?: string;
  mistake?: { wrong: string; right: string };
}

/**
 * Validates provider output against exact schema for the task.
 * Returns validated data object, or throws Error if invalid.
 */
export function validateClassifyInbox(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Classifier response must be an object');
  const c = raw as Record<string, unknown>;
  const kinds = ['word', 'mistake', 'topic', 'other'];
  if (typeof c.kind !== 'string' || !kinds.includes(c.kind)) throw new Error('Missing or invalid "kind"');
  if (typeof c.subject !== 'string' || !c.subject.trim()) throw new Error('Missing or empty "subject"');
  if (c.fix !== undefined && (typeof c.fix !== 'string' || !c.fix.trim())) {
    throw new Error('Invalid "fix"');
  }
  if (!Array.isArray(c.cards)) throw new Error('Missing "cards" array');
  const cards = (c.cards as unknown[]).map((d, i) => validateClassifyDraft(d, i));
  return {
    kind: c.kind,
    subject: (c.subject as string).trim(),
    ...(typeof c.fix === 'string' && c.fix.trim() ? { fix: c.fix.trim() } : {}),
    cards,
  };
}

// ── classify_inbox draft validation ────────────────────────────────────────
// Structural caps mirror `scripts/content-pipeline/check-seed.mjs`. Identity
// fields throw when missing; sizes and ranges are clamped so one loose value
// can never smuggle an out-of-contract card into the store.

function draftStr(r: Record<string, unknown>, field: string, i: number): string {
  const v = r[field];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Draft ${i}: missing "${field}"`);
  return v.trim();
}

function draftExamples(r: Record<string, unknown>, i: number): [string, string] {
  if (
    !Array.isArray(r.examples) ||
    r.examples.length !== 2 ||
    !r.examples.every((e) => typeof e === 'string' && e.trim())
  ) {
    throw new Error(`Draft ${i}: "examples" must have exactly 2 non-empty entries`);
  }
  const [a, b] = r.examples as [string, string];
  return [a.trim(), b.trim()];
}

function draftBeats(r: Record<string, unknown>, i: number): [string, string, string] {
  if (!Array.isArray(r.beats) || r.beats.length !== 3) {
    throw new Error(`Draft ${i}: "beats" must have exactly 3 entries`);
  }
  for (const b of r.beats) {
    if (typeof b !== 'string' || !b.trim()) {
      throw new Error(`Draft ${i}: "beats" must be non-empty strings`);
    }
  }
  const [a, b, c] = r.beats as [string, string, string];
  return [a.trim(), b.trim(), c.trim()];
}

function draftVocab(r: Record<string, unknown>, min: number, max: number, i: number): string[] {
  if (!Array.isArray(r.targetVocab)) throw new Error(`Draft ${i}: missing "targetVocab"`);
  const vocab = r.targetVocab
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
  if (vocab.length < min) throw new Error(`Draft ${i}: "targetVocab" needs at least ${min}`);
  return vocab;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** Snap to the nearest allowed situation length (30 | 45 | 60 | 90). */
function nearestSec(v: unknown): 30 | 45 | 60 | 90 {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 60;
  const secs = [30, 45, 60, 90] as const;
  let best: (typeof secs)[number] = 60;
  for (const s of secs) {
    if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  }
  return best;
}

const SITUATION_KINDS = ['incident', 'office_call', 'feeling', 'opinion', 'life_story'] as const;

/** Optional payload lists (topics / avoid): non-empty strings, capped. */
function validStringList(v: unknown, max: number): boolean {
  return Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.trim().length > 0);
}

function validateClassifyDraft(d: unknown, i: number): unknown {
  if (!d || typeof d !== 'object') throw new Error(`Draft ${i}: must be an object`);
  const r = d as Record<string, unknown>;

  if (r.type === 'word') {
    const out: Record<string, unknown> = {
      type: 'word',
      term: draftStr(r, 'term', i),
      pos: draftStr(r, 'pos', i),
      meaning: draftStr(r, 'meaning', i),
      examples: draftExamples(r, i),
      say: draftStr(r, 'say', i),
    };
    if (r.lang !== undefined) {
      if (r.lang !== 'hi') throw new Error(`Draft ${i}: "lang" must be "hi" when present`);
      out.lang = 'hi';
    }
    return out;
  }

  if (r.type === 'swap') {
    if (!Array.isArray(r.answers) || r.answers.length === 0) {
      throw new Error(`Draft ${i}: missing "answers"`);
    }
    const answers = r.answers
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map((a) => a.trim())
      .slice(0, 5);
    if (answers.length === 0) throw new Error(`Draft ${i}: "answers" must be non-empty strings`);
    return {
      type: 'swap',
      weak: draftStr(r, 'weak', i),
      answers,
      timerSec: clampNum(r.timerSec, 5, 60, 15),
    };
  }

  if (r.type === 'idiom') {
    if (typeof r.corporate !== 'boolean') throw new Error(`Draft ${i}: missing "corporate"`);
    return {
      type: 'idiom',
      phrase: draftStr(r, 'phrase', i),
      meaning: draftStr(r, 'meaning', i),
      scenario: draftStr(r, 'scenario', i),
      example: draftStr(r, 'example', i),
      corporate: r.corporate,
    };
  }

  if (r.type === 'phrase') {
    for (const f of ['weak', 'strong', 'why', 'register'] as const) {
      if (typeof r[f] !== 'string' || !(r[f] as string).trim()) throw new Error(`Draft ${i}: missing "${f}"`);
    }
    if (!['office', 'friends', 'presenting'].includes(r.register as string)) {
      throw new Error(`Draft ${i}: invalid "register"`);
    }
    return {
      type: 'phrase',
      weak: (r.weak as string).trim(),
      strong: (r.strong as string).trim(),
      why: (r.why as string).trim(),
      register: r.register,
    };
  }

  if (r.type === 'feeling') {
    return {
      type: 'feeling',
      term: draftStr(r, 'term', i),
      meaning: draftStr(r, 'meaning', i),
      contrast: draftStr(r, 'contrast', i),
      example: draftStr(r, 'example', i),
    };
  }

  if (r.type === 'story_move') {
    const out: Record<string, unknown> = {
      type: 'story_move',
      move: draftStr(r, 'move', i),
      why: draftStr(r, 'why', i),
      example: draftStr(r, 'example', i),
    };
    if (typeof r.heardIn === 'string' && r.heardIn.trim()) out.heardIn = r.heardIn.trim();
    return out;
  }

  if (r.type === 'describe') {
    return {
      type: 'describe',
      title: draftStr(r, 'title', i).slice(0, 40),
      scene: draftStr(r, 'scene', i).slice(0, 280),
      alt: draftStr(r, 'alt', i),
      prompt: draftStr(r, 'prompt', i),
      beats: draftBeats(r, i),
      targetVocab: draftVocab(r, 3, 5, i),
      targetSec: clampNum(r.targetSec, 15, 120, 60),
    };
  }

  if (r.type === 'explain') {
    const out: Record<string, unknown> = {
      type: 'explain',
      topic: draftStr(r, 'topic', i),
      angle: draftStr(r, 'angle', i),
      beats: draftBeats(r, i),
      targetVocab: draftVocab(r, 3, 5, i),
      targetSec: clampNum(r.targetSec, 15, 180, 60),
    };
    if (typeof r.primer === 'string' && r.primer.trim()) out.primer = r.primer.trim().slice(0, 300);
    return out;
  }

  if (r.type === 'teach_back') {
    return {
      type: 'teach_back',
      prompt: draftStr(r, 'prompt', i),
      beats: draftBeats(r, i),
      targetSec: clampNum(r.targetSec, 15, 180, 60),
    };
  }

  if (r.type === 'situation') {
    if (!SITUATION_KINDS.includes(r.kind as (typeof SITUATION_KINDS)[number])) {
      throw new Error(`Draft ${i}: invalid "kind"`);
    }
    return {
      type: 'situation',
      kind: r.kind,
      title: draftStr(r, 'title', i).slice(0, 40),
      prompt: draftStr(r, 'prompt', i).slice(0, 200),
      beats: draftBeats(r, i),
      targetVocab: draftVocab(r, 0, 4, i),
      targetSec: nearestSec(r.targetSec),
    };
  }

  throw new Error(`Draft ${i}: unknown type`);
}

export function validateVerifyBatch(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Verifier response must be an object');
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.results)) throw new Error('Missing "results" array');
  const results = (c.results as unknown[]).map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`Result ${i}: must be an object`);
    const o = r as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key) throw new Error(`Result ${i}: missing "key"`);
    if (typeof o.ok !== 'boolean') throw new Error(`Result ${i}: missing "ok"`);
    if (typeof o.reason !== 'string' || !o.reason.trim()) throw new Error(`Result ${i}: missing "reason"`);
    return { key: o.key, ok: o.ok, reason: o.reason.trim() };
  });
  return { results };
}

export function validateExpandSeed(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('expand_seed response must be an object');
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.cards)) throw new Error('Missing "cards" array');
  return { cards: (c.cards as unknown[]).map((d, i) => validateClassifyDraft(d, i)) };
}

/**
 * plan_week output — structural check only. Bounds, allowed types, allowed
 * branches and word counts are clamped in the client (`features/auto/plan.ts`),
 * so one loose value here still can never reach the store unchecked.
 * Throws when the plan has no usable field at all, so a junk response fails
 * over to the next provider instead of being stored as an empty plan.
 */
export function validatePlanWeek(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new Error('Plan response must be an object');
  const c = raw as Record<string, unknown>;

  let typeWeights: Record<string, number> | undefined;
  if (c.typeWeights && typeof c.typeWeights === 'object' && !Array.isArray(c.typeWeights)) {
    const entries = Object.entries(c.typeWeights as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
    );
    if (entries.length > 0) typeWeights = Object.fromEntries(entries);
  }

  const challengeFocus =
    typeof c.challengeFocus === 'string' && c.challengeFocus.trim()
      ? c.challengeFocus.trim()
      : undefined;

  let focusWords: string[] | undefined;
  if (Array.isArray(c.focusWords)) {
    const words = c.focusWords
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim())
      .slice(0, 10);
    if (words.length > 0) focusWords = words;
  }

  const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined;

  if (!typeWeights && !challengeFocus && !focusWords && !note) {
    throw new Error('Plan has no usable content');
  }

  return {
    ...(typeWeights ? { typeWeights } : {}),
    ...(challengeFocus ? { challengeFocus } : {}),
    ...(focusWords ? { focusWords } : {}),
    ...(note ? { note } : {}),
  };
}

// ── answer_ask output validation (rulebook §4.1-4.3, card limits §1.2) ──────
// Strict on what the screen depends on (kind, answer, the three versions, at
// least 3 good cards): anything wrong there throws, so the next provider gets
// a turn. Loose on the rest: one bad card is dropped, sizes are clamped, a bad
// weak spot is dropped. Card word limits mirror check-seed.mjs `checkTeach`.

const ASK_KINDS: readonly AskKind[] = [
  'word',
  'phrase_idiom',
  'mistake',
  'fix_sentence',
  'topic',
  'how_say',
  'difference',
  'other',
];
/** The rulebook's own names for the kinds, which a model may echo back. */
const ASK_KIND_ALIASES: Record<string, AskKind> = {
  'phrase-idiom': 'phrase_idiom',
  phrase_idiom: 'phrase_idiom',
  'fix-my-sentence': 'fix_sentence',
  fix_my_sentence: 'fix_sentence',
  'how-do-i-say': 'how_say',
  how_do_i_say: 'how_say',
  'difference-between': 'difference',
  difference_between: 'difference',
};
const TRACKS: readonly Track[] = ['smalltalk', 'stories', 'clearly', 'words'];
const CARD_KINDS: readonly CardKind[] = ['learn', 'use', 'fix', 'try', 'ask_them'];
const REGISTERS = ['casual', 'office', 'both'] as const;
/** Provenance words a card's `source` already means; never a framework credit. */
const PROVENANCE = ['seed', 'ai', 'inbox'];

const wordsOf = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const linesOf = (s: string): number =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Cut to at most `max` characters at a word boundary, never mid-word. */
function clampAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : s.slice(0, max)).trim();
}

/** Cut to at most `max` characters at the last sentence end; else at a word, with "…". */
function clampAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (end > 0) return cut.slice(0, end + 1).trim();
  return `${clampAtWord(s, max - 1)}…`;
}

/**
 * One AI-drafted teach card. Throws with the reason when it breaks a rule;
 * the caller drops it. Rulebook aliases (`instead_of`, `try`, `source`) are
 * accepted and renamed to the contract's field names.
 */
export function validateTeachDraft(d: unknown, i: number): TeachDraft {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`Card ${i}: must be an object`);
  const r = d as Record<string, unknown>;
  if (r.type !== undefined && r.type !== 'teach') throw new Error(`Card ${i}: type must be "teach"`);

  const track = r.track as Track;
  if (!TRACKS.includes(track)) throw new Error(`Card ${i}: unknown track`);
  const kind = r.kind as CardKind;
  if (!CARD_KINDS.includes(kind)) throw new Error(`Card ${i}: unknown kind`);
  if (kind === 'ask_them' && track !== 'smalltalk') throw new Error(`Card ${i}: ask_them is small talk only`);
  if (typeof r.level !== 'number' || !Number.isFinite(r.level)) throw new Error(`Card ${i}: missing level`);
  const level = clampNum(r.level, 1, 5, 1) as TrackLevel;
  const register = r.register as (typeof REGISTERS)[number];
  if (!REGISTERS.includes(register)) throw new Error(`Card ${i}: unknown register`);

  const need = (v: unknown, field: string): string => {
    const s = str(v);
    if (!s) throw new Error(`Card ${i}: missing "${field}"`);
    return s;
  };
  const category = clampAtWord(need(r.category, 'category'), 40);
  const title = clampAtWord(need(r.title, 'title'), 40);
  const tight = track === 'words' || track === 'clearly';

  const rule = need(r.rule, 'rule');
  const ruleCap = tight ? 12 : 15;
  if (wordsOf(rule) > ruleCap) throw new Error(`Card ${i}: rule over ${ruleCap} words`);

  let work: string | undefined;
  let everyday: string | undefined;
  if (Array.isArray(r.examples) && r.examples.length === 2) {
    work = str(r.examples[0]);
    everyday = str(r.examples[1]);
  } else if (r.examples && typeof r.examples === 'object') {
    const ex = r.examples as Record<string, unknown>;
    work = str(ex.work);
    everyday = str(ex.everyday);
  }
  if (!work || !everyday) throw new Error(`Card ${i}: examples must be { work, everyday }`);
  for (const e of [work, everyday]) {
    if (tight && wordsOf(e) > 15) throw new Error(`Card ${i}: example over 15 words`);
    if (track === 'smalltalk' && linesOf(e) > 4) throw new Error(`Card ${i}: example over 4 lines`);
    if (track === 'stories' && wordsOf(e) > 90) throw new Error(`Card ${i}: example over 90 words`);
  }

  const insteadOf = str(r.insteadOf) ?? str(r.instead_of);
  if (kind === 'fix' && !insteadOf) throw new Error(`Card ${i}: fix cards need insteadOf`);
  if (insteadOf && wordsOf(insteadOf) > 20) throw new Error(`Card ${i}: insteadOf over 20 words`);

  const analogy = need(r.analogy, 'analogy');
  if (wordsOf(analogy) > 20 || linesOf(analogy) > 1) throw new Error(`Card ${i}: analogy over one 20-word line`);

  const tryPrompt = need(r.tryPrompt ?? r.try, 'tryPrompt');
  if (wordsOf(tryPrompt) > 25) throw new Error(`Card ${i}: tryPrompt over 25 words`);

  const total = [title, rule, work, everyday, insteadOf ?? '', analogy, tryPrompt].reduce(
    (n, s) => n + wordsOf(s),
    0,
  );
  const cap = track === 'stories' ? 170 : 120;
  if (total > cap) throw new Error(`Card ${i}: whole card over ${cap} words`);

  const answer = str(r.answer);
  const sourceCredit = str(r.source);
  const credit = str(r.credit) ?? (sourceCredit && !PROVENANCE.includes(sourceCredit) ? sourceCredit : undefined);

  return {
    type: 'teach',
    track,
    level,
    kind,
    category,
    title,
    rule,
    examples: { work, everyday },
    ...(insteadOf ? { insteadOf } : {}),
    analogy,
    tryPrompt,
    register,
    ...(answer ? { answer } : {}),
    ...(credit ? { credit: clampAtWord(credit, 80) } : {}),
  };
}

const CHUNK_MARK = /\[\[([^[\]]+?)\]\]/g;

/** Chunks marked [[like this]] in a version. Throws on broken or nested markers. */
function chunksIn(version: string, name: string): string[] {
  const found = [...version.matchAll(CHUNK_MARK)].map((m) => (m[1] ?? '').trim()).filter(Boolean);
  if (/\[\[|\]\]/.test(version.replace(CHUNK_MARK, ''))) {
    throw new Error(`"versions.${name}" has broken [[chunk]] markers`);
  }
  return found;
}

export function validateAnswerAsk(raw: unknown): AnswerAskResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ask response must be an object');
  const c = raw as Record<string, unknown>;

  const kindRaw = typeof c.askKind === 'string' ? c.askKind.trim().toLowerCase() : '';
  const askKind = ASK_KIND_ALIASES[kindRaw] ?? (ASK_KINDS.includes(kindRaw as AskKind) ? (kindRaw as AskKind) : undefined);
  if (!askKind) throw new Error('Missing or invalid "askKind"');

  const answerRaw = str(c.answer);
  if (!answerRaw) throw new Error('Missing or empty "answer"');
  const answer = clampAtSentence(answerRaw, ASK_ANSWER_MAX);

  // Fix-my-sentence: the three versions are the answer, so they are required.
  let versions: AnswerAskResult['versions'];
  let chunks: string[] | undefined;
  if (askKind === 'fix_sentence') {
    const v = c.versions as Record<string, unknown> | undefined;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('fix_sentence needs "versions"');
    const marked: string[] = [];
    const version = (name: 'crisp' | 'confident' | 'polite'): string => {
      const s = str(v[name]);
      if (!s) throw new Error(`Missing or empty "versions.${name}"`);
      if (s.length > ASK_VERSION_MAX) throw new Error(`"versions.${name}" is too long`);
      marked.push(...chunksIn(s, name));
      return s;
    };
    versions = { crisp: version('crisp'), confident: version('confident'), polite: version('polite') };
    const out = versions;

    // The [[markers]] are the source of truth; a listed chunk counts only if
    // it really appears in a version, so the screen never shows a stray one.
    const plain = Object.values(out)
      .join(' ')
      .replace(CHUNK_MARK, '$1')
      .toLowerCase();
    const listed = Array.isArray(c.chunks)
      ? c.chunks.map(str).filter((s): s is string => !!s && plain.includes(s.toLowerCase()))
      : [];
    const seen = new Set<string>();
    chunks = [...marked, ...listed]
      .filter((s) => s.length <= ASK_SHORT_MAX)
      .filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, ASK_CHUNKS_MAX);
  }

  // Weak spot is optional and never fatal (rulebook §4.3).
  let weakSpot: AnswerAskResult['weakSpot'];
  const w = c.weakSpot;
  if (w && typeof w === 'object' && !Array.isArray(w)) {
    const wrong = str((w as Record<string, unknown>).wrong)?.slice(0, ASK_SHORT_MAX).trim();
    const right = str((w as Record<string, unknown>).right)?.slice(0, ASK_SHORT_MAX).trim();
    if (wrong && right && wrong.toLowerCase() !== right.toLowerCase()) weakSpot = { wrong, right };
  }

  if (!Array.isArray(c.cards)) throw new Error('Missing "cards" array');
  const cards: TeachDraft[] = [];
  const reasons: string[] = [];
  const titles = new Set<string>();
  c.cards.forEach((d, i) => {
    try {
      const card = validateTeachDraft(d, i);
      const key = card.title.toLowerCase();
      if (titles.has(key)) throw new Error(`Card ${i}: repeats another card's title`);
      titles.add(key);
      cards.push(card);
    } catch (e) {
      reasons.push((e as Error).message);
    }
  });
  if (cards.length < ASK_CARDS_MIN) {
    throw new Error(
      `Only ${cards.length} usable cards (need ${ASK_CARDS_MIN})${reasons.length ? `: ${reasons[0]}` : ''}`,
    );
  }

  return {
    askKind,
    answer,
    ...(versions ? { versions } : {}),
    ...(chunks && chunks.length ? { chunks } : {}),
    ...(weakSpot ? { weakSpot } : {}),
    cards: cards.slice(0, ASK_CARDS_MAX),
  };
}

/** answer_ask payload: plain-words error, or null when fine. */
export function checkAnswerAskPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Invalid payload';
  const p = payload as Record<string, unknown>;
  if (typeof p.text !== 'string' || !p.text.trim()) return 'Type a question first';
  if (p.text.trim().length > ASK_TEXT_MAX) return `Keep the question under ${ASK_TEXT_MAX} characters`;
  if (p.avoid !== undefined && !validStringList(p.avoid, 50)) return 'Invalid payload';
  if (p.levels !== undefined) {
    if (!p.levels || typeof p.levels !== 'object' || Array.isArray(p.levels)) return 'Invalid payload';
    for (const [k, v] of Object.entries(p.levels as Record<string, unknown>)) {
      if (!TRACKS.includes(k as Track)) return 'Invalid payload';
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return 'Invalid payload';
    }
  }
  return null;
}

export function validateProviderOutput(task: AiTask, raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Provider response must be an object');
  }

  if (task === 'review_recording') {
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) {
      throw new Error('Missing or empty "summary"');
    }
    if (typeof candidate.strongPoint !== 'string' || !candidate.strongPoint.trim()) {
      throw new Error('Missing or empty "strongPoint"');
    }
    if (typeof candidate.oneCorrection !== 'string' || !candidate.oneCorrection.trim()) {
      throw new Error('Missing or empty "oneCorrection"');
    }

    let suggestedAlternative: string | undefined;
    if (
      typeof candidate.suggestedAlternative === 'string' &&
      candidate.suggestedAlternative.trim()
    ) {
      suggestedAlternative = candidate.suggestedAlternative.trim();
    }

    // `mistake` is optional and never fatal: a malformed one is dropped,
    // not thrown — feedback must survive a bad optional field.
    let mistake: { wrong: string; right: string } | undefined;
    const m = candidate.mistake;
    if (m && typeof m === 'object') {
      const mm = m as Record<string, unknown>;
      const wrong = typeof mm.wrong === 'string' ? mm.wrong.trim().slice(0, 60) : '';
      const right = typeof mm.right === 'string' ? mm.right.trim().slice(0, 60) : '';
      if (wrong && right && wrong.toLowerCase() !== right.toLowerCase()) {
        mistake = { wrong, right };
      }
    }

    const validated: ReviewRecordingResponse = {
      summary: candidate.summary.trim(),
      strongPoint: candidate.strongPoint.trim(),
      oneCorrection: candidate.oneCorrection.trim(),
      ...(suggestedAlternative ? { suggestedAlternative } : {}),
      ...(mistake ? { mistake } : {}),
    };
    return validated;
  }

  if (task === 'classify_inbox') {
    return validateClassifyInbox(raw);
  }

  if (task === 'verify_batch') {
    return validateVerifyBatch(raw);
  }

  if (task === 'expand_seed') {
    return validateExpandSeed(raw);
  }

  if (task === 'plan_week') {
    return validatePlanWeek(raw);
  }

  if (task === 'answer_ask') {
    return validateAnswerAsk(raw);
  }

  return raw;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('client-ip') ||
    'anonymous';

  if (!checkRateLimit(clientIp)) {
    return json({ ok: false, error: 'Rate limit exceeded. Please wait a moment.' }, 429);
  }

  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }

  if (!body || !ALLOWED_TASKS.includes(body.task)) {
    return json({ ok: false, error: 'unknown task' }, 400);
  }

  // Task-specific payload validation
  if (body.task === 'classify_inbox') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string' || !payload.text.trim()) {
      return json({ ok: false, task: body.task, error: 'AI sorting needs the note text' }, 400);
    }
    // `avoid` is optional: his rejected headlines (max 50). Never a hard error to omit.
    if (payload.avoid !== undefined) {
      if (!validStringList(payload.avoid, 50)) {
        return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
      }
    }
  }

  if (body.task === 'expand_seed') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    if (typeof payload.type !== 'string' || !(DRAFT_TYPES as readonly string[]).includes(payload.type)) {
      return json({ ok: false, task: body.task, error: 'Invalid card type' }, 400);
    }
    const count = payload.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) {
      return json({ ok: false, task: body.task, error: 'Invalid count' }, 400);
    }
    if (payload.seed !== undefined) {
      let seed: unknown;
      try {
        seed = validateClassifyDraft(payload.seed, 0);
      } catch {
        return json({ ok: false, task: body.task, error: 'Invalid seed card' }, 400);
      }
      if ((seed as { type?: string }).type !== payload.type) {
        return json({ ok: false, task: body.task, error: 'Seed does not match card type' }, 400);
      }
    }
    // `topics` (max 20) and `avoid` (max 50) are optional. Never a hard error to omit.
    for (const [f, cap] of [['topics', 20], ['avoid', 50]] as const) {
      const v = payload[f];
      if (v === undefined) continue;
      if (!validStringList(v, cap)) {
        return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
      }
    }
  }

  if (body.task === 'verify_batch') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
  }

  if (body.task === 'plan_week') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    if (!Array.isArray(payload.types) || payload.types.length === 0 || payload.types.length > 15) {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    for (const t of payload.types) {
      if (!t || typeof t !== 'object' || typeof (t as Record<string, unknown>).type !== 'string') {
        return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
      }
    }
    if (
      payload.voice !== undefined &&
      (typeof payload.voice !== 'object' || payload.voice === null || Array.isArray(payload.voice))
    ) {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    // `coachSubjects` is optional: his recent subjects (max 10). Never a hard error to omit.
    if (payload.coachSubjects !== undefined && !validStringList(payload.coachSubjects, 10)) {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
  }

  if (body.task === 'review_recording') {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
    }
    if (typeof payload.transcript !== 'string' || !payload.transcript.trim()) {
      return json({ ok: false, task: body.task, error: 'AI feedback needs a transcript' }, 400);
    }
    const transcript = payload.transcript.trim();
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 5) {
      return json(
        { ok: false, task: body.task, error: 'Transcript too short for AI review (minimum 5 words)' },
        400,
      );
    }
    // `watch` is optional: his known mistakes (max 10). Never a hard error.
    const watch = (payload as { watch?: unknown }).watch;
    if (watch !== undefined) {
      if (!Array.isArray(watch) || watch.length > 10) {
        return json({ ok: false, task: body.task, error: 'Invalid payload' }, 400);
      }
    }
  }

  if (body.task === 'answer_ask') {
    const bad = checkAnswerAskPayload(body.payload);
    if (bad) return json({ ok: false, task: body.task, error: bad }, 400);
  }

  // Safe: the ALLOWED_TASKS check above guarantees a configured task.
  const task = body.task as ConfiguredTask;
  const cfg = TASK_CONFIG[task];
  const system = systemFor(task);
  const userPrompt = JSON.stringify(body.payload ?? {});
  if (userPrompt.length > 60_000) {
    return json({ ok: false, task: body.task, error: 'payload too large' }, 413);
  }

  // Provider order is Gemini → Groq → Anthropic (locked decision).
  // Anthropic stays only as a last fallback. `prefer` can still override.
  const allProviders: Provider[] = ['gemini', 'groq', 'anthropic'];
  const preferred = body.prefer && allProviders.includes(body.prefer) ? body.prefer : undefined;
  const order: Provider[] = preferred
    ? [preferred, ...allProviders.filter((p) => p !== preferred)]
    : allProviders;

  const functionDeadline = Date.now() + TOTAL_FUNCTION_DEADLINE_MS;
  const errors: string[] = [];

  for (const provider of order) {
    if (Date.now() >= functionDeadline) {
      errors.push('function deadline exceeded');
      break;
    }

    try {
      const remainingTime = Math.max(1000, functionDeadline - Date.now());
      const timeoutMs = Math.min(cfg.timeoutMs ?? PER_PROVIDER_TIMEOUT_MS, remainingTime);

      const rawText = await callWithTimeout(
        provider,
        system,
        userPrompt,
        cfg.temperature,
        cfg.maxTokens,
        timeoutMs,
      );

      if (rawText === null) {
        errors.push(`${provider}: not configured`);
        continue;
      }

      const parsed = safeParse(rawText);
      const validated = validateProviderOutput(body.task, parsed);

      return json({ ok: true, task: body.task, provider, data: validated });
    } catch (e) {
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }

  return json({ ok: false, task: body.task, error: 'AI is unavailable right now (offline or no key). Saved — I will try again when you are online.' }, 502);
}

async function callWithTimeout(
  provider: Provider,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
): Promise<string | null> {
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  try {
    return await call(provider, system, user, temperature, maxTokens, abortCtrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function call(
  provider: Provider,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string | null> {
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        temperature,
        // Cached: the rulebook slice is identical on every call for a task.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Parse a provider's JSON. An empty reply and broken JSON both throw, so the
 * next provider gets a turn. A ```json fence (Anthropic has no JSON mode) is
 * stripped first; nothing else is repaired.
 */
export function safeParse(text: string): unknown {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('Empty response from provider');
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try {
    return JSON.parse(fenced ? (fenced[1] ?? '') : trimmed);
  } catch {
    throw new Error('Malformed JSON returned by provider');
  }
}

function json(payload: Partial<AiResponse>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
