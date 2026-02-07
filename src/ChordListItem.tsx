import React from 'react';
import { ListGroup, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import { PCS12 } from 'ultra-mega-enumerator';

interface ChordListItemProps {
    chord: PCS12;
    keyPrefix: string;
    isPopoverVisible: boolean;
    isActive: boolean;
    onClick: () => void;
    onClosePopover: () => void;
    playChordSeq: (chord: PCS12, down?: boolean) => void;
    playChordSimul: (chord: PCS12) => void;
    copyToClipboard: (text: string) => void;
    onAddToSetOp?: (forte: string) => void;
    onShowZRelations?: (chord: PCS12) => void;
}

export const ChordDetails: React.FC<{ chord: PCS12 }> = ({ chord }) => (
    <>
        <strong>Common name(s): </strong>{chord.getCommonName() || 'None'}<br />
        <strong>Pitch classes: </strong>{chord.combinationString()}<br />
        <strong>Intervals: </strong>{chord.getIntervals().map(x => String(x)).join(" ")}<br />
        <strong>Interval vector: </strong>{chord.getIntervalVector()?.join(' ') || '[]'}<br />
        <strong>Symmetries: </strong>{chord.getSymmetries().map(x => String(x)).join(" ") || "None"}<br />
        <strong>Tension partition: </strong>{chord.getTensionPartition().map(x => String(x)).join(" ") || "None"}
    </>
);

const ChordListItem: React.FC<ChordListItemProps> = ({
    chord,
    keyPrefix,
    isPopoverVisible,
    isActive,
    onClick,
    onClosePopover,
    playChordSeq,
    playChordSimul,
    copyToClipboard,
    onAddToSetOp,
    onShowZRelations,
}) => {
    const forteStr = chord.toString();
    const isZChord = forteStr.toLowerCase().includes('z');

    return (
    <OverlayTrigger
        placement="top"
        overlay={
            <Popover id={`${keyPrefix}pop-${forteStr}`}>
                <Popover.Header>
                    <strong>
                        {forteStr}
                        <Button
                            className="copybutton"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(forteStr); }}
                        >📋</Button>
                    </strong>
                    <button type="button" className="close-button" onClick={(e) => { e.stopPropagation(); onClosePopover(); }}>
                        &times;
                    </button>
                </Popover.Header>
                <Popover.Body>
                    <strong>Play: </strong>
                    <Button className="playbutton" onClick={(e) => { e.stopPropagation(); playChordSeq(chord); }}>Up</Button>
                    <Button className="playbutton" onClick={(e) => { e.stopPropagation(); playChordSeq(chord, true); }}>Down</Button>
                    <Button className="playbutton" onClick={(e) => { e.stopPropagation(); playChordSimul(chord); }}>Simul</Button>
                    {onAddToSetOp && (
                        <Button
                            className="playbutton"
                            onClick={(e) => { e.stopPropagation(); onAddToSetOp(forteStr); }}
                            title="Add to set operations"
                        >⊕</Button>
                    )}
                    {isZChord && onShowZRelations && (
                        <Button
                            className="playbutton zbutton"
                            onClick={(e) => { e.stopPropagation(); onShowZRelations(chord); }}
                            title="Show Z-related chords"
                        >Z</Button>
                    )}
                    <br />
                    <ChordDetails chord={chord} />
                </Popover.Body>
            </Popover>
        }
        show={isPopoverVisible}
        trigger="click"
        rootClose
    >
        <ListGroup.Item
            onClick={onClick}
            className={isActive ? 'active' : ''}
        >
            {forteStr}
        </ListGroup.Item>
    </OverlayTrigger>
    );
};

export default React.memo(ChordListItem);
