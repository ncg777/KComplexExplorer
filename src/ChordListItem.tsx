import React from 'react';
import { ListGroup, OverlayTrigger, Popover, Button } from 'react-bootstrap';
import { PCS12 } from 'ultra-mega-enumerator';
import { getIntervalVectorEntropyMetrics } from './intervalVectorEntropy';
import { SentimentValue } from './pcsSentiment';

interface ChordListItemProps {
    chord: PCS12;
    keyPrefix: string;
    isPopoverVisible: boolean;
    isActive: boolean;
    itemId?: string;
    onClick: () => void;
    onClosePopover: () => void;
    playChordSeq: (chord: PCS12, down?: boolean) => void;
    playChordSimul: (chord: PCS12) => void;
    copyToClipboard: (text: string) => void;
    sentiment: SentimentValue;
    onSentimentChange: (chord: PCS12, sentiment: SentimentValue) => void;
    onAddToSetOp?: (forte: string) => void;
    onShowZRelations?: (chord: PCS12) => void;
    onSelectInMainList?: (chord: PCS12) => void;
}

export const ChordDetails: React.FC<{ chord: PCS12 }> = ({ chord }) => {
    const { entropy, level } = getIntervalVectorEntropyMetrics(chord);
    return (
        <>
            <strong>Common name(s): </strong>{chord.getCommonName() || 'None'}<br />
            <strong>Pitch classes: </strong>{chord.combinationString()}<br />
            <strong>Intervals: </strong>{chord.getIntervals().map(x => String(x)).join(" ")}<br />
            <strong>Interval vector: </strong>{chord.getIntervalVector()?.join(' ') || '[]'}<br />
            <strong>Interval vector entropy: </strong>{entropy.toFixed(3)} ({level})<br />
            <strong>Symmetries: </strong>{chord.getSymmetries().map(x => String(x)).join(" ") || "None"}<br />
            <strong>Tension partition: </strong>{chord.getTensionPartition().map(x => String(x)).join(" ") || "None"}
        </>
    );
};

const ChordListItem: React.FC<ChordListItemProps> = ({
    chord,
    keyPrefix,
    isPopoverVisible,
    isActive,
    itemId,
    onClick,
    onClosePopover,
    playChordSeq,
    playChordSimul,
    copyToClipboard,
    sentiment,
    onSentimentChange,
    onAddToSetOp,
    onShowZRelations,
    onSelectInMainList,
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
                        {onSelectInMainList && (
                            <Button
                                className="copybutton"
                                onClick={(e) => { e.stopPropagation(); onSelectInMainList(chord); }}
                                title="Select this set in the main list"
                            >←</Button>
                        )}
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
                    <strong>Sentiment: </strong>
                    <Button
                        className="playbutton sentiment-button"
                        variant={sentiment === 1 ? 'success' : 'outline-success'}
                        onClick={(e) => { e.stopPropagation(); onSentimentChange(chord, 1); }}
                    >+1</Button>
                    <Button
                        className="playbutton sentiment-button"
                        variant={sentiment === 0 ? 'warning' : 'outline-warning'}
                        onClick={(e) => { e.stopPropagation(); onSentimentChange(chord, 0); }}
                    >0</Button>
                    <Button
                        className="playbutton sentiment-button"
                        variant={sentiment === -1 ? 'danger' : 'outline-danger'}
                        onClick={(e) => { e.stopPropagation(); onSentimentChange(chord, -1); }}
                    >-1</Button>
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
            id={itemId}
            onClick={onClick}
            className={isActive ? 'active' : ''}
        >
            {forteStr}
        </ListGroup.Item>
    </OverlayTrigger>
    );
};

export default React.memo(ChordListItem);
