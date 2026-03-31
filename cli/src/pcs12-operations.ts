import { PCS12, SubsetOf, SupersetOf } from 'ultra-mega-enumerator';

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
  symmetries: number[];
  tensionPartition: number[];
  cardinality: number;
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
  return {
    forte: pcs.toString(),
    commonName: pcs.getCommonName() || 'None',
    pitchClasses: pcs.asSequence(),
    intervals: pcs.getIntervals(),
    intervalVector: pcs.getIntervalVector() ?? [],
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
