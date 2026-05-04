import { describe, it, expect, beforeAll } from 'vitest';
import { PCS12 } from 'ultra-mega-enumerator';
import { getCyclicalMean } from './cyclicalMean';

beforeAll(async () => {
  await PCS12.init();
});

function makePCS12(pcs: number[]): PCS12 {
  return PCS12.identify(PCS12.createWithSizeAndSet(12, new Set(pcs)));
}

describe('getCyclicalMean', () => {
  it('returns null for an empty set', () => {
    expect(getCyclicalMean(makePCS12([]))).toBeNull();
  });

  it('returns the pitch class itself for a singleton set', () => {
    for (let pc = 0; pc < 12; pc++) {
      const result = getCyclicalMean(makePCS12([pc]));
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(pc, 5);
    }
  });

  it('returns null for {0, 6} (diametrically opposed pitch classes)', () => {
    expect(getCyclicalMean(makePCS12([0, 6]))).toBeNull();
  });

  it('returns null for the full chromatic aggregate (12-1)', () => {
    const all12 = Array.from({ length: 12 }, (_, i) => i);
    expect(getCyclicalMean(makePCS12(all12))).toBeNull();
  });

  it('returns a stable expected value for an asymmetric set {0, 4, 7} (C major triad)', () => {
    // C=0, E=4, G=7 — circular mean lands at 4.5, nearest note F
    const result = getCyclicalMean(makePCS12([0, 4, 7]));
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(4.5, 3);
    expect(result!.nearestNote).toBe('F');
  });
});
