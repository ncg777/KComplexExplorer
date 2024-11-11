import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListGroup, OverlayTrigger, Form, Popover, Button, Modal } from 'react-bootstrap';
import { PCS12 } from './Objects/';
import { SubsetOf, SupersetOf } from './Utils';
import PCS12Identifier from './PCS12Identifier';
import './KComplexExplorer.css';
import * as Tone from 'tone';

interface KComplexExplorerProps {
    scale: string;
}

const KComplexExplorer: React.FC<KComplexExplorerProps> = ({ scale }) => {
    const [pcs12List, setPcs12List] = useState<PCS12[]>([]);
    const [supersets, setSupersets] = useState<string[]>([]);
    const [subsets, setSubsets] = useState<string[]>([]);
    const [selectedPcs, setSelectedPcs] = useState<string | null>(null);
    const [selectedScale, setSelectedScale] = useState<string>(scale);
    const [showPcsPopover, setShowPcsPopover] = useState('');
    const [showSupersetPopover, setShowSupersetPopover] = useState('');
    const [showSubsetPopover, setShowSubsetPopover] = useState('');
    const [activeSuperset, setActiveSuperset] = useState<string | null>(null);
    const [activeSubset, setActiveSubset] = useState<string | null>(null);
    const [showPcs12Modal, setShowPcs12Modal] = useState(false);

    // State for the help modal
    const [showHelpModal, setShowHelpModal] = useState(false);

    // Create refs for your lists
    const pcsListRef = useRef<HTMLDivElement>(null);
    const supersetsRef = useRef<HTMLDivElement>(null);
    const subsetsRef = useRef<HTMLDivElement>(null);

    
    
    // Create a poly synth with sine wave
    const getSynth = useCallback(() => {
        return new Tone.PolySynth(Tone.Synth, {
        oscillator: {
            type: 'triangle',
            }
        }
        ).toDestination()
    },[]);
    
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
            setShowSupersetPopover(''); // Reset Superset popover
            setShowSubsetPopover('');
            const supersetChecker = new SupersetOf(selectedChord);
            const subsetChecker = new SubsetOf(selectedChord);

            const foundSupersets = Array.from(pcs12List)
            .filter(chord => supersetChecker.apply(chord))
            .map(chord => chord.toString()).sort(PCS12.ForteStringComparator);
        
            setSupersets(foundSupersets);
            
            const foundSubsets = Array.from(pcs12List)
                .filter(chord => subsetChecker.apply(chord))
                .map(chord => chord.toString()).sort(PCS12.ReverseForteStringComparator);
            
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
            setShowSupersetPopover(''); // Reset Superset popover
            setShowSubsetPopover('');
        }
    };

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
    

    const playChordSeq = useCallback((chord: PCS12, down:boolean = false) => {
        const now = Tone.now();
        const synth = getSynth();

        let nums = chord.asSequence();
        
        if(down) nums = nums.reverse();
        // Calculate and play each note in the chord sequentially
        nums.forEach((pc, index) => {
            const note = Tone.Frequency(pc + 72, "midi").toNote(); // 60 is C4
            synth.triggerAttackRelease(note, 0.25, now + index * 0.25); 
        });

    },[getSynth]);
    
    const playChordSimul = useCallback((chord: PCS12) => {
        const now = Tone.now();
        const synth = getSynth();
        let nums = chord.asSequence();
        
        synth.triggerAttackRelease(nums.map(pc => Tone.Frequency(pc + 72, "midi").toNote()), 1, now);
    },[getSynth]);
    
    const copyToClipboard = useCallback(async (text: string) => {
        await navigator.clipboard.writeText(text);
    },[]);

    return (
        <div className="KComplexExplorer">
            <div className="header">
                <Form.Group controlId="scaleSelect" style={{ textAlign: 'left', paddingLeft:'8px', marginBottom: '1em' }}>
                    <Form.Label><strong>Select Scale </strong></Form.Label>
                    <Form.Control
                        as="select"
                        value={selectedScale}
                        onChange={(e) => handleScaleChange(e.target.value)}
                        style={{margin:'0', paddingLeft:'5px', position:'absolute', left: '108px', top: '-5px',maxWidth: '150px'}}
                    >
                        {Array.from(PCS12.getChords())
                            .map(ch => ch.toString())
                            .sort(PCS12.ReverseForteStringComparator)
                            .map(chord => (
                                <option key={chord} value={chord}>
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
            <table className="kcomplex-table">
                <tbody>
                    <tr>
                        <td rowSpan={2} className="align-top">
                            <h4>Pitch class sets</h4>
                            <div className="scrollable-list" ref={pcsListRef} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <ListGroup>
                                {pcs12List.map(chord => {
                                    return (
                                        chord && (
                                            <OverlayTrigger
                                                key={`pcs12-${chord.toString()}`}
                                                placement="top"
                                                overlay={
                                                    <Popover id={`pcspop-${chord.toString()}`}>
                                                        <Popover.Header>
                                                                <strong>{chord.toString()}
                                                                <Button 
                                                                    className="copybutton"
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        copyToClipboard(chord.toString()); 
                                                                    }}
                                                                >📋</Button>
                                                                </strong>
                                                                <button type="button" className="close-button" onClick={(e) => {e.stopPropagation(); setShowPcsPopover('')}}>
                                                                    &times;
                                                                </button>
                                                        </Popover.Header>
                                                        <Popover.Body>
                                                            <strong>Play: </strong>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(chord)}}>Up</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(chord, true)}}>Down</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSimul(chord);}}>Simul</Button><br />
                                                            <strong>Common name(s): </strong>{chord.getCommonName() || 'None'}<br />
                                                            <strong>Pitch classes: </strong>{chord.combinationString()}<br />
                                                            <strong>Intervals: </strong>{chord.getIntervals().map(x => String(x)).join(", ")}<br />
                                                            <strong>Interval vector: </strong>{chord.getIntervalVector()?.join(', ') || '[]'}<br />
                                                            <strong>Symmetries: </strong>{chord.getSymmetries().map(x => String(x)).join(", ") || "None"}
                                                        </Popover.Body>
                                                    </Popover>
                                                }
                                                show={showPcsPopover === chord.toString()}
                                                trigger="click"
                                                rootClose
                                            >
                                                <ListGroup.Item
                                                    onClick={() => {
                                                        handleSelect(chord.toString());
                                                        setShowPcsPopover(chord.toString());
                                                    }}
                                                    className={selectedPcs === chord.toString() ? 'active' : ''}
                                                >
                                                    {chord.toString()}
                                                </ListGroup.Item>
                                            </OverlayTrigger>
                                        )
                                    );
                                })}
                            </ListGroup>

                        </div>
                        </td>
                        <td rowSpan={1} className="align-top">
                        <h4>Supersets</h4>
                        <div className="scrollable-list" ref={supersetsRef} style={{ height: '33vh', width: '100%', overflowY: 'auto' }}>
                            <ListGroup>
                                {supersets.map(superset => {
                                    const supersetChord = PCS12.parseForte(superset);
                                    return (
                                        supersetChord && (
                                            <OverlayTrigger
                                                key={`superset-${superset}`}
                                                placement="top"
                                                overlay={
                                                    <Popover id={`pcspop-${supersetChord.toString()}`}>
                                                        <Popover.Header>
                                                                <strong>{supersetChord.toString()}
                                                                <Button 
                                                                className="copybutton"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    copyToClipboard(supersetChord.toString()); 
                                                                }}
                                                                >📋</Button>
                                                                </strong>
                                                                <button type="button" className="close-button" onClick={(e) => {e.stopPropagation(); setShowSupersetPopover('')}}>
                                                                    &times;
                                                                </button>
                                                        </Popover.Header>
                                                        <Popover.Body>
                                                            <strong>Play: </strong>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(supersetChord)}}>Up</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(supersetChord, true)}}>Down</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSimul(supersetChord);}}>Simul</Button><br />
                                                            <strong>Common name(s): </strong>{supersetChord.getCommonName() || 'None'}<br />
                                                            <strong>Pitch classes: </strong>{supersetChord.combinationString()}<br />
                                                            <strong>Intervals: </strong>{supersetChord.getIntervals().map(x => String(x)).join(", ")}<br />
                                                            <strong>Interval vector: </strong>{supersetChord.getIntervalVector()?.join(', ') || '[]'}<br />
                                                            <strong>Symmetries: </strong>{supersetChord.getSymmetries().map(x => String(x)).join(", ") || "None"}
                                                        </Popover.Body>
                                                    </Popover>
                                                }
                                                show={showSupersetPopover === superset}
                                                trigger="click"
                                                rootClose
                                            >
                                                <ListGroup.Item
                                                    onClick={() => {
                                                        setActiveSuperset(superset);
                                                        setShowSupersetPopover(superset);
                                                    }}
                                                    className={activeSuperset === superset ? 'active' : ''}
                                                >
                                                    {supersetChord.toString()}
                                                </ListGroup.Item>
                                            </OverlayTrigger>
                                        )
                                    );
                                })}
                            </ListGroup>
                        </div>
                        </td>
                    </tr>
                    <tr>
                        <td rowSpan={1} className="align-top">
                        <h4>Subsets</h4>
                        <div className="scrollable-list" ref={subsetsRef} style={{ height: '33vh', width: '100%', overflowY: 'auto' }}>
                            <ListGroup>
                                {subsets.map(subset => {
                                    const subsetChord = PCS12.parseForte(subset);
                                    return (
                                        subsetChord && (
                                            <OverlayTrigger
                                                key={`subset-${subset}`}
                                                placement="top"
                                                overlay={
                                                    <Popover id={`pcspop-${subsetChord.toString()}`}>
                                                        <Popover.Header>
                                                            <strong>{subsetChord.toString()}
                                                            <Button 
                                                                className="copybutton"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    copyToClipboard(subsetChord.toString()); 
                                                                }}
                                                            >📋</Button>
                                                            </strong>
                                                            <button type="button" className="close-button" onClick={(e) =>{e.stopPropagation(); setShowSubsetPopover('')}}>
                                                                &times;
                                                            </button>
                                                        </Popover.Header>
                                                        <Popover.Body>
                                                            <strong>Play: </strong>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(subsetChord)}}>Up</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSeq(subsetChord, true)}}>Down</Button>
                                                                <Button className="playbutton" onClick={(e) => {e.stopPropagation(); playChordSimul(subsetChord);}}>Simul</Button><br />
                                                            <strong>Common name(s): </strong>{subsetChord.getCommonName() || 'None'}<br />
                                                            <strong>Pitch classes: </strong>{subsetChord.combinationString()}<br />
                                                            <strong>Intervals: </strong>{subsetChord.getIntervals().map(x => String(x)).join(", ")}<br />
                                                            <strong>Interval vector: </strong>{subsetChord.getIntervalVector()?.join(', ') || '[]'}<br />
                                                            <strong>Symmetries: </strong>{subsetChord.getSymmetries().map(x => String(x)).join(", ") || "None"}
                                                        </Popover.Body>
                                                    </Popover>
                                                }
                                                show={showSubsetPopover === subset}
                                                trigger="click"
                                                rootClose
                                            >
                                                <ListGroup.Item
                                                    onClick={() => {
                                                        setActiveSubset(subset);
                                                        setShowSubsetPopover(subset);
                                                    }}
                                                    className={activeSubset === subset ? 'active' : ''}
                                                >
                                                    {subsetChord.toString()}
                                                </ListGroup.Item>
                                            </OverlayTrigger>
                                        )
                                    );
                                })}
                            </ListGroup>
                        </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            {/* Help Modal */}
            <Modal show={showHelpModal} onHide={() => setShowHelpModal(false)} backdrop="static" keyboard={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Help</Modal.Title>
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
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowHelpModal(false)}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            <PCS12Identifier show={showPcs12Modal} onHide={() => setShowPcs12Modal(false)} />
        </div>
    );
};

export default KComplexExplorer;
