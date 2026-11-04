import { describe, expect, it } from 'vitest';
import { evaluatePolynomial, formatPolynomial, generatePolynomialScale, randomPolynomialScale } from './polynomialScales';

describe('polynomial scale generation', () => {
    it('obtains C major and C major pentatonic from fifth chains', () => {
        const major = generatePolynomialScale([5, 7], 7);
        expect(major.prefix).toEqual([5, 0, 7, 2, 9, 4, 11]);
        expect(major.pitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11]);
        expect(major.steps).toEqual([2, 2, 1, 2, 2, 2, 1]);
        expect(major.isPermutation).toBe(true);
        expect(generatePolynomialScale([0, 7], 5).pitchClasses).toEqual([0, 2, 4, 7, 9]);
    });

    it('keeps a valid cubic prefix while detecting the later collision', () => {
        const scale = generatePolynomialScale([0, 1, 3, 1], 7);
        expect(scale.prefix).toEqual([0, 5, 10, 9, 8, 1, 6]);
        expect(scale.pitchClasses).toEqual([0, 1, 5, 6, 8, 9, 10]);
        expect(scale.isDistinctPrefix).toBe(true);
        expect(scale.isPermutation).toBe(false);
        expect(scale.firstRepeatIndex).toBe(7);
        expect(scale.affineEquivalent).toBeNull();
        expect(generatePolynomialScale([0, 1, 3, 1], 8).isDistinctPrefix).toBe(false);
    });

    it('counts repeated outputs once without losing generation order', () => {
        const wholeTone = generatePolynomialScale([0, 2], 7);
        expect(wholeTone.prefix).toEqual([0, 2, 4, 6, 8, 10, 0]);
        expect(wholeTone.pitchClasses).toEqual([0, 2, 4, 6, 8, 10]);
        expect(wholeTone.isDistinctPrefix).toBe(false);
        expect(wholeTone.firstRepeatIndex).toBe(6);
        expect(generatePolynomialScale([0], 1).steps).toEqual([12]);
    });

    it('recognizes a nonlinear expression for the same fifth-chain permutation', () => {
        const quadratic = generatePolynomialScale([0, 1, 6], 12);
        expect(quadratic.sequence).toEqual(generatePolynomialScale([0, 7], 12).sequence);
        expect(quadratic.affineEquivalent).toEqual({ multiplier: 7, offset: 0 });
    });

    it('evaluates negative and large integer coefficients without overflow', () => {
        expect(evaluatePolynomial([-1, -7], 1)).toBe(4);
        expect(evaluatePolynomial([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], 11)).toBe(0);
        expect(evaluatePolynomial([0, 0, 0, 0, 0, 0, -1], 11)).toBe(11);
    });

    it('rejects fractional, missing, and nonfinite inputs', () => {
        for (const coefficients of [[], [1.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1]]) {
            expect(() => generatePolynomialScale(coefficients, 7)).toThrow();
        }
        for (const count of [0, 13, 2.5, NaN]) {
            expect(() => generatePolynomialScale([0, 7], count)).toThrow();
        }
    });

    it('supplies distinct random prefixes in both modes at every supported degree and size', () => {
        let seed = 421;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        for (let degree = 1; degree <= 6; degree += 1) {
            for (let count = 1; count <= 12; count += 1) {
                for (const requirePermutation of [false, true]) {
                    const coefficients = randomPolynomialScale(degree, count, requirePermutation, random);
                    const scale = generatePolynomialScale(coefficients, count);
                    expect(coefficients[degree]).not.toBe(0);
                    expect(scale.isDistinctPrefix).toBe(true);
                    if (requirePermutation) expect(scale.isPermutation).toBe(true);
                }
            }
        }
    });

    it('still returns a full permutation when random attempts repeatedly collide', () => {
        for (let degree = 1; degree <= 6; degree += 1) {
            expect(generatePolynomialScale(randomPolynomialScale(degree, 12, true, () => 0), 12).isPermutation).toBe(true);
        }
    });
});

describe('polynomial labels', () => {
    it('writes sparse and signed expressions in descending powers', () => {
        expect(formatPolynomial([0, 1, 3, 1])).toBe('x³ + 3x² + x');
        expect(formatPolynomial([-5, -1, 0, 1])).toBe('x³ − x − 5');
        expect(formatPolynomial([0, 0])).toBe('0');
    });
});
