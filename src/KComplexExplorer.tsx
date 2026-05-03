import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListGroup, Form, Button, Modal, Badge, ProgressBar, Spinner, Alert } from 'react-bootstrap';
import { PCS12 } from 'ultra-mega-enumerator';
import { SubsetOf, SupersetOf } from 'ultra-mega-enumerator';
import * as tf from '@tensorflow/tfjs';
import PCS12Identifier from './PCS12Identifier';
import ChordListItem, { ChordDetails } from './ChordListItem';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';
import {
    buildPitchClassSetSentimentCsv,
    isConsonantPitchClassSet,
    isDissonantPitchClassSet,
    loadSentiments,
    saveSentiments,
    SentimentValue,
} from './pcsSentiment';
import {
    clearStoredSentimentModel,
    clearStoredSentimentTrainingStats,
    evaluateSentimentModel,
    loadStoredSentimentModel,
    loadStoredSentimentPredictions,
    loadStoredSentimentScores,
    loadStoredSentimentTrainingStats,
    restoreSerializedSentimentModel,
    saveSentimentModel,
    saveSentimentPredictions,
    saveSentimentScores,
    saveSentimentTrainingStats,
    serializeSentimentModel,
    SentimentPredictionMap,
    SentimentScoreMap,
    SentimentTrainingStats,
    trainSentimentModel,
} from './pcsSentimentModel';
import {
    createSentimentPresetRecord,
    deleteSentimentPresetRecord,
    exportSentimentPresetFile,
    getSentimentPresetDownloadName,
    importSentimentPresetFile,
    listSentimentPresetSummaries,
    loadSentimentPresetRecord,
    renameSentimentPresetRecord,
    saveSentimentPresetRecord,
    SentimentPresetRecord,
    SentimentPresetSnapshot,
    SentimentPresetSummary,
} from './sentimentPresets';
import {
    generateRandomPitchClassMatrix,
    RandomPitchClassMatrixSearchCancelledError,
} from './randomPitchClassMatrix';
import './KComplexExplorer.css';
import * as Tone from 'tone';
import { useSynth } from './SynthContext'; // Import the useSynth hook

interface KComplexExplorerProps {
    scale: string;
}

interface TrainingOverlayState {
    isBusy: boolean;
    progress: number;
    message: string;
}

interface MatrixSearchState {
    isSearching: boolean;
    progress: number;
    message: string;
}
    
const KComplexExplorer: React.FC<KComplexExplorerProps> = ({ scale }) => {
    const pendingMainSelectionRef = useRef<string | null>(null);
    const [pcs12List, setPcs12List] = useState<PCS12[]>([]);
    const [supersets, setSupersets] = useState<PCS12[]>([]);
    const [subsets, setSubsets] = useState<PCS12[]>([]);
    const [selectedPcs, setSelectedPcs] = useState<string | null>(null);
    const [selectedScale, setSelectedScale] = useState<string>(scale);
    const [showPcsPopover, setShowPcsPopover] = useState('');
    const [showSupersetPopover, setShowSupersetPopover] = useState('');
    const [showSubsetPopover, setShowSubsetPopover] = useState('');
    const [activeSuperset, setActiveSuperset] = useState<string | null>(null);
    const [activeSubset, setActiveSubset] = useState<string | null>(null);
    const [showPcs12Modal, setShowPcs12Modal] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);

    // Search states
    const [pcsSearch, setPcsSearch] = useState('');
    const [supersetSearch, setSupersetSearch] = useState('');
    const [subsetSearch, setSubsetSearch] = useState('');

    // Set operations states (intersection & union)
    const [setOpItems, setSetOpItems] = useState<string[]>([]);
    const [showSetOps, setShowSetOps] = useState(false);
    const [setOpMode, setSetOpMode] = useState<'intersection' | 'union'>('intersection');

    // Z-relation modal
    const [showZModal, setShowZModal] = useState(false);
    const [zModalChord, setZModalChord] = useState<PCS12 | null>(null);
    const [zMates, setZMates] = useState<PCS12[]>([]);

    // Batch sentiment modal
    type BatchFilterMode = 'bySize' | 'byForteClass' | 'visible' | 'consonant' | 'dissonant';
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [batchFilterMode, setBatchFilterMode] = useState<BatchFilterMode>('bySize');
    const [batchSizeValue, setBatchSizeValue] = useState(7);
    const [batchForteClass, setBatchForteClass] = useState('');
    const [batchSentimentValue, setBatchSentimentValue] = useState<SentimentValue>(1);
    const [sentiments, setSentiments] = useState(() => loadSentiments());
    const [predictedSentiments, setPredictedSentiments] = useState<SentimentPredictionMap>(() => loadStoredSentimentPredictions());
    const [predictedSentimentScores, setPredictedSentimentScores] = useState<SentimentScoreMap>(() => loadStoredSentimentScores());
    const [trainingStats, setTrainingStats] = useState<SentimentTrainingStats | null>(() => loadStoredSentimentTrainingStats());
    const [hasStoredModel, setHasStoredModel] = useState(false);
    const [trainingOverlay, setTrainingOverlay] = useState<TrainingOverlayState>({ isBusy: false, progress: 0, message: '' });
    const [modelFeedback, setModelFeedback] = useState<string>('');
    const [presetSummaries, setPresetSummaries] = useState<SentimentPresetSummary[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
    const [presetNameDraft, setPresetNameDraft] = useState('');
    const [isPresetBusy, setIsPresetBusy] = useState(false);
    const [matrixSearchState, setMatrixSearchState] = useState<MatrixSearchState>({ isSearching: false, progress: 0, message: '' });
    const [matrixRowCount, setMatrixRowCount] = useState(3);
    const [matrixColumnCount, setMatrixColumnCount] = useState(4);
    const [matrixNoteCount, setMatrixNoteCount] = useState(3);
    const [matrixStiffness, setMatrixStiffness] = useState(0);
    const [matrixStasisWeight, setMatrixStasisWeight] = useState(0.1);
    const [matrixOutput, setMatrixOutput] = useState('');
    const modelRef = useRef<tf.LayersModel | null>(null);
    const trainingStatsRef = useRef<SentimentTrainingStats | null>(trainingStats);
    const importPresetInputRef = useRef<HTMLInputElement>(null);
    const skipSentimentRefreshRef = useRef(false);
    const cancelMatrixSearchRef = useRef(false);

    // Create refs for your lists
    const pcsListRef = useRef<HTMLDivElement>(null);
    const supersetsRef = useRef<HTMLDivElement>(null);
    const subsetsRef = useRef<HTMLDivElement>(null);
    const synth = useSynth();

    // Filtered lists for search
    const matchesSearch = useCallback((chord: PCS12, query: string): boolean => {
        if (!query.trim()) return true;
        const q = query.toLowerCase().trim();
        return chord.toString().toLowerCase().includes(q) ||
            (chord.getCommonName() || '').toLowerCase().includes(q);
    }, []);

    const filteredPcs = useMemo(() =>
        pcs12List.filter(c => matchesSearch(c, pcsSearch)),
        [pcs12List, pcsSearch, matchesSearch]
    );
    const filteredSupersets = useMemo(() =>
        supersets.filter(c => matchesSearch(c, supersetSearch)),
        [supersets, supersetSearch, matchesSearch]
    );
    const filteredSubsets = useMemo(() =>
        subsets.filter(c => matchesSearch(c, subsetSearch)),
        [subsets, subsetSearch, matchesSearch]
    );

    const selectedPresetSummary = useMemo(() => (
        presetSummaries.find(preset => preset.id === selectedPresetId) ?? null
    ), [presetSummaries, selectedPresetId]);

    const updateLoadedModel = useCallback((nextModel: tf.LayersModel | null) => {
        if (modelRef.current && modelRef.current !== nextModel) {
            modelRef.current.dispose();
        }

        modelRef.current = nextModel;
        setHasStoredModel(nextModel !== null);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadModel = async () => {
            const storedPredictions = loadStoredSentimentPredictions();
            const storedScores = loadStoredSentimentScores();
            const storedModel = await loadStoredSentimentModel();
            if (cancelled) {
                storedModel?.dispose();
                return;
            }

            updateLoadedModel(storedModel);

            if (storedModel && (Object.keys(storedPredictions).length === 0 || Object.keys(storedScores).length === 0)) {
                const evaluation = await evaluateSentimentModel(storedModel, sentiments, trainingStats ?? undefined);
                if (!cancelled) {
                    setPredictedSentiments(evaluation.predictions);
                    setPredictedSentimentScores(evaluation.scores);
                    setTrainingStats(prev => prev ?? evaluation.stats);
                }
            }
        };

        loadModel().catch(error => {
            console.error('Unable to initialize the stored sentiment model.', error);
            if (!cancelled) {
                setModelFeedback('Unable to load the saved neural-network weights.');
            }
        });

        return () => {
            cancelled = true;
        };
    }, [updateLoadedModel]);

    useEffect(() => () => {
        modelRef.current?.dispose();
        modelRef.current = null;
    }, []);

    // Set operation computation (intersection or union)
    const setOpResult = useMemo(() => {
        if (setOpItems.length < 2) return null;
        const chords = setOpItems.map(f => PCS12.parseForte(f)).filter(Boolean) as PCS12[];
        if (chords.length < 2) return null;
        const sequences = chords.map(c => new Set(c.asSequence()));
        let resultSet: Set<number>;
        if (setOpMode === 'intersection') {
            resultSet = new Set([...sequences[0]].filter(pc => sequences.every(s => s.has(pc))));
        } else {
            resultSet = new Set(sequences.flatMap(s => [...s]));
        }
        if (resultSet.size === 0) return PCS12.empty();
        return PCS12.identify(PCS12.createWithSizeAndSet(12, resultSet));
    }, [setOpItems, setOpMode]);

    const addToSetOp = useCallback((forte: string) => {
        setSetOpItems(prev => {
            if (prev.includes(forte)) return prev;
            const next = [...prev, forte];
            if (next.length >= 2) setShowSetOps(true);
            return next;
        });
    }, []);

    const removeFromSetOp = useCallback((forte: string) => {
        setSetOpItems(prev => prev.filter(f => f !== forte));
    }, []);

    const clearSetOp = useCallback(() => {
        setSetOpItems([]);
        setShowSetOps(false);
    }, []);

    // Z-relation: find all chords with the same interval vector
    const showZRelations = useCallback((chord: PCS12) => {
        const iv = chord.getIntervalVector();
        if (!iv) return;
        const ivStr = iv.join(',');
        const allChords = Array.from(PCS12.getChords());
        const mates = allChords.filter(c => {
            const civ = c.getIntervalVector();
            return civ && civ.join(',') === ivStr && c.toString() !== chord.toString();
        }).sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));
        setZModalChord(chord);
        setZMates(mates);
        setShowZModal(true);
    }, []);

    const refreshPcs = useCallback(() => {
        if (!PCS12 || !PCS12.isInitialized()) return;

        const parsedScale = PCS12.parseForte(selectedScale);
        if(!parsedScale) return;
        const pred = new SubsetOf(parsedScale);
        const allChords = PCS12.getChords();
        const filteredChords = Array.from(allChords)
            .filter(pc => pred.apply(pc))
            .sort((a, b) => PCS12.ReverseForteStringComparator(a.toString(), b.toString()));

        setPcs12List(filteredChords);
    }, [selectedScale]);

    useEffect(() => {
        refreshPcs();
    }, [selectedScale, refreshPcs]);

    useEffect(() => {
        saveSentiments(sentiments);
    }, [sentiments]);

    useEffect(() => {
        trainingStatsRef.current = trainingStats;
    }, [trainingStats]);

    useEffect(() => {
        if (skipSentimentRefreshRef.current) {
            skipSentimentRefreshRef.current = false;
            return;
        }

        if (!modelRef.current) return;

        let cancelled = false;

        evaluateSentimentModel(modelRef.current, sentiments, trainingStatsRef.current ?? undefined).then(result => {
            if (cancelled) return;
            setPredictedSentiments(result.predictions);
            setPredictedSentimentScores(result.scores);
            setTrainingStats(result.stats);
        }).catch(error => {
            console.error('Unable to refresh neural-network sentiment predictions.', error);
        });

        return () => {
            cancelled = true;
        };
    }, [sentiments]);

    const handleSelect = (chord: string) => {
        if (!chord || !PCS12.parseForte(chord)) {
            console.error(`handleSelect: Invalid chord selected - "${chord}".`);
            return;
        }
        setSelectedPcs(chord);
        const selectedChord = PCS12.parseForte(chord);

        if (selectedChord) {
            setShowSupersetPopover('');
            setShowSubsetPopover('');
            setSupersetSearch('');
            setSubsetSearch('');
            const supersetChecker = new SupersetOf(selectedChord);
            const subsetChecker = new SubsetOf(selectedChord);

            const foundSupersets = Array.from(pcs12List)
                .filter(chord => supersetChecker.apply(chord))
                .sort((a, b) => PCS12.ForteStringComparator(a.toString(), b.toString()));
            setSupersets(foundSupersets);

            const foundSubsets = Array.from(pcs12List)
                .filter(chord => subsetChecker.apply(chord))
                .sort((a, b) => PCS12.ReverseForteStringComparator(a.toString(), b.toString()));
            setSubsets(foundSubsets);
        }
    };

    const handleScaleChange = (str: string) => {
        if (str) {
            setSelectedScale(str);
            setActiveSubset(null);
            setActiveSuperset(null);
            setSelectedPcs(null);

            setSupersets([]);
            setSubsets([]);

            setShowPcsPopover('');
            setShowSupersetPopover('');
            setShowSubsetPopover('');
            setPcsSearch('');
            setSupersetSearch('');
            setSubsetSearch('');
        }
    };

    const selectChordInMainList = useCallback((chord: PCS12) => {
        const forte = chord.toString();
        pendingMainSelectionRef.current = forte;
        setPcsSearch('');
        setActiveSubset(null);
        setActiveSuperset(null);
        setShowSupersetPopover('');
        setShowSubsetPopover('');
        handleSelect(forte);
        setShowPcsPopover(forte);
    }, [handleSelect]);

    // Scroll event handler
    const handleScroll = () => {
        setShowPcsPopover(''); // Reset PCS popover
        setShowSupersetPopover(''); // Reset Superset popover
        setShowSubsetPopover(''); // Reset Subset popover
    };
    // Function to close all popovers
    const handleClickOutside = (event: MouseEvent) => {
        const isInsidePcs = pcsListRef.current && pcsListRef.current.contains(event.target as Node);
        const isInsideSupersets = supersetsRef.current && supersetsRef.current.contains(event.target as Node);
        const isInsideSubsets = subsetsRef.current && subsetsRef.current.contains(event.target as Node);

        if (!isInsidePcs && !isInsideSupersets && !isInsideSubsets) {
            setShowPcsPopover('');
            setShowSupersetPopover('');
            setShowSubsetPopover('');
        }
    };
    // Adding scroll event listeners when lists are populated
    useEffect(() => {
        const pcsList = pcsListRef.current;
        const supersetsList = supersetsRef.current;
        const subsetsList = subsetsRef.current;
        window.addEventListener('scroll', handleScroll);
        // Attach scroll event listeners to list elements
        pcsList?.addEventListener('scroll', handleScroll);
        const superL = () => {setShowSupersetPopover('');};
        supersetsList?.addEventListener('scroll', superL);
        const subL = () => {setShowSubsetPopover('');};
        subsetsList?.addEventListener('scroll', subL);

        // Cleanup function to remove event listeners
        return () => {
            window.removeEventListener('scroll', handleScroll);
            pcsList?.removeEventListener('scroll', handleScroll);
            supersetsList?.removeEventListener('scroll', superL);
            subsetsList?.removeEventListener('scroll', subL);
        };
    }, [pcs12List, supersets, subsets]); // Add dependencies as needed
    // Listening to clicks outside
    useEffect(() => {
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const forte = pendingMainSelectionRef.current;
        if (!forte || selectedPcs !== forte) return;

        const itemId = `pcs-item-${encodeURIComponent(forte)}`;
        const scrollToSelected = () => {
            const element = document.getElementById(itemId);
            if (!element) return;

            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            pendingMainSelectionRef.current = null;
        };

        window.requestAnimationFrame(scrollToSelected);
    }, [filteredPcs, selectedPcs]);
    

    const playChordSeq = useCallback((chord: PCS12, down:boolean = false) => {
        const now = Tone.now();

        let nums = chord.asSequence();
        
        if(down) nums = nums.reverse();
        // Calculate and play each note in the chord sequentially
        nums.forEach((pc, index) => {
            const note = Tone.Frequency(pc + 72, "midi").toNote(); // 60 is C4
            synth.triggerAttackRelease(note, 0.25, now + index * 0.25); 
        });

    },[synth]);
    
    const playChordSimul = useCallback((chord: PCS12) => {
        const now = Tone.now();
        let nums = chord.asSequence();
        const vel = Math.sqrt(1.0/chord.getK());
        synth.triggerAttackRelease(nums.map(pc => Tone.Frequency(pc + 72, "midi").toNote()), 1, now, vel);
    },[synth]);
    
    const copyToClipboard = useCallback(async (text: string) => {
        await navigator.clipboard.writeText(text);
    },[]);

    const formatPitchClassMatrix = useCallback((matrix: PCS12[][]) =>
        matrix.map(row => row.map(chord => chord.toString()).join(' ')).join('\n')
    , []);

    const updateSentiment = useCallback((chord: PCS12, sentiment: SentimentValue) => {
        const forte = chord.toString();
        setSentiments(prev => ({
            ...prev,
            [forte]: prev[forte] === sentiment ? null : sentiment,
        }));
    }, []);

    const getForteBaseClass = useCallback((forteStr: string): string => {
        const dotIndex = forteStr.indexOf('.');
        return dotIndex === -1 ? forteStr : forteStr.slice(0, dotIndex);
    }, []);

    const batchTargetChords = useMemo((): PCS12[] => {
        const allChords = Array.from(PCS12.getChords());
        if (batchFilterMode === 'bySize') {
            return allChords.filter(c => c.getK() === batchSizeValue);
        }
        if (batchFilterMode === 'byForteClass') {
            const target = batchForteClass.trim();
            if (!target) return [];
            return allChords.filter(c => getForteBaseClass(c.toString()) === target);
        }
        if (batchFilterMode === 'consonant') {
            return allChords.filter(isConsonantPitchClassSet);
        }
        if (batchFilterMode === 'dissonant') {
            return allChords.filter(isDissonantPitchClassSet);
        }
        // 'visible' - matches currently visible main list
        return filteredPcs;
    }, [batchFilterMode, batchSizeValue, batchForteClass, filteredPcs, getForteBaseClass]);

    const applyBatchSentiment = useCallback(() => {
        if (batchTargetChords.length === 0) return;
        setSentiments(prev => {
            const next = { ...prev };
            for (const chord of batchTargetChords) {
                next[chord.toString()] = batchSentimentValue;
            }
            return next;
        });
        setShowBatchModal(false);
    }, [batchTargetChords, batchSentimentValue]);

    const exportSentimentsToCsv = useCallback(() => {
        const csv = buildPitchClassSetSentimentCsv(sentiments);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'pitch-class-set-sentiments.csv';
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }, 100);
    }, [sentiments]);

    const refreshPresetSummaries = useCallback(async () => {
        const summaries = await listSentimentPresetSummaries();
        setPresetSummaries(summaries);
        setSelectedPresetId(currentId => {
            if (!currentId) {
                return summaries[0]?.id ?? null;
            }

            return summaries.some(summary => summary.id === currentId)
                ? currentId
                : summaries[0]?.id ?? null;
        });
        setPresetNameDraft(currentName => currentName || summaries[0]?.name || '');
        return summaries;
    }, []);

    useEffect(() => {
        refreshPresetSummaries().catch(error => {
            console.error('Unable to initialize the saved preset list.', error);
        });
    }, [refreshPresetSummaries]);

    const buildCurrentPresetSnapshot = useCallback(async (): Promise<SentimentPresetSnapshot> => {
        const serializedModel = modelRef.current ? await serializeSentimentModel(modelRef.current) : null;
        return {
            sentiments: { ...sentiments },
            predictedSentiments: serializedModel ? { ...predictedSentiments } : {},
            predictedSentimentScores: serializedModel ? { ...predictedSentimentScores } : {},
            trainingStats: serializedModel && trainingStats ? { ...trainingStats } : null,
            serializedModel,
        };
    }, [predictedSentimentScores, predictedSentiments, sentiments, trainingStats]);

    const createEmptyPresetSnapshot = useCallback((): SentimentPresetSnapshot => ({
        sentiments: {},
        predictedSentiments: {},
        predictedSentimentScores: {},
        trainingStats: null,
        serializedModel: null,
    }), []);

    const downloadTextFile = useCallback((text: string, fileName: string, contentType: string) => {
        const blob = new Blob([text], { type: contentType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }, 100);
    }, []);

    const applyPresetRecord = useCallback(async (record: SentimentPresetRecord) => {
        const snapshot = record.snapshot;
        const nextModel = snapshot.serializedModel
            ? await restoreSerializedSentimentModel(snapshot.serializedModel)
            : null;

        skipSentimentRefreshRef.current = true;
        updateLoadedModel(nextModel);
        setSentiments({ ...snapshot.sentiments });
        setPredictedSentiments({ ...snapshot.predictedSentiments });
        setPredictedSentimentScores({ ...snapshot.predictedSentimentScores });
        setTrainingStats(snapshot.trainingStats ? { ...snapshot.trainingStats } : null);

        saveSentiments(snapshot.sentiments);
        saveSentimentPredictions(snapshot.predictedSentiments);
        saveSentimentScores(snapshot.predictedSentimentScores);

        if (snapshot.trainingStats) {
            saveSentimentTrainingStats(snapshot.trainingStats);
        } else {
            clearStoredSentimentTrainingStats();
        }

        if (nextModel) {
            await saveSentimentModel(nextModel);
        } else {
            await clearStoredSentimentModel();
        }
    }, [updateLoadedModel]);

    const openPresetManager = useCallback(async () => {
        setModelFeedback('');
        setShowPresetModal(true);
        try {
            await refreshPresetSummaries();
        } catch (error) {
            console.error('Unable to load the saved preset list.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to load the saved preset list.');
        }
    }, [refreshPresetSummaries]);

    const handleSavePreset = useCallback(async () => {
        const name = presetNameDraft.trim();
        if (!name) {
            setModelFeedback('Enter a preset name before saving.');
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const snapshot = await buildCurrentPresetSnapshot();
            const record = createSentimentPresetRecord({ name, snapshot });
            const saved = await saveSentimentPresetRecord(record);
            const summaries = await refreshPresetSummaries();
            setSelectedPresetId(saved.id);
            setPresetNameDraft(saved.name);
            setModelFeedback(`Saved preset "${saved.name}".`);
            if (summaries.length === 1) {
                setSelectedPresetId(saved.id);
            }
        } catch (error) {
            console.error('Unable to save the current preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to save the current preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [buildCurrentPresetSnapshot, presetNameDraft, refreshPresetSummaries]);

    const handleOverwriteSelectedPreset = useCallback(async () => {
        if (!selectedPresetId) {
            setModelFeedback('Select a preset before overwriting it.');
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const existing = await loadSentimentPresetRecord(selectedPresetId);
            if (!existing) {
                throw new Error('The selected preset could not be found.');
            }

            const snapshot = await buildCurrentPresetSnapshot();
            const saved = await saveSentimentPresetRecord({
                ...existing,
                name: presetNameDraft.trim() || existing.name,
                snapshot,
            });
            await refreshPresetSummaries();
            setSelectedPresetId(saved.id);
            setPresetNameDraft(saved.name);
            setModelFeedback(`Updated preset "${saved.name}".`);
        } catch (error) {
            console.error('Unable to overwrite the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to overwrite the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [buildCurrentPresetSnapshot, presetNameDraft, refreshPresetSummaries, selectedPresetId]);

    const handleLoadSelectedPreset = useCallback(async () => {
        if (!selectedPresetId) {
            setModelFeedback('Select a preset before loading it.');
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const record = await loadSentimentPresetRecord(selectedPresetId);
            if (!record) {
                throw new Error('The selected preset could not be found.');
            }

            await applyPresetRecord(record);
            setPresetNameDraft(record.name);
            setModelFeedback(`Loaded preset "${record.name}".`);
        } catch (error) {
            console.error('Unable to load the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to load the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [applyPresetRecord, selectedPresetId]);

    const handleRenameSelectedPreset = useCallback(async () => {
        if (!selectedPresetId) {
            setModelFeedback('Select a preset before renaming it.');
            return;
        }

        const nextName = presetNameDraft.trim();
        if (!nextName) {
            setModelFeedback('Enter a preset name before renaming it.');
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const renamed = await renameSentimentPresetRecord(selectedPresetId, nextName);
            await refreshPresetSummaries();
            setSelectedPresetId(renamed.id);
            setPresetNameDraft(renamed.name);
            setModelFeedback(`Renamed preset to "${renamed.name}".`);
        } catch (error) {
            console.error('Unable to rename the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to rename the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [presetNameDraft, refreshPresetSummaries, selectedPresetId]);

    const handleDeleteSelectedPreset = useCallback(async () => {
        if (!selectedPresetId || !selectedPresetSummary) {
            setModelFeedback('Select a preset before deleting it.');
            return;
        }

        if (!window.confirm(`Delete preset "${selectedPresetSummary.name}"?`)) {
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            await deleteSentimentPresetRecord(selectedPresetId);
            const summaries = await refreshPresetSummaries();
            const nextSummary = summaries[0] ?? null;
            setSelectedPresetId(nextSummary?.id ?? null);
            setPresetNameDraft(nextSummary?.name ?? '');
            setModelFeedback(`Deleted preset "${selectedPresetSummary.name}".`);
        } catch (error) {
            console.error('Unable to delete the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to delete the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [refreshPresetSummaries, selectedPresetId, selectedPresetSummary]);

    const handleExportSelectedPreset = useCallback(async () => {
        if (!selectedPresetId) {
            setModelFeedback('Select a preset before exporting it.');
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const record = await loadSentimentPresetRecord(selectedPresetId);
            if (!record) {
                throw new Error('The selected preset could not be found.');
            }

            const fileText = exportSentimentPresetFile(record);
            downloadTextFile(fileText, getSentimentPresetDownloadName(record.name), 'application/json;charset=utf-8');
            setModelFeedback(`Exported preset "${record.name}".`);
        } catch (error) {
            console.error('Unable to export the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to export the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [downloadTextFile, selectedPresetId]);

    const handleImportPresetClick = useCallback(() => {
        importPresetInputRef.current?.click();
    }, []);

    const handleImportPreset = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        event.target.value = '';

        if (!file) {
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const rawText = await file.text();
            const importedRecord = importSentimentPresetFile(rawText);
            const savedRecord = await saveSentimentPresetRecord(importedRecord);
            await applyPresetRecord(savedRecord);
            await refreshPresetSummaries();
            setSelectedPresetId(savedRecord.id);
            setPresetNameDraft(savedRecord.name);
            setShowPresetModal(true);
            setModelFeedback(`Imported and loaded preset "${savedRecord.name}".`);
        } catch (error) {
            console.error('Unable to import the preset file.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to import the preset file.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [applyPresetRecord, refreshPresetSummaries]);

    const handleClearCurrentWorkspace = useCallback(async () => {
        if (!window.confirm('Clear the current sentiments, predictions, and loaded model?')) {
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const clearedRecord = createSentimentPresetRecord({
                name: 'Cleared Workspace',
                snapshot: createEmptyPresetSnapshot(),
            });
            await applyPresetRecord(clearedRecord);
            setModelFeedback('Cleared the current sentiment workspace.');
        } catch (error) {
            console.error('Unable to clear the current sentiment workspace.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to clear the current sentiment workspace.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [applyPresetRecord, createEmptyPresetSnapshot]);

    const handleResetSelectedPreset = useCallback(async () => {
        if (!selectedPresetId || !selectedPresetSummary) {
            setModelFeedback('Select a preset before resetting it.');
            return;
        }

        if (!window.confirm(`Reset preset "${selectedPresetSummary.name}" to an empty workspace?`)) {
            return;
        }

        setIsPresetBusy(true);
        setModelFeedback('');

        try {
            const existing = await loadSentimentPresetRecord(selectedPresetId);
            if (!existing) {
                throw new Error('The selected preset could not be found.');
            }

            const resetRecord = await saveSentimentPresetRecord({
                ...existing,
                snapshot: createEmptyPresetSnapshot(),
            });
            await applyPresetRecord(resetRecord);
            await refreshPresetSummaries();
            setSelectedPresetId(resetRecord.id);
            setPresetNameDraft(resetRecord.name);
            setModelFeedback(`Reset preset "${resetRecord.name}" and cleared the current workspace.`);
        } catch (error) {
            console.error('Unable to reset the selected preset.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to reset the selected preset.');
        } finally {
            setIsPresetBusy(false);
        }
    }, [applyPresetRecord, createEmptyPresetSnapshot, refreshPresetSummaries, selectedPresetId, selectedPresetSummary]);

    const handleTrainNeuralNetwork = useCallback(async () => {
        setModelFeedback('');
        setTrainingOverlay({
            isBusy: true,
            progress: 0,
            message: 'Preparing sentiment training data...',
        });

        try {
            const result = await trainSentimentModel(sentiments, (epoch, totalEpochs, logs) => {
                const percent = Math.round((epoch / Math.max(totalEpochs, 1)) * 100);
                const lossText = typeof logs?.loss === 'number' ? ` — loss ${logs.loss.toFixed(4)}` : '';
                setTrainingOverlay({
                    isBusy: true,
                    progress: percent,
                    message: `Training neural network (${epoch}/${totalEpochs})${lossText}`,
                });
            });

            updateLoadedModel(result.model);
            setPredictedSentiments(result.predictions);
            setPredictedSentimentScores(result.scores);
            setTrainingStats(result.stats);
            setModelFeedback('Neural-network training complete. Predictions and weights were saved locally.');
            setTrainingOverlay({
                isBusy: true,
                progress: 100,
                message: 'Updating predicted sentiments...',
            });
        } catch (error) {
            console.error('Unable to train the sentiment neural network.', error);
            setModelFeedback(error instanceof Error ? error.message : 'Unable to train the neural network.');
        } finally {
            window.setTimeout(() => {
                setTrainingOverlay({ isBusy: false, progress: 0, message: '' });
            }, 250);
        }
    }, [sentiments, updateLoadedModel]);

    const handleCancelMatrixSearch = useCallback(() => {
        cancelMatrixSearchRef.current = true;
        setMatrixSearchState(prev => ({
            ...prev,
            message: 'Cancelling matrix search...',
        }));
    }, []);

    const handleGenerateRandomMatrix = useCallback(async () => {
        const upperBound = PCS12.parseForte(selectedScale);
        if (!upperBound) {
            setModelFeedback('Unable to read the selected upper bound.');
            return;
        }

        cancelMatrixSearchRef.current = false;
        setMatrixOutput('');
        setModelFeedback('');
        setMatrixSearchState({
            isSearching: true,
            progress: 0,
            message: 'Preparing constrained matrix search...',
        });

        try {
            const result = await generateRandomPitchClassMatrix({
                upperBound,
                rows: matrixRowCount,
                columns: matrixColumnCount,
                noteCount: matrixNoteCount,
                predictions: predictedSentiments,
                predictionScores: predictedSentimentScores,
                stiffness: matrixStiffness,
                stasisWeight: matrixStasisWeight,
                shouldCancel: () => cancelMatrixSearchRef.current,
                onProgress: progress => setMatrixSearchState({
                    isSearching: true,
                    progress: progress.progress,
                    message: progress.message,
                }),
            });

            setMatrixOutput(formatPitchClassMatrix(result.matrix));
            setModelFeedback(
                `Generated a random ${matrixRowCount}×${matrixColumnCount} matrix from ${result.candidateCount} attractive candidates `
                + `at β=${matrixStiffness.toFixed(1)}, stasis=${matrixStasisWeight.toFixed(2)}, seed=${result.seed}.`
            );
            setMatrixSearchState({
                isSearching: true,
                progress: 100,
                message: 'Matrix found.',
            });
        } catch (error) {
            if (error instanceof RandomPitchClassMatrixSearchCancelledError) {
                setModelFeedback('Constrained matrix search cancelled.');
            } else {
                console.error('Unable to generate a random pitch-class matrix.', error);
                setModelFeedback(error instanceof Error ? error.message : 'Unable to generate a constrained matrix.');
            }
        } finally {
            window.setTimeout(() => {
                setMatrixSearchState({ isSearching: false, progress: 0, message: '' });
            }, 250);
        }
    }, [formatPitchClassMatrix, matrixColumnCount, matrixNoteCount, matrixRowCount, matrixStasisWeight, matrixStiffness, predictedSentimentScores, predictedSentiments, selectedScale]);

    // Polychord UI state and computation
    const [showPolychord, setShowPolychord] = useState(false);
    const [polychordText, setPolychordText] = useState('');
    const [polychordResult, setPolychordResult] = useState('');

    const computePolychord = useCallback(() => {
        const parsedScale = PCS12.parseForte(selectedScale);
        if (!parsedScale) {
            setPolychordResult('');
            return;
        }
        const scaleSeq = parsedScale.asSequence();
        const k = parsedScale.getK();

        const entries = polychordText.split(',').map(s => s.trim()).filter(Boolean);
        const out: string[] = [];

        for (const entry of entries) {
            const tokens = entry.split(/\s+/).map(t => t.trim()).filter(Boolean);
            const chords: PCS12[] = tokens.map(t => PCS12.parseForte(t)).filter(Boolean) as PCS12[];

            let o = BigInt(0);
            for (let i = 0; i < chords.length; i++) {
                const seq = chords[i].asSequence();
                let seg = BigInt(0);
                for (const pc of seq) {
                    const idx = scaleSeq.indexOf(pc);
                    if (idx === -1) continue;
                    seg |= (BigInt(1) << BigInt(idx));
                }
                const shift = BigInt(i * k);
                o |= (seg << shift);
            }

            out.push(o.toString());
        }

        setPolychordResult(out.join(' '));
    }, [polychordText, selectedScale]);

    // Chord Sorter UI state and computation
    const [showChordSorter, setShowChordSorter] = useState(false);
    const [chordSorterText, setChordSorterText] = useState('');
    const [chordSorterRotate, setChordSorterRotate] = useState(0);
    const [chordSorterResult, setChordSorterResult] = useState('');
    const [chordSorterError, setChordSorterError] = useState('');

    const computeChordSort = useCallback(() => {
        setChordSorterError('');
        const tokens = chordSorterText.trim().split(/\s+/).filter(Boolean);
        const invalid: string[] = [];
        const chords: PCS12[] = [];
        for (const t of tokens) {
            const c = PCS12.parseForte(t);
            if (c) {
                chords.push(c);
            } else {
                invalid.push(t);
            }
        }
        if (invalid.length > 0) {
            setChordSorterError(`Invalid Forte number(s): ${invalid.join(', ')}`);
        }
        chords.sort((a, b) => a.rotatedCompareTo(b, chordSorterRotate));
        setChordSorterResult(chords.map(c => c.toString()).join(' '));
    }, [chordSorterText, chordSorterRotate]);

    const isBusy = trainingOverlay.isBusy || matrixSearchState.isSearching || isPresetBusy;
    const activeOverlay = trainingOverlay.isBusy
        ? { progress: trainingOverlay.progress, message: trainingOverlay.message, canCancel: false }
        : matrixSearchState.isSearching
            ? { progress: matrixSearchState.progress, message: matrixSearchState.message, canCancel: true }
            : null;

    return (
        <div className="KComplexExplorer">
            <div className="header">
                <Form.Group controlId="scaleSelect" style={{ textAlign: 'left', paddingLeft:'1em', marginBottom: '1em' }}>
                    <Form.Label><strong>Upper Bound: </strong></Form.Label>
                    <Form.Control
                        as="select"
                        value={selectedScale}
                        onChange={(e) => handleScaleChange(e.target.value)}
                        style={{margin:'0', paddingLeft:'5px', position:'absolute', left: '130px', top: '-5px',maxWidth: '12ch'}}
                    >
                        {Array.from(PCS12.getChords())
                            .map(ch => ch.toString())
                            .sort(PCS12.ReverseForteStringComparator)
                            .map(chord => (
                                <option key={`scale${chord}`} value={chord}>
                                    {chord}
                                </option>
                        ))}
                    </Form.Control>
                </Form.Group>
                <div className="header-actions">
                    <Button
                        variant="info"
                        onClick={() => setShowPcs12Modal(true)}
                    >
                        Identify
                    </Button>
                    <Button
                        variant="info"
                        onClick={() => setShowHelpModal(true)}
                    >
                        Help
                    </Button>
                </div>
            </div>
            {/* Set Operations Panel */}
            {(setOpItems.length > 0 || showSetOps) && (
                <div className="setop-panel">
                    <div className="setop-header" onClick={() => setShowSetOps(!showSetOps)}>
                        <strong>⊕ Set Operations ({setOpItems.length})</strong>
                        <Button variant="link" size="sm" className="setop-toggle">
                            {showSetOps ? '▾' : '▸'}
                        </Button>
                        {setOpItems.length > 0 && (
                            <Button variant="outline-danger" size="sm" className="setop-clear" onClick={(e) => { e.stopPropagation(); clearSetOp(); }}>
                                Clear
                            </Button>
                        )}
                    </div>
                    {showSetOps && (
                        <div className="setop-body">
                            <div className="setop-mode-toggle">
                                <Button
                                    size="sm"
                                    variant={setOpMode === 'intersection' ? 'info' : 'outline-info'}
                                    onClick={(e) => { e.stopPropagation(); setSetOpMode('intersection'); }}
                                >∩ Intersection</Button>
                                <Button
                                    size="sm"
                                    variant={setOpMode === 'union' ? 'info' : 'outline-info'}
                                    onClick={(e) => { e.stopPropagation(); setSetOpMode('union'); }}
                                >∪ Union</Button>
                            </div>
                            <div className="setop-chips">
                                {setOpItems.map(forte => (
                                    <Badge key={`setop-${forte}`} bg="info" className="setop-chip">
                                        {forte}
                                        <button className="chip-remove" onClick={() => removeFromSetOp(forte)}>×</button>
                                    </Badge>
                                ))}
                            </div>
                            {setOpResult && setOpItems.length >= 2 && (
                                <div className="setop-result">
                                    <strong>{setOpMode === 'intersection' ? '∩' : '∪'} Result: </strong>{setOpResult.toString()}<br />
                                    <ChordDetails chord={setOpResult} />
                                </div>
                            )}
                            {setOpItems.length < 2 && (
                                <div className="setop-hint">
                                    Add at least 2 pitch class sets using the ⊕ button in popovers.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Polychord bitmask panel */}
            <div className="setop-panel" style={{ marginTop: '8px' }}>
                <div className="setop-header" onClick={() => setShowPolychord(!showPolychord)}>
                    <strong>Polychord bitmask</strong>
                    <Button variant="link" size="sm" className="setop-toggle">
                        {showPolychord ? '▾' : '▸'}
                    </Button>
                </div>
                {showPolychord && (
                    <div className="setop-body">
                        <Form.Control
                            as="textarea"
                            rows={2}
                            placeholder={'Enter polychords, comma-separated. Each entry: space-separated Forte numbers (e.g. "3-11A 3-11B, 4-19").'}
                            value={polychordText}
                            onChange={e => setPolychordText(e.target.value)}
                            className="list-search"
                            size="sm"
                        />
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); computePolychord(); }}>Compute</Button>
                            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setPolychordText(''); setPolychordResult(''); }}>Clear</Button>
                            <Button size="sm" variant="outline-info" onClick={(e) => { e.stopPropagation(); copyToClipboard(polychordResult); }} disabled={!polychordResult}>Copy</Button>
                            <div style={{ marginLeft: 'auto', overflowX: 'auto' }}>
                                <strong>Result:</strong>
                                <span style={{ marginLeft: '8px', whiteSpace: 'pre' }}>{polychordResult}</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '0.9rem', color: '#999' }}>Example: "3-11A 3-11B, 4-19"</div>
                    </div>
                )}
            </div>
            {/* Chord Sorter panel */}
            <div className="setop-panel" style={{ marginTop: '8px' }}>
                <div className="setop-header" onClick={() => setShowChordSorter(!showChordSorter)}>
                    <strong>Chord Sorter</strong>
                    <Button variant="link" size="sm" className="setop-toggle">
                        {showChordSorter ? '▾' : '▸'}
                    </Button>
                </div>
                {showChordSorter && (
                    <div className="setop-body">
                        <Form.Control
                            as="textarea"
                            rows={2}
                            placeholder={'Enter space-separated Forte numbers to sort (e.g. "3-11A 3-11B 3-4").'}
                            value={chordSorterText}
                            onChange={e => setChordSorterText(e.target.value)}
                            className="list-search"
                            size="sm"
                        />
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Form.Label style={{ marginBottom: 0 }}>Rotate:</Form.Label>
                            <Form.Control
                                type="number"
                                value={chordSorterRotate}
                                onChange={e => setChordSorterRotate(parseInt(e.target.value, 10) || 0)}
                                style={{ width: '6ch' }}
                                size="sm"
                            />
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); computeChordSort(); }}>Sort</Button>
                            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setChordSorterText(''); setChordSorterResult(''); setChordSorterError(''); }}>Clear</Button>
                            <Button size="sm" variant="outline-info" onClick={(e) => { e.stopPropagation(); copyToClipboard(chordSorterResult); }} disabled={!chordSorterResult}>Copy</Button>
                        </div>
                        {chordSorterError && (
                            <div style={{ marginTop: '6px', color: '#dc3545', fontSize: '0.9rem' }}>{chordSorterError}</div>
                        )}
                        {chordSorterResult && (
                            <div style={{ marginTop: '8px', overflowX: 'auto' }}>
                                <strong>Result:</strong>
                                <span style={{ marginLeft: '8px', whiteSpace: 'pre' }}>{chordSorterResult}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <table className="kcomplex-table">
                <tbody>
                    <tr>
                        <td rowSpan={2} className="align-top">
                            <h4>Pitch class sets</h4>
                            <Form.Control
                                type="text"
                                placeholder="Search by Forte # or name..."
                                value={pcsSearch}
                                onChange={(e) => setPcsSearch(e.target.value)}
                                className="list-search"
                                size="sm"
                            />
                            <div className="scrollable-list" ref={pcsListRef} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <ListGroup>
                                {filteredPcs.map(chord => (
                                    <ChordListItem
                                        key={`pcs12-${chord.toString()}`}
                                        chord={chord}
                                        keyPrefix="pcs"
                                        itemId={`pcs-item-${encodeURIComponent(chord.toString())}`}
                                        isPopoverVisible={showPcsPopover === chord.toString()}
                                        isActive={selectedPcs === chord.toString()}
                                        onClick={() => {
                                            handleSelect(chord.toString());
                                            setShowPcsPopover(chord.toString());
                                        }}
                                        onClosePopover={() => setShowPcsPopover('')}
                                        playChordSeq={playChordSeq}
                                        playChordSimul={playChordSimul}
                                        copyToClipboard={copyToClipboard}
                                        sentiment={sentiments[chord.toString()] ?? null}
                                        predictedSentiment={hasStoredModel ? (predictedSentiments[chord.toString()] ?? null) : null}
                                        onSentimentChange={updateSentiment}
                                        onAddToSetOp={addToSetOp}
                                        onShowZRelations={showZRelations}
                                    />
                                ))}
                            </ListGroup>

                        </div>
                        </td>
                        <td rowSpan={1} className="align-top">
                        <h4>Supersets</h4>
                        <Form.Control
                            type="text"
                            placeholder="Search..."
                            value={supersetSearch}
                            onChange={(e) => setSupersetSearch(e.target.value)}
                            className="list-search"
                            size="sm"
                        />
                        <div className="scrollable-list" ref={supersetsRef} style={{ height: '33vh', width: '100%', overflowY: 'auto' }}>
                            <ListGroup>
                                {filteredSupersets.map(chord => (
                                    <ChordListItem
                                        key={`superset-${chord.toString()}`}
                                        chord={chord}
                                        keyPrefix="superset"
                                        isPopoverVisible={showSupersetPopover === chord.toString()}
                                        isActive={activeSuperset === chord.toString()}
                                        onClick={() => {
                                            setActiveSuperset(chord.toString());
                                            setShowSupersetPopover(chord.toString());
                                        }}
                                        onClosePopover={() => setShowSupersetPopover('')}
                                        playChordSeq={playChordSeq}
                                        playChordSimul={playChordSimul}
                                        copyToClipboard={copyToClipboard}
                                        sentiment={sentiments[chord.toString()] ?? null}
                                        predictedSentiment={hasStoredModel ? (predictedSentiments[chord.toString()] ?? null) : null}
                                        onSentimentChange={updateSentiment}
                                        onAddToSetOp={addToSetOp}
                                        onShowZRelations={showZRelations}
                                        onSelectInMainList={selectChordInMainList}
                                    />
                                ))}
                            </ListGroup>
                        </div>
                        </td>
                    </tr>
                    <tr>
                        <td rowSpan={1} className="align-top">
                        <h4>Subsets</h4>
                        <Form.Control
                            type="text"
                            placeholder="Search..."
                            value={subsetSearch}
                            onChange={(e) => setSubsetSearch(e.target.value)}
                            className="list-search"
                            size="sm"
                        />
                        <div className="scrollable-list" ref={subsetsRef} style={{ height: '33vh', width: '100%', overflowY: 'auto' }}>
                            <ListGroup>
                                {filteredSubsets.map(chord => (
                                    <ChordListItem
                                        key={`subset-${chord.toString()}`}
                                        chord={chord}
                                        keyPrefix="subset"
                                        isPopoverVisible={showSubsetPopover === chord.toString()}
                                        isActive={activeSubset === chord.toString()}
                                        onClick={() => {
                                            setActiveSubset(chord.toString());
                                            setShowSubsetPopover(chord.toString());
                                        }}
                                        onClosePopover={() => setShowSubsetPopover('')}
                                        playChordSeq={playChordSeq}
                                        playChordSimul={playChordSimul}
                                        copyToClipboard={copyToClipboard}
                                        sentiment={sentiments[chord.toString()] ?? null}
                                        predictedSentiment={hasStoredModel ? (predictedSentiments[chord.toString()] ?? null) : null}
                                        onSentimentChange={updateSentiment}
                                        onAddToSetOp={addToSetOp}
                                        onShowZRelations={showZRelations}
                                        onSelectInMainList={selectChordInMainList}
                                    />
                                ))}
                            </ListGroup>
                        </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div className="sentiment-tools">
                <div className="sentiment-tool-buttons">
                    <Button
                        variant="outline-light"
                        onClick={openPresetManager}
                        disabled={isBusy}
                    >
                        Presets
                    </Button>
                    <Button
                        variant="outline-light"
                        onClick={handleImportPresetClick}
                        disabled={isBusy}
                    >
                        Import Preset
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleTrainNeuralNetwork}
                        disabled={isBusy}
                    >
                        Train NN
                    </Button>
                    <Button
                        variant="success"
                        onClick={exportSentimentsToCsv}
                    >
                        Export CSV
                    </Button>
                    <Button
                        variant="outline-warning"
                        onClick={() => setShowBatchModal(true)}
                        disabled={isBusy}
                    >
                        Batch Sentiment
                    </Button>
                    <input
                        ref={importPresetInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportPreset}
                        style={{ display: 'none' }}
                    />
                </div>
                <div className="sentiment-tool-stats">
                    <div><strong>Model:</strong> {hasStoredModel ? 'Loaded' : 'Not loaded'}</div>
                    <div><strong>Presets:</strong> {presetSummaries.length}</div>
                    <div><strong>Accuracy:</strong> {trainingStats?.accuracy !== null && trainingStats?.accuracy !== undefined ? `${(trainingStats.accuracy * 100).toFixed(1)}%` : '—'}</div>
                    <div><strong>MAE:</strong> {trainingStats?.meanAbsoluteError !== null && trainingStats?.meanAbsoluteError !== undefined ? trainingStats.meanAbsoluteError.toFixed(3) : '—'}</div>
                    <div><strong>Epochs:</strong> {trainingStats?.epochsCompleted ?? '—'}</div>
                    <div><strong>Loss:</strong> {trainingStats?.finalLoss !== null && trainingStats?.finalLoss !== undefined ? trainingStats.finalLoss.toFixed(4) : '—'}</div>
                </div>
            </div>
            {hasStoredModel && (
                <div className="random-matrix-panel">
                    <div className="random-matrix-header">
                        <strong>Constrained matrix generator</strong>
                        <span className="random-matrix-subtitle">Uses attractive model predictions with cyclic horizontal, global vertical, stiffness-weighted motion, and explicit stasis control.</span>
                    </div>
                    <div className="random-matrix-controls">
                        <Form.Group controlId="matrixRows" className="random-matrix-field">
                            <Form.Label>Rows</Form.Label>
                            <Form.Control
                                type="number"
                                min={1}
                                step={1}
                                value={matrixRowCount}
                                onChange={(e) => setMatrixRowCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <Form.Group controlId="matrixColumns" className="random-matrix-field">
                            <Form.Label>Columns</Form.Label>
                            <Form.Control
                                type="number"
                                min={1}
                                step={1}
                                value={matrixColumnCount}
                                onChange={(e) => setMatrixColumnCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <Form.Group controlId="matrixNoteCount" className="random-matrix-field">
                            <Form.Label>Notes</Form.Label>
                            <Form.Control
                                type="number"
                                min={1}
                                max={12}
                                step={1}
                                value={matrixNoteCount}
                                onChange={(e) => setMatrixNoteCount(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <Form.Group controlId="matrixStiffness" className="random-matrix-field random-matrix-field-slider">
                            <Form.Label>Stiffness (β): {matrixStiffness.toFixed(1)}</Form.Label>
                            <Form.Range
                                min={0}
                                max={10}
                                step={0.1}
                                value={matrixStiffness}
                                onChange={(e) => setMatrixStiffness(Number.parseFloat(e.target.value) || 0)}
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <Form.Group controlId="matrixStasisWeight" className="random-matrix-field random-matrix-field-slider">
                            <Form.Label>Stasis probability: {matrixStasisWeight.toFixed(2)}</Form.Label>
                            <Form.Range
                                min={0}
                                max={1}
                                step={0.01}
                                value={matrixStasisWeight}
                                onChange={(e) => setMatrixStasisWeight(Number.parseFloat(e.target.value) || 0)}
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <div className="random-matrix-actions">
                            <Button
                                variant="warning"
                                onClick={handleGenerateRandomMatrix}
                                disabled={isBusy}
                            >
                                Generate Matrix
                            </Button>
                            <Button
                                variant="outline-secondary"
                                onClick={() => setMatrixOutput('')}
                                disabled={isBusy || !matrixOutput}
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                    <Form.Control
                        as="textarea"
                        rows={6}
                        readOnly
                        value={matrixOutput}
                        placeholder="Generated matrix will appear here."
                        className="random-matrix-output"
                    />
                </div>
            )}
            <Modal show={showPresetModal} onHide={() => setShowPresetModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Sentiment Presets</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="preset-toolbar">
                        <Form.Group controlId="presetNameDraft" className="preset-name-field">
                            <Form.Label>Preset Name</Form.Label>
                            <Form.Control
                                type="text"
                                value={presetNameDraft}
                                onChange={(event) => setPresetNameDraft(event.target.value)}
                                placeholder="Enter a preset name"
                                disabled={isBusy}
                            />
                        </Form.Group>
                        <div className="preset-toolbar-actions">
                            <Button variant="primary" onClick={handleSavePreset} disabled={isBusy}>
                                Save Current As
                            </Button>
                            <Button variant="outline-primary" onClick={handleOverwriteSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Overwrite Selected
                            </Button>
                            <Button variant="outline-success" onClick={handleLoadSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Load Selected
                            </Button>
                        </div>
                    </div>
                    <div className="preset-toolbar preset-toolbar-secondary">
                        <div className="preset-toolbar-actions">
                            <Button variant="outline-light" onClick={handleRenameSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Rename Selected
                            </Button>
                            <Button variant="outline-warning" onClick={handleClearCurrentWorkspace} disabled={isBusy}>
                                Clear Current
                            </Button>
                            <Button variant="warning" onClick={handleResetSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Reset Selected
                            </Button>
                            <Button variant="outline-info" onClick={handleExportSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Export Selected
                            </Button>
                            <Button variant="outline-danger" onClick={handleDeleteSelectedPreset} disabled={isBusy || !selectedPresetId}>
                                Delete Selected
                            </Button>
                        </div>
                    </div>
                    <div className="preset-list">
                        {presetSummaries.length === 0 ? (
                            <div className="preset-empty-state">
                                No saved presets yet. Save the current workspace to create one.
                            </div>
                        ) : (
                            presetSummaries.map((preset) => {
                                const isSelected = preset.id === selectedPresetId;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        className={`preset-list-item${isSelected ? ' preset-list-item-selected' : ''}`}
                                        onClick={() => {
                                            setSelectedPresetId(preset.id);
                                            setPresetNameDraft(preset.name);
                                        }}
                                    >
                                        <div className="preset-list-item-header">
                                            <strong>{preset.name}</strong>
                                            <span>{preset.hasModel ? 'Model included' : 'No model'}</span>
                                        </div>
                                        <div className="preset-list-item-meta">
                                            <span>{preset.labeledSentimentCount} labeled sentiments</span>
                                            <span>Updated {new Date(preset.updatedAt).toLocaleString()}</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowPresetModal(false)}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            {modelFeedback && (
                <Alert variant="info" className="sentiment-model-alert">
                    {modelFeedback}
                </Alert>
            )}
            {activeOverlay && (
                <div className="training-overlay">
                    <div className="training-overlay-card">
                        <Spinner animation="border" role="status" />
                        <div className="training-overlay-message">{activeOverlay.message}</div>
                        <ProgressBar now={activeOverlay.progress} label={`${activeOverlay.progress}%`} animated striped />
                        {activeOverlay.canCancel && (
                            <Button variant="outline-light" onClick={handleCancelMatrixSearch}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {/* Help Modal */}
            <Modal show={showHelpModal} onHide={() => setShowHelpModal(false)} backdrop="static" keyboard={false}>
                <Modal.Header closeButton>
                    <Modal.Title>
                        Help <span className="help-version">v{__APP_VERSION__}</span>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <h5>Using the k-Complex explorer</h5>
                    <p>
                        The k-Complex Explorer allows you to explore various pitch class sets using <a href="https://en.wikipedia.org/wiki/Forte_number" target="_blank" rel="noreferrer">Forte number notation</a> and see their supersets and subsets within a specified scale. 
                        You can select a scale from the dropdown menu to filter the list of pitch class sets.
                    </p>
                    <p>
                        The notation used here is a bit extended to include the rotation applied to the set. For example, 7-35.11 is 7.35 transposed by 11 steps.
                    </p>
                    <h6>Pitch Class Sets:</h6>
                    <p>
                        Click on a pitch class set to see its details, including common names, pitch classes, intervals, interval vector 
                        entropy (low/mid/high), and symmetries.
                    </p>
                    <h6>Sentiment Labels &amp; CSV Export:</h6>
                    <p>
                        Each set popover now includes sentiment buttons: <strong>+1</strong> (like), <strong>0</strong>
                        (neutral), and <strong>-1</strong> (dislike). Use <strong>Export CSV</strong> to download every
                        known pitch class set with its current sentiment and analysis data for later modeling.
                    </p>
                    <h6>Batch Sentiment:</h6>
                    <p>
                        Use <strong>Batch Sentiment</strong> to label many sets at once. You can filter by size (e.g.
                        dislike all sets of size 10), by Forte class (e.g. like all transpositions of 7-35), by
                        consonance/dissonance (based on whether the interval vector contains a minor second or tritone),
                        or by the sets currently visible in the main list. Choose the desired sentiment (+1, 0, -1, or
                        Clear) and click <strong>Apply</strong>.
                    </p>
                    <h6>Neural-network sentiment prediction:</h6>
                    <p>
                        Use <strong>Train NN</strong> to train a TensorFlow neural network on all exported numerical
                        fields. Missing manual sentiments are treated as neutral during training, and the resulting
                        ternary predictions are saved locally along with the trained weights.
                    </p>
                    <p>
                        Use <strong>Presets</strong> to save the current sentiment workspace under a name. Presets now
                        capture manual sentiments, saved predictions, training statistics, and the trained neural-network
                        weights when a model is loaded. Use <strong>Import Preset</strong> to restore a full workspace
                        from a JSON preset file, <strong>Clear Current</strong> to wipe the active workspace, and
                        <strong> Reset Selected</strong> to replace a stored preset with an empty workspace.
                    </p>
                    <p>
                        Once a model is loaded, the <strong>Constrained matrix generator</strong> can randomly
                        backtrack through attractive model predictions until every cell, every cyclic horizontal union,
                        and every full-column union is attractive within the selected upper bound. The <strong>Stiffness
                        (β)</strong> slider biases lower-Hamming-distance successors, while <strong>Stasis probability</strong>
                        controls how willing the machine is to repeat the exact same set on the next beat.
                    </p>
                    <h6>Supersets and Subsets:</h6>
                    <p>
                        The supersets and subsets of the selected pitch class set are displayed alongside. You can click
                        on each to see their respective details.
                    </p>
                    <h6>Searching:</h6>
                    <p>
                        Use the search boxes above each list to filter by Forte number or common name.
                    </p>
                    <h6>Set Operations (Intersection &amp; Union):</h6>
                    <p>
                        Click the ⊕ button in any popover to add that set to the operations panel. Toggle between
                        ∩ Intersection (common pitch classes) and ∪ Union (all pitch classes combined). Use the × on
                        each chip to remove individual sets, or "Clear" to reset.
                    </p>
                    <h6>Z-Relation:</h6>
                    <p>
                        Chords whose Forte number contains a "z" share their interval vector with other distinct set classes.
                        When viewing a z-chord, a <strong>Z</strong> button appears in the popover. Click it to see all
                        chords that share the same interval vector.
                    </p>
                    <h6>Chord Sorter:</h6>
                    <p>
                        Enter a space-separated list of Forte numbers and a rotation value, then click <strong>Sort</strong>
                        to order them using the rotated binary-sequence comparison (rotatedCompareTo). The sorted Forte
                        numbers are displayed and can be copied to the clipboard.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowHelpModal(false)}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            {/* Z-Relation Modal */}
            <Modal show={showZModal} onHide={() => setShowZModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        Z-Related chords for {zModalChord?.toString()}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {zModalChord && (() => {
                        const { entropy, level } = getIntervalVectorEntropyMetrics(zModalChord);
                        return (
                            <div style={{ marginBottom: '12px' }}>
                                <strong>Interval vector: </strong>{zModalChord.getIntervalVector()?.join(' ') || '[]'}
                                <br />
                                <strong>Interval vector entropy: </strong>{entropy.toFixed(3)} ({level})
                            </div>
                        );
                    })()}
                    {zMates.length === 0 ? (
                        <p>No Z-related chords found.</p>
                    ) : (
                        <div className="z-mates-grid">
                            {zMates.map(mate => (
                                <div key={`zmate-${mate.toString()}`} className="z-mate-card">
                                    <strong>{mate.toString()}</strong><br />
                                    <ChordDetails chord={mate} />
                                </div>
                            ))}
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowZModal(false)}>Close</Button>
                </Modal.Footer>
            </Modal>
            {/* Batch Sentiment Modal */}
            <Modal show={showBatchModal} onHide={() => setShowBatchModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Batch Sentiment</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group controlId="batchFilterMode" className="mb-3">
                        <Form.Label><strong>Filter</strong></Form.Label>
                        <Form.Select
                            value={batchFilterMode}
                            onChange={e => setBatchFilterMode(e.target.value as BatchFilterMode)}
                        >
                            <option value="bySize">By size (number of notes)</option>
                            <option value="byForteClass">By Forte class (all transpositions)</option>
                            <option value="consonant">Consonant sets (no minor second or tritone)</option>
                            <option value="dissonant">Dissonant sets (minor second or tritone present)</option>
                            <option value="visible">Currently visible sets</option>
                        </Form.Select>
                    </Form.Group>
                    {batchFilterMode === 'bySize' && (
                        <Form.Group controlId="batchSizeValue" className="mb-3">
                            <Form.Label>Number of notes</Form.Label>
                            <Form.Control
                                type="number"
                                min={1}
                                max={12}
                                value={batchSizeValue}
                                onChange={e => setBatchSizeValue(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                            />
                        </Form.Group>
                    )}
                    {batchFilterMode === 'byForteClass' && (
                        <Form.Group controlId="batchForteClass" className="mb-3">
                            <Form.Label>Forte class (e.g. 7-35)</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g. 7-35"
                                value={batchForteClass}
                                onChange={e => setBatchForteClass(e.target.value)}
                            />
                        </Form.Group>
                    )}
                    <Form.Group controlId="batchSentimentValue" className="mb-3">
                        <Form.Label><strong>Sentiment</strong></Form.Label>
                        <div className="d-flex gap-2">
                            <Button
                                variant={batchSentimentValue === 1 ? 'success' : 'outline-success'}
                                onClick={() => setBatchSentimentValue(1)}
                            >+1 Like</Button>
                            <Button
                                variant={batchSentimentValue === 0 ? 'warning' : 'outline-warning'}
                                onClick={() => setBatchSentimentValue(0)}
                            >0 Neutral</Button>
                            <Button
                                variant={batchSentimentValue === -1 ? 'danger' : 'outline-danger'}
                                onClick={() => setBatchSentimentValue(-1)}
                            >-1 Dislike</Button>
                            <Button
                                variant={batchSentimentValue === null ? 'secondary' : 'outline-secondary'}
                                onClick={() => setBatchSentimentValue(null)}
                            >Clear</Button>
                        </div>
                    </Form.Group>
                    <div className="mt-2">
                        <strong>{batchTargetChords.length}</strong> set{batchTargetChords.length !== 1 ? 's' : ''} will be affected.
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowBatchModal(false)}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={applyBatchSentiment}
                        disabled={batchTargetChords.length === 0}
                    >
                        Apply
                    </Button>
                </Modal.Footer>
            </Modal>
            <PCS12Identifier show={showPcs12Modal} onHide={() => setShowPcs12Modal(false)} />
        </div>
    );
};

export default KComplexExplorer;
