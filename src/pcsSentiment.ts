import { PCS12 } from 'ultra-mega-enumerator';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';

export type SentimentValue = -1 | 0 | 1 | null;
export type SentimentMap = Record<string, SentimentValue>;

export const PCS_SENTIMENT_STORAGE_KEY = 'kcomplex-pcs-sentiments';

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

function escapeCsvValue(value: string | number | boolean): string {
    const text = String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

const SYMMETRY_VALUES = Array.from({ length: 24 }, (_, i) => i * 0.5);

export function buildPitchClassSetSentimentCsv(sentiments: SentimentMap): string {
    const rows = [
        [
            'forte_number',
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
            'intervals',
            'iv1',
            'iv2',
            'iv3',
            'iv4',
            'iv5',
            'iv6',
            'interval_vector_entropy',
            'interval_vector_entropy_level',
            ...SYMMETRY_VALUES.map(v => `sym_${v}`),
            'tension_partition',
            'sentiment',
        ],
    ];

    const chords = Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));

    for (const chord of chords) {
        const forte = chord.toString();
        const sentiment = sentiments[forte] ?? null;
        const { entropy, level } = getIntervalVectorEntropyMetrics(chord);
        const iv = chord.getIntervalVector() ?? [];

        rows.push([
            forte,
            chord.getCommonName() || 'None',
            ...chord.getBitSetAsBooleanArray().slice(0, PITCH_CLASS_COUNT).map(bit => bit ? '1' : '0'),
            chord.getIntervals().map(value => String(value)).join(' '),
            String(iv[0] ?? ''),
            String(iv[1] ?? ''),
            String(iv[2] ?? ''),
            String(iv[3] ?? ''),
            String(iv[4] ?? ''),
            String(iv[5] ?? ''),
            entropy.toFixed(3),
            level,
            ...SYMMETRY_VALUES.map(v => chord.getSymmetries().includes(v) ? '1' : '0'),
            chord.getTensionPartition().map(value => String(value)).join(' ') || 'None',
            sentiment !== null ? String(sentiment) : '',
        ]);
    }

    return rows
        .map(row => row.map(value => escapeCsvValue(value)).join(','))
        .join('\n');
}
