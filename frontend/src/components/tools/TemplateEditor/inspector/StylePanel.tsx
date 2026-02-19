import React from 'react';
import { TemplateElement, ElementStyle } from '../canvasTypes';
import { Palette } from 'lucide-react';
import { normalizeTableData, resizeTableData } from '../utils/elementDefaults';

interface StylePanelProps {
    element: TemplateElement;
    onUpdate: (id: string, updates: Partial<TemplateElement>) => void;
}

export function StylePanel({ element, onUpdate }: StylePanelProps) {
    const style = element.style;

    const updateStyle = (updates: Partial<ElementStyle>) => {
        onUpdate(element.id, { style: { ...style, ...updates } });
    };

    const isTextType = element.type === 'text' || element.type === 'heading' || element.type === 'variable';
    const isTableType = element.type === 'table';
    const isSignatureType = element.type === 'signature';
    const tableData = isTableType ? normalizeTableData(element) : null;
    const signatureTitle = isSignatureType ? (element.title ?? element.signatureConfig?.[0]?.title ?? 'SUPERVISOR') : '';
    const signatureName = isSignatureType ? (element.signatureName ?? element.signatureConfig?.[0]?.name ?? '') : '';

    const updateTableCell = (rowIndex: number, colIndex: number, value: string) => {
        if (!tableData) return;
        const nextData = tableData.data.map((row, rIdx) =>
            rIdx === rowIndex
                ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
                : row.slice()
        );
        onUpdate(element.id, { tableData: { ...tableData, data: nextData } });
    };

    return (
        <div className="px-3 py-3 border-b border-neutral-100 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
                <Palette size={10} className="text-neutral-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Estilo</span>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-1.5">
                <ColorInput
                    label="Fondo"
                    value={style.backgroundColor || 'transparent'}
                    onChange={(v) => updateStyle({ backgroundColor: v })}
                />
                {isTextType && (
                    <ColorInput
                        label="Texto"
                        value={style.color || '#000000'}
                        onChange={(v) => updateStyle({ color: v })}
                    />
                )}
            </div>

            {/* Border */}
            <div>
                <span className="text-[10px] font-medium text-neutral-400 block mb-1">Borde</span>
                <div className="grid grid-cols-3 gap-1.5">
                    <ColorInput
                        label=""
                        value={style.borderColor || '#000000'}
                        onChange={(v) => updateStyle({ borderColor: v })}
                    />
                    <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                        <input
                            type="number"
                            value={style.borderWidth || 0}
                            onChange={(e) => updateStyle({ borderWidth: Number(e.target.value) })}
                            min={0}
                            max={20}
                            step={1}
                            className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                        />
                        <span className="text-[9px] text-neutral-400 pr-1 select-none">px</span>
                    </div>
                    <select
                        value={style.borderStyle || 'solid'}
                        onChange={(e) => updateStyle({ borderStyle: e.target.value as any })}
                        className="h-7 text-xs bg-neutral-50 border border-neutral-200 rounded-md px-1 focus:outline-none focus:ring-1 focus:ring-violet-400 text-neutral-700"
                    >
                        <option value="solid">Sólido</option>
                        <option value="dashed">Guiones</option>
                        <option value="dotted">Puntos</option>
                        <option value="none">Ninguno</option>
                    </select>
                </div>
            </div>

            {/* Table config */}
            {isTableType && tableData && (
                <div>
                    <span className="text-[10px] font-medium text-neutral-400 block mb-1">Tabla</span>
                    <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                            <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                                <input
                                    type="number"
                                    value={tableData.rowCount}
                                    onChange={(e) => {
                                        const next = resizeTableData(tableData, Number(e.target.value), tableData.colCount);
                                        onUpdate(element.id, { tableData: next });
                                    }}
                                    min={1}
                                    max={50}
                                    step={1}
                                    className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                                />
                                <span className="text-[9px] text-neutral-400 pr-1 select-none">filas</span>
                            </div>
                            <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                                <input
                                    type="number"
                                    value={tableData.colCount}
                                    onChange={(e) => {
                                        const next = resizeTableData(tableData, tableData.rowCount, Number(e.target.value));
                                        onUpdate(element.id, { tableData: next });
                                    }}
                                    min={1}
                                    max={20}
                                    step={1}
                                    className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                                />
                                <span className="text-[9px] text-neutral-400 pr-1 select-none">cols</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    const next = resizeTableData(tableData, tableData.rowCount + 1, tableData.colCount);
                                    onUpdate(element.id, { tableData: next });
                                }}
                                className="h-7 text-[10px] font-medium bg-neutral-50 border border-neutral-200 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
                                title="Agregar una fila al final"
                            >
                                + Agregar fila
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (tableData.rowCount <= 1) return;
                                    const trimmed = { ...tableData, data: tableData.data.slice(0, -1) };
                                    const next = resizeTableData(trimmed, tableData.rowCount - 1, tableData.colCount);
                                    onUpdate(element.id, { tableData: next });
                                }}
                                disabled={tableData.rowCount <= 1}
                                className="h-7 text-[10px] font-medium bg-neutral-50 border border-neutral-200 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar la ultima fila"
                            >
                                - Eliminar fila
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = resizeTableData(tableData, tableData.rowCount, tableData.colCount + 1);
                                    onUpdate(element.id, { tableData: next });
                                }}
                                className="h-7 text-[10px] font-medium bg-neutral-50 border border-neutral-200 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
                                title="Agregar una columna al final"
                            >
                                + Agregar columna
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (tableData.colCount <= 1) return;
                                    const trimmed = { ...tableData, data: tableData.data.map((row) => row.slice(0, -1)) };
                                    const next = resizeTableData(trimmed, tableData.rowCount, tableData.colCount - 1);
                                    onUpdate(element.id, { tableData: next });
                                }}
                                disabled={tableData.colCount <= 1}
                                className="h-7 text-[10px] font-medium bg-neutral-50 border border-neutral-200 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar la ultima columna"
                            >
                                - Eliminar columna
                            </button>
                        </div>
                        <ColorInput
                            label="Borde tabla"
                            value={tableData.borderColor}
                            onChange={(v) => {
                                onUpdate(element.id, {
                                    tableData: { ...tableData, borderColor: v },
                                    style: { ...style, borderColor: v },
                                });
                            }}
                        />
                        <div>
                            <span className="text-[10px] font-medium text-neutral-400 block mb-1">Contenido de la tabla</span>
                            <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                                {tableData.data.map((row, rowIndex) => (
                                    <div
                                        key={`table-row-${rowIndex}`}
                                        className="grid gap-1"
                                        style={{ gridTemplateColumns: `repeat(${tableData.colCount}, minmax(0, 1fr))` }}
                                    >
                                        {row.map((cell, colIndex) => (
                                            <input
                                                key={`table-cell-${rowIndex}-${colIndex}`}
                                                type="text"
                                                value={cell}
                                                onChange={(e) => updateTableCell(rowIndex, colIndex, e.target.value)}
                                                className="h-7 px-2 text-[10px] border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                                                placeholder={`F${rowIndex + 1} C${colIndex + 1}`}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Signature config */}
            {isSignatureType && (
                <div>
                    <span className="text-[10px] font-medium text-neutral-400 block mb-1">Firma</span>
                    <div className="space-y-1.5">
                        <div>
                            <span className="text-[10px] text-neutral-500 block mb-1">Titulo de la firma</span>
                            <input
                                type="text"
                                value={signatureTitle}
                                onChange={(e) => {
                                    const nextTitle = e.target.value;
                                    onUpdate(element.id, {
                                        title: nextTitle,
                                        signatureName,
                                        signatureConfig: [{ title: nextTitle, name: signatureName }],
                                    });
                                }}
                                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                                placeholder="SUPERVISOR"
                            />
                        </div>
                        <div>
                            <span className="text-[10px] text-neutral-500 block mb-1">Nombre (Opcional)</span>
                            <input
                                type="text"
                                value={signatureName}
                                onChange={(e) => {
                                    const nextName = e.target.value;
                                    onUpdate(element.id, {
                                        title: signatureTitle,
                                        signatureName: nextName,
                                        signatureConfig: [{ title: signatureTitle, name: nextName }],
                                    });
                                }}
                                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                                placeholder="Ing. Juan Perez"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Typography (only for text-like elements) */}
            {isTextType && (
                <div>
                    <span className="text-[10px] font-medium text-neutral-400 block mb-1">Tipografía</span>
                    <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                            <select
                                value={style.fontFamily || 'Arial'}
                                onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                                className="h-7 text-xs bg-neutral-50 border border-neutral-200 rounded-md px-1 focus:outline-none focus:ring-1 focus:ring-violet-400 text-neutral-700"
                            >
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Times New Roman">Times</option>
                                <option value="Courier New">Courier</option>
                                <option value="Georgia">Georgia</option>
                                <option value="monospace">Monospace</option>
                            </select>
                            <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                                <input
                                    type="number"
                                    value={style.fontSize || 12}
                                    onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                                    min={6}
                                    max={120}
                                    className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                                />
                                <span className="text-[9px] text-neutral-400 pr-1 select-none">px</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <select
                                value={style.fontWeight || 'normal'}
                                onChange={(e) => updateStyle({ fontWeight: e.target.value as any })}
                                className="h-7 text-xs bg-neutral-50 border border-neutral-200 rounded-md px-1 focus:outline-none focus:ring-1 focus:ring-violet-400 text-neutral-700"
                            >
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                                <option value="300">Light</option>
                                <option value="500">Medium</option>
                                <option value="600">Semibold</option>
                                <option value="900">Black</option>
                            </select>
                            <div className="flex items-center gap-0.5">
                                {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                                    <button
                                        key={align}
                                        onClick={() => updateStyle({ textAlign: align })}
                                        className={`flex-1 h-7 flex items-center justify-center rounded-md text-xs transition-colors ${style.textAlign === align
                                            ? 'bg-violet-100 text-violet-700'
                                            : 'bg-neutral-50 border border-neutral-200 text-neutral-500 hover:bg-neutral-100'
                                            }`}
                                        title={align}
                                    >
                                        {align === 'left' && '⬱'}
                                        {align === 'center' && '⬳'}
                                        {align === 'right' && '⭰'}
                                        {align === 'justify' && '☰'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Border Radius */}
            <div className="grid grid-cols-2 gap-1.5">
                <div>
                    <span className="text-[10px] font-medium text-neutral-400 block mb-1">Radio borde</span>
                    <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                        <input
                            type="number"
                            value={style.borderRadius || 0}
                            onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
                            min={0}
                            max={50}
                            className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                        />
                        <span className="text-[9px] text-neutral-400 pr-1 select-none">%</span>
                    </div>
                </div>
                <div>
                    <span className="text-[10px] font-medium text-neutral-400 block mb-1">Padding</span>
                    <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
                        <input
                            type="number"
                            value={style.padding || 0}
                            onChange={(e) => updateStyle({ padding: Number(e.target.value) })}
                            min={0}
                            max={100}
                            className="w-full h-full bg-transparent text-xs text-neutral-700 px-1.5 focus:outline-none"
                        />
                        <span className="text-[9px] text-neutral-400 pr-1 select-none">px</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ColorInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
            <input
                type="color"
                value={value === 'transparent' ? '#ffffff' : value}
                onChange={(e) => onChange(e.target.value)}
                className="w-6 h-5 ml-1 rounded border border-neutral-300 cursor-pointer p-0"
                style={{ appearance: 'none', WebkitAppearance: 'none' }}
            />
            {label && <span className="text-[9px] text-neutral-400 px-1 select-none">{label}</span>}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 h-full bg-transparent text-[10px] text-neutral-600 px-0.5 font-mono focus:outline-none"
            />
        </div>
    );
}
