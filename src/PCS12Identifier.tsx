import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { PCS12 } from './Objects';
import './Piano.css'; // Keep CSS for styling

// Define the hardcoded left positions for each key (in percentages)
const WHITE_KEY_WIDTH = '14.2857%'; // 100% / 7 keys for a width of approximately 14.29% each
const BLACK_KEY_WIDTH = '8%'; // Black keys are narrower
const BLACK_KEY_HEIGHT = '75%'; // Height for black keys

const BLACK_KEYS = [1,3,6,8,10];

// Define key positions for black keys based on their offsets from the white keys
const KEY_POSITIONS = [
    '0%',    // C
    '14.2857%',    // C#
    '14.2857%', // D
    '28.5715%', // D#
    '28.5714%', // E
    '42.8571%', // F
    '57.1429%', // F#
    '57.1428%', // G
    '71.42857%', // G#
    '71.4285%', // A
    '85.7143%', // A#
    '85.7142%', // B
];

const PCS12Identifier: React.FC<{ show: boolean; onHide: () => void }> = ({ show, onHide }) => {
    const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
    const [identifiedPCS12, setIdentifiedPCS12] = useState<PCS12>(PCS12.empty());

    
    const toggleKey = (key: number) => {
        const newSelectedKeys = new Set(selectedKeys);
        if (newSelectedKeys.has(key)) {
            newSelectedKeys.delete(key);
        } else {
            newSelectedKeys.add(key);
        }
        setSelectedKeys(newSelectedKeys);
        createPCS12(newSelectedKeys);
    };

    const createPCS12 = (keys: Set<number>) => {
        const set = new Set(keys);
        const pcs12 = PCS12.identify(PCS12.createWithSizeAndSet(12, set));
        setIdentifiedPCS12(pcs12); // Use toForteNumberString
    };

    return (
        <Modal show={show} onHide={onHide}>
            <Modal.Header closeButton>
                <Modal.Title>PCS12 from Notes</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div>
                    <strong>Forte number: </strong>{identifiedPCS12.toForteNumberString()}<br />
                    <strong>Common name(s): </strong>{identifiedPCS12.getCommonName() || 'None'}<br />
                    <strong>Pitch classes: </strong>{identifiedPCS12.combinationString()}<br />
                    <strong>Intervals: </strong>{identifiedPCS12.getIntervals().map(x => String(x)).join(", ")}<br />
                    <strong>Interval vector: </strong>{identifiedPCS12.getIntervalVector()?.join(', ') || '[]'}<br />
                    <strong>Symmetries: </strong>{identifiedPCS12.getSymmetries().map(x => String(x)).join(", ") || "None"}
                </div>
                <div className="piano">
                    {KEY_POSITIONS.map((left, i) => (
                        <React.Fragment key={i}>
                            {/* Render white keys */}
                            {!BLACK_KEYS.includes(i) ?
                            <div
                                className={`piano-key white-key ${selectedKeys.has(i) ? 'selected' : ''}`}
                                onClick={() => toggleKey(i)}
                                style={{
                                    left: left,
                                    width: WHITE_KEY_WIDTH,
                                    height: '100%',
                                    position: 'absolute',
                                }}
                            />
                            :
                            <div
                                className={`piano-key black-key ${selectedKeys.has(i) ? 'selected' : ''}`} // Offset for the black key index
                                onClick={() => toggleKey(i)}
                                style={{
                                    position: 'absolute',
                                    left: left,
                                    width: BLACK_KEY_WIDTH,
                                    height: BLACK_KEY_HEIGHT,
                                    transform: 'translateX(-50%)', // Center the black key above
                                }}
                            />
                            
                        }
                        </React.Fragment>
                    ))}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default PCS12Identifier;
