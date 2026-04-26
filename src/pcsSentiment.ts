import { PCS12 } from 'ultra-mega-enumerator';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';

export type SentimentValue = -1 | 0 | 1;
export type SentimentMap = Record<string, SentimentValue>;

export const PCS_SENTIMENT_STORAGE_KEY = 'kcomplex-pcs-sentiments';

export function loadSentiments(): SentimentMap {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === -1 || value === 0 || value === 1)
        ) as SentimentMap;
    } catch (error) {
        console.error('Unable to load saved pitch class set sentiments. Sentiments will reset to neutral until saved again.', error);
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

export function getSentimentLabel(sentiment: SentimentValue): 'dislike' | 'neutral' | 'like' {
    if (sentiment > 0) return 'like';
    if (sentiment < 0) return 'dislike';
    return 'neutral';
}

export function buildPitchClassSetSentimentCsv(sentiments: SentimentMap): string {
    const rows = [
        [
            'forte_number',
            'common_names',
            'pitch_classes',
            'intervals',
            'interval_vector',
            'interval_vector_entropy',
            'interval_vector_entropy_level',
            'symmetries',
            'tension_partition',
            'sentiment',
            'sentiment_label',
        ],
    ];

    const chords = Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));

    for (const chord of chords) {
        const forte = chord.toString();
        const sentiment = sentiments[forte] ?? 0;
        const { entropy, level } = getIntervalVectorEntropyMetrics(chord);

        rows.push([
            forte,
            chord.getCommonName() || 'None',
            chord.combinationString(),
            chord.getIntervals().map(value => String(value)).join(' '),
            chord.getIntervalVector()?.join(' ') || '[]',
            entropy.toFixed(3),
            level,
            chord.getSymmetries().map(value => String(value)).join(' ') || 'None',
            chord.getTensionPartition().map(value => String(value)).join(' ') || 'None',
            String(sentiment),
            getSentimentLabel(sentiment),
        ]);
    }

    return rows
        .map(row => row.map(value => escapeCsvValue(value)).join(','))
        .join('\n');
}
