import type { Card } from '../../src/types/contract';
import type { CandidateCard, ColdVerificationResult } from './types';

const BANNED_AI_CLICHES = [
  'delve',
  'tapestry',
  'testament to',
  'in conclusion',
  'it is important to remember',
  'navigate the complexities',
  'dynamic interplay',
  'holistic approach',
  'vital role',
  'foster',
  'game-changer',
  'beacon of',
  'unwavering commitment',
  'plethora',
  'multifaceted',
  'synergistic',
  'paradigm shift',
];

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

export function runColdVerification(candidate: CandidateCard): ColdVerificationResult {
  const card = candidate.data;
  const flags: string[] = [];
  const notes: string[] = [];
  let score = 100;

  // Extract all text content from the card
  const textCorpus = JSON.stringify(card).toLowerCase();

  // 1. AI Cliche Check
  for (const cliche of BANNED_AI_CLICHES) {
    if (textCorpus.includes(cliche)) {
      flags.push(`Contains AI cliché phrase: "${cliche}"`);
      score -= 25;
    }
  }

  // 2. Hindi Language & Devanagari Check
  if (card.lang === 'hi') {
    let hasDevanagari = false;
    if (card.type === 'word') {
      hasDevanagari = DEVANAGARI_REGEX.test(card.term) || card.examples.some((e) => DEVANAGARI_REGEX.test(e));
    }
    if (!hasDevanagari) {
      flags.push('Hindi card is missing natural Devanagari script');
      score -= 40;
    } else {
      notes.push('Verified Devanagari script presence');
    }
  }

  // 3. Cadence and Natural Spoken Checks
  if (card.type === 'phrase') {
    if (card.weak.length < 5 || card.strong.length < 5) {
      flags.push('Phrase card contains overly brief or incomplete phrases');
      score -= 20;
    }
    if (card.why.length > 250) {
      flags.push('Phrase why explanation is overly verbose (should be 1-2 concise sentences)');
      score -= 15;
    }
  }

  if (card.type === 'feeling') {
    if (!card.contrast || card.contrast.length < 15) {
      flags.push('Feeling card contrast is too sparse to distinguish emotional nuances');
      score -= 20;
    }
  }

  if (card.type === 'story_move') {
    if (!card.example || card.example.length < 20) {
      flags.push('Story move example is too short to illustrate narrative execution');
      score -= 20;
    }
  }

  if (card.type === 'describe') {
    if (card.targetVocab.length < 3) {
      flags.push('Describe prompt must provide at least 3 target sensory vocabulary words');
      score -= 20;
    }
    if (card.beats.length !== 3) {
      flags.push('Describe prompt must define exactly 3 story beats');
      score -= 30;
    }
  }

  if (card.type === 'explain') {
    if (!card.angle || card.angle.length < 15) {
      flags.push('Explain prompt angle is too vague');
      score -= 20;
    }
  }

  if (card.type === 'teach_back') {
    if (!card.prompt || card.prompt.length < 20) {
      flags.push('Teach-back prompt is too brief');
      score -= 20;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 70 && flags.length === 0;

  if (passed) {
    notes.push('Passed cold linguistic quality pass with natural conversational register');
  }

  return {
    passed,
    score,
    notes,
    flags,
  };
}
