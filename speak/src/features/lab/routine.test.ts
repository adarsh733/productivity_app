import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_STEP,
  MPT_FLOW,
  ROUTINE,
  buildRoutine,
  flattenSteps,
  mandatoryStepIds,
  routineSeconds,
} from './routine';
import { LAB_RULES } from '../../types/contract';

const calibrated = { baselineDb: -20, calibrationSamples: LAB_RULES.CALIBRATION_SESSIONS };
const fresh = {};

describe('the routine', () => {
  it('is twelve minutes once calibration is done', () => {
    expect(routineSeconds(buildRoutine(calibrated))).toBe(LAB_RULES.ROUTINE_SEC);
  });

  it('runs blocks A–E in that order and no other', () => {
    expect(ROUTINE.map((b) => b.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('puts release before straw work before volume work', () => {
    // The order is the treatment: v1 put capacity drills first, which trained
    // something the measurements had already ruled out.
    const ids = ROUTINE.map((b) => b.id);
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
  });

  it('gives every block a step and every step a cue', () => {
    for (const block of ROUTINE) {
      expect(block.steps.length).toBeGreaterThan(0);
      for (const s of block.steps) {
        expect(s.cue.length).toBeGreaterThan(0);
        expect(s.durationSec).toBeGreaterThan(0);
        expect(s.block).toBe(block.id);
      }
    }
  });

  it('keeps every cue short enough to read mid-drill', () => {
    // The shipped breath cards needed scrolling, which is unreadable while
    // holding a breath — see docs/known-issues.md.
    for (const s of flattenSteps([...ROUTINE])) {
      expect(s.cue.length, `${s.id} cue`).toBeLessThanOrEqual(140);
    }
  });

  it('has unique step ids across the whole routine and the MPT flow', () => {
    const ids = [...flattenSteps([...ROUTINE]), CALIBRATION_STEP, ...MPT_FLOW].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('transfer reps', () => {
  it('makes every transfer step mandatory', () => {
    const transfers = flattenSteps([...ROUTINE]).filter((s) => s.kind === 'transfer');
    expect(transfers.length).toBeGreaterThan(0);
    for (const s of transfers) expect(s.mandatory, s.id).toBe(true);
  });

  it('makes nothing else mandatory', () => {
    for (const s of flattenSteps([...ROUTINE])) {
      if (s.mandatory) expect(s.kind, s.id).toBe('transfer');
    }
  });

  it('ends the straw block with one, and measures it', () => {
    const b = ROUTINE.find((x) => x.id === 'B')!;
    const last = b.steps[b.steps.length - 1]!;
    expect(last.kind).toBe('transfer');
    expect(last.metered).toBe(true);
  });

  it('carries a transfer rep in every block that has a drill to transfer from', () => {
    // PLAN.md §1: straw-then-speak, ladder-then-speak, hum-then-speak.
    for (const id of ['B', 'C', 'D'] as const) {
      const block = ROUTINE.find((b) => b.id === id)!;
      expect(block.steps.some((s) => s.kind === 'transfer'), id).toBe(true);
    }
    expect(mandatoryStepIds([...ROUTINE])).toHaveLength(3);
  });
});

describe('what Phase 1 measures', () => {
  it('opens the microphone only for blocks A and B', () => {
    for (const s of flattenSteps([...ROUTINE])) {
      if (s.metered) expect(['A', 'B'], s.id).toContain(s.block);
    }
  });

  it('leaves C, D and E as timed cues until their modules ship', () => {
    for (const block of ROUTINE) {
      if (block.id === 'A' || block.id === 'B') continue;
      for (const s of block.steps) expect(s.metered, s.id).toBe(false);
    }
  });
});

describe('calibration step', () => {
  it('is present in week one and gone afterwards', () => {
    const ids = flattenSteps(buildRoutine(fresh)).map((s) => s.id);
    expect(ids).toContain(CALIBRATION_STEP.id);
    expect(flattenSteps(buildRoutine(calibrated)).map((s) => s.id)).not.toContain(
      CALIBRATION_STEP.id,
    );
  });

  it('runs before any release work, so it measures the habit', () => {
    // Measured after the straw block it would record the loosened voice, the
    // baseline would come out too quiet, and every target derived from it
    // would sit below anything reachable in a real conversation.
    const steps = flattenSteps(buildRoutine(fresh));
    expect(steps[0]!.id).toBe(CALIBRATION_STEP.id);
    expect(CALIBRATION_STEP.metered).toBe(true);
  });

  it('is not mandatory — a denied microphone must not block the routine', () => {
    expect(CALIBRATION_STEP.mandatory).toBe(false);
  });

  it('does not mutate the shared routine when it is added', () => {
    buildRoutine(fresh);
    expect(routineSeconds(buildRoutine(calibrated))).toBe(LAB_RULES.ROUTINE_SEC);
    expect(ROUTINE.find((b) => b.id === 'A')!.steps[0]!.id).not.toBe(CALIBRATION_STEP.id);
  });
});

describe('the weekly MPT flow', () => {
  it('measures habitual before soft, with a rest between', () => {
    expect(MPT_FLOW.map((s) => s.sampleKind)).toEqual([
      'mpt_habitual',
      undefined,
      'mpt_soft',
    ]);
  });

  it('is not part of the daily routine', () => {
    const daily = new Set(flattenSteps(buildRoutine(fresh)).map((s) => s.id));
    for (const s of MPT_FLOW) expect(daily.has(s.id), s.id).toBe(false);
  });

  it('meters both holds so the clock can be stopped by the microphone', () => {
    for (const s of MPT_FLOW) {
      if (s.kind === 'mpt') expect(s.metered, s.id).toBe(true);
    }
  });

  it('gives each hold a ceiling well above the twelve-week target', () => {
    for (const s of MPT_FLOW) {
      if (s.kind === 'mpt') expect(s.durationSec).toBeGreaterThan(25);
    }
  });
});
