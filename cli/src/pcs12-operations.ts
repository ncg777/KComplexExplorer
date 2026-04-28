import { PCS12, SubsetOf, SupersetOf } from 'ultra-mega-enumerator';
import {
  classifyIntervalVectorEntropy,
  getIntervalVectorEntropy,
  type EntropyLevel,
} from './interval-vector-entropy.js';

export type PredictedSentimentValue = -1 | 0 | 1;
export type SentimentPredictionMap = Record<string, PredictedSentimentValue>;
export type SentimentScoreMap = Record<string, number>;

/**
 * Normalize a Forte number string. If no rotation suffix is present
 * (e.g., "3-11A"), append ".00" so the library can parse it.
 */
function normalizeForte(forte: string): string {
  // If the string already contains a dot followed by digits, it has a rotation
  if (/\.\d+$/.test(forte)) return forte;
  return `${forte}.00`;
}

/**
 * Parse a Forte number string, normalizing first.
 */
function parseForteNormalized(forte: string): PCS12 | undefined {
  return PCS12.parseForte(normalizeForte(forte));
}

/**
 * Structured analysis result for a PCS12.
 */
export interface PCS12Analysis {
  forte: string;
  commonName: string;
  pitchClasses: number[];
  intervals: number[];
  intervalVector: number[];
  intervalVectorEntropy: number;
  intervalVectorEntropyLevel: EntropyLevel;
  symmetries: number[];
  tensionPartition: number[];
  cardinality: number;
}

export interface PCS12MatrixResult {
  matrix: string[][];
  candidateCount: number;
  seed: number;
}

/**
 * Ensures PCS12 is initialized. Call once before using any operations.
 */
export async function ensureInitialized(): Promise<void> {
  if (!PCS12.isInitialized()) {
    await PCS12.init();
  }
}

/**
 * Analyze a PCS12 object and return a structured result.
 */
export function analyzePCS12(pcs: PCS12): PCS12Analysis {
  const intervalVector = pcs.getIntervalVector() ?? [];
  const intervalVectorEntropy = getIntervalVectorEntropy(intervalVector);
  return {
    forte: pcs.toString(),
    commonName: pcs.getCommonName() || 'None',
    pitchClasses: pcs.asSequence(),
    intervals: pcs.getIntervals(),
    intervalVector,
    intervalVectorEntropy,
    intervalVectorEntropyLevel: classifyIntervalVectorEntropy(intervalVectorEntropy, pcs.getK()),
    symmetries: pcs.getSymmetries(),
    tensionPartition: pcs.getTensionPartition(),
    cardinality: pcs.getK(),
  };
}

/**
 * Format a PCS12Analysis as a human-readable string.
 */
export function formatAnalysis(analysis: PCS12Analysis): string {
  return [
    `Forte number: ${analysis.forte}`,
    `Common name(s): ${analysis.commonName}`,
    `Pitch classes: ${analysis.pitchClasses.join(' ')}`,
    `Intervals: ${analysis.intervals.join(' ')}`,
    `Interval vector: ${analysis.intervalVector.join(' ')}`,
    `Interval vector entropy: ${analysis.intervalVectorEntropy.toFixed(3)} (${analysis.intervalVectorEntropyLevel})`,
    `Symmetries: ${analysis.symmetries.join(' ') || 'None'}`,
    `Tension partition: ${analysis.tensionPartition.join(' ') || 'None'}`,
    `Cardinality (k): ${analysis.cardinality}`,
  ].join('\n');
}

/**
 * Analyze a PCS by its Forte number string (e.g., "3-11A").
 */
export function analyze(forte: string): PCS12Analysis {
  const pcs = parseForteNormalized(forte);
  if (!pcs) {
    throw new Error(`Invalid Forte number: "${forte}"`);
  }
  return analyzePCS12(pcs);
}

/**
 * Identify a PCS from a set of pitch classes (0–11).
 */
export function identify(pitchClasses: number[]): PCS12Analysis {
  for (const pc of pitchClasses) {
    if (!Number.isInteger(pc) || pc < 0 || pc > 11) {
      throw new Error(`Invalid pitch class: ${pc}. Must be an integer from 0 to 11.`);
    }
  }
  const set = new Set(pitchClasses);
  if (set.size === 0) {
    return analyzePCS12(PCS12.empty());
  }
  const pcs = PCS12.identify(PCS12.createWithSizeAndSet(12, set));
  return analyzePCS12(pcs);
}

/**
 * List all pitch class sets, optionally filtered by an upper bound scale
 * and/or a search query.
 */
export function listPCS(options?: {
  upperBound?: string;
  search?: string;
}): PCS12Analysis[] {
  const { upperBound, search } = options ?? {};

  let chords: PCS12[];
  if (upperBound) {
    const parsedScale = parseForteNormalized(upperBound);
    if (!parsedScale) {
      throw new Error(`Invalid upper bound Forte number: "${upperBound}"`);
    }
    const pred = new SubsetOf(parsedScale);
    chords = Array.from(PCS12.getChords())
      .filter(pc => pred.apply(pc))
      .sort((a, b) => PCS12.ReverseForteStringComparator(a.toString(), b.toString()));
  } else {
    chords = Array.from(PCS12.getChords())
      .sort((a, b) => PCS12.ReverseForteStringComparator(a.toString(), b.toString()));
  }

  if (search) {
    const q = search.toLowerCase().trim();
    chords = chords.filter(c =>
      c.toString().toLowerCase().includes(q) ||
      (c.getCommonName() || '').toLowerCase().includes(q)
    );
  }

  return chords.map(analyzePCS12);
}

/**
 * Get subsets of a given PCS, optionally within a given scale.
 */
export function getSubsets(forte: string, withinScale?: string): PCS12Analysis[] {
  const pcs = parseForteNormalized(forte);
  if (!pcs) {
    throw new Error(`Invalid Forte number: "${forte}"`);
  }

  let pool: PCS12[];
  if (withinScale) {
    const parsedScale = parseForteNormalized(withinScale);
    if (!parsedScale) {
      throw new Error(`Invalid upper bound Forte number: "${withinScale}"`);
    }
    const scalePred = new SubsetOf(parsedScale);
    pool = Array.from(PCS12.getChords()).filter(c => scalePred.apply(c));
  } else {
    pool = Array.from(PCS12.getChords());
  }

  const subsetChecker = new SubsetOf(pcs);
  return pool
    .filter(c => subsetChecker.apply(c))
    .sort((a, b) => PCS12.ReverseForteStringComparator(a.toString(), b.toString()))
    .map(analyzePCS12);
}

/**
 * Get supersets of a given PCS, optionally within a given scale.
 */
export function getSupersets(forte: string, withinScale?: string): PCS12Analysis[] {
  const pcs = parseForteNormalized(forte);
  if (!pcs) {
    throw new Error(`Invalid Forte number: "${forte}"`);
  }

  let pool: PCS12[];
  if (withinScale) {
    const parsedScale = parseForteNormalized(withinScale);
    if (!parsedScale) {
      throw new Error(`Invalid upper bound Forte number: "${withinScale}"`);
    }
    const scalePred = new SubsetOf(parsedScale);
    pool = Array.from(PCS12.getChords()).filter(c => scalePred.apply(c));
  } else {
    pool = Array.from(PCS12.getChords());
  }

  const supersetChecker = new SupersetOf(pcs);
  return pool
    .filter(c => supersetChecker.apply(c))
    .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()))
    .map(analyzePCS12);
}

/**
 * Compute the union of multiple PCS given by Forte numbers.
 */
export function union(forteNumbers: string[]): PCS12Analysis {
  if (forteNumbers.length < 2) {
    throw new Error('At least 2 Forte numbers are required for union.');
  }

  const chords = forteNumbers.map(f => {
    const pcs = parseForteNormalized(f);
    if (!pcs) throw new Error(`Invalid Forte number: "${f}"`);
    return pcs;
  });

  const sequences = chords.map(c => new Set(c.asSequence()));
  const resultSet = new Set(sequences.flatMap(s => [...s]));

  if (resultSet.size === 0) {
    return analyzePCS12(PCS12.empty());
  }
  return analyzePCS12(PCS12.identify(PCS12.createWithSizeAndSet(12, resultSet)));
}

/**
 * Compute the intersection of multiple PCS given by Forte numbers.
 */
export function intersection(forteNumbers: string[]): PCS12Analysis {
  if (forteNumbers.length < 2) {
    throw new Error('At least 2 Forte numbers are required for intersection.');
  }

  const chords = forteNumbers.map(f => {
    const pcs = parseForteNormalized(f);
    if (!pcs) throw new Error(`Invalid Forte number: "${f}"`);
    return pcs;
  });

  const sequences = chords.map(c => new Set(c.asSequence()));
  const resultSet = new Set(
    [...sequences[0]].filter(pc => sequences.every(s => s.has(pc)))
  );

  if (resultSet.size === 0) {
    return analyzePCS12(PCS12.empty());
  }
  return analyzePCS12(PCS12.identify(PCS12.createWithSizeAndSet(12, resultSet)));
}

/**
 * Find Z-related chords: chords with the same interval vector but different pitch-class content.
 */
export function zRelations(forte: string): { chord: PCS12Analysis; zMates: PCS12Analysis[] } {
  const pcs = parseForteNormalized(forte);
  if (!pcs) {
    throw new Error(`Invalid Forte number: "${forte}"`);
  }

  const iv = pcs.getIntervalVector();
  if (!iv) {
    return { chord: analyzePCS12(pcs), zMates: [] };
  }

  const ivStr = iv.join(',');
  const allChords = Array.from(PCS12.getChords());
  const mates = allChords
    .filter(c => {
      const civ = c.getIntervalVector();
      return civ && civ.join(',') === ivStr && c.toString() !== pcs.toString();
    })
    .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));

  return {
    chord: analyzePCS12(pcs),
    zMates: mates.map(analyzePCS12),
  };
}

/**
 * Sort a list of PCS given by Forte numbers using rotatedCompareTo.
 *
 * @param forteNumbers - list of Forte number strings to sort
 * @param rotate       - rotation parameter passed to rotatedCompareTo
 */
export function sortChords(forteNumbers: string[], rotate: number): PCS12Analysis[] {
  const chords: PCS12[] = forteNumbers.map(forteNumber => {
    const pcs = parseForteNormalized(forteNumber);
    if (!pcs) throw new Error(`Invalid Forte number: "${forteNumber}"`);
    return pcs;
  });

  return chords
    .sort((a, b) => a.rotatedCompareTo(b, rotate))
    .map(analyzePCS12);
}

/**
 * Transpose a PCS by a given number of semitones.
 */
export function transpose(forte: string, semitones: number): PCS12Analysis {
  const pcs = parseForteNormalized(forte);
  if (!pcs) {
    throw new Error(`Invalid Forte number: "${forte}"`);
  }
  const transposed = pcs.transpose(semitones);
  return analyzePCS12(PCS12.identify(transposed));
}

/**
 * Compute polychord bitmasks for comma-separated polychord entries.
 * Each entry is a space-separated list of Forte numbers representing chords.
 * The algorithm maps each chord's pitch classes to bit positions within the
 * supplied scale and packs successive chords into higher bit ranges.
 *
 * Returns an array of decimal strings (BigInt) for each comma-separated entry.
 */
export function computePolychordMasks(scaleForte: string, chordsText: string): string[] {
  const scale = parseForteNormalized(scaleForte);
  if (!scale) throw new Error(`Invalid scale Forte number: "${scaleForte}"`);

  const scaleSeq = scale.asSequence();
  const k = scale.getK();

  const entries = chordsText
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const results: string[] = [];

  for (const entry of entries) {
    const tokens = entry.split(/\s+/).map(t => t.trim()).filter(Boolean);
    const chords: PCS12[] = tokens.map(t => parseForteNormalized(t)).filter(Boolean) as PCS12[];

    let o = 0n;
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const seq = chord.asSequence();
      let segment = 0n;
      for (const pc of seq) {
        const idx = scaleSeq.indexOf(pc);
        if (idx === -1) continue; // pitch class not in scale, ignore
        segment |= (1n << BigInt(idx));
      }
      const shift = BigInt(i * k);
      o |= (segment << shift);
    }

    results.push(o.toString());
  }

  return results;
}

interface AttractiveCandidate {
  chord: PCS12;
  forte: string;
  mask: number;
  score: number;
}

type RandomNumberGenerator = () => number;

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
    .filter((chord): chord is PCS12 => subsetOfUpperBound.apply(chord))
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

export async function generateMatrix(options: {
  upperBound: string;
  rows: number;
  columns: number;
  noteCount: number;
  predictions: SentimentPredictionMap;
  predictionScores?: SentimentScoreMap;
  stiffness?: number;
  stasisWeight?: number;
  seed?: number;
}): Promise<PCS12MatrixResult> {
  const {
    upperBound,
    rows,
    columns,
    noteCount,
    predictions,
    predictionScores = {},
    stiffness = 0,
    stasisWeight = 0.1,
    seed = Date.now(),
  } = options;

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

  const parsedUpperBound = parseForteNormalized(upperBound);
  if (!parsedUpperBound) {
    throw new Error(`Invalid upper bound Forte number: "${upperBound}"`);
  }

  const candidates = getAttractiveCandidates(parsedUpperBound, noteCount, predictions, predictionScores);
  if (candidates.length === 0) {
    throw new Error('No attractively predicted pitch class sets are available within the selected upper bound.');
  }
  const normalizedSeed = normalizeSeed(seed);
  const random = createSeededRandom(normalizedSeed);

  const matrixIndexes = Array.from({ length: rows }, () => Array.from({ length: columns }, () => -1));
  const columnUnionMasks = Array.from({ length: columns }, () => 0);
  const positivityByMask = new Map<number, boolean>();
  const columnReachabilityCache = new Map<string, boolean>();

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

  const tryPlace = async (position: number): Promise<boolean> => {
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
        column === columns - 1
        && firstIndexInRow >= 0
        && !hasPositivePrediction(candidateMask | candidates[firstIndexInRow].mask)
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

  const found = await tryPlace(0);
  if (!found) {
    throw new Error('No matrix satisfies the current dimensions, cyclic horizontal unions, and global column-union sentiment constraints.');
  }

  return {
    matrix: matrixIndexes.map(row => row.map(candidateIndex => candidates[candidateIndex].chord.toString())),
    candidateCount: candidates.length,
    seed: normalizedSeed,
  };
}
