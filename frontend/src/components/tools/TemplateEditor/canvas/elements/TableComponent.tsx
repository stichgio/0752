import React, { useMemo } from 'react';
import { TemplateElement } from '../../canvasTypes';
import { normalizeTableData } from '../../utils/elementDefaults';

interface TableComponentProps {
    tableData?: TemplateElement['tableData'];
    style: TemplateElement['style'];
}

export function TableComponent({ tableData, style }: TableComponentProps) {
    const table = useMemo(
        () => normalizeTableData({ tableData, style }),
        [tableData, style]
    );

    return (
        <table
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
            <tbody>
                {Array.from({ length: table.rowCount }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                        {Array.from({ length: table.colCount }).map((__, colIndex) => {
                            const value = table.data[rowIndex]?.[colIndex] ?? '';
                            return (
                                <td
                                    key={colIndex}
                                    style={{
                                        border: `1px solid ${table.borderColor}`,
                                        padding: '2px 4px',
                                        verticalAlign: 'middle',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {value || '\u00A0'}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
