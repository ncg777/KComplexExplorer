import { PCS12 } from 'ultra-mega-enumerator';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Computes the cyclical (circular) mean of the pitch classes in a PCS12 set.
 * Each pitch class is treated as an angle on the chromatic circle (pc * 2π/12).
 * Returns null for empty sets.
 */
export function getCyclicalMean(chord: PCS12): { value: number; nearestNote: string } | null {
  const pcs = chord.getCombinationAsArray();
  if (pcs.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (const pc of pcs) {
    const angle = (pc * 2 * Math.PI) / 12;
    sumX += Math.cos(angle);
    sumY += Math.sin(angle);
  }

  const meanAngle = Math.atan2(sumY / pcs.length, sumX / pcs.length);
  const raw = (meanAngle * 12) / (2 * Math.PI);
  const value = ((raw % 12) + 12) % 12;
  const nearestNote = NOTE_NAMES[Math.round(value) % 12];

  return { value, nearestNote };
}
