import { describe, expect, it } from 'vitest';
import {
  calculateRms,
  classifyVolumeBand,
  dbToPercent,
  rmsToDb,
  DEFAULT_TARGET_BAND,
} from './audioMeter';

describe('audioMeter math engine', () => {
  it('calculates RMS correctly for silence and constant signals', () => {
    const silence = new Float32Array([0, 0, 0, 0]);
    expect(calculateRms(silence)).toBe(0);

    const constantSignal = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(calculateRms(constantSignal)).toBeCloseTo(0.5);
  });

  it('converts RMS to dB correctly', () => {
    expect(rmsToDb(0)).toBe(-60);
    expect(rmsToDb(1.0)).toBeCloseTo(0, 1);
    expect(rmsToDb(0.1)).toBeCloseTo(-20, 1);
  });

  it('maps dB values to percentages correctly', () => {
    expect(dbToPercent(-60)).toBe(0);
    expect(dbToPercent(0)).toBe(100);
    expect(dbToPercent(-30)).toBe(50);
  });

  it('classifies volume levels into target bands', () => {
    expect(classifyVolumeBand(-45, DEFAULT_TARGET_BAND)).toBe('low');
    expect(classifyVolumeBand(-20, DEFAULT_TARGET_BAND)).toBe('target');
    expect(classifyVolumeBand(-5, DEFAULT_TARGET_BAND)).toBe('high');
  });
});
