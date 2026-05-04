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
    stasisWeight?: number;
    seed?: number;
    shouldCancel?: () => boolean;
    onProgress?: (progress: RandomPitchClassMatrixProgress) => void;
}

export interface RandomPitchClassMatrixSearchResult {
    matrix: PCS12[][];
    candidateCount: number;
    seed: number;
}

export class RandomPitchClassMatrixSearchCancelledError extends Error {
    constructor() {
        super('Constrained matrix search cancelled.');
        this.name = 'RandomPitchClassMatrixSearchCancelledError';
    }
}

export interface MatrixCandidate {
    chord: PCS12;
    forte: string;
    mask: number;
    score: number;
}

// Keep the private alias for internal use
type AttractiveCandidate = MatrixCandidate;

export interface SolvePartialMatrixOptions {
    upperBound: PCS12;
    noteCount: number;
    predictions: SentimentPredictionMap;
    predictionScores?: SentimentScoreMap;
    stiffness?: number;
    stasisWeight?: number;
    seed?: number;
    currentMatrix: PCS12[][];
    lockedCells: boolean[][];
    shouldCancel?: () => boolean;
    onProgress?: (progress: RandomPitchClassMatrixProgress) => void;
}

export interface SolvePartialMatrixResult {
    matrix: PCS12[][];
    candidateCount: number;
    seed: number;
}

const UI_YIELD_INTERVAL = 250;
const SEARCH_PROGRESS_SPAN = 2000;

type RandomNumberGenerator = () => number;

function ensureNotCancelled(shouldCancel?: () => boolean) {
    if (shouldCancel?.()) {
        throw new RandomPitchClassMatrixSearchCancelledError();
    }
}

export function computePitchClassMask(chord: PCS12): number {
    return chord.asSequence().reduce((mask, pitchClass) => mask | (1 << pitchClass), 0);
}

export function computeChordFromMask(mask: number): PCS12 {
    const set = new Set<number>();
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        if ((mask & (1 << pitchClass)) !== 0) {
            set.add(pitchClass);
        }
    }

    return PCS12.identify(PCS12.createWithSizeAndSet(12, set));
}

// Keep private aliases for internal use
const getPitchClassMask = computePitchClassMask;
const createChordFromMask = computeChordFromMask;

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

export function computeAttractiveCandidates(
    upperBound: PCS12,
    noteCount: number,
    predictions: SentimentPredictionMap,
    predictionScores: SentimentScoreMap = {},
): MatrixCandidate[] {
    return getAttractiveCandidates(upperBound, noteCount, predictions, predictionScores);
}

function normalizeSeed(seed: number): number {
    return (Math.abs(Math.trunc(seed)) || 1) >>> 0;
}

function createSeededRandom(seed: number): RandomNumberGenerator {
    let state = normalizeSeed(seed);
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getCandidateWeight(
    leftMask: number | null,
    candidateMask: number,
    score: number,
    stiffness: number,
    stasisWeight: number,
): number {
    if (leftMask === null) {
        return Math.max(score, 0);
    }

    const distance = getHammingDistance(leftMask, candidateMask);
    if (distance === 0) {
        return Math.max(stasisWeight * score, 0);
    }

    return Math.max(Math.exp(-stiffness * distance) * score, 0);
}

function getWeightedCandidateOrder(
    candidates: AttractiveCandidate[],
    candidateIndexes: number[],
    leftIndex: number,
    stiffness: number,
    stasisWeight: number,
    random: RandomNumberGenerator,
): number[] {
    const leftMask = leftIndex >= 0 ? candidates[leftIndex].mask : null;
    const remaining = candidateIndexes.map(candidateIndex => ({
        candidateIndex,
        forte: candidates[candidateIndex].forte,
        weight: Math.max(
            getCandidateWeight(
                leftMask,
                candidates[candidateIndex].mask,
                candidates[candidateIndex].score,
                stiffness,
                stasisWeight,
            ),
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

        let threshold = random() * totalWeight;
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

export function computeColumnUnionMask(matrix: PCS12[][], col: number): number {
    return matrix.reduce((mask, row) => mask | getPitchClassMask(row[col]), 0);
}

export function computeValidCandidatesForCell(
    matrix: PCS12[][],
    row: number,
    col: number,
    candidates: MatrixCandidate[],
    predictions: SentimentPredictionMap,
): MatrixCandidate[] {
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;

    const hasPositivePrediction = (mask: number): boolean => {
        if (mask === 0) return false;
        return predictions[computeChordFromMask(mask).toString()] === 1;
    };

    // Column union without the current cell
    let colUnionWithoutCell = 0;
    for (let r = 0; r < rows; r += 1) {
        if (r !== row && matrix[r][col]) {
            colUnionWithoutCell |= getPitchClassMask(matrix[r][col]);
        }
    }

    const leftMask = col > 0 && matrix[row][col - 1] ? getPitchClassMask(matrix[row][col - 1]) : -1;
    const rightMask = col < cols - 1 && matrix[row][col + 1] ? getPitchClassMask(matrix[row][col + 1]) : -1;
    const wrapMask = col === cols - 1 && cols > 1 && matrix[row][0] ? getPitchClassMask(matrix[row][0]) : -1;

    return candidates.filter(candidate => {
        const mask = candidate.mask;
        if (leftMask >= 0 && !hasPositivePrediction(mask | leftMask)) return false;
        if (rightMask >= 0 && !hasPositivePrediction(mask | rightMask)) return false;
        if (wrapMask >= 0 && !hasPositivePrediction(mask | wrapMask)) return false;
        if (!hasPositivePrediction(colUnionWithoutCell | mask)) return false;
        return true;
    });
}

export async function solvePartialMatrix({
    upperBound,
    noteCount,
    predictions,
    predictionScores = {},
    stiffness = 0,
    stasisWeight = 0.1,
    seed = Date.now(),
    currentMatrix,
    lockedCells,
    shouldCancel,
    onProgress,
}: SolvePartialMatrixOptions): Promise<SolvePartialMatrixResult | null> {
    const rows = currentMatrix.length;
    const columns = currentMatrix[0]?.length ?? 0;

    const candidates = getAttractiveCandidates(upperBound, noteCount, predictions, predictionScores);
    if (candidates.length === 0) {
        throw new Error('No attractively predicted pitch class sets are available within the selected upper bound.');
    }

    const normalizedSeed = normalizeSeed(seed);
    const random = createSeededRandom(normalizedSeed);

    // Pre-compute future locked mask contributions per column (from row r onward)
    const futureLockedMasks: number[][] = Array.from({ length: columns }, (_, col) => {
        const arr = Array(rows + 1).fill(0);
        for (let r = rows - 1; r >= 0; r -= 1) {
            arr[r] = arr[r + 1];
            if (lockedCells[r]?.[col] && currentMatrix[r]?.[col]) {
                arr[r] |= getPitchClassMask(currentMatrix[r][col]);
            }
        }
        return arr;
    });

    // Count future unlocked cells per column (from row r onward)
    const futureUnlockedCounts: number[][] = Array.from({ length: columns }, (_, col) => {
        const arr = Array(rows + 1).fill(0);
        for (let r = rows - 1; r >= 0; r -= 1) {
            arr[r] = arr[r + 1] + (lockedCells[r]?.[col] ? 0 : 1);
        }
        return arr;
    });

    const placedMasks: number[][] = Array.from({ length: rows }, () => Array(columns).fill(-1));
    const columnUnionMasks = Array.from({ length: columns }, () => 0);
    const positivityByMask = new Map<number, boolean>();
    const columnReachabilityCache = new Map<string, boolean>();
    let visitedStates = 0;

    const hasPositivePrediction = (mask: number): boolean => {
        if (mask === 0) return false;
        const cached = positivityByMask.get(mask);
        if (cached !== undefined) return cached;
        const isPositive = predictions[createChordFromMask(mask).toString()] === 1;
        positivityByMask.set(mask, isPositive);
        return isPositive;
    };

    const canReachPositiveColumnUnion = (mask: number, remainingUnlocked: number): boolean => {
        if (mask !== 0 && hasPositivePrediction(mask)) return true;
        if (remainingUnlocked === 0) return false;
        const cacheKey = `${mask}:${remainingUnlocked}`;
        const cached = columnReachabilityCache.get(cacheKey);
        if (cached !== undefined) return cached;
        for (const candidate of candidates) {
            if (canReachPositiveColumnUnion(mask | candidate.mask, remainingUnlocked - 1)) {
                columnReachabilityCache.set(cacheKey, true);
                return true;
            }
        }
        columnReachabilityCache.set(cacheKey, false);
        return false;
    };

    const maybeYieldToUi = async (position: number) => {
        visitedStates += 1;
        if (visitedStates % UI_YIELD_INTERVAL !== 0) return;
        onProgress?.({
            progress: Math.round(((visitedStates % SEARCH_PROGRESS_SPAN) / SEARCH_PROGRESS_SPAN) * 100),
            message: `Solving ${rows}×${columns} matrix — explored ${visitedStates.toLocaleString()} states.`,
        });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        ensureNotCancelled(shouldCancel);
    };

    const tryPlace = async (position: number): Promise<boolean> => {
        ensureNotCancelled(shouldCancel);
        await maybeYieldToUi(position);

        if (position >= rows * columns) {
            return columnUnionMasks.every(hasPositivePrediction);
        }

        const row = Math.floor(position / columns);
        const column = position % columns;
        const isLocked = !!(lockedCells[row]?.[column] && currentMatrix[row]?.[column]);
        const leftMask = column > 0 ? placedMasks[row][column - 1] : -1;
        const firstMaskInRow = placedMasks[row][0];
        const previousColumnUnionMask = columnUnionMasks[column];
        const futureLockedMask = futureLockedMasks[column][row + 1];
        const futureUnlocked = futureUnlockedCounts[column][row + 1];

        const tryCandidate = async (candidateMask: number): Promise<boolean> => {
            const nextColumnUnionMask = previousColumnUnionMask | candidateMask;

            if (leftMask >= 0 && !hasPositivePrediction(candidateMask | leftMask)) return false;

            if (!canReachPositiveColumnUnion(nextColumnUnionMask | futureLockedMask, futureUnlocked)) {
                return false;
            }

            if (column === columns - 1 && firstMaskInRow >= 0 && !hasPositivePrediction(candidateMask | firstMaskInRow)) {
                return false;
            }

            placedMasks[row][column] = candidateMask;
            columnUnionMasks[column] = nextColumnUnionMask;

            if (await tryPlace(position + 1)) return true;

            placedMasks[row][column] = -1;
            columnUnionMasks[column] = previousColumnUnionMask;
            return false;
        };

        if (isLocked) {
            const lockedMask = getPitchClassMask(currentMatrix[row][column]);
            return tryCandidate(lockedMask);
        }

        // Unlocked cell: collect valid candidates
        const validCandidateIndexes: number[] = [];
        for (let i = 0; i < candidates.length; i += 1) {
            const candidateMask = candidates[i].mask;
            const nextColumnUnionMask = previousColumnUnionMask | candidateMask;
            if (leftMask >= 0 && !hasPositivePrediction(candidateMask | leftMask)) continue;
            if (!canReachPositiveColumnUnion(nextColumnUnionMask | futureLockedMask, futureUnlocked)) continue;
            if (column === columns - 1 && firstMaskInRow >= 0 && !hasPositivePrediction(candidateMask | firstMaskInRow)) continue;
            validCandidateIndexes.push(i);
        }

        const leftCandidateIndex = leftMask >= 0
            ? candidates.findIndex(c => c.mask === leftMask)
            : -1;

        for (const i of getWeightedCandidateOrder(candidates, validCandidateIndexes, leftCandidateIndex, stiffness, stasisWeight, random)) {
            ensureNotCancelled(shouldCancel);
            placedMasks[row][column] = candidates[i].mask;
            columnUnionMasks[column] = previousColumnUnionMask | candidates[i].mask;

            if (await tryPlace(position + 1)) return true;

            placedMasks[row][column] = -1;
            columnUnionMasks[column] = previousColumnUnionMask;
        }

        return false;
    };

    onProgress?.({ progress: 0, message: `Solving ${rows}×${columns} matrix...` });
    const found = await tryPlace(0);
    if (!found) return null;

    return {
        matrix: Array.from({ length: rows }, (_, r) =>
            Array.from({ length: columns }, (_, c) => {
                if (lockedCells[r]?.[c] && currentMatrix[r]?.[c]) {
                    return currentMatrix[r][c];
                }
                const mask = placedMasks[r][c];
                // Find the candidate whose mask matches
                const candidate = candidates.find(cd => cd.mask === mask);
                return candidate ? candidate.chord : createChordFromMask(mask);
            })
        ),
        candidateCount: candidates.length,
        seed: normalizedSeed,
    };
}

export async function generateRandomPitchClassMatrix({
    upperBound,
    rows,
    columns,
    noteCount,
    predictions,
    predictionScores = {},
    stiffness = 0,
    stasisWeight = 0.1,
    seed = Date.now(),
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

    if (!Number.isFinite(stasisWeight) || stasisWeight < 0 || stasisWeight > 1) {
        throw new Error('Stasis weight must be a finite number between 0 and 1.');
    }

    if (!Number.isFinite(seed)) {
        throw new Error('Seed must be a finite number.');
    }

    const candidates = getAttractiveCandidates(upperBound, noteCount, predictions, predictionScores);
    if (candidates.length === 0) {
        throw new Error('No attractively predicted pitch class sets are available within the selected upper bound.');
    }
    const normalizedSeed = normalizeSeed(seed);
    const random = createSeededRandom(normalizedSeed);

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
        const validCandidateIndexes: number[] = [];

        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
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

            validCandidateIndexes.push(candidateIndex);
        }

        for (const candidateIndex of getWeightedCandidateOrder(
            candidates,
            validCandidateIndexes,
            leftIndex,
            stiffness,
            stasisWeight,
            random,
        )) {
            ensureNotCancelled(shouldCancel);

            const candidateMask = candidates[candidateIndex].mask;
            const nextColumnUnionMask = previousColumnUnionMask | candidateMask;

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
        seed: normalizedSeed,
    };
}
