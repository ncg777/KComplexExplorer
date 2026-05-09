import { beforeAll, describe, expect, it } from 'vitest';
import { PCS12 } from 'ultra-mega-enumerator';
import { computeMatrixSentimentMetrics } from './randomPitchClassMatrix';
import { SentimentScoreMap } from './pcsSentimentModel';

beforeAll(async () => {
    await PCS12.init();
});

function makeChord(pitchClasses: number[]): PCS12 {
    return PCS12.identify(PCS12.createWithSizeAndSet(12, new Set(pitchClasses)));
}

function createScoreMap(entries: Array<[PCS12, number]>): SentimentScoreMap {
    return Object.fromEntries(entries.map(([chord, score]) => [chord.toString(), score]));
}

describe('computeMatrixSentimentMetrics', () => {
    it('computes mean scores for cells, cyclic row unions, and column unions', () => {
        const a = makeChord([0]);
        const b = makeChord([1]);
        const c = makeChord([2]);
        const d = makeChord([3]);
        const ab = makeChord([0, 1]);
        const cd = makeChord([2, 3]);
        const ac = makeChord([0, 2]);
        const bd = makeChord([1, 3]);
        const matrix = [
            [a, b],
            [c, d],
        ];
        const scoreMap = createScoreMap([
            [a, 0.1],
            [b, 0.2],
            [c, 0.3],
            [d, 0.4],
            [ab, 0.8],
            [cd, 0.6],
            [ac, 0.5],
            [bd, 0.7],
        ]);

        const metrics = computeMatrixSentimentMetrics(matrix, scoreMap);

        expect(metrics.cellCount).toBe(4);
        expect(metrics.horizontalUnionCount).toBe(4);
        expect(metrics.columnCount).toBe(2);
        expect(metrics.meanCellScore).toBeCloseTo(0.25, 6);
        expect(metrics.meanHorizontalUnionScore).toBeCloseTo(0.7, 6);
        expect(metrics.meanColumnUnionScore).toBeCloseTo(0.6, 6);
        expect(metrics.overallMeanConfidence).toBeCloseTo((0.25 + 0.7 + 0.6) / 3, 6);
    });

    it('includes the wraparound row union in cyclic rows', () => {
        const a = makeChord([0]);
        const b = makeChord([1]);
        const c = makeChord([2]);
        const ab = makeChord([0, 1]);
        const bc = makeChord([1, 2]);
        const ac = makeChord([0, 2]);
        const matrix = [[a, b, c]];
        const scoreMap = createScoreMap([
            [a, 0.1],
            [b, 0.2],
            [c, 0.3],
            [ab, 0.9],
            [bc, 0.6],
            [ac, 0.4],
        ]);

        const metrics = computeMatrixSentimentMetrics(matrix, scoreMap);

        expect(metrics.horizontalUnionCount).toBe(3);
        expect(metrics.meanHorizontalUnionScore).toBeCloseTo((0.9 + 0.6 + 0.4) / 3, 6);
    });

    it('falls back to zero for missing sentiment scores', () => {
        const a = makeChord([0]);
        const b = makeChord([1]);
        const matrix = [[a, b]];
        const scoreMap = createScoreMap([[a, 0.25]]);

        const metrics = computeMatrixSentimentMetrics(matrix, scoreMap);

        expect(metrics.meanCellScore).toBeCloseTo(0.125, 6);
        expect(metrics.meanHorizontalUnionScore).toBe(0);
        expect(metrics.meanColumnUnionScore).toBeCloseTo(0.125, 6);
    });
});