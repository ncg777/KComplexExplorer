import { PCS12 } from 'ultra-mega-enumerator';

export type EntropyLevel = 'Low' | 'Mid' | 'High';

function computeEntropyFromVector(intervalVector: number[] | null | undefined): number {
  if (!intervalVector || intervalVector.length === 0) return 0;

  const total = intervalVector.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;

  return -intervalVector.reduce((sum, value) => {
    if (value <= 0) return sum;
    const p = value / total;
    return sum + p * Math.log2(p);
  }, 0);
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

type EntropyThresholds = { lowToMid: number; midToHigh: number };

let cachedThresholdsByCardinality: Map<number, EntropyThresholds> | null = null;

function getEntropyThresholdsByCardinality(): Map<number, EntropyThresholds> {
  if (cachedThresholdsByCardinality) return cachedThresholdsByCardinality;

  const entropiesByCardinality = new Map<number, number[]>();
  for (const chord of PCS12.getChords()) {
    const cardinality = chord.getK();
    const entropies = entropiesByCardinality.get(cardinality);
    const entropy = computeEntropyFromVector(chord.getIntervalVector());
    if (entropies) {
      entropies.push(entropy);
    } else {
      entropiesByCardinality.set(cardinality, [entropy]);
    }
  }

  cachedThresholdsByCardinality = new Map(
    Array.from(entropiesByCardinality.entries(), ([cardinality, entropies]) => {
      entropies.sort((a, b) => a - b);
      return [cardinality, {
        lowToMid: percentile(entropies, 0.33),
        midToHigh: percentile(entropies, 0.66),
      }];
    }),
  );

  return cachedThresholdsByCardinality;
}

export function getIntervalVectorEntropy(intervalVector: number[] | null | undefined): number {
  return computeEntropyFromVector(intervalVector);
}

export function classifyIntervalVectorEntropy(entropy: number, cardinality: number): EntropyLevel {
  const thresholds = getEntropyThresholdsByCardinality().get(cardinality);
  if (!thresholds) return 'Mid';
  if (entropy <= thresholds.lowToMid) return 'Low';
  if (entropy <= thresholds.midToHigh) return 'Mid';
  return 'High';
}

export function getIntervalVectorEntropyMetrics(chord: PCS12): { entropy: number; level: EntropyLevel } {
  const entropy = getIntervalVectorEntropy(chord.getIntervalVector());
  return { entropy, level: classifyIntervalVectorEntropy(entropy, chord.getK()) };
}
