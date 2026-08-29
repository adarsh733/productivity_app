/**
 * SPEAK — SHARED INTERESTS CONTRACT
 *
 * Single source of truth for interest IDs across Onboarding (FirstRun),
 * Preferences (InterestsManager/YouScreen), and Queue weight calculation.
 */

export type InterestId =
  | 'office' // Office English (meetings, slack, pushback)
  | 'words' // Everyday words (richer vocab, less repetition)
  | 'hindi' // Practical Hindi (everyday fluency)
  | 'speaking' // Speaking with presence (pacing, projection)
  | 'storytelling' // Storytelling (structure, landing points)
  | 'ideas'; // Ideas & opinions (clarity under pressure)

export interface InterestOption {
  id: InterestId;
  label: string;
  desc: string;
  icon: string;
}

export const INTEREST_OPTIONS: readonly InterestOption[] = [
  { id: 'office', label: 'Office English', desc: 'meetings, slack, pushback', icon: '💼' },
  { id: 'words', label: 'Everyday words', desc: 'richer vocab, less repetition', icon: '📖' },
  { id: 'hindi', label: 'Practical Hindi', desc: 'everyday fluency', icon: '🇮🇳' },
  { id: 'speaking', label: 'Speaking with presence', desc: 'pacing, projection', icon: '🎙️' },
  { id: 'storytelling', label: 'Storytelling', desc: 'structure, landing points', icon: '📚' },
  { id: 'ideas', label: 'Ideas & opinions', desc: 'clarity under pressure', icon: '🧠' },
] as const;

/**
 * Clearly neutral recommended subset for fresh users.
 * Do not select every interest by default.
 */
export const DEFAULT_SELECTED_INTERESTS: readonly InterestId[] = ['office', 'words'] as const;
