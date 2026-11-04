export const PITCH_CLASS_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export interface PolynomialScale {
    sequence: number[];
    prefix: number[];
    pitchClasses: number[];
    firstRepeatIndex: number | null;
    isDistinctPrefix: boolean;
    isPermutation: boolean;
    affineEquivalent: { multiplier: number; offset: number } | null;
    steps: number[];
}

export const POLYNOMIAL_PRESETS = [
    { id: 'major', name: 'C major', caption: 'A chain of fifths', coefficients: [5, 7], count: 7 },
    { id: 'pentatonic', name: 'Pentatonic', caption: 'Five notes, open space', coefficients: [0, 7], count: 5 },
    { id: 'whole-tone', name: 'Whole tone', caption: 'Six equal steps', coefficients: [0, 2], count: 6 },
    { id: 'cubic', name: 'Cubic bloom', caption: 'Beyond a full permutation', coefficients: [0, 1, 3, 1], count: 7 },
];

export function mod12(value: number): number {
    return ((value % 12) + 12) % 12;
}

// Coefficients are in ascending order: constant, x, x², ... . Reducing at
// each Horner step keeps evaluation exact even for large safe integers.
export function evaluatePolynomial(coefficients: readonly number[], x: number): number {
    return coefficients.reduceRight((value, coefficient) => mod12(value * mod12(x) + mod12(coefficient)), 0);
}

export function generatePolynomialScale(coefficients: readonly number[], count: number): PolynomialScale {
    if (coefficients.length === 0 || !coefficients.every(Number.isSafeInteger)) {
        throw new Error('Polynomial coefficients must be safe integers.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 12) {
        throw new Error('Select between 1 and 12 outputs.');
    }

    const sequence = Array.from({ length: 12 }, (_, x) => evaluatePolynomial(coefficients, x));
    const prefix = sequence.slice(0, count);
    const pitchClasses = Array.from(new Set(prefix)).sort((a, b) => a - b);
    const repeatIndex = sequence.findIndex((pc, index) => sequence.indexOf(pc) !== index);
    const isPermutation = repeatIndex === -1;
    const multiplier = mod12(sequence[1] - sequence[0]);

    return {
        sequence,
        prefix,
        pitchClasses,
        firstRepeatIndex: isPermutation ? null : repeatIndex,
        isDistinctPrefix: pitchClasses.length === count,
        isPermutation,
        affineEquivalent: isPermutation ? { multiplier, offset: sequence[0] } : null,
        steps: pitchClasses.map((pc, index) =>
            index === pitchClasses.length - 1 ? pitchClasses[0] + 12 - pc : pitchClasses[index + 1] - pc),
    };
}

export function formatPolynomial(coefficients: readonly number[]): string {
    const powers = ['', 'x', 'x²', 'x³', 'x⁴', 'x⁵', 'x⁶'];
    const terms: string[] = [];
    for (let power = coefficients.length - 1; power >= 0; power -= 1) {
        const coefficient = coefficients[power];
        if (coefficient === 0) continue;
        const magnitude = Math.abs(coefficient);
        const term = `${power > 0 && magnitude === 1 ? '' : magnitude}${powers[power] ?? `x^${power}`}`;
        terms.push(`${terms.length ? (coefficient < 0 ? ' − ' : ' + ') : (coefficient < 0 ? '−' : '')}${term}`);
    }
    return terms.join('') || '0';
}

export function randomPolynomialScale(
    degree: number,
    count: number,
    requirePermutation: boolean,
    random: () => number = Math.random,
): number[] {
    if (!Number.isInteger(degree) || degree < 1 || degree > 6) {
        throw new Error('Select a degree between 1 and 6.');
    }
    for (let attempt = 0; attempt < 256; attempt += 1) {
        const coefficients = Array.from({ length: degree + 1 }, () => Math.floor(random() * 12) - 5);
        if (coefficients[degree] === 0) continue;
        const result = generatePolynomialScale(coefficients, count);
        if (result.isDistinctPrefix && (!requirePermutation || result.isPermutation)) return coefficients;
    }

    // A permutation always supplies a valid prefix, including at k = 12.
    // Multiples of x⁴ − x² supply higher-degree expressions for the same map.
    const coefficients = Array(degree + 1).fill(0) as number[];
    coefficients[0] = Math.floor(random() * 12);
    coefficients[1] = [1, 5, 7, 11][Math.floor(random() * 4)];
    if (degree === 2) {
        coefficients[2] = 6;
    } else if (degree === 3) {
        coefficients[3] = 6;
        coefficients[1] -= 6;
    } else if (degree >= 4) {
        coefficients[degree] = 1;
        coefficients[degree - 2] -= 1;
    }
    return coefficients;
}
