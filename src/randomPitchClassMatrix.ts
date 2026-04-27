import { PCS12, SubsetOf } from 'ultra-mega-enumerator';
import { SentimentPredictionMap } from './pcsSentimentModel';

export interface RandomPitchClassMatrixProgress {
    progress: number;
    message: string;
}

export interface RandomPitchClassMatrixSearchOptions {
    upperBound: PCS12;
    rows: number;
    columns: number;
    predictions: SentimentPredictionMap;
    shouldCancel?: () => boolean;
    onProgress?: (progress: RandomPitchClassMatrixProgress) => void;
}

export interface RandomPitchClassMatrixSearchResult {
    matrix: PCS12[][];
    candidateCount: number;
}

export class RandomPitchClassMatrixSearchCancelledError extends Error {
    constructor() {
        super('Random matrix search cancelled.');
        this.name = 'RandomPitchClassMatrixSearchCancelledError';
    }
}

const UI_YIELD_INTERVAL = 250;
const SEARCH_PROGRESS_SPAN = 2000;

function ensureNotCancelled(shouldCancel?: () => boolean) {
    if (shouldCancel?.()) {
        throw new RandomPitchClassMatrixSearchCancelledError();
    }
}

function getPitchClassMask(chord: PCS12): number {
    return chord.asSequence().reduce((mask, pitchClass) => mask | (1 << pitchClass), 0);
}

function createChordFromMask(mask: number): PCS12 {
    const set = new Set<number>();
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        if ((mask & (1 << pitchClass)) !== 0) {
            set.add(pitchClass);
        }
    }

    return PCS12.identify(PCS12.createWithSizeAndSet(12, set));
}

function getPositiveCandidates(upperBound: PCS12, predictions: SentimentPredictionMap): PCS12[] {
    const subsetOfUpperBound = new SubsetOf(upperBound);
    return Array.from(PCS12.getChords())
        .filter(chord => subsetOfUpperBound.apply(chord))
        .filter(chord => predictions[chord.toString()] === 1)
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));
}

export async function generateRandomPitchClassMatrix({
    upperBound,
    rows,
    columns,
    predictions,
    shouldCancel,
    onProgress,
}: RandomPitchClassMatrixSearchOptions): Promise<RandomPitchClassMatrixSearchResult> {
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
        throw new Error('Matrix dimensions must be positive integers.');
    }

    const candidates = getPositiveCandidates(upperBound, predictions);
    if (candidates.length === 0) {
        throw new Error('No positively predicted pitch class sets are available within the selected upper bound.');
    }

    const candidateMasks = candidates.map(getPitchClassMask);
    const matrixIndexes = Array.from({ length: rows }, () => Array.from({ length: columns }, () => -1));
    const columnUnionMasks = Array.from({ length: columns }, () => 0);
    const positivityByMask = new Map<number, boolean>();
    let visitedStates = 0;

    const hasPositivePrediction = (mask: number) => {
        const cached = positivityByMask.get(mask);
        if (cached !== undefined) {
            return cached;
        }

        const predictedSentiment = predictions[createChordFromMask(mask).toString()] ?? 0;
        const isPositive = predictedSentiment === 1;
        positivityByMask.set(mask, isPositive);
        return isPositive;
    };

    const maybeYieldToUi = async (position: number) => {
        visitedStates += 1;
        if (visitedStates % UI_YIELD_INTERVAL !== 0) {
            return;
        }

        onProgress?.({
            progress: Math.round(((visitedStates % SEARCH_PROGRESS_SPAN) / SEARCH_PROGRESS_SPAN) * 100),
            message: `Searching ${rows}×${columns} matrix — explored ${visitedStates.toLocaleString()} states across ${candidates.length.toLocaleString()} candidates.`,
        });
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        ensureNotCancelled(shouldCancel);
        if (position === 0) {
            onProgress?.({
                progress: 0,
                message: `Preparing search across ${candidates.length.toLocaleString()} candidates...`,
            });
        }
    };

    const tryPlace = async (position: number): Promise<boolean> => {
        ensureNotCancelled(shouldCancel);
        await maybeYieldToUi(position);

        if (position >= rows * columns) {
            return true;
        }

        const row = Math.floor(position / columns);
        const column = position % columns;
        const leftIndex = column > 0 ? matrixIndexes[row][column - 1] : -1;
        const firstIndexInRow = matrixIndexes[row][0];
        const columnUnionMask = columnUnionMasks[column];
        const candidateCount = candidates.length;
        const startOffset = Math.floor(Math.random() * candidateCount);

        for (let offset = 0; offset < candidateCount; offset += 1) {
            ensureNotCancelled(shouldCancel);

            const candidateIndex = (startOffset + offset) % candidateCount;
            const candidateMask = candidateMasks[candidateIndex];

            if (leftIndex >= 0 && !hasPositivePrediction(candidateMask | candidateMasks[leftIndex])) {
                continue;
            }

            if (columnUnionMask !== 0 && !hasPositivePrediction(candidateMask | columnUnionMask)) {
                continue;
            }

            if (
                column === columns - 1 &&
                firstIndexInRow >= 0 &&
                !hasPositivePrediction(candidateMask | candidateMasks[firstIndexInRow])
            ) {
                continue;
            }

            const previousColumnUnionMask = columnUnionMasks[column];
            matrixIndexes[row][column] = candidateIndex;
            columnUnionMasks[column] = previousColumnUnionMask | candidateMask;

            if (await tryPlace(position + 1)) {
                return true;
            }

            matrixIndexes[row][column] = -1;
            columnUnionMasks[column] = previousColumnUnionMask;
        }

        return false;
    };

    onProgress?.({
        progress: 0,
        message: `Preparing search across ${candidates.length.toLocaleString()} candidates...`,
    });

    const found = await tryPlace(0);
    if (!found) {
        throw new Error('No matrix satisfies the current dimensions and predicted-sentiment constraints.');
    }

    return {
        matrix: matrixIndexes.map(row =>
            row.map(candidateIndex => candidates[candidateIndex])
        ),
        candidateCount: candidates.length,
    };
}
