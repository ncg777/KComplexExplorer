import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListGroup, Form, Button, Modal, Badge } from 'react-bootstrap';
import { PCS12 } from 'ultra-mega-enumerator';
import { SubsetOf, SupersetOf } from 'ultra-mega-enumerator';
import PCS12Identifier from './PCS12Identifier';
import ChordListItem, { ChordDetails } from './ChordListItem';
import './KComplexExplorer.css';
import * as Tone from 'tone';
import { useSynth } from './SynthContext'; // Import the useSynth hook

interface KComplexExplorerProps {
    scale: string;
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
                <Button
                    variant="info"
                    style={{ position: 'absolute', right: '80px', top: '-5px' }}
                    onClick={() => setShowPcs12Modal(true)}
                >
                    Identify
                </Button>
                <Button
                    variant="info"
                    onClick={() => setShowHelpModal(true)}
                    style={{ position: 'absolute', right: 0, top: '-5px'}}
                >
                    Help
                </Button>
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
                        and symmetries.
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
                    {zModalChord && (
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Interval vector: </strong>{zModalChord.getIntervalVector()?.join(' ') || '[]'}
                        </div>
                    )}
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
            <PCS12Identifier show={showPcs12Modal} onHide={() => setShowPcs12Modal(false)} />
        </div>
    );
};

export default KComplexExplorer;
