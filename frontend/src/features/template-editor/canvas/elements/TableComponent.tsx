import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TemplateElement } from '../../canvasTypes';
import { normalizeTableData } from '../../utils/elementDefaults';

interface TableComponentProps {
    tableData?: TemplateElement['tableData'];
    style: TemplateElement['style'];
    disabled?: boolean;
    onTableDataChange?: (nextTable: NonNullable<TemplateElement['tableData']>) => void;
}

type ResizeAxis = 'col' | 'row';

interface ActiveResize {
    axis: ResizeAxis;
    index: number;
    startClient: number;
    sizePx: number;
    count: number;
    startDistribution: number[];
}

interface EditingCell {
    rowIndex: number;
    colIndex: number;
    value: string;
}

const HANDLE_THICKNESS = 6;

function roundPercent(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function normalizePercentages(values: number[], count: number): number[] {
    if (count <= 0) return [];
    const raw = Array.from({ length: count }, (_, idx) => {
        const n = Number(values[idx]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const total = raw.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        const equal = Array.from({ length: count }, () => roundPercent(100 / count));
        const equalDelta = roundPercent(100 - equal.reduce((sum, value) => sum + value, 0));
        equal[equal.length - 1] = roundPercent(equal[equal.length - 1] + equalDelta);
        return equal;
    }
    const normalized = raw.map((value) => roundPercent((value / total) * 100));
    const delta = roundPercent(100 - normalized.reduce((sum, value) => sum + value, 0));
    normalized[normalized.length - 1] = roundPercent(normalized[normalized.length - 1] + delta);
    return normalized;
}

function resizeAdjacentPair(distribution: number[], index: number, deltaPercent: number, minPercent: number): number[] {
    const next = distribution.slice();
    if (index < 0 || index >= next.length - 1) return next;

    const pairTotal = next[index] + next[index + 1];
    const boundedMin = Math.max(0.5, Math.min(minPercent, pairTotal / 2));
    const resizedFirst = Math.max(boundedMin, Math.min(pairTotal - boundedMin, next[index] + deltaPercent));
    const resizedSecond = pairTotal - resizedFirst;

    next[index] = resizedFirst;
    next[index + 1] = resizedSecond;
    return normalizePercentages(next, next.length);
}

export function TableComponent({ tableData, style, disabled = false, onTableDataChange }: TableComponentProps) {
    const table = useMemo(
        () => normalizeTableData({ tableData, style }),
        [tableData, style]
    );
    const tableRef = useRef<HTMLTableElement | null>(null);
    const latestTableRef = useRef(table);
    const resizeStateRef = useRef<ActiveResize | null>(null);
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const cellEditorRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        latestTableRef.current = table;
    }, [table]);

    useEffect(() => {
        if (!editingCell || !cellEditorRef.current) return;
        const editor = cellEditorRef.current;
        editor.focus();
        const cursorPos = editor.value.length;
        editor.setSelectionRange(cursorPos, cursorPos);
    }, [editingCell]);

    useEffect(() => {
        if (!editingCell) return;
        if (editingCell.rowIndex >= table.rowCount || editingCell.colIndex >= table.colCount) {
            setEditingCell(null);
        }
    }, [editingCell, table.rowCount, table.colCount]);

    const commitCellEdit = useCallback(() => {
        if (!editingCell) return;

        const currentTable = latestTableRef.current;
        const { rowIndex, colIndex, value } = editingCell;
        const currentValue = currentTable.data?.[rowIndex]?.[colIndex] || '';

        if (value !== currentValue && onTableDataChange) {
            const nextData = currentTable.data.map((row, rIdx) =>
                rIdx === rowIndex
                    ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
                    : row.slice()
            );
            onTableDataChange({
                ...currentTable,
                data: nextData,
            });
        }

        setEditingCell(null);
    }, [editingCell, onTableDataChange]);

    const startCellEdit = useCallback((event: React.MouseEvent, rowIndex: number, colIndex: number) => {
        if (disabled || !onTableDataChange) return;
        const target = event.target as HTMLElement;
        if (target.closest('[data-table-resize-handle]')) return;

        event.preventDefault();
        event.stopPropagation();

        const value = latestTableRef.current.data?.[rowIndex]?.[colIndex] || '';
        setEditingCell({ rowIndex, colIndex, value });
    }, [disabled, onTableDataChange]);

    const startResize = useCallback((event: React.MouseEvent, axis: ResizeAxis, index: number) => {
        if (disabled || !onTableDataChange) return;
        const node = tableRef.current;
        if (!node) return;

        const rect = node.getBoundingClientRect();
        const sizePx = axis === 'col' ? rect.width : rect.height;
        const count = axis === 'col' ? table.colCount : table.rowCount;
        const distribution = axis === 'col' ? table.colWidths : table.rowHeights;

        if (sizePx <= 0 || count < 2 || index < 0 || index >= count - 1) return;

        event.preventDefault();
        event.stopPropagation();

        resizeStateRef.current = {
            axis,
            index,
            startClient: axis === 'col' ? event.clientX : event.clientY,
            sizePx,
            count,
            startDistribution: distribution.slice(),
        };

        document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }, [disabled, onTableDataChange, table]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const state = resizeStateRef.current;
            if (!state || !onTableDataChange) return;

            const deltaPx = (state.axis === 'col' ? event.clientX : event.clientY) - state.startClient;
            const deltaPercent = (deltaPx / state.sizePx) * 100;
            const minPercent = Math.min(40, Math.max(2, 100 / (state.count * 4)));
            const resized = resizeAdjacentPair(state.startDistribution, state.index, deltaPercent, minPercent);
            const currentTable = latestTableRef.current;

            onTableDataChange({
                ...currentTable,
                colWidths: state.axis === 'col' ? resized : currentTable.colWidths,
                rowHeights: state.axis === 'row' ? resized : currentTable.rowHeights,
            });
        };

        const handleMouseUp = () => {
            if (!resizeStateRef.current) return;
            resizeStateRef.current = null;
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
        };
    }, [onTableDataChange]);

    return (
        <table
            ref={tableRef}
            style={{
                width: '100%',
                height: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontSize: style.fontSize || 10,
                color: style.color || '#111827',
                backgroundColor: style.backgroundColor || 'transparent',
            }}
        >
            <colgroup>
                {table.colWidths.map((width, colIndex) => (
                    <col key={`col-${colIndex}`} style={{ width: `${width}%` }} />
                ))}
            </colgroup>
            <tbody>
                {Array.from({ length: table.rowCount }).map((_, rowIndex) => (
                    <tr key={rowIndex} style={{ height: `${table.rowHeights[rowIndex] ?? 0}%` }}>
                        {Array.from({ length: table.colCount }).map((__, colIndex) => {
                            const isEditingCurrentCell =
                                editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex;
                            return (
                                <td
                                    key={colIndex}
                                    onClick={(event) => startCellEdit(event, rowIndex, colIndex)}
                                    style={{
                                        border: `1px solid ${table.borderColor}`,
                                        padding: '2px 4px',
                                        verticalAlign: 'middle',
                                        overflow: 'hidden',
                                        position: 'relative',
                                    }}
                                >
                                    <div
                                        style={{
                                            overflow: 'hidden',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            minHeight: 12,
                                            opacity: isEditingCurrentCell ? 0 : 1,
                                        }}
                                    >
                                        {table.data?.[rowIndex]?.[colIndex] || ''}
                                    </div>
                                    {isEditingCurrentCell && (
                                        <textarea
                                            ref={cellEditorRef}
                                            value={editingCell.value}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setEditingCell((prev) =>
                                                    prev ? { ...prev, value } : prev
                                                );
                                            }}
                                            onBlur={commitCellEdit}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' && event.shiftKey) {
                                                    event.preventDefault();
                                                    event.currentTarget.blur();
                                                }
                                                if (event.key === 'Escape') {
                                                    event.preventDefault();
                                                    setEditingCell(null);
                                                }
                                            }}
                                            spellCheck={false}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                width: '100%',
                                                height: '100%',
                                                border: 'none',
                                                outline: 'none',
                                                resize: 'none',
                                                background: 'transparent',
                                                color: style.color || '#111827',
                                                fontSize: style.fontSize || 10,
                                                fontFamily: style.fontFamily,
                                                fontWeight: style.fontWeight as React.CSSProperties['fontWeight'],
                                                textAlign: style.textAlign as React.CSSProperties['textAlign'],
                                                lineHeight: style.lineHeight ? `${style.lineHeight}` : undefined,
                                                letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
                                                padding: '2px 4px',
                                                boxSizing: 'border-box',
                                                overflow: 'hidden',
                                            }}
                                        />
                                    )}
                                    {colIndex < table.colCount - 1 && !disabled && (
                                        <div
                                            data-table-resize-handle="col"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onMouseDown={(event) => startResize(event, 'col', colIndex)}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                right: -HANDLE_THICKNESS / 2,
                                                width: HANDLE_THICKNESS,
                                                height: '100%',
                                                cursor: 'col-resize',
                                                zIndex: 2,
                                                background: 'rgba(59, 130, 246, 0.18)',
                                            }}
                                        />
                                    )}
                                    {rowIndex < table.rowCount - 1 && !disabled && (
                                        <div
                                            data-table-resize-handle="row"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onMouseDown={(event) => startResize(event, 'row', rowIndex)}
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                bottom: -HANDLE_THICKNESS / 2,
                                                width: '100%',
                                                height: HANDLE_THICKNESS,
                                                cursor: 'row-resize',
                                                zIndex: 2,
                                                background: 'rgba(59, 130, 246, 0.18)',
                                            }}
                                        />
                                    )}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
