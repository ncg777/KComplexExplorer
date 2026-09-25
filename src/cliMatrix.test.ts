import { beforeAll, describe, expect, it } from 'vitest';
import { PCS12 } from 'ultra-mega-enumerator';
import { ensureInitialized, generateMatrix, type SentimentPredictionMap } from '../cli/src/pcs12-operations';

beforeAll(async () => {
    await PCS12.init();
    await ensureInitialized();
});

function forteFor(pitchClasses: number[]): string {
    return PCS12.identify(PCS12.createWithSizeAndSet(12, new Set(pitchClasses))).toString();
}

describe('CLI matrix generation', () => {
    it('requires positive predictions for nonadjacent row-pair unions', async () => {
        const predictions: SentimentPredictionMap = {};
        for (let pitchClass = 0; pitchClass < 4; pitchClass += 1) {
            predictions[forteFor([pitchClass])] = 1;
        }
        for (const pair of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
            predictions[forteFor(pair)] = 1;
        }

        for (const seed of [1, 2, 3, 4, 5]) {
            const { matrix } = await generateMatrix({
                upperBound: '12-1.00',
                rows: 1,
                columns: 4,
                noteCount: 1,
                predictions,
                seed,
            });

            const row = matrix[0].map(forte => PCS12.parseForte(forte)!);
            for (let left = 0; left < row.length - 1; left += 1) {
                for (let right = left + 1; right < row.length; right += 1) {
                    const union = new Set([...row[left].asSequence(), ...row[right].asSequence()]);
                    expect(predictions[forteFor([...union])]).toBe(1);
                }
            }
        }
    });
});
