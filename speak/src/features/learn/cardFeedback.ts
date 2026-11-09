import { MODULE_LABEL, type CardFeedback, type FeedbackReason, type ModuleId } from '../../types/contract';

/**
 * Generates the one-line AI reply for feedback given on a module card.
 * Example: Too easy on Words gives "Got it: Words will get harder from the next batch."
 */
export function gotItLine(
  module: ModuleId,
  input: {
    thumb?: 'up' | 'down';
    reasons: FeedbackReason[];
    comment?: string;
  },
): string {
  const name = MODULE_LABEL[module] ?? module;
  const reasons = input.reasons ?? [];

  if (reasons.includes('wrong_english')) {
    return 'Got it: Card removed and flagged for review.';
  }
  if (reasons.includes('too_easy')) {
    return `Got it: ${name} will get harder from the next batch.`;
  }
  if (reasons.includes('too_hard')) {
    return `Got it: ${name} will get easier from the next batch.`;
  }
  if (reasons.includes('confusing')) {
    return `Got it: We'll use simpler examples for ${name} from the next batch.`;
  }
  if (reasons.includes('loved')) {
    return `Got it: More like this in ${name} from the next batch.`;
  }

  if (input.comment && input.comment.trim()) {
    return `Got it: Feedback noted for the next ${name} batch.`;
  }

  if (input.thumb === 'up') {
    return `Got it: More like this in ${name} from the next batch.`;
  }
  if (input.thumb === 'down') {
    return `Got it: Fewer cards like this in ${name} from the next batch.`;
  }

  return `Got it: Feedback saved for the next ${name} batch.`;
}

/**
 * Extracts visible learned lines from feedback records for the Me screen.
 * Rows with `hidden: true` are excluded; newest first.
 */
export function learnedLines(rows: CardFeedback[]): { id: string; text: string }[] {
  return rows
    .filter((r) => !r.hidden && Boolean((r.reply && r.reply.trim()) || (r.comment && r.comment.trim())))
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((r) => ({
      id: r.id,
      text: r.reply && r.reply.trim() ? r.reply : (r.comment ?? '').trim(),
    }));
}

/**
 * Reasons in `next` that `prev` did not have. A level move or a recheck must
 * happen once per tap, not again each time the same sheet is sent.
 */
export function newReasons(prev: readonly FeedbackReason[] | undefined, next: readonly FeedbackReason[]): FeedbackReason[] {
  const had = new Set(prev ?? []);
  return [...new Set(next)].filter((r) => !had.has(r));
}
