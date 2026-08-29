import { describe, expect, it } from 'vitest';
import { getTypeMultiplier } from '../../srs/queue';
import { applyCardCompletion, emptyDay, isDayComplete, isPass } from '../session/day';

describe('useFeed State Machine & Logic', () => {
  it('emptyDay initializes day record with 0 completed cards, 0 spoken reps, and 0 XP', () => {
    const day = emptyDay('2026-08-20');
    expect(day.date).toBe('2026-08-20');
    expect(day.cardsCompleted).toBe(0);
    expect(day.spokenReps).toBe(0);
    expect(day.xp).toBe(0);
    expect(day.coreThreeDone).toBe(false);
  });

  it('isPass correctly determines whether grade is a pass (hard, good, easy) or fail (again)', () => {
    expect(isPass('again')).toBe(false);
    expect(isPass('hard')).toBe(true);
    expect(isPass('good')).toBe(true);
    expect(isPass('easy')).toBe(true);
  });

  it('Silently viewing a feed card for 10 seconds does not increment spokenReps', () => {
    const day = emptyDay('2026-08-26');
    const updated = applyCardCompletion(day, { msSpent: 10000 });
    expect(updated.spokenReps).toBe(0);
    expect(updated.cardsCompleted).toBe(1);
    expect(updated.secondsActive).toBe(10);
    expect(updated.xp).toBe(1);
  });

  it('Four silent cards do not complete the day', () => {
    let day = emptyDay('2026-08-26');
    for (let i = 0; i < 4; i++) {
      day = applyCardCompletion(day, { msSpent: 5000 });
    }
    expect(day.cardsCompleted).toBe(4);
    expect(day.spokenReps).toBe(0);
    expect(isDayComplete(day)).toBe(false);
    expect(day.coreThreeDone).toBe(false);
  });

  it('Five silent cards complete the day', () => {
    let day = emptyDay('2026-08-26');
    for (let i = 0; i < 5; i++) {
      day = applyCardCompletion(day, { msSpent: 3000 });
    }
    expect(day.cardsCompleted).toBe(5);
    expect(day.spokenReps).toBe(0);
    expect(isDayComplete(day)).toBe(true);
    expect(day.coreThreeDone).toBe(true);
  });

  it('getTypeMultiplier calculates multipliers based on typeWeights and interests with floor at 0.15', () => {
    expect(getTypeMultiplier('word')).toBe(1.0);
    expect(getTypeMultiplier('swap', [], { swap: 0.3 })).toBeCloseTo(0.3, 2);
    expect(getTypeMultiplier('swap', [], { swap: 0.001 })).toBe(0.15);

    expect(getTypeMultiplier('idiom', ['Office English'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('phrase', ['office'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('swap', ['💼 Office English'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('word', ['Office English'])).toBe(1.0);

    expect(getTypeMultiplier('word', ['Everyday words'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('pronounce', ['words'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('say_it', ['speaking'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('pronounce', ['🎙️ Speaking'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('story_move', ['Storytelling'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('action_verb', ['story'])).toBeCloseTo(1.6, 1);

    expect(getTypeMultiplier('feeling', ['Ideas & opinions'])).toBeCloseTo(1.6, 1);
    expect(getTypeMultiplier('phrase', ['🧠 Ideas & opinions'])).toBeCloseTo(1.6, 1);
  });
});

