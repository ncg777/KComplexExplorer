import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListGroup, Row, Col, OverlayTrigger, Form, Popover, Button } from 'react-bootstrap';
import { PCS12 } from './Objects';
import { SubsetOf, SupersetOf } from './Utils';
import './KComplexExplorer.css'; 

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

    // Create refs for your lists
    const pcsListRef = useRef<HTMLDivElement>(null);
    const supersetsRef = useRef<HTMLDivElement>(null);
    const subsetsRef = useRef<HTMLDivElement>(null);

    
    const refreshPcs = useCallback(() => {
        if (!PCS12 || !PCS12.isInitialized()) return;

        const parsedScale = PCS12.parseForte(selectedScale);
        const pred = new SubsetOf(parsedScale!!);
        const allChords = PCS12.getChords();
        const filteredChords = Array.from(allChords)
            .filter(pc => pred.apply(pc))
            .sort((a, b) => PCS12.ReverseForteStringComparator(a.toForteNumberString(), b.toForteNumberString()));

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
            const supersetChecker = new SupersetOf(selectedChord);
            const subsetChecker = new SubsetOf(selectedChord);

            const allChords = PCS12.getChords();

            const foundSupersets = Array.from(allChords)
            .filter(chord => supersetChecker.apply(chord))
            .map(chord => chord.toForteNumberString()).sort(PCS12.ForteStringComparator);
        
            setSupersets(foundSupersets);
            
            const foundSubsets = Array.from(allChords)
                .filter(chord => subsetChecker.apply(chord))
                .map(chord => chord.toForteNumberString()).sort(PCS12.ReverseForteStringComparator);
            
            setSubsets(foundSubsets);
        }
    };

    const handleScaleChange = (str: string) => {
        if (str) {
            setSelectedScale(str);
            setSupersets([]);
            setSubsets([]);
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
        supersetsList?.addEventListener('scroll', handleScroll);
        subsetsList?.addEventListener('scroll', handleScroll);

        // Cleanup function to remove event listeners
        return () => {
            window.removeEventListener('scroll', handleScroll);
            pcsList?.removeEventListener('scroll', handleScroll);
            supersetsList?.removeEventListener('scroll', handleScroll);
            subsetsList?.removeEventListener('scroll', handleScroll);
        };
    }, [pcs12List, supersets, subsets]); // Add dependencies as needed
    // Listening to clicks outside
    useEffect(() => {
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);
    return (
        <div className="KComplexExplorer">
            <Form.Group controlId="scaleSelect" style={{ textAlign: 'left', marginLeft:'8px' }}>
                <Form.Label><strong>Select Scale: </strong></Form.Label>
                <Form.Control
                    as="select"
                    value={selectedScale}
                    onChange={(e) => handleScaleChange(e.target.value)}
                    style={{margin:'0', padding:'0'}}
                >
                    {Array.from(PCS12.getChords())
                        .map(ch => ch.toForteNumberString())
                        .sort(PCS12.ReverseForteStringComparator)
                        .map(chord => (
                            <option key={chord} value={chord}>
                                {chord}
                            </option>
                        ))}
                </Form.Control>
            </Form.Group>

            <table className="kcomplex-table">
                <tbody>
                    <tr>
                        <td rowSpan={2} className="align-top">
                            <h4>Pitch class sets:</h4>
                            <div className="scrollable-list" ref={pcsListRef} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                {pcs12List.map(chord => (
                                    <OverlayTrigger
                                        key={`pcs-${chord.toForteNumberString()}`}
                                        placement="left"
                                        show={showPcsPopover === chord.toForteNumberString()}
                                        overlay={
                                            <Popover id={`pcs-popover-${chord.toForteNumberString()}`} className="custom-popover">
                                                <Popover.Header>
                                                    <strong>{chord.toForteNumberString()}</strong>
                                                    <Button variant="close" className="close-button" onClick={() => setShowPcsPopover('')}>×</Button>
                                                </Popover.Header>
                                                <Popover.Body>
                                                    <strong>Common name(s): </strong>{chord.getCommonName() || 'None'}<br />
                                                    <strong>Pitch classes: </strong>{chord.combinationString()}<br />
                                                    <strong>Interval vector: </strong>{chord.getIntervalVector()?.join(', ') || '[]'}
                                                </Popover.Body>
                                            </Popover>
                                        }
                                        trigger="click"
                                        rootClose
                                    >
                                        <ListGroup.Item
                                            onClick={() => {
                                                handleSelect(chord.toForteNumberString());
                                                setShowPcsPopover(chord.toForteNumberString());
                                            }}
                                            className={selectedPcs === chord.toForteNumberString() ? 'active' : ''}
                                        >
                                            {chord.toForteNumberString()}
                                        </ListGroup.Item>
                                    </OverlayTrigger>
                                ))}
                            </div>
                        </td>
                        <td rowSpan={1} className="align-top">
                            <h4>Supersets</h4>
                            <div className="scrollable-list" ref={supersetsRef} style={{ height: '28vh', width: '100%', overflowY: 'auto' }}>
                                <ListGroup>
                                    {supersets.map(superset => {
                                        const supersetChord = PCS12.parseForte(superset);
                                        return (
                                            supersetChord && (
                                                <OverlayTrigger
                                                    key={`superset-${superset}`}
                                                    placement="right"
                                                    show={showSupersetPopover === superset}
                                                    overlay={
                                                        <Popover id={`superset-popover-${superset}`} className="custom-popover">
                                                            <Popover.Header>
                                                                <strong>{supersetChord.toForteNumberString()}</strong>
                                                                <Button variant="close" className="close-button" onClick={() => setShowSupersetPopover('')}>×</Button>
                                                            </Popover.Header>
                                                            <Popover.Body>
                                                                <strong>Common name(s): </strong>{supersetChord.getCommonName() || 'None'}<br />
                                                                <strong>Pitch classes: </strong>{supersetChord.combinationString()}<br />
                                                                <strong>Interval vector: </strong>{supersetChord.getIntervalVector()?.join(', ') || '[]'}<br />
                                                            </Popover.Body>
                                                        </Popover>
                                                    }
                                                    trigger="click"
                                                    rootClose
                                                >
                                                    <ListGroup.Item
                                                        onClick={() => {
                                                            setActiveSuperset(superset);
                                                            setShowSupersetPopover(superset);
                                                        }}
                                                        className={activeSuperset === superset ? 'active' : ''} // Apply active class conditionally
                                                    >
                                                        {supersetChord.toForteNumberString()}
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
                            <div className="scrollable-list" ref={subsetsRef} style={{ height: '28vh', width: '100%', overflowY: 'auto' }}>
                                <ListGroup>
                                    {subsets.map(subset => {
                                        const subsetChord = PCS12.parseForte(subset);
                                        return (
                                            subsetChord && (
                                                <OverlayTrigger
                                                    key={`subset-${subset}`}
                                                    placement="right"
                                                    show={showSubsetPopover === subset}
                                                    overlay={
                                                        <Popover id={`subset-popover-${subset}`} className="custom-popover">
                                                            <Popover.Header>
                                                                <strong>{subsetChord.toForteNumberString()}</strong>
                                                                <Button variant="close" className="close-button" onClick={() => setShowSubsetPopover('')}>×</Button>
                                                            </Popover.Header>
                                                            <Popover.Body>
                                                                <strong>Common name(s): </strong>{subsetChord.getCommonName() || 'None'}<br />
                                                                <strong>Pitch classes: </strong>{subsetChord.combinationString()}<br />
                                                                <strong>Interval vector: </strong>{subsetChord.getIntervalVector()?.join(', ') || '[]'}<br />
                                                            </Popover.Body>
                                                        </Popover>
                                                    }
                                                    trigger="click"
                                                    rootClose
                                                >
                                                    <ListGroup.Item
                                                        onClick={() => {
                                                            setActiveSubset(subset);
                                                            setShowSubsetPopover(subset);
                                                        }}
                                                        className={activeSuperset === subset ? 'active' : ''} // Apply active class conditionally
                                                    >
                                                        {subsetChord.toForteNumberString()}
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
        </div>
    );
};

export default KComplexExplorer;
