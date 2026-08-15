/**
 * The speaking missions.
 *
 * Until now every entry point in the app — Today, Coach, and all eight Practice
 * lanes including Hindi — landed on one hardcoded office prompt, and the
 * "feedback" was four fixed sentences asserting things about audio nothing had
 * listened to. This file is the content layer that makes a lane mean something.
 *
 * Two rules hold here:
 *
 *  1. **Nothing claims to have heard him.** There is no transcript and no model
 *     in this path, so the app never says "your recommendation had a clear
 *     direction". He listens back and picks what to fix; the authored line
 *     tells him *how* to fix the thing he picked. That is honest, it works
 *     offline, and it is the part a model would replace later — not the part it
 *     would invent.
 *  2. **One correction at a time** (PRODUCT-RESET-PLAN §14.3). Every focus
 *     carries exactly one redo instruction.
 */

import type { Lang } from '../types/contract';

export type MissionLane =
  | 'office'
  | 'incident'
  | 'feelings'
  | 'teachback'
  | 'lifestory'
  | 'tone'
  | 'vocab_en'
  | 'vocab_hi';

/** One thing he can choose to fix, and the single instruction for the redo. */
export interface MissionFocus {
  id: string;
  /** What he noticed, in his words. */
  label: string;
  /** Why it matters — one sentence, no lecture. */
  correction: string;
  /** The redo target. One instruction, not a list. */
  redoTarget: string;
}

export interface Mission {
  id: string;
  lane: MissionLane;
  laneLabel: string;
  lang: Lang;
  /** The prompt itself, used as the screen heading. */
  headline: string;
  /** One line of setup. */
  brief: string;
  /** Chips: register, constraint, target words. */
  meta: string[];
  /** The shape a good answer takes. */
  structure: string;
  /** Suggested length of the spoken rep, in seconds. */
  targetSec: number;
  focus: [MissionFocus, MissionFocus, MissionFocus];
}

// ─────────────────────────────────────────────────────────────────────────────
// Focus sets shared across lanes
// ─────────────────────────────────────────────────────────────────────────────

const PACE: MissionFocus = {
  id: 'pace',
  label: 'I rushed, and words ran together',
  correction:
    'Speed removes the gaps a listener uses to keep up. The fix is not slower words — it is longer gaps between phrases.',
  redoTarget: 'Same content. Stop fully at the end of each sentence before starting the next.',
};

const VOLUME: MissionFocus = {
  id: 'volume',
  label: 'I got louder to make the point',
  correction:
    'Volume is the one emphasis tool that costs you air and makes you sound less certain, not more.',
  redoTarget: 'Say it again at the volume you would use across a dinner table. Emphasise with a pause instead.',
};

const STRUCTURE: MissionFocus = {
  id: 'structure',
  label: 'I wandered before getting to the point',
  correction:
    'A listener holds one thread. Backstory before the point makes them work out what the story is for.',
  redoTarget: 'Lead with the one-sentence point, then give the two facts that support it.',
};

const FILLER: MissionFocus = {
  id: 'filler',
  label: 'I filled the gaps with “um” and “basically”',
  correction:
    'Filler is what a pause turns into when silence feels unsafe. The silence is what you actually want.',
  redoTarget: 'When you reach for a filler, close your mouth and wait instead. Let it be quiet.',
};

const WORDS: MissionFocus = {
  id: 'words',
  label: 'I could not find the right word',
  correction:
    'Retrieval improves by finishing the sentence with a plainer word, not by stopping to search for the perfect one.',
  redoTarget: 'Run it again. If a word does not come in one beat, use the simple one and keep moving.',
};

const ENDINGS: MissionFocus = {
  id: 'endings',
  label: 'My sentence endings faded out',
  correction:
    'The last three words carry the meaning, and they are the ones that vanish when air runs out early.',
  redoTarget: 'Finish each sentence at the same clarity you started it. Breathe before the sentence, not during it.',
};

const VAGUE: MissionFocus = {
  id: 'vague',
  label: 'I leaned on vague intensifiers',
  correction:
    '"Very", "really" and "a lot" are placeholders for a precise word you already know.',
  redoTarget: 'Say it again with no intensifiers at all. Name the specific thing instead.',
};

const HOOK: MissionFocus = {
  id: 'hook',
  label: 'The opening did not pull anyone in',
  correction:
    'A story earns attention in the first sentence or spends the rest of it asking for attention back.',
  redoTarget: 'Open on the moment something changed. No scene-setting before it.',
};

// ─────────────────────────────────────────────────────────────────────────────
// The missions
// ─────────────────────────────────────────────────────────────────────────────

export const MISSIONS: readonly Mission[] = [
  // ── Office ────────────────────────────────────────────────────────────────
  {
    id: 'office-premature-launch',
    lane: 'office',
    laneLabel: 'Office',
    lang: 'en',
    headline: 'Explain why an AI feature launch is premature',
    brief: 'Give the evidence, name the trade-off, pause, then state your recommendation.',
    meta: ['Quiet authority', 'Use “trade-off”', '60 sec'],
    structure: 'Context → evidence → trade-off → recommendation',
    targetSec: 60,
    focus: [
      {
        id: 'recommendation',
        label: 'I never landed a clear recommendation',
        correction:
          'A stakeholder needs the decision, not the analysis. Everything before the recommendation is support for it.',
        redoTarget: 'End on one sentence starting “My recommendation is…” and stop talking after it.',
      },
      VOLUME,
      PACE,
    ],
  },
  {
    id: 'office-delay-update',
    lane: 'office',
    laneLabel: 'Office',
    lang: 'en',
    headline: 'Tell your lead the release slipped by two weeks',
    brief: 'Deliver the bad news in the first sentence. No wind-up.',
    meta: ['Firm but polite', 'No hedging', '45 sec'],
    structure: 'The news → the cause → what you are doing → what you need',
    targetSec: 45,
    focus: [
      {
        id: 'hedge',
        label: 'I softened it so much the news got lost',
        correction:
          'Hedging before bad news makes the listener brace for something worse than it is.',
        redoTarget: 'Open with the plain sentence: “The release will slip by two weeks.” Then explain.',
      },
      STRUCTURE,
      FILLER,
    ],
  },
  {
    id: 'office-disagree',
    lane: 'office',
    laneLabel: 'Office',
    lang: 'en',
    headline: 'Disagree with a senior colleague’s approach',
    brief: 'Keep the relationship and keep the position. Both are the job.',
    meta: ['Composure', 'Disagree without conceding', '60 sec'],
    structure: 'Agree with the goal → name the risk → offer the alternative',
    targetSec: 60,
    focus: [
      VOLUME,
      {
        id: 'apologise',
        label: 'I apologised my way through it',
        correction:
          'Repeated apology reads as a request to be overruled, and usually gets one.',
        redoTarget: 'Say it again with no apology anywhere. State the risk as a fact, not an imposition.',
      },
      PACE,
    ],
  },
  {
    id: 'office-status-update',
    lane: 'office',
    laneLabel: 'Office',
    lang: 'en',
    headline: 'Give a 45-second product status update',
    brief: 'Someone who missed two weeks should be current by the end of it.',
    meta: ['Concise', 'No jargon padding', '45 sec'],
    structure: 'Where we are → what changed → what is next → risk',
    targetSec: 45,
    focus: [STRUCTURE, PACE, FILLER],
  },

  // ── Incident ──────────────────────────────────────────────────────────────
  {
    id: 'incident-confusing-work',
    lane: 'incident',
    laneLabel: 'Incident',
    lang: 'en',
    headline: 'Tell a friend about a confusing incident at work',
    brief: 'Not a report — a story. They should feel the confusion you felt.',
    meta: ['Conversational', 'Friend, not colleague', '60 sec'],
    structure: 'What you expected → what actually happened → why it threw you',
    targetSec: 60,
    focus: [HOOK, STRUCTURE, PACE],
  },
  {
    id: 'incident-misunderstood',
    lane: 'incident',
    laneLabel: 'Incident',
    lang: 'en',
    headline: 'Describe a time you were misunderstood',
    brief: 'Give both sides fairly, including the part where you were unclear.',
    meta: ['Even-handed', 'Specific detail', '60 sec'],
    structure: 'The setup → what you said → what they heard → what you know now',
    targetSec: 60,
    focus: [WORDS, STRUCTURE, ENDINGS],
  },
  {
    id: 'incident-small-thing',
    lane: 'incident',
    laneLabel: 'Incident',
    lang: 'en',
    headline: 'Tell the smallest interesting thing that happened today',
    brief: 'Ordinary material, told well. This is the everyday rep.',
    meta: ['Light', 'Concrete detail', '45 sec'],
    structure: 'One moment → one detail → why it stayed with you',
    targetSec: 45,
    focus: [HOOK, VAGUE, PACE],
  },

  // ── Feelings ──────────────────────────────────────────────────────────────
  {
    id: 'feelings-disappointment',
    lane: 'feelings',
    laneLabel: 'Feelings',
    lang: 'en',
    headline: 'Explain disappointment without saying “very upset”',
    brief: 'Name the feeling precisely, then the thing that caused it.',
    meta: ['No intensifiers', 'Precision', '45 sec'],
    structure: 'The feeling named → what caused it → what you wanted instead',
    targetSec: 45,
    focus: [VAGUE, WORDS, PACE],
  },
  {
    id: 'feelings-frustration-calm',
    lane: 'feelings',
    laneLabel: 'Feelings',
    lang: 'en',
    headline: 'Say you are frustrated, calmly',
    brief: 'The content is frustration. The delivery is not.',
    meta: ['Quiet register', 'Content vs delivery', '45 sec'],
    structure: 'What happened → the effect on you → what would help',
    targetSec: 45,
    focus: [VOLUME, VAGUE, ENDINGS],
  },
  {
    id: 'feelings-appreciation',
    lane: 'feelings',
    laneLabel: 'Feelings',
    lang: 'en',
    headline: 'Tell someone specifically why their help mattered',
    brief: 'Generic thanks lands as politeness. Specific thanks lands as meaning.',
    meta: ['Warmth', 'Specific', '30 sec'],
    structure: 'What they did → what it changed → what it meant',
    targetSec: 30,
    focus: [VAGUE, WORDS, HOOK],
  },

  // ── Teach-back ────────────────────────────────────────────────────────────
  {
    id: 'teachback-geopolitics',
    lane: 'teachback',
    laneLabel: 'Teach-back',
    lang: 'en',
    headline: 'Teach back a geopolitical event in 60 seconds',
    brief: 'Pick something you read this week. Explain it to someone who did not.',
    meta: ['Structured', 'No jargon', '60 sec'],
    structure: 'What happened → why now → who it affects → what to watch',
    targetSec: 60,
    focus: [STRUCTURE, PACE, WORDS],
  },
  {
    id: 'teachback-ai-concept',
    lane: 'teachback',
    laneLabel: 'Teach-back',
    lang: 'en',
    headline: 'Explain one AI concept to a non-technical colleague',
    brief: 'No analogies you have not tested. If it needs a diagram, it needs a better sentence.',
    meta: ['Plain language', 'Consulting register', '60 sec'],
    structure: 'The problem it solves → how it works → the limit',
    targetSec: 60,
    focus: [
      {
        id: 'jargon',
        label: 'I hid behind jargon',
        correction:
          'A term you cannot unpack on demand is a term the listener has to take on trust.',
        redoTarget: 'Run it again with no technical terms at all. Ordinary words only.',
      },
      STRUCTURE,
      PACE,
    ],
  },
  {
    id: 'teachback-philosophy',
    lane: 'teachback',
    laneLabel: 'Teach-back',
    lang: 'en',
    headline: 'Explain an idea from philosophy or psychology you find useful',
    brief: 'Explain why it changed how you think, not just what it says.',
    meta: ['Thought leadership', 'One idea only', '60 sec'],
    structure: 'The idea → an example → how you use it',
    targetSec: 60,
    focus: [STRUCTURE, WORDS, ENDINGS],
  },

  // ── Life story ────────────────────────────────────────────────────────────
  {
    id: 'lifestory-turning-point',
    lane: 'lifestory',
    laneLabel: 'Life story',
    lang: 'en',
    headline: 'Tell a turning point using Hook → Context → Turn → Landing',
    brief: 'One decision that changed the direction of something.',
    meta: ['Narrative', 'Four beats', '90 sec'],
    structure: 'Hook → Context → Turn → Landing',
    targetSec: 90,
    focus: [HOOK, STRUCTURE, PACE],
  },
  {
    id: 'lifestory-tell-me-about-yourself',
    lane: 'lifestory',
    laneLabel: 'Life story',
    lang: 'en',
    headline: 'Answer “tell me about yourself” in 60 seconds',
    brief: 'The version you would give in an interview, not a résumé recital.',
    meta: ['Composed', 'One thread', '60 sec'],
    structure: 'Where you started → what you chose → what you do now → where it points',
    targetSec: 60,
    focus: [STRUCTURE, PACE, ENDINGS],
  },

  // ── Tone ──────────────────────────────────────────────────────────────────
  {
    id: 'tone-same-line-three-ways',
    lane: 'tone',
    laneLabel: 'Tone',
    lang: 'en',
    headline: 'Say “We need to talk about the timeline” three ways',
    brief: 'Neutral, then warm, then firm-but-polite. Same words each time.',
    meta: ['Same words', 'Three tones', '45 sec'],
    structure: 'Neutral → warm → firm but polite',
    targetSec: 45,
    focus: [
      {
        id: 'sameness',
        label: 'All three sounded the same',
        correction:
          'Tone lives in pace and pitch, not volume. If volume is the only thing that moved, the tones collapse together.',
        redoTarget: 'Change only your speed and where you pause. Keep the volume identical across all three.',
      },
      VOLUME,
      PACE,
    ],
  },
  {
    id: 'tone-reassuring',
    lane: 'tone',
    laneLabel: 'Tone',
    lang: 'en',
    headline: 'Reassure someone whose work just got cut',
    brief: 'Warmth without false comfort. Do not promise anything.',
    meta: ['Warm', 'Honest', '45 sec'],
    structure: 'Acknowledge → be honest → what happens next',
    targetSec: 45,
    focus: [PACE, VAGUE, VOLUME],
  },

  // ── English vocabulary ────────────────────────────────────────────────────
  {
    id: 'vocab-en-precise-swap',
    lane: 'vocab_en',
    laneLabel: 'English vocabulary',
    lang: 'en',
    headline: 'Use “premature”, “trade-off” and “nuance” in your own sentences',
    brief: 'Not definitions — sentences you would actually say at work this week.',
    meta: ['Retrieval', 'Three words', '45 sec'],
    structure: 'One natural sentence per word, spoken not read',
    targetSec: 45,
    focus: [WORDS, VAGUE, PACE],
  },
  {
    id: 'vocab-en-kill-intensifiers',
    lane: 'vocab_en',
    laneLabel: 'English vocabulary',
    lang: 'en',
    headline: 'Describe your day with no “very”, “really” or “a lot”',
    brief: 'Every intensifier is a precise word you did not reach for.',
    meta: ['Precision', 'Banned words', '45 sec'],
    structure: 'Three sentences about today, none of them padded',
    targetSec: 45,
    focus: [VAGUE, WORDS, ENDINGS],
  },

  // ── Hindi vocabulary ──────────────────────────────────────────────────────
  {
    id: 'vocab-hi-everyday',
    lane: 'vocab_hi',
    laneLabel: 'Hindi vocabulary',
    lang: 'hi',
    headline: 'उलझन, टालमटोल और सहूलियत — तीनों को अपने वाक्य में बोलिए',
    brief: 'Conversational Hindi, the way you would actually speak it — not textbook Hindi.',
    meta: ['Practical Hindi', 'Spoken, not read', '45 sec'],
    structure: 'One natural sentence per word, out loud',
    targetSec: 45,
    focus: [
      {
        id: 'formal-hindi',
        label: 'It came out sounding like a textbook',
        correction:
          'Formal Hindi is a register nobody uses in conversation, and it makes an ordinary sentence sound rehearsed.',
        redoTarget: 'Say it again the way you would to a friend. Mix in English where you naturally would.',
      },
      WORDS,
      PACE,
    ],
  },
  {
    id: 'vocab-hi-explain-day',
    lane: 'vocab_hi',
    laneLabel: 'Hindi vocabulary',
    lang: 'hi',
    headline: 'आज का दिन हिंदी में सुनाइए',
    brief: 'Tell today in Hindi. Switch to English only where you genuinely would.',
    meta: ['Practical Hindi', 'Everyday register', '45 sec'],
    structure: 'What happened → how it went → what is next',
    targetSec: 45,
    focus: [WORDS, PACE, ENDINGS],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────────────

export const LANES: readonly { lane: MissionLane; label: string; detail: string }[] = [
  { lane: 'incident', label: 'Incident', detail: 'Tell what happened and why it mattered' },
  { lane: 'office', label: 'Office', detail: 'Update, disagree, persuade or recommend' },
  { lane: 'feelings', label: 'Feelings', detail: 'Explain disappointment without saying “very upset”' },
  { lane: 'teachback', label: 'Teach-back', detail: 'Explain a geopolitical event in 60 seconds' },
  { lane: 'lifestory', label: 'Life story', detail: 'Hook → Context → Turn → Landing' },
  { lane: 'tone', label: 'Tone', detail: 'Firm-but-polite without getting louder' },
  { lane: 'vocab_en', label: 'English vocabulary', detail: 'Retrieve and use precise words naturally' },
  { lane: 'vocab_hi', label: 'Hindi vocabulary', detail: 'Practical conversational sentence usage' },
];

export function missionsForLane(lane: MissionLane): Mission[] {
  return MISSIONS.filter((mission) => mission.lane === lane);
}

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}

/** Stable per-day index so the same day always offers the same thing. */
function dayIndex(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * A mission inside a lane, rotated by date so repeated visits on the same day
 * are consistent but tomorrow is different. `seen` pushes past what he has
 * already recorded today, so a second session is never the same prompt again.
 */
export function pickMission(lane: MissionLane, dateKey: string, seen: string[] = []): Mission {
  const pool = missionsForLane(lane);
  if (pool.length === 0) return MISSIONS[0]!;
  const start = dayIndex(dateKey) % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(start + offset) % pool.length]!;
    if (!seen.includes(candidate.id)) return candidate;
  }
  return pool[start]!;
}

/**
 * The lane Today recommends. Rotates across the eight lanes by date so the
 * headline mission is a different kind of speaking every day — the whole point
 * of "balanced daily practice, rotating emphasis" (PRODUCT-RESET-PLAN §4).
 */
export function recommendedLane(dateKey: string): MissionLane {
  return LANES[dayIndex(dateKey) % LANES.length]!.lane;
}
