import * as tf from '@tensorflow/tfjs';
import { PCS12 } from 'ultra-mega-enumerator';
import { getPitchClassSetNumericalFeatures, SentimentMap, SentimentValue } from './pcsSentiment';

export type PredictedSentimentValue = -1 | 0 | 1;
export type SentimentPredictionMap = Record<string, PredictedSentimentValue>;

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
export const PCS_SENTIMENT_TRAINING_STATS_STORAGE_KEY = 'kcomplex-pcs-sentiment-training-stats';

function getSortedChords(): PCS12[] {
    return Array.from(PCS12.getChords())
        .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));
}

function defuzzifySentimentScore(value: number): PredictedSentimentValue {
    if (value >= 1 / 3) return 1;
    if (value <= -1 / 3) return -1;
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
    const regularizer = tf.regularizers.l2({ l2: 0.0001 });
    const hiddenUnits = Math.max(8, inputSize * 4);
    const model = tf.sequential({
        layers: [
            tf.layers.dense({
                inputShape: [inputSize],
                units: hiddenUnits,
                activation: 'relu',
                kernelRegularizer: regularizer,
            }),
            tf.layers.dropout({ rate: 0.1 }),
            tf.layers.dense({
                units: hiddenUnits,
                activation: 'relu',
                kernelRegularizer: regularizer,
            }),
            tf.layers.dropout({ rate: 0.1 }),
            tf.layers.dense({
                units: 1,
                activation: 'tanh',
            }),
        ],
    });

    model.compile({
        optimizer: tf.train.adam(0.0005),
        loss: tf.losses.huberLoss,
        metrics: ['mae'],
    });

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
): Promise<{ predictions: SentimentPredictionMap; stats: SentimentTrainingStats }> {
    const dataset = buildDataset(sentiments);
    const rawOutputs = await runPrediction(model, dataset.normalizedFeatures);
    const predictedValues = rawOutputs.map(value => defuzzifySentimentScore(value));
    const predictions = Object.fromEntries(
        dataset.chords.map((chord, index) => [chord.toString(), predictedValues[index] ?? 0])
    ) as SentimentPredictionMap;

    return {
        predictions,
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
        model.compile({
            optimizer: tf.train.adam(0.003),
            loss: tf.losses.huberLoss,
            metrics: ['mae'],
        });
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
    saveSentimentTrainingStats(stats);
    return { predictions: result.predictions, stats };
}

export async function importSentimentModel(files: File[], sentiments: SentimentMap) {
    await tf.ready();

    const jsonFile = files.find(file => file.name.toLowerCase().endsWith('.json'));
    const weightFiles = files.filter(file => file !== jsonFile);

    if (!jsonFile || weightFiles.length === 0) {
        throw new Error('Select the exported model JSON file and its matching weight file.');
    }

    const model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, ...weightFiles]));
    model.compile({
        optimizer: tf.train.adam(0.003),
        loss: tf.losses.huberLoss,
        metrics: ['mae'],
    });

    const evaluation = await evaluateModel(model, sentiments);
    await saveSentimentModel(model);
    saveSentimentPredictions(evaluation.predictions);
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

    const totalEpochs = 500;
    const batchSize = trainingDataset.targets.length < 8
        ? trainingDataset.targets.length
        : Math.min(32, Math.max(8, Math.floor(trainingDataset.targets.length / 6)));
    const validationSplit = trainingDataset.targets.length >= 10 ? 0.2 : 0;
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
                    monitor: validationSplit > 0 ? 'val_loss' : 'loss',
                    patience: validationSplit > 0 ? 50 : 12,
                    restoreBestWeight: true,
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
