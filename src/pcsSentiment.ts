import { PCS12 } from 'ultra-mega-enumerator';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';

export type SentimentValue = -1 | 0 | 1;
export type SentimentMap = Record<string, SentimentValue>;

export const PCS_SENTIMENT_STORAGE_KEY = 'kcomplex-pcs-sentiments';

// A starting heuristic to pre-label pitch class sets
function synthesizeTrit(vector: number[]): SentimentValue {
    const [v1, v2, v3, v4, v5, v6] = vector;

    const load = v1 + (v6 * 2);
    const capacity = (v5 * 2) + (v3 + v4) + (v2 * 0.5);

    if (v5 === 0) return 0;
    if (load > capacity || (v1 > 0 && v6 > 0)) return -1;
    if (load > 0 && load <= capacity) return 1;

    return 0;
}

function buildDefaultSentiments(): SentimentMap {
    const result: SentimentMap = {};
    for (const chord of PCS12.getChords()) {
        const iv = chord.getIntervalVector();
        if (iv) {
            result[chord.toString()] = synthesizeTrit(iv);
        }
    }
    return result;
}

export function loadSentiments(): SentimentMap {
    if (typeof window === 'undefined') return buildDefaultSentiments();

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_STORAGE_KEY);
        if (!raw) return buildDefaultSentiments();

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === -1 || value === 0 || value === 1)
        ) as SentimentMap;
    } catch (error) {
        console.error('Unable to load saved pitch class set sentiments, possibly because local storage data is corrupted. Sentiments will reset to neutral until you save them again.', error);
        return buildDefaultSentiments();
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

export function buildPitchClassSetSentimentCsv(sentiments: SentimentMap): string {
    const rows = [
        [
            'forte_number',
            'common_names',
            'pitch_classes',
            'intervals',
            'iv1',
            'iv2',
            'iv3',
            'iv4',
            'iv5',
            'iv6',
            'interval_vector_entropy',
            'interval_vector_entropy_level',
            'symmetries',
            'tension_partition',
            'sentiment',
        ],
    ];

    const chords = Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));

    for (const chord of chords) {
        const forte = chord.toString();
        const sentiment = sentiments[forte] ?? 0;
        const { entropy, level } = getIntervalVectorEntropyMetrics(chord);
        const iv = chord.getIntervalVector() ?? [];

        rows.push([
            forte,
            chord.getCommonName() || 'None',
            chord.combinationString(),
            chord.getIntervals().map(value => String(value)).join(' '),
            String(iv[0] ?? ''),
            String(iv[1] ?? ''),
            String(iv[2] ?? ''),
            String(iv[3] ?? ''),
            String(iv[4] ?? ''),
            String(iv[5] ?? ''),
            entropy.toFixed(3),
            level,
            chord.getSymmetries().map(value => String(value)).join(' ') || 'None',
            chord.getTensionPartition().map(value => String(value)).join(' ') || 'None',
            String(sentiment),
        ]);
    }

    return rows
        .map(row => row.map(value => escapeCsvValue(value)).join(','))
        .join('\n');
}
