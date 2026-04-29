import packageInfo from '../package.json';
import { SentimentMap } from './pcsSentiment';
import {
    SentimentPredictionMap,
    SentimentScoreMap,
    SentimentTrainingStats,
    SerializedSentimentModelArtifacts,
} from './pcsSentimentModel';

const SENTIMENT_PRESET_DB_NAME = 'kcomplex-sentiment-presets';
const SENTIMENT_PRESET_STORE_NAME = 'presets';
const SENTIMENT_PRESET_DB_VERSION = 1;

export const SENTIMENT_PRESET_SCHEMA_VERSION = 1;
export const SENTIMENT_PRESET_FILE_EXTENSION = '.kcomplex-preset.json';
export const CURRENT_APP_VERSION = typeof packageInfo.version === 'string' ? packageInfo.version : null;

export interface SentimentPresetSnapshot {
    sentiments: SentimentMap;
    predictedSentiments: SentimentPredictionMap;
    predictedSentimentScores: SentimentScoreMap;
    trainingStats: SentimentTrainingStats | null;
    serializedModel: SerializedSentimentModelArtifacts | null;
}

export interface SentimentPresetRecord {
    id: string;
    name: string;
    schemaVersion: number;
    appVersion: string | null;
    createdAt: string;
    updatedAt: string;
    snapshot: SentimentPresetSnapshot;
}

export interface SentimentPresetSummary {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    hasModel: boolean;
    labeledSentimentCount: number;
}

interface SentimentPresetFilePayload {
    schemaVersion: number;
    preset: SentimentPresetRecord;
}

function createPresetId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizePresetName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
}

function sanitizeFileNameSegment(name: string): string {
    const collapsed = sanitizePresetName(name).toLowerCase();
    const cleaned = collapsed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned || 'sentiment-preset';
}

function countLabeledSentiments(sentiments: SentimentMap): number {
    return Object.values(sentiments).filter((value) => value === -1 || value === 0 || value === 1).length;
}

function cloneSnapshot(snapshot: SentimentPresetSnapshot): SentimentPresetSnapshot {
    return {
        sentiments: { ...snapshot.sentiments },
        predictedSentiments: { ...snapshot.predictedSentiments },
        predictedSentimentScores: { ...snapshot.predictedSentimentScores },
        trainingStats: snapshot.trainingStats ? { ...snapshot.trainingStats } : null,
        serializedModel: snapshot.serializedModel ? {
            ...snapshot.serializedModel,
            modelTopology: { ...snapshot.serializedModel.modelTopology },
            weightSpecs: snapshot.serializedModel.weightSpecs.map(spec => ({ ...spec })),
            modelSettings: {
                ...snapshot.serializedModel.modelSettings,
                layers: snapshot.serializedModel.modelSettings.layers.map(layer => ({
                    className: layer.className,
                    config: { ...layer.config },
                })),
            },
        } : null,
    };
}

function cloneRecord(record: SentimentPresetRecord): SentimentPresetRecord {
    return {
        ...record,
        snapshot: cloneSnapshot(record.snapshot),
    };
}

function normalizeSentimentMap(value: unknown): SentimentMap {
    if (!value || typeof value !== 'object') return {};

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, entry]) => (
            entry === -1 || entry === 0 || entry === 1 || entry === null
        )),
    ) as SentimentMap;
}

function normalizePredictionMap(value: unknown): SentimentPredictionMap {
    if (!value || typeof value !== 'object') return {};

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, entry]) => (
            entry === -1 || entry === 0 || entry === 1
        )),
    ) as SentimentPredictionMap;
}

function normalizeScoreMap(value: unknown): SentimentScoreMap {
    if (!value || typeof value !== 'object') return {};

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, entry]) => (
            typeof entry === 'number' && Number.isFinite(entry)
        )),
    ) as SentimentScoreMap;
}

function readFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeTrainingStats(value: unknown): SentimentTrainingStats | null {
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    const accuracy = readFiniteNumber(raw.accuracy)
        ?? readFiniteNumber(raw.labeledAccuracy)
        ?? readFiniteNumber(raw.ternaryAccuracy);

    return {
        epochsCompleted: readFiniteNumber(raw.epochsCompleted) ?? 0,
        sampleCount: readFiniteNumber(raw.sampleCount) ?? 0,
        labeledSampleCount: readFiniteNumber(raw.labeledSampleCount) ?? 0,
        meanAbsoluteError: readFiniteNumber(raw.meanAbsoluteError),
        accuracy,
        finalLoss: readFiniteNumber(raw.finalLoss),
        finalValidationLoss: readFiniteNumber(raw.finalValidationLoss),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
}

function normalizeSerializedModel(value: unknown): SerializedSentimentModelArtifacts | null {
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    if (!raw.modelTopology || typeof raw.modelTopology !== 'object') return null;
    if (!Array.isArray(raw.weightSpecs)) return null;
    if (typeof raw.weightDataBase64 !== 'string') return null;
    if (!raw.modelSettings || typeof raw.modelSettings !== 'object') return null;

    const rawModelSettings = raw.modelSettings as Record<string, unknown>;
    const rawLayers = Array.isArray(rawModelSettings.layers) ? rawModelSettings.layers : [];

    return {
        format: typeof raw.format === 'string' ? raw.format : null,
        generatedBy: typeof raw.generatedBy === 'string' ? raw.generatedBy : null,
        convertedBy: typeof raw.convertedBy === 'string' ? raw.convertedBy : null,
        modelTopology: raw.modelTopology as Record<string, unknown>,
        weightSpecs: raw.weightSpecs.filter((entry): entry is SerializedSentimentModelArtifacts['weightSpecs'][number] => {
            if (!entry || typeof entry !== 'object') return false;
            const candidate = entry as Record<string, unknown>;
            return typeof candidate.name === 'string'
                && Array.isArray(candidate.shape)
                && typeof candidate.dtype === 'string';
        }),
        weightDataBase64: raw.weightDataBase64,
        modelSettings: {
            inputSize: typeof rawModelSettings.inputSize === 'number' ? rawModelSettings.inputSize : null,
            optimizer: 'adam',
            learningRate: typeof rawModelSettings.learningRate === 'number' ? rawModelSettings.learningRate : 0.001,
            loss: 'huberLoss',
            outputActivation: 'tanh',
            layers: rawLayers
                .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
                .map((entry) => ({
                    className: typeof entry.className === 'string' ? entry.className : 'Layer',
                    config: entry.config && typeof entry.config === 'object' ? entry.config as Record<string, unknown> : {},
                })),
        },
    };
}

function normalizeSnapshot(value: unknown): SentimentPresetSnapshot | null {
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    return {
        sentiments: normalizeSentimentMap(raw.sentiments),
        predictedSentiments: normalizePredictionMap(raw.predictedSentiments),
        predictedSentimentScores: normalizeScoreMap(raw.predictedSentimentScores),
        trainingStats: normalizeTrainingStats(raw.trainingStats),
        serializedModel: normalizeSerializedModel(raw.serializedModel),
    };
}

export function normalizeSentimentPresetRecord(value: unknown): SentimentPresetRecord | null {
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    const snapshot = normalizeSnapshot(raw.snapshot);
    const name = typeof raw.name === 'string' ? sanitizePresetName(raw.name) : '';

    if (!snapshot || !name) {
        return null;
    }

    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : createPresetId(),
        name,
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SENTIMENT_PRESET_SCHEMA_VERSION,
        appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : CURRENT_APP_VERSION,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
        snapshot,
    };
}

export function createSentimentPresetRecord(options: {
    name: string;
    snapshot: SentimentPresetSnapshot;
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    appVersion?: string | null;
}): SentimentPresetRecord {
    const name = sanitizePresetName(options.name);
    if (!name) {
        throw new Error('Preset names cannot be empty.');
    }

    const timestamp = new Date().toISOString();
    return {
        id: options.id ?? createPresetId(),
        name,
        schemaVersion: SENTIMENT_PRESET_SCHEMA_VERSION,
        appVersion: options.appVersion ?? CURRENT_APP_VERSION,
        createdAt: options.createdAt ?? timestamp,
        updatedAt: options.updatedAt ?? timestamp,
        snapshot: cloneSnapshot(options.snapshot),
    };
}

export function getSentimentPresetSummary(record: SentimentPresetRecord): SentimentPresetSummary {
    return {
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        hasModel: record.snapshot.serializedModel !== null,
        labeledSentimentCount: countLabeledSentiments(record.snapshot.sentiments),
    };
}

export function getSentimentPresetDownloadName(name: string): string {
    return `${sanitizeFileNameSegment(name)}${SENTIMENT_PRESET_FILE_EXTENSION}`;
}

function openPresetDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(SENTIMENT_PRESET_DB_NAME, SENTIMENT_PRESET_DB_VERSION);

        request.onerror = () => {
            reject(request.error ?? new Error('Unable to open preset storage.'));
        };

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(SENTIMENT_PRESET_STORE_NAME)) {
                database.createObjectStore(SENTIMENT_PRESET_STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };
    });
}

function runPresetRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onerror = () => {
            reject(request.error ?? new Error('Preset storage operation failed.'));
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
    });
}

async function withPresetStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    if (typeof window === 'undefined' || !window.indexedDB) {
        throw new Error('This browser does not support preset storage.');
    }

    const database = await openPresetDatabase();
    try {
        const transaction = database.transaction(SENTIMENT_PRESET_STORE_NAME, mode);
        const store = transaction.objectStore(SENTIMENT_PRESET_STORE_NAME);
        const result = await action(store);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('Preset transaction failed.'));
            transaction.onabort = () => reject(transaction.error ?? new Error('Preset transaction was aborted.'));
        });
        return result;
    } finally {
        database.close();
    }
}

export async function listSentimentPresetSummaries(): Promise<SentimentPresetSummary[]> {
    const records = await withPresetStore('readonly', async (store) => {
        const values = await runPresetRequest(store.getAll());
        return values
            .map((entry) => normalizeSentimentPresetRecord(entry))
            .filter((entry): entry is SentimentPresetRecord => entry !== null);
    });

    return records
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(getSentimentPresetSummary);
}

export async function loadSentimentPresetRecord(id: string): Promise<SentimentPresetRecord | null> {
    return withPresetStore('readonly', async (store) => {
        const entry = await runPresetRequest(store.get(id));
        const record = normalizeSentimentPresetRecord(entry);
        return record ? cloneRecord(record) : null;
    });
}

export async function saveSentimentPresetRecord(record: SentimentPresetRecord): Promise<SentimentPresetRecord> {
    const normalized = normalizeSentimentPresetRecord(record);
    if (!normalized) {
        throw new Error('Unable to save an invalid preset.');
    }

    const updatedRecord: SentimentPresetRecord = {
        ...normalized,
        updatedAt: new Date().toISOString(),
        snapshot: cloneSnapshot(normalized.snapshot),
    };

    await withPresetStore('readwrite', async (store) => {
        await runPresetRequest(store.put(updatedRecord));
        return undefined;
    });

    return cloneRecord(updatedRecord);
}

export async function renameSentimentPresetRecord(id: string, name: string): Promise<SentimentPresetRecord> {
    const existing = await loadSentimentPresetRecord(id);
    if (!existing) {
        throw new Error('The selected preset could not be found.');
    }

    return saveSentimentPresetRecord({
        ...existing,
        name: sanitizePresetName(name),
    });
}

export async function deleteSentimentPresetRecord(id: string): Promise<void> {
    await withPresetStore('readwrite', async (store) => {
        await runPresetRequest(store.delete(id));
        return undefined;
    });
}

export function exportSentimentPresetFile(record: SentimentPresetRecord): string {
    const normalized = normalizeSentimentPresetRecord(record);
    if (!normalized) {
        throw new Error('Unable to export an invalid preset.');
    }

    const payload: SentimentPresetFilePayload = {
        schemaVersion: SENTIMENT_PRESET_SCHEMA_VERSION,
        preset: normalized,
    };

    return JSON.stringify(payload, null, 2);
}

export function importSentimentPresetFile(rawText: string): SentimentPresetRecord {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error('Preset files must contain valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Preset files must contain a valid preset payload.');
    }

    const payload = parsed as Partial<SentimentPresetFilePayload> & Record<string, unknown>;
    const candidatePreset = payload.preset ?? payload;
    const record = normalizeSentimentPresetRecord(candidatePreset);
    if (!record) {
        throw new Error('Preset files must contain a valid preset record.');
    }

    return cloneRecord(record);
}
