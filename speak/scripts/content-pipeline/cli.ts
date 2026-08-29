import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Card } from '../../src/types/contract';
import type { CandidateCard } from './types';
import { validateCardSchema, DuplicateDetector } from './validator';
import { runColdVerification } from './coldVerifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SEED_DIR = path.resolve(PROJECT_ROOT, 'src/content/seed');
const STAGING_DIR = path.resolve(PROJECT_ROOT, 'src/content/staging');
const PUBLIC_DIR = path.resolve(PROJECT_ROOT, 'public');

export function loadExistingSeedCards(): Card[] {
  const cards: Card[] = [];
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(SEED_DIR, file), 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (parsed.cards || []);
      for (const item of list) {
        cards.push(item as Card);
      }
    } catch (err) {
      console.error(`Error reading seed file ${file}:`, err);
    }
  }
  return cards;
}

export function processCandidates(candidates: CandidateCard[]): {
  processed: CandidateCard[];
  reportMarkdown: string;
} {
  const existingCards = loadExistingSeedCards();
  const duplicateDetector = new DuplicateDetector();

  // Index existing seed cards
  for (const c of existingCards) {
    duplicateDetector.indexCard(c, 'seed');
  }

  const processed: CandidateCard[] = [];
  let validCount = 0;
  let coldPassCount = 0;
  let duplicateCount = 0;

  const rows: string[] = [];

  for (const candidate of candidates) {
    const card = candidate.data;
    const schemaResult = validateCardSchema(card, PUBLIC_DIR);
    const duplicateReport = duplicateDetector.checkDuplicates(candidate);
    const coldResult = runColdVerification(candidate);

    const issues: string[] = [];
    if (!schemaResult.valid) {
      issues.push(...schemaResult.issues.map((i) => `[Schema] ${i.field}: ${i.message}`));
    }
    if (duplicateReport.duplicateFound) {
      duplicateCount++;
      issues.push(...duplicateReport.conflicts.map((c) => `[Duplicate] Matched existing ${c.existingSource} card "${c.existingId}" on ${c.field}`));
    }
    if (!coldResult.passed) {
      issues.push(...coldResult.flags.map((f) => `[Cold Verifier] ${f}`));
    }

    if (schemaResult.valid && !duplicateReport.duplicateFound) {
      validCount++;
      duplicateDetector.indexCard(card, 'candidate');
    }
    if (coldResult.passed) {
      coldPassCount++;
    }

    const isApproved = schemaResult.valid && !duplicateReport.duplicateFound && coldResult.passed;
    const updatedCandidate: CandidateCard = {
      ...candidate,
      status: isApproved ? 'approved' : 'rejected',
      rejectionReason: issues.length > 0 ? issues.join('; ') : undefined,
      verifierNotes: coldResult.notes.join('; '),
    };

    processed.push(updatedCandidate);

    const statusEmoji = isApproved ? '✅ APPROVED' : '❌ REJECTED';
    let snippet = '';
    if (card.type === 'phrase') snippet = `"${card.weak}" ➔ "${card.strong}"`;
    else if (card.type === 'feeling') snippet = `**${card.term}** — ${card.meaning.slice(0, 60)}…`;
    else if (card.type === 'story_move') snippet = `**${card.move}** — ${card.why.slice(0, 60)}…`;
    else if (card.type === 'describe') snippet = `🎬 "${card.prompt.slice(0, 60)}…" (${card.targetVocab.join(', ')})`;
    else if (card.type === 'explain') snippet = `💡 **${card.topic}**: ${card.angle.slice(0, 60)}…`;
    else if (card.type === 'teach_back') snippet = `🎓 "${card.prompt.slice(0, 60)}…"`;
    else if (card.type === 'word') snippet = `📖 **${card.term}** (${card.lang}): ${card.meaning.slice(0, 50)}…`;
    else snippet = `${card.type}: ${card.id}`;

    rows.push(
      `| \`${card.id}\` | \`${card.type}\` | ${snippet} | \`${candidate.batchId}\` | ${statusEmoji} | ${issues.length > 0 ? issues.join('<br>') : 'All quality gates passed'} |`
    );
  }

  const reportMarkdown = `# Candidate Content Staging Review Report
Generated on: ${new Date().toISOString()}

## Pipeline Summary
- **Total Candidates Staged:** ${candidates.length}
- **Schema Valid & Unique:** ${validCount}
- **Cold Verification Passed:** ${coldPassCount}
- **Duplicates Blocked:** ${duplicateCount}
- **Approved for Seed Promotion:** ${processed.filter((c) => c.status === 'approved').length}
- **Rejected:** ${processed.filter((c) => c.status === 'rejected').length}

---

## Candidate Verification Table

| ID | Type | Content Snippet | Batch ID | Status | Reviewer / Verifier Notes |
|---|---|---|---|---|---|
${rows.join('\n')}

---

## Promotion Checklist
- [x] All cards staged in \`CandidateCard\` format
- [x] Schema & required fields strictly validated
- [x] Normalized duplicate detection verified across existing seed library
- [x] Spoken cadence & natural Indian corporate / social register checked
- [x] Image asset existence verified for local image prompts
- [x] Batch IDs preserved for batch retirement capability
`;

  return { processed, reportMarkdown };
}

export function promoteApprovedCandidatesToSeeds(candidates: CandidateCard[]): {
  promotedCount: number;
  promotedByType: Record<string, number>;
} {
  const approved = candidates.filter((c) => c.status === 'approved');
  const typeFileMap: Record<string, string> = {
    phrase: '17-phrases.json',
    feeling: '18-feelings.json',
    story_move: '19-story-moves.json',
    describe: '21-describe.json',
    explain: '22-explain.json',
    teach_back: '23-teach-backs.json',
    word: '10-words-en.json',
  };

  const promotedByType: Record<string, number> = {};

  // Group approved cards by target file
  const byFile = new Map<string, Card[]>();

  for (const candidate of approved) {
    const card = {
      ...candidate.data,
      batchId: candidate.batchId,
      source: 'seed' as const,
      status: 'active' as const,
      createdAt: candidate.createdAt || Date.now(),
    };

    let targetFile = typeFileMap[card.type];
    if (card.lang === 'hi') {
      targetFile = '20-hindi.json';
    }

    if (!targetFile) continue;

    const list = byFile.get(targetFile) || [];
    list.push(card);
    byFile.set(targetFile, list);

    promotedByType[card.type] = (promotedByType[card.type] || 0) + 1;
  }

  // Update seed files
  for (const [file, newCards] of byFile.entries()) {
    const filePath = path.join(SEED_DIR, file);
    let existingList: Card[] = [];
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existingList = parsed;
      } else if (parsed && Array.isArray(parsed.cards)) {
        existingList = parsed.cards;
      }
    }

    const existingMap = new Map<string, Card>(existingList.map((c) => [c.id, c]));
    for (const c of newCards) {
      existingMap.set(c.id, c);
    }

    const merged = Array.from(existingMap.values());
    if (file === '20-hindi.json') {
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          {
            version: 1,
            note: 'Everyday spoken Hindi, natural conversational register. The value is sentence framing.',
            cards: merged,
          },
          null,
          2
        ),
        'utf-8'
      );
    } else {
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    }
  }

  return {
    promotedCount: approved.length,
    promotedByType,
  };
}
