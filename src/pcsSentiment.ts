import { PCS12 } from 'ultra-mega-enumerator';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';

export type SentimentValue = -1 | 0 | 1 | null;
export type SentimentMap = Record<string, SentimentValue>;

export const PCS_SENTIMENT_STORAGE_KEY = 'kcomplex-pcs-sentiments';
export const SYMMETRY_VALUES = Array.from({ length: 24 }, (_, i) => i * 0.5);
export const PITCH_CLASS_SET_NUMERICAL_FEATURE_HEADERS = [
    'forte_num_notes',
    'forte_has_z',
    'forte_order',
    'forte_ab',
    'forte_transposition',
    'pc0',
    'pc1',
    'pc2',
    'pc3',
    'pc4',
    'pc5',
    'pc6',
    'pc7',
    'pc8',
    'pc9',
    'pc10',
    'pc11',
    'iv1',
    'iv2',
    'iv3',
    'iv4',
    'iv5',
    'iv6',
    'interval_vector_entropy',
    'interval_vector_entropy_level',
    ...SYMMETRY_VALUES.map(v => `sym_${v}`),
] as const;

const PITCH_CLASS_COUNT = 12;

export function loadSentiments(): SentimentMap {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === -1 || value === 0 || value === 1 || value === null)
        ) as SentimentMap;
    } catch (error) {
        console.error('Unable to load saved pitch class set sentiments, possibly because local storage data is corrupted. All sentiments will be unset (null) until you save them again.', error);
        return {};
    }
}

export function saveSentiments(sentiments: SentimentMap) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PCS_SENTIMENT_STORAGE_KEY, JSON.stringify(sentiments));
}

interface ForteNumberParts {
    numNotes: number;
    hasZ: number;
    order: number;
    ab: number;
    transposition: number;
}

function parseForteNumber(forte: string): ForteNumberParts {
    const match = forte.match(/^(\d+)-(z?)(\d+)([AB]?)(?:\.(\d+))?$/);
    if (!match) {
        return { numNotes: 0, hasZ: 0, order: 0, ab: 0, transposition: 0 };
    }
    return {
        numNotes: parseInt(match[1], 10),
        hasZ: match[2] === 'z' ? 1 : 0,
        order: parseInt(match[3], 10),
        ab: match[4] === 'A' ? 1 : match[4] === 'B' ? -1 : 0,
        transposition: match[5] !== undefined ? parseInt(match[5], 10) : 0,
    };
}

function getPitchClassFlags(chord: PCS12): string[] {
    const flags = Array.from({ length: PITCH_CLASS_COUNT }, () => '0');

    for (const pitchClass of chord.asSequence()) {
        if (pitchClass >= 0 && pitchClass < PITCH_CLASS_COUNT) {
            flags[pitchClass] = '1';
        }
    }

    return flags;
}

function escapeCsvValue(value: string | number | boolean): string {
    const text = String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}
export function getPitchClassSetNumericalFeatures(chord: PCS12): number[] {
    const forte = chord.toString();
    const forteParts = parseForteNumber(forte);
    const { entropy, level } = getIntervalVectorEntropyMetrics(chord);
    const iv = chord.getIntervalVector() ?? [];

    return [
        forteParts.numNotes,
        forteParts.hasZ,
        forteParts.order,
        forteParts.ab,
        forteParts.transposition,
        ...getPitchClassFlags(chord).map(value => Number(value)),
        iv[0] ?? 0,
        iv[1] ?? 0,
        iv[2] ?? 0,
        iv[3] ?? 0,
        iv[4] ?? 0,
        iv[5] ?? 0,
        Number(entropy.toFixed(3)),
        level === 'Low' ? 1 : level === 'Mid' ? 0 : -1,
        ...SYMMETRY_VALUES.map(v => chord.getSymmetries().includes(v) ? 1 : 0),
    ];
}

export function isConsonantPitchClassSet(chord: PCS12): boolean {
    const intervalVector = chord.getIntervalVector() ?? [];
    const hasMinorSecond = (intervalVector[0] ?? 0) > 0;
    const hasTritone = (intervalVector[5] ?? 0) > 0;
    return !hasMinorSecond && !hasTritone;
}

export function isDissonantPitchClassSet(chord: PCS12): boolean {
    return !isConsonantPitchClassSet(chord);
}

export function buildPitchClassSetSentimentCsv(sentiments: SentimentMap): string {
    const rows = [
        [
            'forte_number',
            'forte_num_notes',
            'forte_has_z',
            'forte_order',
            'forte_ab',
            'forte_transposition',
            'common_names',
            'pc0',
            'pc1',
            'pc2',
            'pc3',
            'pc4',
            'pc5',
            'pc6',
            'pc7',
            'pc8',
            'pc9',
            'pc10',
            'pc11',
            'iv1',
            'iv2',
            'iv3',
            'iv4',
            'iv5',
            'iv6',
            'interval_vector_entropy',
            'interval_vector_entropy_level',
            ...SYMMETRY_VALUES.map(v => `sym_${v}`),
            'sentiment',
        ],
    ];

    const chords = Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));

    for (const chord of chords) {
        const forte = chord.toString();
        const sentiment = sentiments[forte] ?? null;
        const numericalFeatures = getPitchClassSetNumericalFeatures(chord);

        rows.push([
            forte,
            ...numericalFeatures.slice(0, 5).map(String),
            chord.getCommonName() || 'None',
            ...numericalFeatures.slice(5).map(String),
            sentiment !== null ? String(sentiment) : '',
        ]);
    }

    return rows
        .map(row => row.map(value => escapeCsvValue(value)).join(','))
        .join('\n');
}
