/**
 * The 12-minute daily routine, from VOICE-PROFILE.md §6, as data.
 *
 * **The order is the treatment.** Release before production; semi-occluded work
 * before volume work; every drill ending in a rep that carries its feeling into
 * ordinary speech. Reordering the blocks or dropping a `transfer` step changes
 * what the session trains, so neither happens without a decision in PLAN.md.
 *
 * Cues are one line each, deliberately. The shipped breath cards used five-step
 * instruction lists that had to be scrolled, which is unreadable while you are
 * holding a breath — see `docs/known-issues.md`.
 *
 * Phase 1 measures Blocks A and B. Blocks C, D and E run as timed cues; their
 * meters arrive with M12 (Phase 2) and M16 (Phase 5) and need no change here
 * beyond flipping `metered`.
 */

import type { LabBlock, LabStep, Profile } from '../../types/contract';
import { LAB_RULES } from '../../types/contract';
import { isCalibrated } from './calibration';

/**
 * Captured **before any release work**, and that placement is not cosmetic.
 * Measured after Block B this would record the loosened voice rather than the
 * habitual one, the baseline would come out too quiet, and every target derived
 * from it would sit below anything he could reach in a real conversation.
 */
export const CALIBRATION_STEP: LabStep = {
  id: 'cal-habitual',
  block: 'A',
  title: 'Before we start',
  cue: 'Talk about your day for half a minute, at the volume you would actually use.',
  feel: 'Do not perform and do not soften it. This is measuring the habit, so the habit is what it needs.',
  durationSec: 30,
  kind: 'calibrate',
  mandatory: false,
  metered: true,
};

const BLOCK_A: LabBlock = {
  id: 'A',
  title: 'Release',
  purpose: 'Open the throat and take the work off it, before asking it to do anything.',
  module: 'M8',
  steps: [
    {
      id: 'a-yawn-sigh',
      block: 'A',
      title: 'Yawn-sigh',
      cue: 'Start a real yawn. Before it finishes, sigh out "haaah" and keep the throat that open. Six times.',
      feel: 'The larynx drops and the throat feels wide and cool. That position is the target for everything below.',
      durationSec: 45,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'a-jaw',
      block: 'A',
      title: 'Jaw release',
      cue: 'Let the jaw hang heavy. Massage the muscle at the hinge.',
      feel: 'Loose and heavy. A clamped jaw at speed is what collapses your consonants.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'a-tongue',
      block: 'A',
      title: 'Tongue forward',
      cue: 'Tip behind your lower front teeth, body low and forward.',
      feel: 'Flat and forward — not bunched back toward the throat.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'a-larynx',
      block: 'A',
      title: 'Larynx check',
      cue: 'Fingers on the front of your throat. Say one ordinary sentence.',
      feel: 'If it rides up, that is the habit showing itself. Only notice it here — do not correct it yet.',
      durationSec: 15,
      kind: 'meter',
      mandatory: false,
      metered: true,
    },
  ],
};

const BLOCK_B: LabBlock = {
  id: 'B',
  title: 'Straw work',
  purpose:
    'The one drill your own measurements already proved works on this voice — your /z/ ran 25 s.',
  module: 'M9',
  steps: [
    {
      id: 'b-straw',
      block: 'B',
      title: 'Straw phonation',
      cue: 'Hum through a narrow straw. Then glide slowly up and down your range.',
      feel: 'Almost effortless, buzzing in the lips and face. If it feels like work, you are still pushing.',
      durationSec: 120,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'b-straw-water',
      block: 'B',
      title: 'Straw into water',
      cue: 'Straw into two inches of water. Keep the bubbles steady and even.',
      feel: 'Evenness is the objective. Duration is not.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'b-transfer',
      block: 'B',
      title: 'The transfer moment',
      cue: 'Straw out. Now say one ordinary sentence with exactly that same easy feeling.',
      feel: 'This is the exercise — the straw was only the set-up. Skip this and the four minutes above changed nothing.',
      durationSec: 30,
      kind: 'transfer',
      mandatory: true,
      metered: true,
    },
  ],
};

const BLOCK_C: LabBlock = {
  id: 'C',
  title: 'Volume ladder',
  purpose: 'Build the quiet gear you do not currently have. Level 1 is voiced, never whispered.',
  module: 'M12',
  steps: [
    {
      id: 'c-descend',
      block: 'C',
      title: 'Descend the ladder',
      cue: 'One sentence at level 5, 4, 3, 2, 1 — each a deliberate step down, not a fade. Then back up.',
      durationSec: 60,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'c-hold',
      block: 'C',
      title: 'Level 1 hold',
      cue: 'Stay at level 1 — genuinely quiet, but voiced.',
      feel: 'When it breaks up, stop, reset, restart. Those break points are the coordination being built.',
      durationSec: 60,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'c-silent-room',
      block: 'C',
      title: 'Silent room',
      cue: 'Three or four sentences at level 1–2, as though to someone sitting beside you.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'c-anchor',
      block: 'C',
      title: 'Hold level 2',
      cue: 'Find level 2 and stay there across four sentences without drifting up.',
      feel: 'The drift will happen — it is the default. Noticing it is the whole skill.',
      durationSec: 30,
      kind: 'transfer',
      mandatory: true,
      metered: false,
    },
  ],
};

const BLOCK_D: LabBlock = {
  id: 'D',
  title: 'Resonance',
  purpose: 'Where perceived depth actually comes from. Never from pressing the pitch down.',
  module: 'M16',
  steps: [
    {
      id: 'd-chest-hum',
      block: 'D',
      title: 'Chest hum',
      cue: 'Palm flat on your sternum. Hum low and find where the buzz under your hand is strongest.',
      feel: 'Usually the lower third of your range. That pitch is your resonant spot.',
      durationSec: 60,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'd-hum-speech',
      block: 'D',
      title: 'Hum into speech',
      cue: 'Slide straight from that hum into a sentence, keeping the chest buzz alive through the words.',
      feel: 'This is the depth you have been trying to get by pushing your pitch down. It comes from here instead.',
      durationSec: 30,
      kind: 'transfer',
      mandatory: true,
      metered: false,
    },
    {
      id: 'd-open-throat',
      block: 'D',
      title: 'Open-throat sentence',
      cue: 'One sentence holding the yawn-sigh posture, fingers on your throat.',
      feel: 'The larynx should stay where it is.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
  ],
};

const BLOCK_E: LabBlock = {
  id: 'E',
  title: 'Prosody',
  purpose: 'Emphasis without volume — the dial you do not have yet.',
  module: 'M13',
  steps: [
    {
      id: 'e-pause',
      block: 'E',
      title: 'Pause for emphasis',
      cue: 'Pick one key word. Emphasise it by pausing before it — volume stays completely flat. Then a different word.',
      durationSec: 60,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'e-soft-onset',
      block: 'E',
      title: 'Soft onsets',
      cue: 'Start vowel words with a faint "h" before the tone. Then drop the h and keep the airy start.',
      feel: 'This is the main acoustic ingredient of sounding polite.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
    {
      id: 'e-palette',
      block: 'E',
      title: 'Two moods',
      cue: 'One sentence said warm, then the same sentence said firm. Twice each.',
      durationSec: 30,
      kind: 'guided',
      mandatory: false,
      metered: false,
    },
  ],
};

/** Blocks A–E in the only order they are run in. */
export const ROUTINE: readonly LabBlock[] = [BLOCK_A, BLOCK_B, BLOCK_C, BLOCK_D, BLOCK_E];

/**
 * The weekly maximum-phonation-time test. **Not part of the daily routine** —
 * VOICE-PROFILE.md §7 puts MPT on a weekly cadence, and taking it daily invites
 * pushing for a record, which measures effort rather than the habit.
 */
export const MPT_FLOW: readonly LabStep[] = [
  {
    id: 'mpt-habitual',
    block: 'A',
    title: 'Normal volume',
    cue: 'One comfortable breath, then hold "aaah" at your normal speaking volume, as steadily as you can.',
    feel: 'Do not push for a record. This is the number that moves — 15 s today, 25 s by week 12.',
    // A ceiling, not a target: the mic stops the clock when the note does.
    durationSec: 60,
    kind: 'mpt',
    mandatory: false,
    metered: true,
    sampleKind: 'mpt_habitual',
  },
  {
    id: 'mpt-rest',
    block: 'A',
    title: 'Rest',
    cue: 'Breathe normally for half a minute.',
    durationSec: 30,
    kind: 'guided',
    mandatory: false,
    metered: false,
  },
  {
    id: 'mpt-soft',
    block: 'A',
    title: 'Soft volume',
    cue: 'Same again, but soft — quiet and voiced, never whispered.',
    feel: 'This one is already normal at ~25 s. It is the ceiling the number above is chasing.',
    durationSec: 60,
    kind: 'mpt',
    mandatory: false,
    metered: true,
    sampleKind: 'mpt_soft',
  },
];

/**
 * The routine for this user right now — the calibration step is present only
 * while the baseline is still being built, then it disappears for good.
 */
export function buildRoutine(
  profile: Pick<Profile, 'baselineDb' | 'calibrationSamples'>,
): LabBlock[] {
  if (isCalibrated(profile)) return ROUTINE.map((b) => ({ ...b, steps: [...b.steps] }));

  return ROUTINE.map((b) =>
    b.id === 'A'
      ? { ...b, steps: [CALIBRATION_STEP, ...b.steps] }
      : { ...b, steps: [...b.steps] },
  );
}

export function flattenSteps(blocks: readonly LabBlock[]): LabStep[] {
  return blocks.flatMap((b) => b.steps);
}

export function routineSeconds(blocks: readonly LabBlock[]): number {
  return flattenSteps(blocks).reduce((s, step) => s + step.durationSec, 0);
}

/** Total mandatory steps — the number a session has to hit to count as real. */
export function mandatoryStepIds(blocks: readonly LabBlock[]): string[] {
  return flattenSteps(blocks)
    .filter((s) => s.mandatory)
    .map((s) => s.id);
}

/** Sanity guard: the canonical routine is 12 minutes and must stay so. */
export const CALIBRATED_ROUTINE_SEC = LAB_RULES.ROUTINE_SEC;
