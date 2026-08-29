import type { Card, CardType, Lang } from '../../src/types/contract';

export type CandidateStatus = 'candidate' | 'approved' | 'rejected';

export interface CandidateCard<T extends Card = Card> {
  candidateId: string;
  batchId: string;
  status: CandidateStatus;
  rejectionReason?: string;
  verifierNotes?: string;
  data: T;
  createdAt: number;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface NormalizedIndexEntry {
  cardId: string;
  source: 'seed' | 'candidate';
  type: CardType;
  lang: Lang;
  normalizedKey: string;
  originalText: string;
}

export interface DuplicateReport {
  duplicateFound: boolean;
  conflicts: {
    candidateId: string;
    existingId: string;
    existingSource: 'seed' | 'candidate';
    field: string;
    matchedText: string;
  }[];
}

export interface ColdVerificationResult {
  passed: boolean;
  score: number; // 0 to 100
  notes: string[];
  flags: string[];
}
