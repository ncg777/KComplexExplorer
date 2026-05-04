import React, { useMemo } from 'react';
import { PCS12 } from 'ultra-mega-enumerator';
import { SentimentPredictionMap } from './pcsSentimentModel';
import { computePitchClassMask, computeChordFromMask, computeColumnUnionMask } from './randomPitchClassMatrix';
import './MatrixBoard.css';

interface MatrixBoardProps {
    matrix: PCS12[][];
    lockedCells: boolean[][];
    selectedCell: { row: number; col: number } | null;
    predictions: SentimentPredictionMap;
    onCellClick: (row: number, col: number) => void;
    onLockToggle: (row: number, col: number) => void;
}

function formatPitchClasses(chord: PCS12): string {
    return chord.asSequence()
        .map(pc => pc < 10 ? String(pc) : pc === 10 ? 'T' : 'E')
        .join('');
}

function getSentimentClass(forte: string, predictions: SentimentPredictionMap): string {
    const val = predictions[forte];
    if (val === 1) return 'positive';
    if (val === -1) return 'negative';
    return 'neutral';
}

function getUnionSentimentClass(mask: number, predictions: SentimentPredictionMap): string {
    if (mask === 0) return 'neutral';
    const chord = computeChordFromMask(mask);
    return getSentimentClass(chord.toString(), predictions);
}

const MatrixBoard: React.FC<MatrixBoardProps> = ({
    matrix,
    lockedCells,
    selectedCell,
    predictions,
    onCellClick,
    onLockToggle,
}) => {
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;

    const columnUnionMasks = useMemo(() =>
        Array.from({ length: cols }, (_, col) => computeColumnUnionMask(matrix, col)),
        [matrix, cols]
    );

    const columnUnionChords = useMemo(() =>
        columnUnionMasks.map(mask => mask !== 0 ? computeChordFromMask(mask) : null),
        [columnUnionMasks]
    );

    if (rows === 0 || cols === 0) return null;

    return (
        <div className="matrix-board-wrapper">
            <div
                className="matrix-board"
                style={{ '--cols': cols } as React.CSSProperties}
            >
                {matrix.map((rowData, rIdx) =>
                    rowData.map((chord, cIdx) => {
                        const forte = chord.toString();
                        const sentClass = getSentimentClass(forte, predictions);
                        const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                        const isLocked = lockedCells[rIdx]?.[cIdx] ?? false;
                        const pcs = formatPitchClasses(chord);

                        return (
                            <button
                                key={`cell-${rIdx}-${cIdx}`}
                                type="button"
                                className={`matrix-cell ${sentClass}${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                                onClick={() => onCellClick(rIdx, cIdx)}
                                title={`${forte} (${pcs})${isLocked ? ' — locked' : ''}`}
                            >
                                <span className="matrix-cell-forte">{forte}</span>
                                <span className="matrix-cell-pcs">{pcs}</span>
                                {isLocked && <span className="matrix-cell-lock" aria-label="locked">🔒</span>}
                            </button>
                        );
                    })
                )}
            </div>

            {/* Column union row */}
            <div
                className="matrix-union-row"
                style={{ '--cols': cols } as React.CSSProperties}
            >
                {columnUnionChords.map((unionChord, cIdx) => {
                    const sentClass = unionChord
                        ? getUnionSentimentClass(columnUnionMasks[cIdx], predictions)
                        : 'neutral';
                    const forte = unionChord?.toString() ?? '—';
                    const pcs = unionChord ? formatPitchClasses(unionChord) : '';

                    return (
                        <div
                            key={`union-${cIdx}`}
                            className={`matrix-union-cell ${sentClass}`}
                            title={`Column ${cIdx + 1} union: ${forte}`}
                        >
                            <span className="matrix-union-label">∪</span>
                            <span className="matrix-cell-forte">{forte}</span>
                            {pcs && <span className="matrix-cell-pcs">{pcs}</span>}
                        </div>
                    );
                })}
            </div>

            {/* Lock/unlock buttons per cell in selected row */}
            {selectedCell && (
                <div className="matrix-lock-hint">
                    <button
                        type="button"
                        className="matrix-lock-btn"
                        onClick={() => onLockToggle(selectedCell.row, selectedCell.col)}
                    >
                        {lockedCells[selectedCell.row]?.[selectedCell.col]
                            ? '🔓 Unlock cell'
                            : '🔒 Lock cell'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default MatrixBoard;
