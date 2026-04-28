import { PCS12, SubsetOf } from 'ultra-mega-enumerator';
import { SentimentPredictionMap, SentimentScoreMap } from './pcsSentimentModel';

export interface RandomPitchClassMatrixProgress {
    progress: number;
    message: string;
}

export interface RandomPitchClassMatrixSearchOptions {
    upperBound: PCS12;
    rows: number;
    columns: number;
    noteCount: number;
    predictions: SentimentPredictionMap;
    predictionScores?: SentimentScoreMap;
    stiffness?: number;
    shouldCancel?: () => boolean;
    onProgress?: (progress: RandomPitchClassMatrixProgress) => void;
}

export interface RandomPitchClassMatrixSearchResult {
    matrix: PCS12[][];
    candidateCount: number;
}

export class RandomPitchClassMatrixSearchCancelledError extends Error {
    constructor() {
        super('Constrained matrix search cancelled.');
        this.name = 'RandomPitchClassMatrixSearchCancelledError';
    }
}

interface AttractiveCandidate {
    chord: PCS12;
    forte: string;
    mask: number;
    score: number;
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

function getHammingDistance(leftMask: number, rightMask: number): number {
    let diff = leftMask ^ rightMask;
    let count = 0;

    while (diff !== 0) {
        diff &= diff - 1;
        count += 1;
    }

    return count;
}

function getAttractiveCandidates(
    upperBound: PCS12,
    noteCount: number,
    predictions: SentimentPredictionMap,
    predictionScores: SentimentScoreMap,
): AttractiveCandidate[] {
    const subsetOfUpperBound = new SubsetOf(upperBound);
    return Array.from(PCS12.getChords())
        .filter(chord => subsetOfUpperBound.apply(chord))
        .filter(chord => chord.getK() === noteCount)
        .filter(chord => predictions[chord.toString()] === 1)
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()))
        .map(chord => {
            const forte = chord.toString();
            const score = predictionScores[forte];
            return {
                chord,
                forte,
                mask: getPitchClassMask(chord),
                score: Number.isFinite(score) ? Math.max(score, 0) : 1,
            };
        });
}

function getWeightedCandidateOrder(
    candidates: AttractiveCandidate[],
    leftIndex: number,
    stiffness: number,
): number[] {
    const leftMask = leftIndex >= 0 ? candidates[leftIndex].mask : null;
    const remaining = candidates.map((candidate, candidateIndex) => ({
        candidateIndex,
        forte: candidate.forte,
        weight: Math.max(
            leftMask === null
                ? candidate.score
                : Math.exp(-stiffness * getHammingDistance(leftMask, candidate.mask)) * candidate.score,
            0,
        ),
    }));
    const ordered: number[] = [];

    while (remaining.length > 0) {
        const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);
        if (!(totalWeight > 0)) {
            remaining
                .sort((left, right) => PCS12.ForteStringComparator(left.forte, right.forte))
                .forEach(entry => ordered.push(entry.candidateIndex));
            break;
        }

        let threshold = Math.random() * totalWeight;
        let selectedIndex = remaining.length - 1;
        for (let index = 0; index < remaining.length; index += 1) {
            threshold -= remaining[index].weight;
            if (threshold <= 0) {
                selectedIndex = index;
                break;
            }
        }

        const [selected] = remaining.splice(selectedIndex, 1);
        ordered.push(selected.candidateIndex);
    }

    return ordered;
}

export async function generateRandomPitchClassMatrix({
    upperBound,
    rows,
    columns,
    noteCount,
    predictions,
    predictionScores = {},
    stiffness = 0,
    shouldCancel,
    onProgress,
}: RandomPitchClassMatrixSearchOptions): Promise<RandomPitchClassMatrixSearchResult> {
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
        throw new Error('Matrix dimensions must be positive integers.');
    }

    if (!Number.isInteger(noteCount) || noteCount < 1 || noteCount > 12) {
        throw new Error('Note count must be an integer between 1 and 12.');
    }

    if (!Number.isFinite(stiffness) || stiffness < 0) {
        throw new Error('Stiffness must be a finite number greater than or equal to 0.');
    }

    const candidates = getAttractiveCandidates(upperBound, noteCount, predictions, predictionScores);
    if (candidates.length === 0) {
        throw new Error('No attractively predicted pitch class sets are available within the selected upper bound.');
    }

    const matrixIndexes = Array.from({ length: rows }, () => Array.from({ length: columns }, () => -1));
    const columnUnionMasks = Array.from({ length: columns }, () => 0);
    const positivityByMask = new Map<number, boolean>();
    const columnReachabilityCache = new Map<string, boolean>();
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

    const canReachPositiveColumnUnion = (mask: number, remainingRows: number): boolean => {
        if (mask !== 0 && hasPositivePrediction(mask)) {
            return true;
        }

        if (remainingRows === 0) {
            return false;
        }

        const cacheKey = `${mask}:${remainingRows}`;
        const cached = columnReachabilityCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        for (const candidate of candidates) {
            if (canReachPositiveColumnUnion(mask | candidate.mask, remainingRows - 1)) {
                columnReachabilityCache.set(cacheKey, true);
                return true;
            }
        }

        columnReachabilityCache.set(cacheKey, false);
        return false;
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
        await new Promise<void>(resolve => setTimeout(resolve, 0));
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
            return columnUnionMasks.every(hasPositivePrediction);
        }

        const row = Math.floor(position / columns);
        const column = position % columns;
        const leftIndex = column > 0 ? matrixIndexes[row][column - 1] : -1;
        const firstIndexInRow = matrixIndexes[row][0];
        const previousColumnUnionMask = columnUnionMasks[column];
        const remainingRowsInColumn = rows - row - 1;

        for (const candidateIndex of getWeightedCandidateOrder(candidates, leftIndex, stiffness)) {
            ensureNotCancelled(shouldCancel);

            const candidateMask = candidates[candidateIndex].mask;
            const nextColumnUnionMask = previousColumnUnionMask | candidateMask;

            if (leftIndex >= 0 && !hasPositivePrediction(candidateMask | candidates[leftIndex].mask)) {
                continue;
            }

            if (!canReachPositiveColumnUnion(nextColumnUnionMask, remainingRowsInColumn)) {
                continue;
            }

            if (
                column === columns - 1 &&
                firstIndexInRow >= 0 &&
                !hasPositivePrediction(candidateMask | candidates[firstIndexInRow].mask)
            ) {
                continue;
            }

            matrixIndexes[row][column] = candidateIndex;
            columnUnionMasks[column] = nextColumnUnionMask;

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
        throw new Error('No matrix satisfies the current dimensions, cyclic horizontal unions, and global column-union sentiment constraints.');
    }

    return {
        matrix: matrixIndexes.map(row =>
            row.map(candidateIndex => candidates[candidateIndex].chord)
        ),
        candidateCount: candidates.length,
    };
}
