import React, { useMemo, useState } from 'react';
import { PCS12 } from 'ultra-mega-enumerator';
import { SentimentPredictionMap } from './pcsSentimentModel';
import { computeChordFromMask, computeColumnUnionMask } from './randomPitchClassMatrix';
import './MatrixBoard.css';

interface MatrixBoardProps {
    matrix: PCS12[][];
    lockedCells: boolean[][];
    selectedCell: { row: number; col: number } | null;
    predictions: SentimentPredictionMap;
    rowOrder: number[];
    colOrder: number[];
    onCellClick: (row: number, col: number) => void;
    onLockToggle: (row: number, col: number) => void;
    onPlayChord: (chord: PCS12) => void;
    onMoveRow?: (from: number, to: number) => void;
    onMoveColumn?: (from: number, to: number) => void;
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
    rowOrder,
    colOrder,
    onCellClick,
    onLockToggle,
    onPlayChord,
    onMoveRow,
    onMoveColumn,
}) => {
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;

    const [dragRow, setDragRow] = useState<number | null>(null);
    const [dragCol, setDragCol] = useState<number | null>(null);
    const [dropRow, setDropRow] = useState<number | null>(null);
    const [dropCol, setDropCol] = useState<number | null>(null);

    const effRowOrder = useMemo(
        () => (rowOrder.length === rows ? rowOrder : Array.from({ length: rows }, (_, i) => i)),
        [rowOrder, rows]
    );
    const effColOrder = useMemo(
        () => (colOrder.length === cols ? colOrder : Array.from({ length: cols }, (_, i) => i)),
        [colOrder, cols]
    );

    const columnUnionMasks = useMemo(() =>
        Array.from({ length: cols }, (_, col) => computeColumnUnionMask(matrix, col)),
        [matrix, cols]
    );

    const columnUnionChords = useMemo(() =>
        columnUnionMasks.map(mask => mask !== 0 ? computeChordFromMask(mask) : null),
        [columnUnionMasks]
    );

    if (rows === 0 || cols === 0) return null;

    const rowsReorderable = Boolean(onMoveRow) && rows > 1;
    const colsReorderable = Boolean(onMoveColumn) && cols > 1;

    const finishRowDrop = (targetRow: number) => {
        if (onMoveRow && dragRow !== null && dragRow !== targetRow) {
            onMoveRow(dragRow, targetRow);
        }
        setDragRow(null);
        setDropRow(null);
    };

    const finishColDrop = (targetCol: number) => {
        if (onMoveColumn && dragCol !== null && dragCol !== targetCol) {
            onMoveColumn(dragCol, targetCol);
        }
        setDragCol(null);
        setDropCol(null);
    };

    return (
        <div className="matrix-board-wrapper">
            <div
                className="matrix-grid"
                style={{ '--cols': cols } as React.CSSProperties}
            >
                {/* Corner */}
                <div
                    className="matrix-corner"
                    title="Drag a row (R) or column (C) header to reorder. The #n badge shows the original position."
                >
                    R/C
                </div>

                {/* Column headers */}
                {effColOrder.map((origCol, cIdx) => (
                    <div
                        key={`col-header-${cIdx}`}
                        className={
                            'matrix-col-header'
                            + (colsReorderable ? ' draggable' : '')
                            + (dragCol === cIdx ? ' dragging' : '')
                            + (dropCol === cIdx ? ' drop-target' : '')
                            + (origCol !== cIdx ? ' moved' : '')
                        }
                        draggable={colsReorderable}
                        onDragStart={() => { if (colsReorderable) setDragCol(cIdx); }}
                        onDragOver={(event) => {
                            if (dragCol !== null) {
                                event.preventDefault();
                                if (dropCol !== cIdx) setDropCol(cIdx);
                            }
                        }}
                        onDragLeave={() => { if (dropCol === cIdx) setDropCol(null); }}
                        onDrop={() => finishColDrop(cIdx)}
                        onDragEnd={() => { setDragCol(null); setDropCol(null); }}
                        title={`Column ${cIdx + 1} — original position ${origCol + 1}${colsReorderable ? ' (drag to reorder)' : ''}`}
                    >
                        <span className="matrix-header-pos">C{cIdx + 1}</span>
                        <span className="matrix-header-orig">#{origCol + 1}</span>
                    </div>
                ))}

                {/* Rows */}
                {matrix.map((rowData, rIdx) => (
                    <React.Fragment key={`row-${rIdx}`}>
                        <div
                            className={
                                'matrix-row-header'
                                + (rowsReorderable ? ' draggable' : '')
                                + (dragRow === rIdx ? ' dragging' : '')
                                + (dropRow === rIdx ? ' drop-target' : '')
                                + (effRowOrder[rIdx] !== rIdx ? ' moved' : '')
                            }
                            draggable={rowsReorderable}
                            onDragStart={() => { if (rowsReorderable) setDragRow(rIdx); }}
                            onDragOver={(event) => {
                                if (dragRow !== null) {
                                    event.preventDefault();
                                    if (dropRow !== rIdx) setDropRow(rIdx);
                                }
                            }}
                            onDragLeave={() => { if (dropRow === rIdx) setDropRow(null); }}
                            onDrop={() => finishRowDrop(rIdx)}
                            onDragEnd={() => { setDragRow(null); setDropRow(null); }}
                            title={`Row ${rIdx + 1} — original position ${effRowOrder[rIdx] + 1}${rowsReorderable ? ' (drag to reorder)' : ''}`}
                        >
                            <span className="matrix-header-pos">R{rIdx + 1}</span>
                            <span className="matrix-header-orig">#{effRowOrder[rIdx] + 1}</span>
                        </div>

                        {rowData.map((chord, cIdx) => {
                            const forte = chord.toString();
                            const sentClass = getSentimentClass(forte, predictions);
                            const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                            const isLocked = lockedCells[rIdx]?.[cIdx] ?? false;
                            const pcs = formatPitchClasses(chord);

                            return (
                                <div
                                    key={`cell-${rIdx}-${cIdx}`}
                                    className="matrix-cell-frame"
                                >
                                    <button
                                        type="button"
                                        className={`matrix-cell ${sentClass}${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                                        onClick={() => onCellClick(rIdx, cIdx)}
                                        title={`${forte} (${pcs})${isLocked ? ' — locked' : ''}`}
                                    >
                                        <span className="matrix-cell-forte">{forte}</span>
                                        <span className="matrix-cell-pcs">{pcs}</span>
                                        {isLocked && <span className="matrix-cell-lock" aria-label="locked">🔒</span>}
                                    </button>
                                    <button
                                        type="button"
                                        className="matrix-cell-play"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onPlayChord(chord);
                                        }}
                                        title={`Play ${forte}`}
                                        aria-label={`Play ${forte}`}
                                    >
                                        ▶
                                    </button>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>

            {/* Column union row */}
            <div
                className="matrix-union-row"
                style={{ '--cols': cols } as React.CSSProperties}
            >
                <div className="matrix-union-spacer" aria-hidden="true" />
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
