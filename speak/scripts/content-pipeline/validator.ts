import fs from 'fs';
import path from 'path';
import type { Card, CardType } from '../../src/types/contract';
import type { CandidateCard, DuplicateReport, ValidationIssue, ValidationResult } from './types';

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s\u0900-\u097F]/g, ' ') // Preserve alphanumeric and Devanagari Unicode
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUIRED_FIELDS: Record<CardType, string[]> = {
  word: ['term', 'pos', 'meaning', 'examples', 'say'],
  swap: ['weak', 'answers', 'timerSec'],
  idiom: ['phrase', 'meaning', 'scenario', 'example', 'corporate'],
  action_verb: ['verb', 'meaning', 'contrast', 'examples'],
  pronounce: ['term', 'syllables', 'stressIndex'],
  say_it: ['line', 'marked', 'targetWpm'],
  breath: ['drill', 'title', 'instructions', 'logUnit'],
  phrase: ['weak', 'strong', 'why', 'register'],
  feeling: ['term', 'meaning', 'contrast', 'example'],
  story_move: ['move', 'why', 'example'],
  describe: ['prompt', 'beats', 'targetVocab', 'targetSec'],
  explain: ['topic', 'angle', 'beats', 'targetVocab', 'targetSec'],
  teach_back: ['prompt', 'beats', 'targetSec'],
};

export function validateCardSchema(card: Card, publicDir?: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!card.id || typeof card.id !== 'string' || card.id.trim() === '') {
    issues.push({ field: 'id', message: 'Card ID is missing or empty', severity: 'error' });
  }

  if (!card.type || !(card.type in REQUIRED_FIELDS)) {
    issues.push({ field: 'type', message: `Unknown or invalid card type: ${String(card.type)}`, severity: 'error' });
    return { valid: false, issues };
  }

  const req = REQUIRED_FIELDS[card.type];
  const obj = card as unknown as Record<string, unknown>;

  for (const field of req) {
    if (obj[field] === undefined || obj[field] === null) {
      issues.push({ field, message: `Missing required field '${field}' for type '${card.type}'`, severity: 'error' });
    }
  }

  // Language check
  if (card.lang && card.lang !== 'en' && card.lang !== 'hi') {
    issues.push({ field: 'lang', message: `Invalid language '${card.lang}', must be 'en' or 'hi'`, severity: 'error' });
  }

  // Type-specific invariants
  switch (card.type) {
    case 'word':
    case 'action_verb':
      if (!Array.isArray(card.examples) || card.examples.length !== 2 || !card.examples.every((e) => typeof e === 'string' && e.trim().length > 0)) {
        issues.push({ field: 'examples', message: 'examples must be exactly two non-empty strings', severity: 'error' });
      }
      break;

    case 'swap':
      if (!Array.isArray(card.answers) || card.answers.length === 0 || !card.answers.every((a) => typeof a === 'string' && a.trim().length > 0)) {
        issues.push({ field: 'answers', message: 'answers must be a non-empty string array', severity: 'error' });
      }
      if (typeof card.timerSec !== 'number' || card.timerSec <= 0) {
        issues.push({ field: 'timerSec', message: 'timerSec must be a positive number', severity: 'error' });
      }
      break;

    case 'phrase':
      if (!card.weak || typeof card.weak !== 'string' || card.weak.trim() === '') {
        issues.push({ field: 'weak', message: 'weak phrase must be non-empty', severity: 'error' });
      }
      if (!card.strong || typeof card.strong !== 'string' || card.strong.trim() === '') {
        issues.push({ field: 'strong', message: 'strong phrase must be non-empty', severity: 'error' });
      }
      if (!card.why || typeof card.why !== 'string' || card.why.trim() === '') {
        issues.push({ field: 'why', message: 'why explanation must be non-empty', severity: 'error' });
      }
      break;

    case 'feeling':
      if (!card.term || !card.meaning || !card.contrast || !card.example) {
        issues.push({ field: 'feeling', message: 'feeling card must contain term, meaning, contrast, and example', severity: 'error' });
      }
      break;

    case 'story_move':
      if (!card.move || !card.why || !card.example) {
        issues.push({ field: 'story_move', message: 'story_move must contain move, why, and example', severity: 'error' });
      }
      break;

    case 'describe':
      if (!Array.isArray(card.beats) || card.beats.length !== 3 || !card.beats.every((b) => typeof b === 'string' && b.trim().length > 0)) {
        issues.push({ field: 'beats', message: 'beats must be an array of exactly 3 descriptive beats', severity: 'error' });
      }
      if (!Array.isArray(card.targetVocab) || card.targetVocab.length < 3 || card.targetVocab.length > 5) {
        issues.push({ field: 'targetVocab', message: 'targetVocab must contain 3 to 5 words', severity: 'error' });
      }
      if (card.imagePath && card.imagePath.trim() !== '') {
        if (publicDir) {
          const relPath = card.imagePath.replace(/^\//, '');
          const fullPath = path.resolve(publicDir, relPath);
          if (!fs.existsSync(fullPath)) {
            issues.push({ field: 'imagePath', message: `Referenced image asset does not exist on disk: ${fullPath}`, severity: 'error' });
          }
        }
        if (!card.alt || card.alt.trim() === '') {
          issues.push({ field: 'alt', message: 'Image-based describe card must have meaningful alt text', severity: 'error' });
        }
      }
      break;

    case 'explain':
      if (!card.topic || !card.angle) {
        issues.push({ field: 'explain', message: 'explain card must have topic and angle', severity: 'error' });
      }
      if (!Array.isArray(card.beats) || card.beats.length !== 3) {
        issues.push({ field: 'beats', message: 'beats must be an array of exactly 3 beats', severity: 'error' });
      }
      if (!Array.isArray(card.targetVocab) || card.targetVocab.length < 3) {
        issues.push({ field: 'targetVocab', message: 'targetVocab must contain at least 3 vocabulary targets', severity: 'error' });
      }
      break;

    case 'teach_back':
      if (!card.prompt) {
        issues.push({ field: 'prompt', message: 'teach_back card must have prompt', severity: 'error' });
      }
      if (!Array.isArray(card.beats) || card.beats.length !== 3) {
        issues.push({ field: 'beats', message: 'beats must be an array of exactly 3 beats', severity: 'error' });
      }
      break;

    case 'pronounce':
      const syllables = String(card.syllables || '').split('·');
      if (typeof card.stressIndex !== 'number' || card.stressIndex < 0 || card.stressIndex >= syllables.length) {
        issues.push({ field: 'stressIndex', message: 'stressIndex out of range for syllables', severity: 'error' });
      }
      break;
  }

  const valid = issues.every((i) => i.severity !== 'error');
  return { valid, issues };
}

export class DuplicateDetector {
  private keyMap = new Map<string, { id: string; source: 'seed' | 'candidate'; field: string; original: string }>();

  public indexCard(card: Card, source: 'seed' | 'candidate'): void {
    const addKey = (field: string, text: string) => {
      const norm = normalizeText(text);
      if (!norm || norm.length < 3) return;
      const compositeKey = `${card.type}:${norm}`;
      if (!this.keyMap.has(compositeKey)) {
        this.keyMap.set(compositeKey, { id: card.id, source, field, original: text });
      }
    };

    switch (card.type) {
      case 'word':
      case 'pronounce':
      case 'feeling':
        addKey('term', card.term);
        break;
      case 'action_verb':
        addKey('verb', card.verb);
        break;
      case 'idiom':
        addKey('phrase', card.phrase);
        break;
      case 'swap':
        addKey('weak', card.weak);
        for (const ans of card.answers) addKey('answer', ans);
        break;
      case 'phrase':
        addKey('weak_strong', `${card.weak} -> ${card.strong}`);
        addKey('weak', card.weak);
        break;
      case 'story_move':
        addKey('move', card.move);
        break;
      case 'describe':
        addKey('prompt', card.prompt);
        break;
      case 'explain':
        addKey('topic_angle', `${card.topic} : ${card.angle}`);
        addKey('topic', card.topic);
        break;
      case 'teach_back':
        addKey('prompt', card.prompt);
        break;
      case 'say_it':
        addKey('line', card.line);
        break;
    }
  }

  public checkDuplicates(candidate: CandidateCard): DuplicateReport {
    const card = candidate.data;
    const conflicts: DuplicateReport['conflicts'] = [];

    const testKey = (field: string, text: string) => {
      const norm = normalizeText(text);
      if (!norm || norm.length < 3) return;
      const compositeKey = `${card.type}:${norm}`;
      const existing = this.keyMap.get(compositeKey);
      if (existing && existing.id !== card.id) {
        conflicts.push({
          candidateId: candidate.candidateId,
          existingId: existing.id,
          existingSource: existing.source,
          field,
          matchedText: existing.original,
        });
      }
    };

    switch (card.type) {
      case 'word':
      case 'pronounce':
      case 'feeling':
        testKey('term', card.term);
        break;
      case 'action_verb':
        testKey('verb', card.verb);
        break;
      case 'idiom':
        testKey('phrase', card.phrase);
        break;
      case 'swap':
        testKey('weak', card.weak);
        for (const ans of card.answers) testKey('answer', ans);
        break;
      case 'phrase':
        testKey('weak_strong', `${card.weak} -> ${card.strong}`);
        testKey('weak', card.weak);
        break;
      case 'story_move':
        testKey('move', card.move);
        break;
      case 'describe':
        testKey('prompt', card.prompt);
        break;
      case 'explain':
        testKey('topic_angle', `${card.topic} : ${card.angle}`);
        testKey('topic', card.topic);
        break;
      case 'teach_back':
        testKey('prompt', card.prompt);
        break;
      case 'say_it':
        testKey('line', card.line);
        break;
    }

    return {
      duplicateFound: conflicts.length > 0,
      conflicts,
    };
  }
}
