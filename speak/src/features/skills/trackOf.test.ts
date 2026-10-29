import { describe, expect, it } from 'vitest';
import { trackChipText, trackOf, TRACK_LABELS } from './trackOf';
import type { AnyCard, SkillTag, TeachCard } from '../../types/contract';

const base = { lang: 'en', tags: [], source: 'seed', status: 'active', createdAt: 0 } as const;

function old(type: string, extra: Record<string, unknown> = {}): AnyCard {
  return { id: `x-${type}`, type, ...base, ...extra } as unknown as AnyCard;
}

describe('trackOf', () => {
  it('maps old card types to the four skills', () => {
    expect(trackOf(old('word')).track).toBe('words');
    expect(trackOf(old('idiom')).track).toBe('words');
    expect(trackOf(old('feeling')).track).toBe('words');
    expect(trackOf(old('action_verb')).track).toBe('words');
    expect(trackOf(old('swap', { weak: 'revert' }))).toMatchObject({ track: 'words', insteadOf: 'revert' });
    expect(trackOf(old('phrase', { weak: 'kindly do' })).track).toBe('clearly');
    expect(trackOf(old('story_move')).track).toBe('stories');
  });

  it('treats a situation as a Try card, track by its kind', () => {
    const t = (kind: string) => trackOf(old('situation', { kind }));
    expect(t('incident')).toMatchObject({ track: 'stories', kind: 'try' });
    expect(t('life_story').track).toBe('stories');
    expect(t('office_call').track).toBe('smalltalk');
    expect(t('feeling').track).toBe('words');
    expect(t('opinion').track).toBe('clearly');
  });

  it("uses the card's own skill when set", () => {
    const skill: SkillTag = { track: 'smalltalk', level: 2, kind: 'use' };
    expect(trackOf(old('word', { skill }))).toBe(skill);
  });

  it('reads track, level and kind straight off a teach card', () => {
    const card = {
      id: 't1', type: 'teach', ...base, track: 'stories', level: 3, kind: 'fix',
      category: 'c', title: 't', rule: 'r', examples: { work: 'w', everyday: 'e' },
      insteadOf: 'bad', analogy: 'a', tryPrompt: 'p', register: 'both',
    } as unknown as TeachCard;
    expect(trackOf(card)).toMatchObject({ track: 'stories', level: 3, kind: 'fix', work: 'w', insteadOf: 'bad' });
  });

  it('gives delivery drills to Speak clearly', () => {
    expect(trackOf(old('pronounce')).track).toBe('clearly');
    expect(trackOf(old('breath')).track).toBe('clearly');
  });

  it('writes the chip text with the level when known', () => {
    expect(trackChipText({ track: 'words', kind: 'learn' })).toBe(TRACK_LABELS.words);
    expect(trackChipText({ track: 'smalltalk', level: 2, kind: 'use' })).toBe('💬 Small talk · L2');
  });
});
