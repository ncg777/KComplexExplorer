import * as tf from '@tensorflow/tfjs';
import { PCS12 } from 'ultra-mega-enumerator';
import {
    getPitchClassSetNumericalFeatures,
    PITCH_CLASS_SET_NUMERICAL_FEATURE_HEADERS,
    SentimentMap,
    SentimentValue,
} from './pcsSentiment';

export type PredictedSentimentValue = -1 | 0 | 1;
export type SentimentPredictionMap = Record<string, PredictedSentimentValue>;
export type SentimentScoreMap = Record<string, number>;

export interface SentimentTrainingStats {
    epochsCompleted: number;
    sampleCount: number;
    labeledSampleCount: number;
    meanAbsoluteError: number | null;
    accuracy: number | null;
    finalLoss: number | null;
    finalValidationLoss: number | null;
    updatedAt: string;
}

export interface SentimentModelLayerConfig {
    className: string;
    config: Record<string, unknown>;
}

export interface SentimentModelSettings {
    inputSize: number | null;
    optimizer: 'adam';
    learningRate: number;
    loss: 'huberLoss';
    outputActivation: 'tanh';
    layers: SentimentModelLayerConfig[];
}

export interface SerializedSentimentModelArtifacts {
    format: string | null;
    generatedBy: string | null;
    convertedBy: string | null;
    modelTopology: Record<string, unknown>;
    weightSpecs: tf.io.WeightsManifestEntry[];
    weightDataBase64: string;
    modelSettings: SentimentModelSettings;
}

interface DatasetBundle {
    chords: PCS12[];
    normalizedFeatures: number[][];
    labeledTargets: SentimentValue[];
}

interface TrainingDatasetBundle {
    normalizedFeatures: number[][];
    targets: PredictedSentimentValue[];
}

export const PCS_SENTIMENT_MODEL_STORAGE_URL = 'localstorage://kcomplex-pcs-sentiment-model';
export const PCS_SENTIMENT_PREDICTIONS_STORAGE_KEY = 'kcomplex-pcs-sentiment-predictions';
export const PCS_SENTIMENT_SCORES_STORAGE_KEY = 'kcomplex-pcs-sentiment-scores';
export const PCS_SENTIMENT_TRAINING_STATS_STORAGE_KEY = 'kcomplex-pcs-sentiment-training-stats';

const SENTIMENT_MODEL_LEARNING_RATE = 0.001;
const SENTIMENT_MODEL_EARLY_STOPPING_PATIENCE = 12;
const SENTIMENT_MODEL_EARLY_STOPPING_MIN_DELTA = 1e-4;

function compileSentimentModel(model: tf.LayersModel) {
    model.compile({
        optimizer: tf.train.adam(SENTIMENT_MODEL_LEARNING_RATE),
        loss: tf.losses.huberLoss,
        metrics: ['mae'],
    });
}

function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
    if (typeof window === 'undefined' || typeof window.btoa !== 'function') {
        throw new Error('Model serialization requires browser base64 support.');
    }

    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return window.btoa(binary);
}

function normalizeWeightData(weightData: tf.io.WeightData | undefined): ArrayBuffer {
    if (!weightData) {
        return new ArrayBuffer(0);
    }

    if (weightData instanceof ArrayBuffer) {
        return weightData;
    }

    const totalBytes = weightData.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    for (const buffer of weightData) {
        merged.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return merged.buffer;
}

function decodeBase64ToArrayBuffer(encoded: string): ArrayBuffer {
    if (typeof window === 'undefined' || typeof window.atob !== 'function') {
        throw new Error('Model restoration requires browser base64 support.');
    }

    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
}

function getModelInputSize(model: tf.LayersModel): number | null {
    const maybeInputSize = model.inputs[0]?.shape?.[1];
    return typeof maybeInputSize === 'number' ? maybeInputSize : null;
}

function getExpectedSentimentModelInputSize() {
    return PITCH_CLASS_SET_NUMERICAL_FEATURE_HEADERS.length;
}

function isWeightSpec(value: unknown): value is tf.io.WeightsManifestEntry {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Record<string, unknown>;
    return typeof candidate.name === 'string'
        && Array.isArray(candidate.shape)
        && typeof candidate.dtype === 'string';
}

function getSortedChords(): PCS12[] {
    return Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));
}

function defuzzifySentimentScore(value: number): PredictedSentimentValue {
    if (value > 1 / 3) return 1;
    if (value < -1 / 3) return -1;
    return 0;
}

function normalizeFeatureMatrix(featureMatrix: number[][]): number[][] {
    if (featureMatrix.length === 0) return [];

    const featureCount = featureMatrix[0].length;
    const mins = Array.from({ length: featureCount }, (_, index) =>
        Math.min(...featureMatrix.map(row => row[index]))
    );
    const maxs = Array.from({ length: featureCount }, (_, index) =>
        Math.max(...featureMatrix.map(row => row[index]))
    );

    return featureMatrix.map(row => row.map((value, index) => {
        const range = maxs[index] - mins[index];
        if (range === 0) return 0;
        return (value - mins[index]) / range;
    }));
}

function buildDataset(sentiments: SentimentMap): DatasetBundle {
    const chords = getSortedChords();
    const featureMatrix = chords.map(chord => getPitchClassSetNumericalFeatures(chord));

    return {
        chords,
        normalizedFeatures: normalizeFeatureMatrix(featureMatrix),
        labeledTargets: chords.map(chord => sentiments[chord.toString()] ?? null),
    };
}

function buildTrainingDataset(dataset: DatasetBundle): TrainingDatasetBundle {
    const labeledRows = dataset.labeledTargets
        .map((value, index) => ({ value, index }))
        .filter((entry): entry is { value: PredictedSentimentValue; index: number } => entry.value !== null);

    return {
        normalizedFeatures: labeledRows.map(({ index }) => dataset.normalizedFeatures[index]),
        targets: labeledRows.map(({ value }) => value),
    };
}

function createSentimentModel(inputSize: number): tf.LayersModel {
    const hiddenUnits = Math.max(8, inputSize * 4);
    const model = tf.sequential({
        layers: [
            tf.layers.dense({
                inputShape: [inputSize],
                units: hiddenUnits,
                activation: 'tanh',
            }),
            tf.layers.dense({
                units: 1,
                activation: 'tanh',
            }),
        ],
    });

    compileSentimentModel(model);

    return model;
}

export function getSentimentModelSettings(model: tf.LayersModel): SentimentModelSettings {
    return {
        inputSize: getModelInputSize(model),
        optimizer: 'adam',
        learningRate: SENTIMENT_MODEL_LEARNING_RATE,
        loss: 'huberLoss',
        outputActivation: 'tanh',
        layers: model.layers.map(layer => ({
            className: layer.getClassName(),
            config: layer.getConfig() as Record<string, unknown>,
        })),
    };
}

export async function serializeSentimentModel(model: tf.LayersModel): Promise<SerializedSentimentModelArtifacts> {
    await tf.ready();

    const artifactHolder: { current: tf.io.ModelArtifacts | null } = { current: null };
    await model.save(tf.io.withSaveHandler(async (artifacts: tf.io.ModelArtifacts) => {
        artifactHolder.current = artifacts;
        return {
            modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(artifacts),
        };
    }));

    const modelArtifacts = artifactHolder.current;
    if (!modelArtifacts || !modelArtifacts.modelTopology || !modelArtifacts.weightSpecs) {
        throw new Error('Unable to serialize the trained neural-network weights.');
    }

    const inputSize = getModelInputSize(model);
    const expectedInputSize = getExpectedSentimentModelInputSize();
    if (inputSize !== null && inputSize !== expectedInputSize) {
        throw new Error(`The loaded neural-network expects ${inputSize} features, but this build provides ${expectedInputSize}.`);
    }

    return {
        format: modelArtifacts.format ?? null,
        generatedBy: modelArtifacts.generatedBy ?? null,
        convertedBy: modelArtifacts.convertedBy ?? null,
        modelTopology: modelArtifacts.modelTopology as Record<string, unknown>,
        weightSpecs: modelArtifacts.weightSpecs.map((spec: tf.io.WeightsManifestEntry) => ({ ...spec })),
        weightDataBase64: encodeArrayBufferToBase64(normalizeWeightData(modelArtifacts.weightData)),
        modelSettings: getSentimentModelSettings(model),
    };
}

export async function restoreSerializedSentimentModel(serialized: SerializedSentimentModelArtifacts): Promise<tf.LayersModel> {
    await tf.ready();

    if (!serialized.modelTopology || typeof serialized.modelTopology !== 'object') {
        throw new Error('The preset does not contain a valid neural-network topology.');
    }

    if (!Array.isArray(serialized.weightSpecs) || !serialized.weightSpecs.every(isWeightSpec)) {
        throw new Error('The preset does not contain valid neural-network weight metadata.');
    }

    if (typeof serialized.weightDataBase64 !== 'string') {
        throw new Error('The preset does not contain valid neural-network weight data.');
    }

    const expectedInputSize = getExpectedSentimentModelInputSize();
    const configuredInputSize = serialized.modelSettings?.inputSize ?? null;
    if (configuredInputSize !== null && configuredInputSize !== expectedInputSize) {
        throw new Error(`The preset neural network expects ${configuredInputSize} features, but this build provides ${expectedInputSize}.`);
    }

    const model = await tf.loadLayersModel({
        load: async () => ({
            format: serialized.format ?? undefined,
            generatedBy: serialized.generatedBy ?? undefined,
            convertedBy: serialized.convertedBy ?? undefined,
            modelTopology: serialized.modelTopology,
            weightSpecs: serialized.weightSpecs,
            weightData: decodeBase64ToArrayBuffer(serialized.weightDataBase64),
        }),
    });

    compileSentimentModel(model);

    const restoredInputSize = getModelInputSize(model);
    if (restoredInputSize !== null && restoredInputSize !== expectedInputSize) {
        model.dispose();
        throw new Error(`The restored neural network expects ${restoredInputSize} features, but this build provides ${expectedInputSize}.`);
    }

    return model;
}

function buildStats(
    predictedValues: PredictedSentimentValue[],
    rawOutputs: number[],
    labeledTargets: SentimentValue[],
    epochsCompleted: number,
    finalLoss: number | null,
    finalValidationLoss: number | null,
): SentimentTrainingStats {
    const labeledIndexes = labeledTargets
        .map((value, index) => ({ value, index }))
        .filter((entry): entry is { value: PredictedSentimentValue; index: number } => entry.value !== null);
    const labeledMatches = labeledIndexes.filter(({ value, index }) => predictedValues[index] === value).length;
    const absoluteError = labeledIndexes.reduce((sum, { value, index }) => {
        const rawOutput = rawOutputs[index];
        if (rawOutput === undefined) {
            throw new Error(`Missing model output for labeled sentiment at index ${index}.`);
        }
        return sum + Math.abs(rawOutput - value);
    }, 0);

    return {
        epochsCompleted,
        sampleCount: rawOutputs.length,
        labeledSampleCount: labeledIndexes.length,
        meanAbsoluteError: labeledIndexes.length > 0 ? absoluteError / labeledIndexes.length : null,
        accuracy: labeledIndexes.length > 0 ? labeledMatches / labeledIndexes.length : null,
        finalLoss,
        finalValidationLoss,
        updatedAt: new Date().toISOString(),
    };
}

async function runPrediction(model: tf.LayersModel, normalizedFeatures: number[][]): Promise<number[]> {
    const inputTensor = tf.tensor2d(normalizedFeatures);
    const outputTensor = model.predict(inputTensor) as tf.Tensor;

    try {
        return Array.from(await outputTensor.data());
    } finally {
        inputTensor.dispose();
        outputTensor.dispose();
    }
}

async function evaluateModel(
    model: tf.LayersModel,
    sentiments: SentimentMap,
    trainingSummary?: {
        epochsCompleted: number;
        finalLoss: number | null;
        finalValidationLoss: number | null;
    },
): Promise<{ predictions: SentimentPredictionMap; scores: SentimentScoreMap; stats: SentimentTrainingStats }> {
    const dataset = buildDataset(sentiments);
    const rawOutputs = await runPrediction(model, dataset.normalizedFeatures);
    const predictedValues = rawOutputs.map(value => defuzzifySentimentScore(value));
    const predictions = Object.fromEntries(
        dataset.chords.map((chord, index) => [chord.toString(), predictedValues[index] ?? 0])
    ) as SentimentPredictionMap;
    const scores = Object.fromEntries(
        dataset.chords.map((chord, index) => [chord.toString(), rawOutputs[index] ?? 0])
    ) as SentimentScoreMap;

    return {
        predictions,
        scores,
        stats: buildStats(
            predictedValues,
            rawOutputs,
            dataset.labeledTargets,
            trainingSummary?.epochsCompleted ?? 0,
            trainingSummary?.finalLoss ?? null,
            trainingSummary?.finalValidationLoss ?? null,
        ),
    };
}

function readLastMetric(history: tf.History['history'], key: string): number | null {
    const values = history[key];
    if (!values || values.length === 0) return null;
    const last = values[values.length - 1];
    return typeof last === 'number' ? last : Number(last);
}

function readFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStoredTrainingStats(value: unknown): SentimentTrainingStats | null {
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

export function loadStoredSentimentPredictions(): SentimentPredictionMap {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_PREDICTIONS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === -1 || value === 0 || value === 1)
        ) as SentimentPredictionMap;
    } catch (error) {
        console.error('Unable to load stored sentiment predictions.', error);
        return {};
    }
}

export function saveSentimentPredictions(predictions: SentimentPredictionMap) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PCS_SENTIMENT_PREDICTIONS_STORAGE_KEY, JSON.stringify(predictions));
}

export function loadStoredSentimentScores(): SentimentScoreMap {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_SCORES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        ) as SentimentScoreMap;
    } catch (error) {
        console.error('Unable to load stored sentiment scores.', error);
        return {};
    }
}

export function saveSentimentScores(scores: SentimentScoreMap) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PCS_SENTIMENT_SCORES_STORAGE_KEY, JSON.stringify(scores));
}

export function loadStoredSentimentTrainingStats(): SentimentTrainingStats | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(PCS_SENTIMENT_TRAINING_STATS_STORAGE_KEY);
        if (!raw) return null;
        return normalizeStoredTrainingStats(JSON.parse(raw));
    } catch (error) {
        console.error('Unable to load stored training stats.', error);
        return null;
    }
}

export function saveSentimentTrainingStats(stats: SentimentTrainingStats) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PCS_SENTIMENT_TRAINING_STATS_STORAGE_KEY, JSON.stringify(stats));
}

export function clearStoredSentimentTrainingStats() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PCS_SENTIMENT_TRAINING_STATS_STORAGE_KEY);
}

export async function clearStoredSentimentModel() {
    if (typeof window === 'undefined') return;

    try {
        const models = await tf.io.listModels();
        if (models[PCS_SENTIMENT_MODEL_STORAGE_URL]) {
            await tf.io.removeModel(PCS_SENTIMENT_MODEL_STORAGE_URL);
        }
    } catch (error) {
        console.error('Unable to remove the stored sentiment model.', error);
    }
}

export async function saveSentimentModel(model: tf.LayersModel) {
    await clearStoredSentimentModel();
    await model.save(PCS_SENTIMENT_MODEL_STORAGE_URL);
}

export async function loadStoredSentimentModel(): Promise<tf.LayersModel | null> {
    if (typeof window === 'undefined') return null;

    await tf.ready();

    try {
        const models = await tf.io.listModels();
        if (!models[PCS_SENTIMENT_MODEL_STORAGE_URL]) {
            return null;
        }

        const model = await tf.loadLayersModel(PCS_SENTIMENT_MODEL_STORAGE_URL);
        compileSentimentModel(model);
        return model;
    } catch (error) {
        console.error('Unable to load the stored sentiment model.', error);
        return null;
    }
}

export async function evaluateSentimentModel(
    model: tf.LayersModel,
    sentiments: SentimentMap,
    baselineStats?: Partial<SentimentTrainingStats>,
) {
    const result = await evaluateModel(model, sentiments, {
        epochsCompleted: baselineStats?.epochsCompleted ?? 0,
        finalLoss: baselineStats?.finalLoss ?? null,
        finalValidationLoss: baselineStats?.finalValidationLoss ?? null,
    });
    const stats: SentimentTrainingStats = {
        ...result.stats,
        epochsCompleted: baselineStats?.epochsCompleted ?? result.stats.epochsCompleted,
        finalLoss: baselineStats?.finalLoss ?? result.stats.finalLoss,
        finalValidationLoss: baselineStats?.finalValidationLoss ?? result.stats.finalValidationLoss,
    };
    saveSentimentPredictions(result.predictions);
    saveSentimentScores(result.scores);
    saveSentimentTrainingStats(stats);
    return { predictions: result.predictions, scores: result.scores, stats };
}

export async function importSentimentModel(files: File[], sentiments: SentimentMap) {
    await tf.ready();

    const jsonFile = files.find(file => file.name.toLowerCase().endsWith('.json'));
    const weightFiles = files.filter(file => file !== jsonFile);

    if (!jsonFile || weightFiles.length === 0) {
        throw new Error('Select the exported model JSON file and its matching weight file.');
    }

    const model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, ...weightFiles]));
    compileSentimentModel(model);

    const evaluation = await evaluateModel(model, sentiments);
    await saveSentimentModel(model);
    saveSentimentPredictions(evaluation.predictions);
    saveSentimentScores(evaluation.scores);
    saveSentimentTrainingStats(evaluation.stats);
    return { model, ...evaluation };
}

export async function exportSentimentModel(model: tf.LayersModel) {
    await model.save('downloads://kcomplex-pcs-sentiment-model');
}

export async function trainSentimentModel(
    sentiments: SentimentMap,
    onEpochEnd?: (epoch: number, totalEpochs: number, logs?: tf.Logs) => void,
) {
    await tf.ready();

    const dataset = buildDataset(sentiments);
    const trainingDataset = buildTrainingDataset(dataset);
    if (trainingDataset.targets.length === 0) {
        throw new Error('Label at least one pitch-class set before training the neural network.');
    }

    const totalEpochs = 300;
    const batchSize = trainingDataset.targets.length < 8
        ? trainingDataset.targets.length
        : Math.min(32, Math.max(8, Math.floor(trainingDataset.targets.length / 6)));
    const validationSplit = 0;
    const model = createSentimentModel(trainingDataset.normalizedFeatures[0]?.length ?? 1);
    const inputTensor = tf.tensor2d(trainingDataset.normalizedFeatures);
    const targetTensor = tf.tensor2d(trainingDataset.targets, [trainingDataset.targets.length, 1]);

    try {
        const history = await model.fit(inputTensor, targetTensor, {
            batchSize,
            epochs: totalEpochs,
            shuffle: true,
            validationSplit,
            callbacks: [
                tf.callbacks.earlyStopping({
                    monitor: 'loss',
                    mode: 'min',
                    patience: SENTIMENT_MODEL_EARLY_STOPPING_PATIENCE,
                    minDelta: SENTIMENT_MODEL_EARLY_STOPPING_MIN_DELTA,
                }),
                new tf.CustomCallback({
                    onEpochEnd: async (epoch, logs) => {
                        onEpochEnd?.(epoch + 1, totalEpochs, logs);
                    },
                }),
            ],
        });

        const epochsCompleted = history.epoch.length;
        const finalLoss = readLastMetric(history.history, 'loss');
        const finalValidationLoss = readLastMetric(history.history, 'val_loss');
        const evaluation = await evaluateModel(model, sentiments, {
            epochsCompleted,
            finalLoss,
            finalValidationLoss,
        });

        await saveSentimentModel(model);
        saveSentimentPredictions(evaluation.predictions);
        saveSentimentScores(evaluation.scores);
        saveSentimentTrainingStats(evaluation.stats);

        return { model, ...evaluation };
    } catch (error) {
        model.dispose();
        throw error;
    } finally {
        inputTensor.dispose();
        targetTensor.dispose();
    }
}
