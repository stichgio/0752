/**
 * MultiSheetReportApp.jsx
 * Herramienta "Informe Multi-Hoja" — genera un PDF con N secciones bajo un
 * encabezado principal único y mini-encabezados opcionales por hoja.
 *
 * Cómo añadir una nueva hoja al informe (runtime):
 *   Selecciona una plantilla del dropdown "+ Agregar Hoja" en el Step 1.
 *   La hoja aparece automáticamente en el preview y se incluye en el PDF al exportar.
 *   Para "Grilla de Imágenes", puedes seleccionar imágenes específicas del pool global.
 *
 * Cómo extender el mini-encabezado alternativo:
 *   Añadir campos al objeto altHeaderConfig y referenciarlos en el backend
 *   (routers/multi_sheet_report.py → _build_alt_header_html).
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    FileSpreadsheet,
    Image as ImageIcon,
    Printer,
    Settings,
    ChevronLeft,
    ChevronRight,
    Search,
    BookOpen,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    ToggleLeft,
    ToggleRight,
    FileText,
    CheckCircle,
    AlertCircle,
    Layers,
    Eye,
    Grid2X2,
} from 'lucide-react';
import DashboardLayout from '../../DashboardLayout';
import { Step, LoadingModal } from '../../common';
import { downloadBlob } from '../../../utils/downloadBlob';
import { getApiBase } from '../../../utils/apiBase';
import { useSSEProgress } from '../../../hooks/useSSEProgress';
import { excelSerialToDate, isDateColumn } from '../../../utils';
import { toast } from 'sonner';

const API_BASE = `${getApiBase()}/api/multi-sheet`;

// ─────────────────────────────────────────────────────────────────────────────
// Utility: igual que en App.jsx (copiada, no importada — es local al componente)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Verifica si un nombre de imagen corresponde al ID de un registro.
 * Pattern: ID_NUMBER.ext o ID.ext  (ej. 1_1.jpeg, 1_2.jpg, 1.png)
 * Evita que el ID "1" coincida con "11_1.jpeg" o "12_2.jpg".
 */
const matchesRecordId = (imageName, recordId) => {
    const id = String(recordId).trim();
    const name = imageName.toLowerCase();
    const regex = new RegExp(
        `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[-_]\\d+)?\\.(jpg|jpeg|png|gif|webp)$`,
        'i'
    );
    return regex.test(name);
};

// Grid layout helper — maps N images to optimal columns (mirrors backend _grid_cols)
const GRID_COLS_MAP = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 3 };
const getGridCols = (n) => GRID_COLS_MAP[n] || 3;
const GRID_TEMPLATE_NAME = 'Grilla de Imágenes';
const VOLANTEO_TEMPLATE_NAME = 'Panel Fotográfico Volanteo';

const getRowTextValue = (rowData, key) => {
    if (!rowData) return '-';
    const value = rowData[key];
    if (value === null || value === undefined) return '-';
    const text = String(value).trim();
    return text || '-';
};

/**
 * Client-side Jinja2 substitution for local multi-sheet templates.
 * Handles the subset of Jinja2 used in multi_sheet_templates/*.html
 */
function renderLocalTemplate(html, rowData, logoLeft, logoRight, images) {
    const emptyPixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

    // Logo if/else conditionals
    html = html.replace(
        /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (logoLeft ? ifPart : elsePart)
    );
    html = html.replace(
        /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (logoRight ? ifPart : elsePart)
    );
    html = html.replace(
        /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, content) => (logoLeft ? content : '')
    );
    html = html.replace(
        /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, content) => (logoRight ? content : '')
    );

    // Logo variable substitution
    html = html.replaceAll('{{ logo_left }}', logoLeft || emptyPixel);
    html = html.replaceAll('{{ logo_right }}', logoRight || emptyPixel);

    // Image presence conditional
    const imgCount = images.length;
    html = html.replace(
        /\{%\s*if\s+images\s+and\s+images\|length\s*>\s*0\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (imgCount > 0 ? ifPart : elsePart)
    );

    // Row data: {{ data.get('KEY', 'default') }}
    html = html.replace(
        /\{\{\s*data\.get\('([^']+)',\s*'([^']*)'\)\s*\}\}/g,
        (_, key, def) => (rowData?.[key] != null ? String(rowData[key]) : def || '-')
    );

    // Image loop: {% for img in images[:N] %}...{% endfor %}
    html = html.replace(
        /\{%\s*for\s+img\s+in\s+images\[:(\d+)\]\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
        (_, countStr, loopContent) =>
            images.slice(0, parseInt(countStr, 10)).map((img, i) => {
                let item = loopContent;
                item = item.replaceAll('{{ img.path }}', img.url || '');
                item = item.replaceAll('{{ img.name }}', img.name || '');
                item = item.replaceAll('{{ loop.index }}', String(i + 1));
                return item;
            }).join('')
    );

    // Placeholder fill: {% for i in range(images|length, N) %}...{% endfor %}
    html = html.replace(
        /\{%\s*for\s+i\s+in\s+range\(images\|length,\s*(\d+)\)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
        (_, maxStr, content) => {
            const remaining = parseInt(maxStr, 10) - imgCount;
            return remaining > 0 ? content.repeat(remaining) : '';
        }
    );

    // Strip any remaining Jinja2 tags
    html = html.replace(/\{%[\s\S]*?%\}/g, '');
    html = html.replace(/\{\{[\s\S]*?\}\}/g, '-');

    return html;
}

const normalizeTemplateSections = (rawSections) => {
    if (!Array.isArray(rawSections)) return [];

    return rawSections
        .map((section, index) => {
            const id = typeof section?.id === 'string' && section.id.trim()
                ? section.id.trim()
                : `section-${index + 1}`;
            const label = typeof section?.label === 'string' && section.label.trim()
                ? section.label.trim()
                : `Sección ${index + 1}`;
            const templates = Array.isArray(section?.templates)
                ? Array.from(new Set(section.templates.map(t => String(t || '').trim()).filter(Boolean)))
                : [];

            return { id, label, templates };
        })
        .filter(section => section.templates.length > 0);
};

const orderSheetsForFirstPage = (sheetList) => {
    if (!Array.isArray(sheetList) || sheetList.length === 0) return [];
    const firstPageSheets = sheetList.filter(sheet => Boolean(sheet?.firstPageOnly));
    const regularSheets = sheetList.filter(sheet => !sheet?.firstPageOnly);
    return [...firstPageSheets, ...regularSheets];
};

const VOLANTEO_TEMPLATE_FIELDS = [
    'CENTRO',
    'NIS',
    'SECTOR',
    'FECHA CORTE',
    'DIRECCIONES AFECTADAS',
    'DISTRITO',
    'CODIGO COMPONENTE',
    'ESTADO',
];

const normalizeMappingToken = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const dedupeStrings = (values) => Array.from(new Set(
    values
        .map(value => String(value || '').trim())
        .filter(Boolean)
));

const findBestHeaderMatch = (targetKey, sourceHeaders) => {
    const cleanTarget = String(targetKey || '').trim();
    if (!cleanTarget) return '';

    const exactMatch = sourceHeaders.find(header =>
        String(header || '').trim().toLowerCase() === cleanTarget.toLowerCase()
    );
    if (exactMatch) return String(exactMatch);

    const normalizedTarget = normalizeMappingToken(cleanTarget);
    if (!normalizedTarget) return '';

    const normalizedMatch = sourceHeaders.find(header =>
        normalizeMappingToken(header) === normalizedTarget
    );
    if (normalizedMatch) return String(normalizedMatch);

    const fuzzyMatch = sourceHeaders.find(header => {
        const normalizedHeader = normalizeMappingToken(header);
        return normalizedHeader && (
            normalizedHeader.includes(normalizedTarget) ||
            normalizedTarget.includes(normalizedHeader)
        );
    });

    return fuzzyMatch ? String(fuzzyMatch) : '';
};

const buildTemplateFieldMappings = (templateFields, sourceHeaders, currentMappings = {}) => (
    templateFields.reduce((acc, field) => {
        const existing = currentMappings[field];
        acc[field] = existing || {
            sourceType: 'header',
            sourceValue: findBestHeaderMatch(field, sourceHeaders),
        };
        return acc;
    }, {})
);

const createCustomMappingEntry = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    targetKey: '',
    sourceType: 'header',
    sourceValue: '',
});

const resolveMappedValue = (row, mapping, fallbackKey = '') => {
    if (!mapping) {
        const fallbackValue = fallbackKey ? row?.[fallbackKey] : '';
        return fallbackValue === undefined ? '' : fallbackValue;
    }

    if (mapping.sourceType === 'manual') {
        return mapping.sourceValue ?? '';
    }

    const sourceKey = String(mapping.sourceValue || '').trim();
    if (sourceKey) {
        const sourceValue = row?.[sourceKey];
        return sourceValue === undefined ? '' : sourceValue;
    }

    const fallbackValue = fallbackKey ? row?.[fallbackKey] : '';
    return fallbackValue === undefined ? '' : fallbackValue;
};

const buildMappedDataset = (sourceHeaders, sourceRows, templateFieldMappings, customFieldMappings) => {
    const safeHeaders = dedupeStrings(sourceHeaders);
    const safeRows = Array.isArray(sourceRows) ? sourceRows : [];
    const effectiveCustomMappings = (Array.isArray(customFieldMappings) ? customFieldMappings : [])
        .map(entry => ({
            ...entry,
            targetKey: String(entry?.targetKey || '').trim(),
            sourceValue: entry?.sourceValue ?? '',
            sourceType: entry?.sourceType === 'manual' ? 'manual' : 'header',
        }))
        .filter(entry => entry.targetKey);

    const mappedRows = safeRows.map(row => {
        const nextRow = { ...row };

        Object.entries(templateFieldMappings || {}).forEach(([targetKey, mapping]) => {
            nextRow[targetKey] = resolveMappedValue(row, mapping, targetKey);
        });

        effectiveCustomMappings.forEach(mapping => {
            nextRow[mapping.targetKey] = resolveMappedValue(row, mapping);
        });

        return nextRow;
    });

    const mappedKeys = dedupeStrings([
        ...Object.keys(templateFieldMappings || {}),
        ...effectiveCustomMappings.map(entry => entry.targetKey),
    ]);

    return {
        headers: dedupeStrings([...safeHeaders, ...mappedKeys]),
        rows: mappedRows,
    };
};

function ColumnMappingModal({
    isOpen,
    isLoading,
    sourceHeaders,
    fileName,
    templateNames,
    templateFields,
    templateFieldMappings,
    customFieldMappings,
    errorMessage,
    onTemplateFieldChange,
    onAddCustomField,
    onCustomFieldChange,
    onRemoveCustomField,
    closeLabel,
    onClose,
    onApply,
}) {
    if (!isOpen) return null;

    const hasTemplateFields = templateFields.length > 0;
    const hasSourceHeaders = sourceHeaders.length > 0;

    const renderMappingEditor = (mapping, onChange) => (
        <div className="grid gap-1.5 sm:grid-cols-[124px,minmax(0,1fr)]">
            <select
                value={mapping?.sourceType || 'header'}
                onChange={e => onChange({
                    sourceType: e.target.value,
                    sourceValue: e.target.value === 'manual' ? (mapping?.sourceType === 'manual' ? mapping?.sourceValue || '' : '') : '',
                })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-400"
            >
                <option value="header">Columna del archivo</option>
                <option value="manual">Valor fijo</option>
            </select>

            {mapping?.sourceType === 'manual' ? (
                <input
                    type="text"
                    value={mapping?.sourceValue || ''}
                    onChange={e => onChange({ sourceValue: e.target.value })}
                    placeholder="Escribe un valor fijo"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400"
                />
            ) : (
                <select
                    value={mapping?.sourceValue || ''}
                    onChange={e => onChange({ sourceValue: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-400"
                >
                    <option value="">-- Seleccionar columna --</option>
                    {sourceHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                    ))}
                </select>
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-950/84 p-2 backdrop-blur-sm sm:p-3">
            <div className="grid h-[calc(100dvh-0.75rem)] w-full max-w-[860px] min-h-[420px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_42%),linear-gradient(180deg,rgba(24,24,27,0.985),rgba(10,10,10,0.985))] shadow-[0_32px_90px_rgba(0,0,0,0.52)] sm:h-[calc(100dvh-1.5rem)]">
                    <div className="border-b border-white/10 px-4 py-2.5 sm:px-5 sm:py-3">
                        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                            <div className="min-w-0 space-y-1.5">
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                                    <Layers size={12} />
                                    Mapeo de columnas
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold leading-tight text-white sm:text-xl">Conecta tu base de datos con la plantilla</h3>
                                    <p className="mt-1 max-w-2xl text-[11px] leading-5 text-neutral-300 sm:text-xs sm:leading-5">
                                        Relaciona las columnas del archivo con los c&oacute;digos Jinja detectados y crea campos extra si necesitas valores fijos.
                                    </p>
                                </div>
                                {fileName && (
                                    <p className="text-[10px] font-mono text-neutral-400 sm:text-[11px]">
                                        Archivo: <span className="text-neutral-200">{fileName}</span>
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 xl:w-[292px] xl:shrink-0">
                                <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-2.5 py-2.5 sm:px-3">
                                    <div className="truncate text-[9px] uppercase tracking-[0.16em] text-neutral-500">Activas</div>
                                    <div className="mt-1 text-sm font-semibold text-white sm:text-base">{templateNames.length}</div>
                                </div>
                                <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-2.5 py-2.5 sm:px-3">
                                    <div className="truncate text-[9px] uppercase tracking-[0.16em] text-neutral-500">Origen</div>
                                    <div className="mt-1 text-sm font-semibold text-white sm:text-base">{sourceHeaders.length}</div>
                                </div>
                                <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-2.5 py-2.5 sm:px-3">
                                    <div className="truncate text-[9px] uppercase tracking-[0.16em] text-neutral-500">Jinja</div>
                                    <div className="mt-1 text-sm font-semibold text-white sm:text-base">{templateFields.length}</div>
                                </div>
                            </div>
                        </div>

                            {templateNames.length > 0 && (
                            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 pr-1">
                                {templateNames.map(name => (
                                    <span
                                        key={name}
                                        className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-neutral-200"
                                    >
                                        {name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-3">
                        {isLoading ? (
                            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                                <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
                                <div>
                                    <p className="text-sm font-medium text-white">Analizando columnas y plantilla...</p>
                                    <p className="mt-1 text-xs text-neutral-400">Esto suele tardar solo unos segundos.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {errorMessage && (
                                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100">
                                        {errorMessage}
                                    </div>
                                )}

                                {!hasSourceHeaders && (
                                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-300">
                                        No se detectaron columnas en el archivo cargado.
                                    </div>
                                )}

                                <section className="space-y-2.5">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h4 className="text-sm font-semibold text-white">Campos detectados en la plantilla</h4>
                                            <p className="text-[11px] text-neutral-400 sm:text-xs">
                                                Cada c&oacute;digo Jinja puede apuntar a una columna del archivo o a un valor fijo.
                                            </p>
                                        </div>
                                        {hasTemplateFields && (
                                            <span className="self-start rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:self-auto">
                                                {templateFields.length} campos
                                            </span>
                                        )}
                                    </div>

                                    {hasTemplateFields ? (
                                        <div className="grid gap-2 lg:grid-cols-2">
                                            {templateFields.map(field => {
                                                const mapping = templateFieldMappings[field] || { sourceType: 'header', sourceValue: '' };
                                                const isReady = mapping.sourceType === 'manual'
                                                    ? String(mapping.sourceValue || '').trim().length > 0
                                                    : String(mapping.sourceValue || '').trim().length > 0;

                                                return (
                                                    <div
                                                        key={field}
                                                        className="rounded-2xl border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                                    >
                                                        <div className="mb-2 flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">Jinja</div>
                                                                <div className="mt-1 rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-emerald-200 break-all">
                                                                    {`{{ data.get('${field}', '-') }}`}
                                                                </div>
                                                            </div>
                                                            {isReady
                                                                ? <CheckCircle size={14} className="mt-1 shrink-0 text-emerald-400" />
                                                                : <AlertCircle size={14} className="mt-1 shrink-0 text-amber-300" />
                                                            }
                                                        </div>

                                                        {renderMappingEditor(mapping, patch => onTemplateFieldChange(field, patch))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-4 text-sm text-neutral-300">
                                            No se encontraron c&oacute;digos Jinja en las plantillas activas. Puedes continuar con los datos originales o crear columnas personalizadas abajo.
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-2.5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h4 className="text-sm font-semibold text-white">Columnas personalizadas</h4>
                                            <p className="text-[11px] text-neutral-400 sm:text-xs">
                                                Agrega nuevos campos para generar alias o inyectar textos fijos dentro del dataset.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onAddCustomField}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2 text-[11px] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/50 hover:bg-emerald-400/15"
                                        >
                                            <Plus size={13} />
                                            Agregar columna personalizada
                                        </button>
                                    </div>

                                    {customFieldMappings.length > 0 ? (
                                        <div className="space-y-3">
                                            {customFieldMappings.map(entry => (
                                                <div
                                                    key={entry.id}
                                                    className="rounded-2xl border border-white/10 bg-black/20 p-3"
                                                >
                                                    <div className="mb-2 flex flex-col gap-2.5 lg:flex-row lg:items-center">
                                                        <input
                                                            type="text"
                                                            value={entry.targetKey}
                                                            onChange={e => onCustomFieldChange(entry.id, { targetKey: e.target.value })}
                                                            placeholder="Nombre de la columna nueva"
                                                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => onRemoveCustomField(entry.id)}
                                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] font-medium text-red-100 transition-colors hover:border-red-300/40 hover:bg-red-400/15"
                                                        >
                                                            <Trash2 size={13} />
                                                            Quitar
                                                        </button>
                                                    </div>

                                                    {renderMappingEditor(entry, patch => onCustomFieldChange(entry.id, patch))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-4 text-sm text-neutral-400">
                                            A&uacute;n no agregaste columnas personalizadas.
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-white/10 bg-black/20 px-4 py-2.5 sm:px-5 sm:py-3">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] text-neutral-400">
                                Puedes remapear el archivo cuando cambies de plantilla.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/10"
                                >
                                    {closeLabel || 'Cerrar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onApply}
                                    disabled={isLoading}
                                    className="rounded-xl border border-emerald-400/30 bg-emerald-400/15 px-4 py-2 text-[11px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Aplicar mapeo
                                </button>
                            </div>
                        </div>
                    </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes de preview
// ─────────────────────────────────────────────────────────────────────────────

/** Preview inline del encabezado principal */
function MainHeaderPreview({ title, subtitle, logoLeft, logoRight }) {
    return (
        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2 mb-3 bg-white px-3 py-2 rounded-t">
            <div className="w-16 h-10 flex items-center justify-start">
                {logoLeft
                    ? <img src={logoLeft} className="max-h-10 max-w-[64px] object-contain" alt="logo-left" />
                    : <div className="w-12 h-8 bg-neutral-100 rounded border border-dashed border-neutral-300 flex items-center justify-center">
                        <ImageIcon size={12} className="text-neutral-300" />
                    </div>
                }
            </div>
            <div className="flex-1 text-center px-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-800 leading-tight">
                    {title || 'INFORME TÉCNICO'}
                </div>
                {subtitle && (
                    <div className="text-[9px] text-neutral-500 mt-0.5">{subtitle}</div>
                )}
            </div>
            <div className="w-16 h-10 flex items-center justify-end">
                {logoRight
                    ? <img src={logoRight} className="max-h-10 max-w-[64px] object-contain" alt="logo-right" />
                    : <div className="w-12 h-8 bg-neutral-100 rounded border border-dashed border-neutral-300 flex items-center justify-center">
                        <ImageIcon size={12} className="text-neutral-300" />
                    </div>
                }
            </div>
        </div>
    );
}

/** Preview inline del mini-encabezado alternativo */
function AltHeaderPreview({ altHeaderConfig, rowData, heightClass }) {
    const { idField, dateField, extraText, height } = altHeaderConfig;

    const idValue = idField && rowData ? String(rowData[idField] ?? '') : (idField ? `[${idField}]` : '');
    const dateValue = dateField && rowData ? String(rowData[dateField] ?? '') : (dateField ? `[${dateField}]` : '');

    const paddingMap = { 'very-compact': 'py-0.5 px-2', compact: 'py-1 px-2.5', normal: 'py-1.5 px-3' };
    const fontMap = { 'very-compact': 'text-[9px]', compact: 'text-[10px]', normal: 'text-xs' };
    const padding = paddingMap[height] || 'py-1 px-2.5';
    const fontSize = fontMap[height] || 'text-[10px]';

    const parts = [];
    if (idValue) parts.push(<span key="id"><strong>ID:</strong> {idValue}</span>);
    if (dateValue) parts.push(<span key="date"><strong>Fecha:</strong> {dateValue}</span>);
    if (extraText) parts.push(<span key="extra">{extraText}</span>);

    const isEmpty = parts.length === 0;

    return (
        <div className={`border border-neutral-300 rounded bg-neutral-50 ${padding} ${fontSize} text-neutral-700 font-mono flex items-center gap-3 flex-wrap`}>
            {isEmpty
                ? <span className="text-neutral-400 italic">Mini-encabezado (configura los campos arriba)</span>
                : parts.map((p, i) => (
                    <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-neutral-300 mx-1">|</span>}
                        {p}
                    </span>
                ))
            }
        </div>
    );
}

/** 
 * Grid de imágenes para el preview 
 * Muestra las miniaturas reales si están cargadas.
 */
function ImageGridPreview({ images, imagesPerPage }) {
    if (!images || images.length === 0) {
        return (
            <div className="mt-2 border border-dashed border-neutral-200 rounded p-4 text-center">
                <ImageIcon size={16} className="text-neutral-300 mx-auto mb-1" />
                <p className="text-[10px] text-neutral-400">Sin imágenes encontradas</p>
                <p className="text-[9px] text-neutral-300">Asegúrate de que el ID coincida con el nombre de los archivos</p>
            </div>
        );
    }

    const cols = getGridCols(imagesPerPage);
    const displayImages = images.slice(0, imagesPerPage);

    return (
        <div
            className="mt-2 grid gap-1 p-1 bg-neutral-50 rounded border border-neutral-200"
            style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
            }}
        >
            {displayImages.map((img, i) => (
                <div key={i} className="relative aspect-[4/3] bg-white rounded overflow-hidden border border-neutral-200 shadow-sm">
                    <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 bg-black/50 text-[6px] text-white px-0.5 rounded-tl font-mono">
                        {i + 1}
                    </div>
                </div>
            ))}
            {/* Espacios vacíos si faltan fotos para completar la grilla visual */}
            {Array.from({ length: Math.max(0, imagesPerPage - displayImages.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-[4/3] bg-neutral-100 rounded border border-dashed border-neutral-200 flex items-center justify-center">
                    <ImageIcon size={8} className="text-neutral-300" />
                </div>
            ))}
        </div>
    );
}

function VolanteoTemplatePreview({ rowData, images, logoLeft, logoRight }) {
    const photos = Array.isArray(images) ? images.slice(0, 4) : [];
    const hasPhotos = photos.length > 0;
    const centro = getRowTextValue(rowData, 'CENTRO');
    const nis = getRowTextValue(rowData, 'NIS');
    const sector = getRowTextValue(rowData, 'SECTOR');
    const fechaCorte = getRowTextValue(rowData, 'FECHA CORTE');
    const direcciones = getRowTextValue(rowData, 'DIRECCIONES AFECTADAS');
    const distrito = getRowTextValue(rowData, 'DISTRITO');
    const codigoComponente = getRowTextValue(rowData, 'CODIGO COMPONENTE');
    const estado = getRowTextValue(rowData, 'ESTADO');

    return (
        <div className="mt-2 border border-neutral-300 rounded-md bg-white p-3 aspect-[210/297] flex flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b-2 border-neutral-700 pb-2 mb-2 shrink-0">
                <div className="w-24 h-10 flex items-center justify-center">
                    {logoLeft
                        ? <img src={logoLeft} alt="logo-left" className="max-h-10 max-w-full object-contain" />
                        : <div className="w-16 h-8 border border-dashed border-neutral-300 rounded" />
                    }
                </div>
                <div className="text-center px-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-neutral-900">Panel Fotográfico Volanteo</h3>
                </div>
                <div className="w-24 h-10 flex items-center justify-center">
                    {logoRight
                        ? <img src={logoRight} alt="logo-right" className="max-h-10 max-w-full object-contain" />
                        : <div className="w-16 h-8 border border-dashed border-neutral-300 rounded" />
                    }
                </div>
            </header>

            <div className="grid grid-cols-4 border border-neutral-300 divide-x divide-neutral-300 text-[8px] shrink-0">
                <div className="px-1.5 py-1">
                    <div className="font-bold uppercase text-neutral-500">Centro de Servicios</div>
                    <div className="font-semibold text-neutral-900 truncate">{centro}</div>
                </div>
                <div className="px-1.5 py-1">
                    <div className="font-bold uppercase text-neutral-500">NIS</div>
                    <div className="font-semibold text-neutral-900 truncate">{nis}</div>
                </div>
                <div className="px-1.5 py-1">
                    <div className="font-bold uppercase text-neutral-500">Sector</div>
                    <div className="font-semibold text-neutral-900 truncate">{sector}</div>
                </div>
                <div className="px-1.5 py-1">
                    <div className="font-bold uppercase text-neutral-500">Fecha de Corte</div>
                    <div className="font-semibold text-neutral-900 truncate">{fechaCorte}</div>
                </div>
            </div>

            <section className="mt-2 shrink-0">
                <div className="text-[9px] font-bold uppercase text-blue-700 border-b border-blue-700 pb-1 mb-1">1.0 Localización</div>
                <div className="text-[8px] text-neutral-800">
                    <div className="mb-1 truncate"><span className="font-bold uppercase">Direcciones Afectadas:</span> {direcciones}</div>
                    <div className="flex gap-3 flex-wrap">
                        <div><span className="font-bold uppercase">Distrito:</span> {distrito}</div>
                        <div><span className="font-bold uppercase">Código de Componente:</span> {codigoComponente}</div>
                        <div><span className="font-bold uppercase">Estado:</span> {estado}</div>
                    </div>
                </div>
            </section>

            <section className="mt-2 flex-1 min-h-0 flex flex-col">
                <div className="text-[9px] font-bold uppercase text-blue-700 border-b border-blue-700 pb-1 mb-1 shrink-0">2.0 Panel Fotográfico</div>
                {hasPhotos ? (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 border border-blue-700 p-1 flex-1 min-h-0">
                        {photos.map((img, idx) => (
                            <div key={`${img.name}-${idx}`} className="border border-neutral-300 bg-neutral-100 overflow-hidden min-h-0">
                                <img src={img.url} alt={img.name} className="w-full h-full object-contain" />
                            </div>
                        ))}
                        {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, idx) => (
                            <div key={`placeholder-${idx}`} className="border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 text-[8px] italic flex items-center justify-center">
                                Sin imagen
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="border border-blue-700 text-neutral-400 text-[9px] italic flex-1 min-h-0 flex items-center justify-center text-center px-2">
                        No se encontraron imágenes asociadas a este registro.
                    </div>
                )}
            </section>
        </div>
    );
}

const A4_WIDTH_PX = 794;   // 210mm @ 96 dpi
const A4_HEIGHT_PX = 1123; // 297mm @ 96 dpi

/** Scales a full A4 iframe to fit a thumbnail container using ResizeObserver. */
function LocalTemplateIframePreview({ renderedHtml }) {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(0.38);

    useEffect(() => {
        if (!containerRef.current) return;
        const updateScale = () => {
            const w = containerRef.current?.offsetWidth || 300;
            setScale(w / A4_WIDTH_PX);
        };
        updateScale();
        const ro = new ResizeObserver(updateScale);
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const scaledHeight = A4_HEIGHT_PX * scale;

    return (
        <div
            ref={containerRef}
            className="mt-2 rounded overflow-hidden border border-neutral-200"
            style={{ width: '100%', height: scaledHeight }}
        >
            <iframe
                srcDoc={renderedHtml}
                sandbox="allow-same-origin"
                title="Local Template Preview"
                style={{
                    width: A4_WIDTH_PX,
                    height: A4_HEIGHT_PX,
                    border: 'none',
                    display: 'block',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            />
        </div>
    );
}

/** Tarjeta de preview de una hoja individual */
function SheetPreviewCard({ sheet, index, total, headerTitle, headerSubtitle, logoLeft, logoRight, altHeaderConfig, rowData, allImages, idColumn, localTemplateNames, fetchLocalTemplateHtml }) {
    const hasTemplate = Boolean(sheet.templateName);

    // Obtener imágenes para esta fila si hay datos
    const rowImages = useMemo(() => {
        if (!rowData || !allImages || allImages.length === 0) return [];
        const recordId = idColumn ? rowData[idColumn] : (rowData.ID_UNICO || rowData.id || rowData.ID);
        if (!recordId) return [];
        const filtered = allImages.filter(img => matchesRecordId(img.name, recordId));
        if (sheet.pageNum && sheet.totalPages) {
            const p = sheet.pageNum - 1;
            const size = sheet.imagesPerPage || 4;
            return filtered.slice(p * size, (p + 1) * size);
        }
        return filtered;
    }, [rowData, allImages, idColumn, sheet.pageNum, sheet.totalPages, sheet.imagesPerPage]);
    const isLocalTemplate = sheet.templateName != null && localTemplateNames.has(sheet.templateName);
    const [localRenderedHtml, setLocalRenderedHtml] = useState(null);

    useEffect(() => {
        if (!isLocalTemplate || !sheet.templateName) {
            setLocalRenderedHtml(null);
            return;
        }
        let cancelled = false;
        fetchLocalTemplateHtml(sheet.templateName)
            .then(rawHtml => {
                if (!cancelled) {
                    const rendered = renderLocalTemplate(
                        rawHtml, rowData, logoLeft, logoRight, rowImages
                    );
                    setLocalRenderedHtml(rendered);
                }
            })
            .catch(err => console.error('[MultiSheet] Preview fetch error:', err));
        return () => { cancelled = true; };
    }, [isLocalTemplate, sheet.templateName, rowData, logoLeft, logoRight, rowImages, fetchLocalTemplateHtml]);

    const isGridTemplate = sheet.templateName === GRID_TEMPLATE_NAME;
    const isVolanteoTemplate = sheet.templateName === VOLANTEO_TEMPLATE_NAME;
    const showStandardHeaderPreview = !isVolanteoTemplate;
    const pageIndicator = sheet.totalPages && sheet.totalPages > 1
        ? ` (Pág ${sheet.pageNum}/${sheet.totalPages})`
        : '';

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden border border-neutral-200">
            {/* Badge hoja */}
            <div className="flex items-center justify-between bg-neutral-800 px-3 py-1.5">
                <div className="flex items-center gap-2">
                    <span className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                        {index + 1}
                    </span>
                    <span className="text-white text-xs font-medium truncate max-w-[200px]">
                        {sheet.title || 'Sin título'}{pageIndicator}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {sheet.firstPageOnly && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-200 border border-amber-400/40 px-1.5 py-0.5 rounded font-mono">
                            1° HOJA
                        </span>
                    )}
                    {sheet.useAltHeader
                        ? <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono">MINI-HEADER</span>
                        : <span className="text-[9px] bg-neutral-700 text-neutral-300 border border-neutral-600 px-1.5 py-0.5 rounded font-mono">HEADER PRINCIPAL</span>
                    }
                    {hasTemplate
                        ? <CheckCircle size={12} className="text-emerald-400" />
                        : <AlertCircle size={12} className="text-neutral-500" />
                    }
                </div>
            </div>

            {/* Contenido preview */}
            <div className="p-3">
                {/* Encabezado preview */}
                {showStandardHeaderPreview && (
                    sheet.useAltHeader
                        ? <AltHeaderPreview altHeaderConfig={altHeaderConfig} rowData={rowData} />
                        : <MainHeaderPreview title={headerTitle} subtitle={headerSubtitle} logoLeft={logoLeft} logoRight={logoRight} />
                )}

                {/* Área de plantilla */}
                {hasTemplate ? (
                    <div className={`${showStandardHeaderPreview ? 'mt-2 ' : ''}space-y-2`}>
                        {/* Mostrar tarjeta de info solo si NO es plantilla local NI grilla de imágenes */}
                        {!isLocalTemplate && !isGridTemplate && (
                            <div className="border border-emerald-200 rounded bg-emerald-50 px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText size={14} className="text-emerald-600 shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-mono text-emerald-700 font-semibold truncate">{sheet.templateName}</div>
                                        <div className="text-[9px] text-emerald-600 mt-0.5">Plantilla asignada</div>
                                    </div>
                                </div>
                                {isVolanteoTemplate && (
                                    <div className="bg-white/50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                        <Grid2X2 size={10} className="text-emerald-600" />
                                        <span className="text-[9px] font-bold text-emerald-700 underline underline-offset-2">4 fotos</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview específico de Grilla */}
                        {isGridTemplate && (
                            <ImageGridPreview images={rowImages} imagesPerPage={sheet.imagesPerPage || 4} />
                        )}
                        {isVolanteoTemplate && (
                            <VolanteoTemplatePreview
                                rowData={rowData}
                                images={rowImages}
                                logoLeft={logoLeft}
                                logoRight={logoRight}
                            />
                        )}
                        {isLocalTemplate && localRenderedHtml && (
                            <LocalTemplateIframePreview renderedHtml={localRenderedHtml} />
                        )}
                    </div>
                ) : (
                    <div className="mt-2 border border-dashed border-neutral-200 rounded px-3 py-4 text-center">
                        <Eye size={16} className="text-neutral-300 mx-auto mb-1" />
                        <p className="text-[10px] text-neutral-400">Sin plantilla asignada</p>
                        <p className="text-[9px] text-neutral-300 mt-0.5">Asígnala en el Step 1</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function MultiSheetReportApp() {
    // ── Encabezado principal ──────────────────────────────────────────────────
    const [headerTitle, setHeaderTitle] = useState('INFORME TÉCNICO');
    const [headerSubtitle, setHeaderSubtitle] = useState('');
    const [logoLeft, setLogoLeft] = useState(null);        // data URL (base64)
    const [logoRight, setLogoRight] = useState(null);
    const [logoLeftFile, setLogoLeftFile] = useState(null); // File object
    const [logoRightFile, setLogoRightFile] = useState(null);

    // ── Drag & Drop — logos ───────────────────────────────────────────────────
    const [isDraggingLogoLeft, setIsDraggingLogoLeft] = useState(false);
    const [isDraggingLogoRight, setIsDraggingLogoRight] = useState(false);

    // ── Hojas del informe ─────────────────────────────────────────────────────
    /**
     * @typedef {Object} SheetConfig
     * @property {string}      id           - ID único (Date.now())
     * @property {string}      title        - Título visible de la hoja
     * @property {string|null} templateName - Nombre de la plantilla asignada
     * @property {boolean}     useAltHeader - true → usar mini-encabezado
     * @property {boolean}     firstPageOnly - true → se usa solo como 1° hoja
     */
    const [sheets, setSheets] = useState([]);

    // ── Datos globales (Excel/CSV) ────────────────────────────────────────────
    const [data, setData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [idColumn, setIdColumn] = useState('');
    const [isDraggingData, setIsDraggingData] = useState(false);
    const [sourceData, setSourceData] = useState([]);
    const [sourceHeaders, setSourceHeaders] = useState([]);
    const [loadedDataFileName, setLoadedDataFileName] = useState('');
    const [isColumnMappingOpen, setIsColumnMappingOpen] = useState(false);
    const [isColumnMappingLoading, setIsColumnMappingLoading] = useState(false);
    const [columnMappingError, setColumnMappingError] = useState('');
    const [mappingTemplateNames, setMappingTemplateNames] = useState([]);
    const [mappingTemplateFields, setMappingTemplateFields] = useState([]);
    const [templateFieldMappings, setTemplateFieldMappings] = useState({});
    const [customFieldMappings, setCustomFieldMappings] = useState([]);
    const [hasPendingDataCommit, setHasPendingDataCommit] = useState(false);

    // ── Mini-encabezado alternativo ───────────────────────────────────────────
    const [altHeaderConfig, setAltHeaderConfig] = useState({
        idField: '',
        dateField: '',
        extraText: '',
        height: 'compact',
    });

    // ── Imágenes ──────────────────────────────────────────────────────────────
    const [images, setImages] = useState([]);
    const [isDraggingImages, setIsDraggingImages] = useState(false);

    // ── Plantillas disponibles (del backend) ──────────────────────────────────
    const [availableTemplates, setAvailableTemplates] = useState([]);
    const [templateSections, setTemplateSections] = useState([]);
    const [localTemplateNames, setLocalTemplateNames] = useState(new Set());
    const localTemplateHtmlCache = useRef({});

    // ── Selección y exportación ───────────────────────────────────────────────
    const [selectedIndex, setSelectedIndex] = useState('');
    const [exportScope, setExportScope] = useState('single');
    const [searchOrder, setSearchOrder] = useState('');

    // ── Loading ───────────────────────────────────────────────────────────────
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [pdfLoadingMessage, setPdfLoadingMessage] = useState('');
    const sseProgress = useSSEProgress();

    // ─────────────────────────────────────────────────────────────────────────
    // Carga de plantillas disponibles
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`${API_BASE}/templates`);
                if (!res.ok) throw new Error('Error al obtener plantillas');
                const json = await res.json();
                console.log('[MultiSheet] Templates response:', json);
                const templates = Array.isArray(json.templates)
                    ? Array.from(new Set(json.templates.map(t => String(t || '').trim()).filter(Boolean)))
                    : [];
                const sections = normalizeTemplateSections(json.sections);
                console.log('[MultiSheet] Normalized sections:', sections);
                const sectionTemplates = sections.flatMap(section => section.templates);
                const finalTemplates = templates.length > 0
                    ? templates
                    : Array.from(new Set(sectionTemplates));

                if (!cancelled) {
                    setAvailableTemplates(finalTemplates);
                    setTemplateSections(sections);
                    const localSection = sections.find(s => s.id === 'local');
                    if (localSection) {
                        setLocalTemplateNames(new Set(localSection.templates));
                    }
                }
            } catch (err) {
                console.error('[MultiSheet] Error cargando plantillas:', err);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const fetchTemplateMappingFields = useCallback(async (templateNames) => {
        const uniqueTemplateNames = dedupeStrings(templateNames);
        if (uniqueTemplateNames.length === 0) {
            return { templateFields: [], errors: [] };
        }

        const responses = await Promise.all(uniqueTemplateNames.map(async (templateName) => {
            if (templateName === GRID_TEMPLATE_NAME) {
                return { templateName, fields: [], error: '' };
            }

            try {
                const encoded = encodeURIComponent(templateName);
                const res = await fetch(`${API_BASE}/templates/${encoded}/mapping-fields`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const fields = Array.isArray(json.fields)
                    ? dedupeStrings(json.fields)
                    : [];
                return { templateName, fields, error: '' };
            } catch (err) {
                console.error(`[MultiSheet] Error cargando campos de mapeo para "${templateName}":`, err);
                const fallbackFields = templateName === VOLANTEO_TEMPLATE_NAME
                    ? [...VOLANTEO_TEMPLATE_FIELDS]
                    : [];
                return {
                    templateName,
                    fields: fallbackFields,
                    error: fallbackFields.length > 0 ? '' : templateName,
                };
            }
        }));

        return {
            templateFields: dedupeStrings(responses.flatMap(item => item.fields)),
            errors: responses
                .map(item => item.error)
                .filter(Boolean),
        };
    }, []);

    const commitLoadedData = useCallback((nextHeaders, nextRows, successMessage) => {
        const normalizedHeaders = dedupeStrings(nextHeaders);
        const normalizedRows = Array.isArray(nextRows) ? nextRows : [];

        setHeaders(normalizedHeaders);
        setData(normalizedRows);
        setSelectedIndex('');
        setExportScope('single');
        setSearchOrder('');
        setIdColumn(prev => normalizedHeaders.includes(prev) ? prev : '');
        setAltHeaderConfig(prev => ({
            ...prev,
            idField: normalizedHeaders.includes(prev.idField) ? prev.idField : '',
            dateField: normalizedHeaders.includes(prev.dateField) ? prev.dateField : '',
        }));
        setHasPendingDataCommit(false);
        setIsColumnMappingOpen(false);
        toast.success(successMessage || `${normalizedRows.length} registros cargados`);
    }, []);

    const openColumnMappingModal = useCallback(async (
        nextSourceHeaders,
        nextSourceData,
        options = {},
    ) => {
        const {
            fileName = loadedDataFileName,
            preserveExisting = false,
            preserveCustom = false,
        } = options;

        const safeHeaders = dedupeStrings(nextSourceHeaders);
        const safeRows = Array.isArray(nextSourceData) ? nextSourceData : [];
        const activeTemplateNames = dedupeStrings(
            sheets
                .map(sheet => sheet?.templateName)
                .filter(Boolean)
        );

        setSourceHeaders(safeHeaders);
        setSourceData(safeRows);
        setLoadedDataFileName(fileName || '');
        setMappingTemplateNames(activeTemplateNames);
        setHasPendingDataCommit(!preserveExisting);
        setIsColumnMappingOpen(true);
        setIsColumnMappingLoading(true);
        setColumnMappingError('');

        try {
            const { templateFields, errors } = await fetchTemplateMappingFields(activeTemplateNames);

            setMappingTemplateFields(templateFields);
            setTemplateFieldMappings(prev => buildTemplateFieldMappings(
                templateFields,
                safeHeaders,
                preserveExisting ? prev : {},
            ));
            setCustomFieldMappings(prev => preserveCustom ? prev : []);

            if (activeTemplateNames.length === 0) {
                setColumnMappingError('No hay plantillas activas en el Step 1. Puedes usar los datos originales o crear columnas personalizadas.');
            } else if (errors.length > 0) {
                setColumnMappingError(`No se pudo leer el mapeo de: ${errors.join(', ')}. Puedes completar el resto manualmente.`);
            }
        } catch (err) {
            console.error('[MultiSheet] Error preparando modal de mapeo:', err);
            setMappingTemplateFields([]);
            setTemplateFieldMappings({});
            if (!preserveCustom) {
                setCustomFieldMappings([]);
            }
            setColumnMappingError('No se pudo preparar el mapeo automatico. Puedes continuar con los datos originales.');
        } finally {
            setIsColumnMappingLoading(false);
        }
    }, [fetchTemplateMappingFields, loadedDataFileName, sheets]);

    const applyColumnMapping = useCallback(() => {
        const { headers: mappedHeaders, rows: mappedRows } = buildMappedDataset(
            sourceHeaders,
            sourceData,
            templateFieldMappings,
            customFieldMappings,
        );
        commitLoadedData(mappedHeaders, mappedRows, `${mappedRows.length} registros cargados con mapeo`);
    }, [sourceHeaders, sourceData, templateFieldMappings, customFieldMappings, commitLoadedData]);

    const useOriginalLoadedData = useCallback(() => {
        commitLoadedData(sourceHeaders, sourceData, `${sourceData.length} registros cargados`);
    }, [sourceHeaders, sourceData, commitLoadedData]);

    const handleCloseColumnMappingModal = useCallback(() => {
        if (hasPendingDataCommit) {
            useOriginalLoadedData();
            return;
        }
        setIsColumnMappingOpen(false);
    }, [hasPendingDataCommit, useOriginalLoadedData]);

    const updateTemplateFieldMapping = useCallback((field, patch) => {
        setTemplateFieldMappings(prev => ({
            ...prev,
            [field]: {
                sourceType: 'header',
                sourceValue: '',
                ...(prev[field] || {}),
                ...patch,
            },
        }));
    }, []);

    const addCustomFieldMapping = useCallback(() => {
        setCustomFieldMappings(prev => [...prev, createCustomMappingEntry()]);
    }, []);

    const updateCustomFieldMapping = useCallback((id, patch) => {
        setCustomFieldMappings(prev => prev.map(entry => (
            entry.id === id
                ? {
                    ...entry,
                    ...patch,
                    sourceType: (patch.sourceType || entry.sourceType || 'header') === 'manual' ? 'manual' : 'header',
                }
                : entry
        )));
    }, []);

    const removeCustomFieldMapping = useCallback((id) => {
        setCustomFieldMappings(prev => prev.filter(entry => entry.id !== id));
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers: logos
    // ─────────────────────────────────────────────────────────────────────────
    const handleLogoFile = useCallback((file, side) => {
        if (!file || !file.type.startsWith('image/')) return;
        if (side === 'left') setLogoLeftFile(file);
        else setLogoRightFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            if (side === 'left') setLogoLeft(e.target.result);
            else setLogoRight(e.target.result);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleLogoInput = useCallback((e, side) => {
        const file = e.target.files?.[0];
        if (file) handleLogoFile(file, side);
    }, [handleLogoFile]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers: Excel/CSV
    // ─────────────────────────────────────────────────────────────────────────
    const processExcelFile = useCallback(async (file) => {
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

            if (!Array.isArray(jsonData) || jsonData.length === 0) {
                toast.error('El archivo no contiene datos legibles.');
                return;
            }

            const parsedHeaders = (jsonData[0] || []).map((header, index) => {
                const label = String(header ?? '').trim();
                return label || `Columna ${index + 1}`;
            });

            const parsedRows = jsonData
                .slice(1)
                .filter(row => Array.isArray(row) && row.some(value => (
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ''
                )))
                .map(row => {
                    const nextRow = {};
                    parsedHeaders.forEach((header, index) => {
                        let value = row[index];
                        if (isDateColumn(header) && typeof value === 'number' && value > 1000 && value < 100000) {
                            value = excelSerialToDate(value);
                        }
                        nextRow[header] = value;
                    });
                    return nextRow;
                });

            await openColumnMappingModal(parsedHeaders, parsedRows, {
                fileName: file.name,
                preserveExisting: false,
                preserveCustom: false,
            });
        } catch (err) {
            console.error('[MultiSheet] Error procesando archivo de datos:', err);
            toast.error('No se pudo leer el archivo seleccionado.');
        }
    }, [openColumnMappingModal]);

    const handleDataDrop = useCallback((e) => {
        e.preventDefault();
        setIsDraggingData(false);
        const [file] = Array.from(e.dataTransfer.files || []);
        if (!file) return;
        const name = file.name.toLowerCase();
        if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) return;
        processExcelFile(file);
    }, [processExcelFile]);

    const handleDataInput = useCallback((e) => {
        const file = e.target.files?.[0];
        if (file) processExcelFile(file);
    }, [processExcelFile]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers: imágenes
    // ─────────────────────────────────────────────────────────────────────────
    const handleImageFiles = useCallback((fileList) => {
        const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (imgs.length === 0) return;
        setImages(prev => {
            const existingNames = new Set(prev.map(obj => obj.name));
            const newImgs = imgs
                .filter(f => !existingNames.has(f.name))
                .map(f => ({ name: f.name, url: URL.createObjectURL(f), file: f }));
            return [...prev, ...newImgs];
        });
    }, []);

    const handleImageInput = useCallback((e) => {
        if (e.target.files) handleImageFiles(e.target.files);
    }, [handleImageFiles]);

    const handleImageDrop = useCallback((e) => {
        e.preventDefault();
        setIsDraggingImages(false);
        handleImageFiles(e.dataTransfer.files);
    }, [handleImageFiles]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers: gestión de hojas
    // ─────────────────────────────────────────────────────────────────────────
    const addSheet = useCallback((templateName) => {
        // Use provided template or default to Grilla de Imágenes
        const defaultTemplate = templateName || (availableTemplates.includes(GRID_TEMPLATE_NAME)
            ? GRID_TEMPLATE_NAME
            : (availableTemplates[0] ?? null));
        setSheets(prev => [...prev, {
            id: String(Date.now()),
            title: `Hoja ${prev.length + 1}`,
            templateName: defaultTemplate,
            useAltHeader: false,
            firstPageOnly: false,
            imagesPerPage: 4,
            // For Grilla de Imágenes: store selected image indices from global pool
            selectedImageIndices: defaultTemplate === GRID_TEMPLATE_NAME ? [] : undefined,
        }]);
    }, [availableTemplates]);

    const removeSheet = useCallback((id) => {
        setSheets(prev => {
            const sheet = prev.find(s => s.id === id);
            if (sheet?.templateName) {
                if (!window.confirm(`¿Eliminar la hoja "${sheet.title}" (tiene plantilla asignada)?`)) {
                    return prev;
                }
            }
            return prev.filter(s => s.id !== id);
        });
    }, []);

    const updateSheet = useCallback((id, patch) => {
        setSheets(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    }, []);

    const toggleFirstPageSheet = useCallback((id) => {
        setSheets(prev => {
            const target = prev.find(sheet => sheet.id === id);
            const nextValue = !target?.firstPageOnly;

            return prev.map(sheet => {
                if (sheet.id === id) {
                    return { ...sheet, firstPageOnly: nextValue };
                }
                if (nextValue && sheet.firstPageOnly) {
                    return { ...sheet, firstPageOnly: false };
                }
                return sheet;
            });
        });
    }, []);

    const moveSheet = useCallback((index, direction) => {
        setSheets(prev => {
            const next = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= next.length) return prev;
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Imágenes filtradas por registro
    // ─────────────────────────────────────────────────────────────────────────
    const getImagesForRow = useCallback((row) => {
        if (!row || !idColumn) return [];
        const recordId = String(row[idColumn]);
        const filtered = images.filter(img => matchesRecordId(img.name, recordId));
        const seen = new Set();
        return filtered.filter(img => {
            if (seen.has(img.name)) return false;
            seen.add(img.name);
            return true;
        });
    }, [images, idColumn]);

    const fetchLocalTemplateHtml = useCallback(async (templateName) => {
        if (localTemplateHtmlCache.current[templateName]) {
            return localTemplateHtmlCache.current[templateName];
        }
        const encoded = encodeURIComponent(templateName);
        const res = await fetch(`${API_BASE}/templates/${encoded}/html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        localTemplateHtmlCache.current[templateName] = html;
        return html;
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Construir FormData para el backend
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @backend-contract
     * Contrato esperado del endpoint POST /api/multi-sheet/generate-pdf:
     *
     * FormData fields:
     *   sheets_config   (str/JSON)  → SheetEntry[]
     *     SheetEntry: { order, title, templateName, useAltHeader, rowData, imageFilenames, imagesPerPage }
     *     - rowData: objeto plano con los datos del Excel/CSV para este registro.
     *     - imageFilenames: nombres de archivos de imágenes incluidas en 'files'.
     *
     *   header_config   (str/JSON)  → { title, subtitle, logoLeft?, logoRight? }
     *     - logoLeft / logoRight: data URI base64 o null.
     *     - Si el logo se adjunta como archivo, se envía null aquí para no
     *       inflar el tamaño del campo multipart.
     *
     *   alt_header_config (str/JSON) → { idField, dateField, extraText, height }
     *     - height: "very-compact" | "compact" | "normal"
     *
     *   files           (File[])    → imágenes adjuntas (campo 'files')
     *   logoLeftFile    (File)      → logo izquierdo como archivo (opcional)
     *   logoRightFile   (File)      → logo derecho como archivo (opcional)
     *
     * Respuesta: application/pdf (streaming)
     *
     * Modo "Todos":
     *   sheetsConfig contiene N×M entradas (N registros × M hojas configuradas),
     *   en orden continuo. El backend las concatena en un único PDF.
     */
    const buildFormData = useCallback((rowIndices) => {
        const formData = new FormData();

        const activeSheets = orderSheetsForFirstPage(
            sheets.map((s, sheetIdx) => ({ ...s, _sheetIdx: sheetIdx }))
        );
        const firstPageSheet = activeSheets.find(sheet => sheet.firstPageOnly);
        const regularSheets = activeSheets.filter(sheet => !sheet.firstPageOnly);

        let globalOrder = 0;
        const sheetsConfig = [];
        const allImages = new Set();

        const resolveSheetImages = (sheet, rowImages) => {
            const hasManualSelection = sheet.selectedImageIndices && sheet.selectedImageIndices.length > 0;
            if (hasManualSelection) {
                return sheet.selectedImageIndices.map(idx => images[idx]).filter(Boolean);
            }
            if (sheet.templateName === VOLANTEO_TEMPLATE_NAME) {
                return rowImages.slice(0, 4);
            }
            return rowImages;
        };

        const pushSheetConfigEntries = ({
            sheet,
            rowData,
            rowImages,
            forceSinglePage = false,
        }) => {
            const photosPerPage = sheet.imagesPerPage || 4;
            const sheetImages = resolveSheetImages(sheet, rowImages);

            sheetImages.forEach(img => allImages.add(img));

            if (forceSinglePage) {
                const singlePageImages = sheet.templateName === GRID_TEMPLATE_NAME
                    ? sheetImages.slice(0, photosPerPage)
                    : sheetImages;

                sheetsConfig.push({
                    order: globalOrder++,
                    title: sheet.title,
                    templateName: sheet.templateName,
                    useAltHeader: sheet.useAltHeader,
                    imagesPerPage: photosPerPage,
                    rowData,
                    imageFilenames: singlePageImages.map(img => img.name),
                    pageNum: 1,
                    totalPages: 1,
                });
                return;
            }

            if (sheetImages.length === 0) {
                sheetsConfig.push({
                    order: globalOrder++,
                    title: sheet.title,
                    templateName: sheet.templateName,
                    useAltHeader: sheet.useAltHeader,
                    imagesPerPage: photosPerPage,
                    rowData,
                    imageFilenames: [],
                    pageNum: 1,
                    totalPages: 1,
                });
                return;
            }

            if (sheet.templateName === GRID_TEMPLATE_NAME && sheetImages.length > photosPerPage) {
                const totalPages = Math.ceil(sheetImages.length / photosPerPage);
                for (let p = 0; p < totalPages; p++) {
                    const chunk = sheetImages.slice(p * photosPerPage, (p + 1) * photosPerPage);
                    sheetsConfig.push({
                        order: globalOrder++,
                        title: sheet.title,
                        templateName: sheet.templateName,
                        useAltHeader: sheet.useAltHeader,
                        imagesPerPage: photosPerPage,
                        rowData,
                        imageFilenames: chunk.map(img => img.name),
                        pageNum: p + 1,
                        totalPages,
                    });
                }
                return;
            }

            sheetsConfig.push({
                order: globalOrder++,
                title: sheet.title,
                templateName: sheet.templateName,
                useAltHeader: sheet.useAltHeader,
                imagesPerPage: photosPerPage,
                rowData,
                imageFilenames: sheetImages.map(img => img.name),
                pageNum: 1,
                totalPages: 1,
            });
        };

        if (firstPageSheet && rowIndices.length > 0) {
            const firstRow = data[rowIndices[0]];
            if (firstRow) {
                const firstRowData = { ...firstRow };
                const firstRowImages = getImagesForRow(firstRow);
                pushSheetConfigEntries({
                    sheet: firstPageSheet,
                    rowData: firstRowData,
                    rowImages: firstRowImages,
                    forceSinglePage: true,
                });
            }
        }

        rowIndices.forEach(rowIdx => {
            const row = data[rowIdx];
            if (!row) return;
            const rowData = { ...row };  // pasar toda la fila sin transformación

            const rowImages = getImagesForRow(row);
            regularSheets.forEach(sheet => {
                pushSheetConfigEntries({
                    sheet,
                    rowData,
                    rowImages,
                });
            });
        });

        formData.append('sheets_config', JSON.stringify(sheetsConfig));
        formData.append('header_config', JSON.stringify({
            title: headerTitle,
            subtitle: headerSubtitle,
            logoLeft: logoLeftFile ? null : (logoLeft || null),
            logoRight: logoRightFile ? null : (logoRight || null),
        }));
        formData.append('alt_header_config', JSON.stringify(altHeaderConfig));

        allImages.forEach(img => formData.append('files', img.file));
        if (logoLeftFile) formData.append('logoLeftFile', logoLeftFile);
        if (logoRightFile) formData.append('logoRightFile', logoRightFile);

        return { formData, count: sheetsConfig.length };
    }, [sheets, data, getImagesForRow, images, headerTitle, headerSubtitle, logoLeft, logoRight, altHeaderConfig, logoLeftFile, logoRightFile]);

    // ─────────────────────────────────────────────────────────────────────────
    // Exportar PDF
    // ─────────────────────────────────────────────────────────────────────────
    const hasActiveSheets = sheets.length > 0;
    const canExport = hasActiveSheets &&
        (exportScope === 'all' ? data.length > 0 : selectedIndex !== '');

    const handleDownloadPdf = useCallback(async () => {
        if (!canExport) return;

        const rowIndices = exportScope === 'all'
            ? data.map((_, i) => i)
            : [Number(selectedIndex)];

        const { formData, count } = buildFormData(rowIndices);
        const msgBase = exportScope === 'all'
            ? `Generando informe (${data.length} registros × ${sheets.length} hojas)...`
            : 'Generando informe PDF...';

        try {
            setIsPdfLoading(true);
            setPdfLoadingMessage(msgBase);

            const res = await fetch(`${API_BASE}/generate-pdf`, { method: 'POST', body: formData });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`El servidor devolvió ${res.status}: ${errText}`);
            }

            const blob = await res.blob();
            const recId = exportScope === 'single' && data[selectedIndex] && idColumn
                ? data[selectedIndex][idColumn]
                : new Date().toISOString().split('T')[0];
            downloadBlob(blob, `Informe_Multi_Hoja_${recId}.pdf`);
            toast.success('PDF generado correctamente');
        } catch (err) {
            console.error('[MultiSheet] Error generando PDF:', err);
            let msg = 'Error al generar PDF: ';
            if (err.message.includes('Failed to fetch')) {
                msg += 'No se puede conectar con el servidor.';
            } else {
                msg += err.message;
            }
            toast.error(msg);
        } finally {
            setIsPdfLoading(false);
        }
    }, [canExport, exportScope, data, selectedIndex, idColumn, sheets, buildFormData]);

    // ─────────────────────────────────────────────────────────────────────────
    // Datos del registro seleccionado (para previews)
    // ─────────────────────────────────────────────────────────────────────────
    const selectedRow = selectedIndex !== '' ? data[Number(selectedIndex)] : null;
    const anyAltHeader = sheets.some(s => s.useAltHeader);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <DashboardLayout>
            <div className="flex h-full w-full bg-neutral-900 overflow-hidden font-sans text-sm">

                {/* ── Sidebar ───────────────────────────────────────────────── */}
                <aside className="w-96 bg-neutral-950 text-white flex flex-col border-r border-neutral-800">
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">

                        {/* Step 0 — Logos y Encabezado Principal */}
                        <Step number="0" title="Logos y Encabezado" icon={<Settings size={16} />}>
                            <div className="space-y-3">
                                {/* Logos */}
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Logo Izquierdo */}
                                    <div>
                                        <label className="block text-xs text-neutral-400 mb-1">Logo Izq</label>
                                        <div
                                            onDragOver={e => { e.preventDefault(); setIsDraggingLogoLeft(true); }}
                                            onDragEnter={e => { e.preventDefault(); setIsDraggingLogoLeft(true); }}
                                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingLogoLeft(false); }}
                                            onDrop={e => {
                                                e.preventDefault();
                                                setIsDraggingLogoLeft(false);
                                                const file = e.dataTransfer.files?.[0];
                                                if (file?.type.startsWith('image/')) handleLogoFile(file, 'left');
                                            }}
                                            onClick={() => document.getElementById('msr-logo-left').click()}
                                            className={`border border-dashed h-16 rounded flex items-center justify-center cursor-pointer
                                                overflow-hidden transition-colors
                                                ${isDraggingLogoLeft ? 'border-violet-500 bg-violet-500/10' : 'border-neutral-700 hover:bg-neutral-800'}`}
                                        >
                                            {logoLeft
                                                ? <img src={logoLeft} className="h-full object-contain p-1" alt="logo-izq" />
                                                : <div className="text-center">
                                                    <div className={`text-xs ${isDraggingLogoLeft ? 'text-violet-300' : 'text-neutral-500'}`}>
                                                        {isDraggingLogoLeft ? 'Soltar aquí' : 'Subir Logo'}
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                        <input id="msr-logo-left" type="file" hidden accept="image/*" onChange={e => handleLogoInput(e, 'left')} />
                                        {logoLeft && (
                                            <button onClick={() => { setLogoLeft(null); setLogoLeftFile(null); }}
                                                className="mt-1 text-[10px] text-red-400 hover:text-red-300 w-full text-center">
                                                Quitar
                                            </button>
                                        )}
                                    </div>

                                    {/* Logo Derecho */}
                                    <div>
                                        <label className="block text-xs text-neutral-400 mb-1">Logo Der</label>
                                        <div
                                            onDragOver={e => { e.preventDefault(); setIsDraggingLogoRight(true); }}
                                            onDragEnter={e => { e.preventDefault(); setIsDraggingLogoRight(true); }}
                                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingLogoRight(false); }}
                                            onDrop={e => {
                                                e.preventDefault();
                                                setIsDraggingLogoRight(false);
                                                const file = e.dataTransfer.files?.[0];
                                                if (file?.type.startsWith('image/')) handleLogoFile(file, 'right');
                                            }}
                                            onClick={() => document.getElementById('msr-logo-right').click()}
                                            className={`border border-dashed h-16 rounded flex items-center justify-center cursor-pointer
                                                overflow-hidden transition-colors
                                                ${isDraggingLogoRight ? 'border-violet-500 bg-violet-500/10' : 'border-neutral-700 hover:bg-neutral-800'}`}
                                        >
                                            {logoRight
                                                ? <img src={logoRight} className="h-full object-contain p-1" alt="logo-der" />
                                                : <div className="text-center">
                                                    <div className={`text-xs ${isDraggingLogoRight ? 'text-violet-300' : 'text-neutral-500'}`}>
                                                        {isDraggingLogoRight ? 'Soltar aquí' : 'Subir Logo'}
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                        <input id="msr-logo-right" type="file" hidden accept="image/*" onChange={e => handleLogoInput(e, 'right')} />
                                        {logoRight && (
                                            <button onClick={() => { setLogoRight(null); setLogoRightFile(null); }}
                                                className="mt-1 text-[10px] text-red-400 hover:text-red-300 w-full text-center">
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Título y Subtítulo */}
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Título del informe</label>
                                    <input
                                        type="text"
                                        value={headerTitle}
                                        onChange={e => setHeaderTitle(e.target.value)}
                                        placeholder="INFORME TÉCNICO"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-white outline-none placeholder:text-neutral-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Subtítulo (opcional)</label>
                                    <input
                                        type="text"
                                        value={headerSubtitle}
                                        onChange={e => setHeaderSubtitle(e.target.value)}
                                        placeholder="Empresa · Año"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-white outline-none placeholder:text-neutral-600"
                                    />
                                </div>
                            </div>
                        </Step>

                        {/* Step 1 — Hojas del Informe */}
                        <Step number="1" title="Hojas del Informe" icon={<Layers size={16} />}>
                            <div className="space-y-2">
                                {/* Lista de hojas */}
                                {sheets.map((sheet, index) => (
                                    <div key={sheet.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-2 space-y-2">
                                        {/* Fila superior: número, título, toggle, controles */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-neutral-600 text-[10px] font-mono w-4 shrink-0">{index + 1}</span>
                                            <input
                                                type="text"
                                                value={sheet.title}
                                                onChange={e => updateSheet(sheet.id, { title: e.target.value })}
                                                className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-white outline-none"
                                                placeholder="Título de hoja"
                                            />
                                            {/* Toggle mini-header */}
                                            <button
                                                onClick={() => updateSheet(sheet.id, { useAltHeader: !sheet.useAltHeader })}
                                                title={sheet.useAltHeader ? 'Usar encabezado principal' : 'Usar mini-encabezado'}
                                                className={`shrink-0 transition-colors ${sheet.useAltHeader ? 'text-blue-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                                            >
                                                {sheet.useAltHeader ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                            </button>
                                            {/* Marcar como primera hoja */}
                                            <button
                                                onClick={() => toggleFirstPageSheet(sheet.id)}
                                                title={sheet.firstPageOnly ? 'Quitar como 1° hoja' : 'Usar como 1° hoja'}
                                                className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-bold transition-colors
                                                    ${sheet.firstPageOnly
                                                        ? 'border-amber-400/60 text-amber-300 bg-amber-500/10'
                                                        : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-500'}`}
                                            >
                                                1°
                                            </button>
                                            {/* Mover arriba */}
                                            <button
                                                onClick={() => moveSheet(index, -1)}
                                                disabled={index === 0}
                                                className="shrink-0 text-neutral-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ArrowUp size={13} />
                                            </button>
                                            {/* Mover abajo */}
                                            <button
                                                onClick={() => moveSheet(index, 1)}
                                                disabled={index === sheets.length - 1}
                                                className="shrink-0 text-neutral-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ArrowDown size={13} />
                                            </button>
                                            {/* Eliminar */}
                                            <button
                                                onClick={() => removeSheet(sheet.id)}
                                                className="shrink-0 text-red-500/60 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>

                                        {/* Selector de plantilla: solo Grilla de Imágenes + plantillas locales (.mtemplates/) */}
                                        <select
                                            className={`w-full bg-neutral-800 border rounded px-2 py-1 text-xs text-white outline-none transition-colors
                                                ${sheet.templateName ? 'border-emerald-600' : 'border-neutral-700'}`}
                                            value={sheet.templateName || ''}
                                            onChange={e => updateSheet(sheet.id, { templateName: e.target.value || null })}
                                        >
                                            <option value="">-- Asignar Plantilla --</option>
                                            {/* Grilla de Imágenes siempre disponible */}
                                            <optgroup label="Plantillas base">
                                                <option value={GRID_TEMPLATE_NAME}>{GRID_TEMPLATE_NAME}</option>
                                            </optgroup>
                                            {/* Plantillas locales (.html en multi_sheet_templates/) */}
                                            {(() => {
                                                const localSection = templateSections.find(s => s.id === 'local');
                                                if (!localSection || localSection.templates.length === 0) return null;
                                                return (
                                                    <optgroup label="Plantillas locales">
                                                        {localSection.templates.map(t => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </optgroup>
                                                );
                                            })()}
                                        </select>

                                        {/* Selector de tamaño de grilla (solo si es "Grilla de Imágenes") */}
                                        {sheet.templateName === GRID_TEMPLATE_NAME && (
                                            <>
                                                <div className="mt-1.5 flex flex-wrap gap-1 p-1.5 bg-neutral-900/50 rounded border border-neutral-700">
                                                    <div className="w-full text-[9px] text-neutral-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                                        <Grid2X2 size={10} /> Fotos por página
                                                    </div>
                                                    {[2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                                        <button
                                                            key={num}
                                                            onClick={() => updateSheet(sheet.id, { imagesPerPage: num })}
                                                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all
                                                                ${(sheet.imagesPerPage || 4) === num
                                                                    ? 'bg-white text-black scale-110 shadow-lg'
                                                                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                                                        >
                                                            {num}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Selector de imágenes para la grilla */}
                                                {images.length > 0 && (
                                                    <div className="mt-1.5 p-1.5 bg-neutral-900/50 rounded border border-neutral-700 max-h-32 overflow-y-auto">
                                                        <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 sticky top-0 bg-neutral-900/80">
                                                            <ImageIcon size={10} /> Seleccionar imágenes ({sheet.selectedImageIndices?.length || 0}/{sheet.imagesPerPage || 4})
                                                        </div>
                                                        <div className="grid grid-cols-4 gap-1">
                                                            {images.slice(0, 20).map((img, idx) => {
                                                                const isSelected = sheet.selectedImageIndices?.includes(idx);
                                                                const isDisabled = !isSelected && (sheet.selectedImageIndices?.length || 0) >= (sheet.imagesPerPage || 4);
                                                                return (
                                                                    <button
                                                                        key={idx}
                                                                        disabled={isDisabled && !isSelected}
                                                                        onClick={() => {
                                                                            const current = sheet.selectedImageIndices || [];
                                                                            let updated;
                                                                            if (isSelected) {
                                                                                updated = current.filter(i => i !== idx);
                                                                            } else if (current.length < (sheet.imagesPerPage || 4)) {
                                                                                updated = [...current, idx];
                                                                            } else {
                                                                                return;
                                                                            }
                                                                            updateSheet(sheet.id, { selectedImageIndices: updated });
                                                                        }}
                                                                        className={`relative aspect-square rounded overflow-hidden border text-[8px] transition-all
                                                                            ${isSelected
                                                                                ? 'border-emerald-500 ring-1 ring-emerald-500/50'
                                                                                : 'border-neutral-600 hover:border-neutral-400'}
                                                                            ${isDisabled && !isSelected ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                    >
                                                                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                                                        {isSelected && (
                                                                            <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                                                                                <CheckCircle size={12} className="text-white" />
                                                                            </div>
                                                                        )}
                                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-0.5 truncate text-[6px]">
                                                                            {idx + 1}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {images.length > 20 && (
                                                            <div className="text-[8px] text-neutral-500 text-center mt-1">
                                                                +{images.length - 20} más
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => updateSheet(sheet.id, { selectedImageIndices: [] })}
                                                            className="mt-1 text-[8px] text-neutral-500 hover:text-neutral-300 underline w-full text-center"
                                                        >
                                                            Limpiar selección
                                                        </button>
                                                    </div>
                                                )}
                                                {images.length === 0 && (
                                                    <div className="mt-1.5 p-2 text-[9px] text-neutral-500 text-center border border-dashed border-neutral-700 rounded">
                                                        Sube imágenes en el paso 2 para seleccionarlas
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Badge de estado */}
                                        <div className="flex items-center gap-2">
                                            {sheet.templateName
                                                ? <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono">
                                                    <CheckCircle size={9} /> Lista
                                                </span>
                                                : <span className="flex items-center gap-1 text-[9px] text-neutral-500 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 font-mono">
                                                    Sin plantilla
                                                </span>
                                            }
                                            {sheet.useAltHeader && (
                                                <span className="text-[9px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 font-mono">
                                                    Mini-header
                                                </span>
                                            )}
                                            {sheet.firstPageOnly && (
                                                <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded px-1.5 py-0.5 font-mono">
                                                    1° hoja
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Selector de plantilla para agregar nueva hoja */}
                                <div className="mb-2">
                                    <select
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-2 text-xs text-white outline-none focus:border-white"
                                        value=""
                                        onChange={e => {
                                            if (e.target.value) {
                                                addSheet(e.target.value);
                                            }
                                        }}
                                    >
                                        <option value="">+ Agregar Hoja (selecciona plantilla)</option>
                                        <optgroup label="Plantillas base">
                                            <option value={GRID_TEMPLATE_NAME}>{GRID_TEMPLATE_NAME}</option>
                                        </optgroup>
                                        {(() => {
                                            const localSection = templateSections.find(s => s.id === 'local');
                                            if (!localSection || localSection.templates.length === 0) return null;
                                            return (
                                                <optgroup label="Plantillas locales">
                                                    {localSection.templates.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </optgroup>
                                            );
                                        })()}
                                    </select>
                                </div>
                            </div>
                        </Step>

                        {/* Step 2 — Datos Globales */}
                        <Step number="2" title="Cargar Datos" icon={<FileSpreadsheet size={16} />}>
                            <div className="space-y-2">
                                {/* Zona drag & drop Excel */}
                                <label className="block w-full cursor-pointer group">
                                    <div
                                        onDragOver={e => { e.preventDefault(); setIsDraggingData(true); }}
                                        onDragEnter={e => { e.preventDefault(); setIsDraggingData(true); }}
                                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingData(false); }}
                                        onDrop={handleDataDrop}
                                        className={`border border-dashed rounded-lg p-3 text-center transition-colors
                                            ${isDraggingData ? 'border-violet-500 bg-neutral-800' : 'border-neutral-700 hover:bg-neutral-900'}`}
                                    >
                                        <div className={`text-xs transition-colors ${isDraggingData ? 'text-white' : 'text-neutral-400 group-hover:text-white'}`}>
                                            {isDraggingData ? 'Soltar aquí' : data.length > 0
                                                ? `${data.length} registros cargados`
                                                : 'Seleccionar Excel / CSV'}
                                        </div>
                                    </div>
                                    <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={handleDataInput} />
                                </label>

                                {sourceData.length > 0 && (
                                    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Mapeo activo</div>
                                                <div className="mt-1 text-[11px] text-neutral-300">
                                                    {mappingTemplateFields.length} campos Jinja y {customFieldMappings.length} columnas personalizadas configuradas.
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => openColumnMappingModal(sourceHeaders, sourceData, {
                                                    fileName: loadedDataFileName,
                                                    preserveExisting: true,
                                                    preserveCustom: true,
                                                })}
                                                className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/15"
                                            >
                                                Reabrir mapeo
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Columna ID */}
                                {headers.length > 0 && (
                                    <div>
                                        <label className="block text-xs text-neutral-400 mb-1">Columna ID (para vincular fotos)</label>
                                        <select
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-white outline-none"
                                            value={idColumn}
                                            onChange={e => setIdColumn(e.target.value)}
                                        >
                                            <option value="">-- Ninguna --</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* Zona imágenes */}
                                <label className={`block w-full cursor-pointer group ${!idColumn ? 'opacity-40 pointer-events-none' : ''}`}>
                                    <div
                                        onDragOver={e => { e.preventDefault(); setIsDraggingImages(true); }}
                                        onDragEnter={e => { e.preventDefault(); setIsDraggingImages(true); }}
                                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingImages(false); }}
                                        onDrop={handleImageDrop}
                                        className={`border border-dashed rounded-lg p-2.5 text-center transition-colors
                                            ${isDraggingImages ? 'border-violet-500 bg-neutral-800' : 'border-neutral-700 hover:bg-neutral-900'}`}
                                    >
                                        <div className={`text-xs transition-colors ${isDraggingImages ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                                            {isDraggingImages ? 'Soltar aquí' : images.length > 0
                                                ? `${images.length} imágenes`
                                                : <span className="flex items-center justify-center gap-1.5"><ImageIcon size={12} /> Subir Imágenes</span>
                                            }
                                        </div>
                                    </div>
                                    <input type="file" hidden multiple accept="image/*" onChange={handleImageInput} />
                                </label>
                                {images.length > 0 && (
                                    <button onClick={() => { images.forEach(img => URL.revokeObjectURL(img.url)); setImages([]); }}
                                        className="text-[10px] text-red-400/60 hover:text-red-400 w-full text-right">
                                        Limpiar imágenes
                                    </button>
                                )}
                            </div>
                        </Step>

                        {/* Step 3 — Mini-Encabezado Alternativo */}
                        <Step number="3" title="Mini-Encabezado" icon={<FileText size={16} />}>
                            <div className={`space-y-2 ${!anyAltHeader ? 'opacity-40' : ''}`}>
                                {!anyAltHeader && (
                                    <p className="text-[10px] text-neutral-500 mb-2">
                                        Activa "Mini-header" en al menos una hoja del Step 1.
                                    </p>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-1">Campo ID visible</label>
                                        <select
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none disabled:cursor-not-allowed"
                                            value={altHeaderConfig.idField}
                                            onChange={e => setAltHeaderConfig(p => ({ ...p, idField: e.target.value }))}
                                            disabled={!anyAltHeader}
                                        >
                                            <option value="">-- Ninguno --</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-1">Campo Fecha</label>
                                        <select
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none disabled:cursor-not-allowed"
                                            value={altHeaderConfig.dateField}
                                            onChange={e => setAltHeaderConfig(p => ({ ...p, dateField: e.target.value }))}
                                            disabled={!anyAltHeader}
                                        >
                                            <option value="">-- Ninguno --</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] text-neutral-400 mb-1">Texto adicional</label>
                                    <input
                                        type="text"
                                        value={altHeaderConfig.extraText}
                                        onChange={e => setAltHeaderConfig(p => ({ ...p, extraText: e.target.value }))}
                                        disabled={!anyAltHeader}
                                        placeholder="Ej: Inspección mensual"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none placeholder:text-neutral-600 disabled:cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] text-neutral-400 mb-1">Altura</label>
                                    <select
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none disabled:cursor-not-allowed"
                                        value={altHeaderConfig.height}
                                        onChange={e => setAltHeaderConfig(p => ({ ...p, height: e.target.value }))}
                                        disabled={!anyAltHeader}
                                    >
                                        <option value="very-compact">Muy compacto</option>
                                        <option value="compact">Compacto</option>
                                        <option value="normal">Normal</option>
                                    </select>
                                </div>

                                {/* Preview inline del mini-encabezado */}
                                <div className="mt-2">
                                    <label className="block text-[10px] text-neutral-500 mb-1.5 uppercase tracking-wide">Preview</label>
                                    <AltHeaderPreview
                                        altHeaderConfig={altHeaderConfig}
                                        rowData={selectedRow}
                                        allImages={images}
                                    />
                                </div>
                            </div>
                        </Step>

                        {/* Step 4 — Seleccionar Registro y Exportar */}
                        <Step
                            number="4"
                            title="Seleccionar y Exportar"
                            disabled={!hasActiveSheets}
                        >
                            <div className="space-y-3">
                                {/* Buscador */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Buscar orden..."
                                        value={searchOrder}
                                        onChange={e => {
                                            const term = e.target.value;
                                            setSearchOrder(term);
                                            if (term) {
                                                const idx = data.findIndex((row, i) => {
                                                    const label = idColumn ? String(row[idColumn]) : `Fila ${i + 1}`;
                                                    return label.toLowerCase().includes(term.toLowerCase());
                                                });
                                                if (idx !== -1) { setSelectedIndex(String(idx)); setExportScope('single'); }
                                            }
                                        }}
                                        className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:border-white outline-none placeholder:text-neutral-500"
                                    />
                                </div>

                                {/* Selector de fila */}
                                <select
                                    className="w-full bg-white text-black font-bold border border-neutral-300 rounded p-2 text-xs focus:outline-none disabled:opacity-50"
                                    value={selectedIndex}
                                    onChange={e => { setSelectedIndex(e.target.value); setExportScope('single'); }}
                                    disabled={data.length === 0 || exportScope === 'all'}
                                >
                                    <option value="">-- Seleccionar Fila --</option>
                                    {data.map((row, idx) => (
                                        <option key={idx} value={idx}>
                                            {idx + 1}. {idColumn ? row[idColumn] : `Fila ${idx + 1}`}
                                        </option>
                                    ))}
                                </select>

                                {/* Scope */}
                                <div className="flex gap-2">
                                    <button
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${exportScope === 'single' ? 'bg-black text-white border border-white' : 'bg-neutral-800 text-neutral-400'}`}
                                        onClick={() => setExportScope('single')}
                                    >
                                        Solo Actual
                                    </button>
                                    <button
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${exportScope === 'all' ? 'bg-black text-white border border-white' : 'bg-neutral-800 text-neutral-400'}`}
                                        onClick={() => setExportScope('all')}
                                        disabled={data.length === 0}
                                    >
                                        Todo ({data.length})
                                    </button>
                                </div>

                                {/* Resumen */}
                                <div className="bg-neutral-900 border border-neutral-800 rounded p-2 text-[10px] font-mono text-neutral-500 space-y-0.5">
                                    <div>Hojas activas: <span className="text-white">{sheets.length}</span></div>
                                    <div>Imágenes: <span className="text-white">{images.length}</span></div>
                                    {exportScope === 'all' && (
                                        <div>PDFs a generar: <span className="text-amber-400">{data.length} × {sheets.length} hojas</span></div>
                                    )}
                                </div>

                                {/* Botón descargar */}
                                <button
                                    onClick={handleDownloadPdf}
                                    disabled={!canExport || isPdfLoading}
                                    className="w-full flex items-center justify-center gap-2 bg-black hover:bg-neutral-900 border border-neutral-700 text-white font-bold p-3 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg text-sm"
                                >
                                    <Printer size={16} />
                                    {isPdfLoading ? 'Generando...' : 'Descargar PDF'}
                                </button>

                                {!hasActiveSheets && (
                                    <p className="text-[10px] text-amber-400/70 text-center">
                                        Agrega hojas en el Step 1 para exportar
                                    </p>
                                )}
                            </div>
                        </Step>

                    </div>
                </aside>

                {/* ── Panel de Preview ──────────────────────────────────────── */}
                <main className="flex-1 overflow-y-auto bg-neutral-800 p-6">
                    {sheets.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <BookOpen size={48} className="text-neutral-700 mb-4" />
                            <h2 className="text-neutral-500 font-mono text-sm uppercase tracking-widest mb-2">
                                Sin hojas configuradas
                            </h2>
                            <p className="text-neutral-600 text-xs max-w-xs">
                                Agrega hojas en el Step 1 para comenzar a componer tu informe multi-sección.
                            </p>
                        </div>
                    ) : (
                        <div className="w-[210mm] mx-auto space-y-4">
                            {/* Cabecera del preview */}
                            <div className="flex items-center gap-2 mb-2">
                                <Layers size={16} className="text-neutral-400" />
                                <span className="text-neutral-400 text-xs font-mono uppercase tracking-widest">
                                    Vista previa — {sheets.length} {sheets.length === 1 ? 'hoja' : 'hojas'}
                                </span>
                                {selectedRow && idColumn && (
                                    <span className="ml-auto text-xs bg-white/10 text-white px-2 py-0.5 rounded font-mono">
                                        Registro: {selectedRow[idColumn]}
                                    </span>
                                )}
                            </div>

                            {/* Tarjetas de hojas */}
                            {(() => {
                                const previewCards = [];
                                let globalIdx = 0;
                                const orderedPreviewSheets = orderSheetsForFirstPage(sheets);

                                orderedPreviewSheets.forEach((sheet) => {
                                    const recordId = idColumn ? selectedRow?.[idColumn] : null;
                                    const rowImages = (recordId && images)
                                        ? images.filter(img => matchesRecordId(img.name, String(recordId)))
                                        : [];

                                    const photosPerPage = sheet.imagesPerPage || 4;
                                    const isGrid = sheet.templateName === GRID_TEMPLATE_NAME;
                                    const shouldPaginateGrid = isGrid && !sheet.firstPageOnly;

                                    if (shouldPaginateGrid && rowImages.length > photosPerPage) {
                                        const totalPages = Math.ceil(rowImages.length / photosPerPage);
                                        for (let p = 0; p < totalPages; p++) {
                                            previewCards.push(
                                                <div key={`${sheet.id}-p${p}`}>
                                                    <SheetPreviewCard
                                                        sheet={{ ...sheet, pageNum: p + 1, totalPages }}
                                                        index={globalIdx++}
                                                        total={999} // se recalcula después o se omite
                                                        headerTitle={headerTitle}
                                                        headerSubtitle={headerSubtitle}
                                                        logoLeft={logoLeft}
                                                        logoRight={logoRight}
                                                        altHeaderConfig={altHeaderConfig}
                                                        rowData={selectedRow}
                                                        allImages={images}
                                                        idColumn={idColumn}
                                                        localTemplateNames={localTemplateNames}
                                                        fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                    />
                                                    <div className="flex items-center gap-2 my-2">
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                        <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE PÁGINA</span>
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    </div>
                                                </div>
                                            );
                                        }
                                    } else {
                                        previewCards.push(
                                            <div key={sheet.id}>
                                                <SheetPreviewCard
                                                    sheet={sheet}
                                                    index={globalIdx++}
                                                    total={999}
                                                    headerTitle={headerTitle}
                                                    headerSubtitle={headerSubtitle}
                                                    logoLeft={logoLeft}
                                                    logoRight={logoRight}
                                                    altHeaderConfig={altHeaderConfig}
                                                    rowData={selectedRow}
                                                    allImages={images}
                                                    idColumn={idColumn}
                                                    localTemplateNames={localTemplateNames}
                                                    fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                />
                                                <div className="flex items-center gap-2 my-2">
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE SECCIÓN</span>
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                </div>
                                            </div>
                                        );
                                    }
                                });
                                return previewCards;
                            })()}

                            {/* Info de exportación */}
                            <div className="mt-4 bg-neutral-900/60 border border-neutral-700 rounded-lg p-3 text-[10px] font-mono text-neutral-500">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <CheckCircle size={10} className="text-emerald-400" />
                                    <span className="text-neutral-400">Hojas configuradas: {sheets.length}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ImageIcon size={10} className="text-blue-400" />
                                    <span className="text-neutral-400">Imágenes cargadas: {images.length}</span>
                                    {selectedRow && idColumn && (
                                        <span className="text-neutral-500 ml-1">
                                            ({getImagesForRow(selectedRow).length} para este registro)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </main>

            </div>

            <ColumnMappingModal
                isOpen={isColumnMappingOpen}
                isLoading={isColumnMappingLoading}
                sourceHeaders={sourceHeaders}
                fileName={loadedDataFileName}
                templateNames={mappingTemplateNames}
                templateFields={mappingTemplateFields}
                templateFieldMappings={templateFieldMappings}
                customFieldMappings={customFieldMappings}
                errorMessage={columnMappingError}
                onTemplateFieldChange={updateTemplateFieldMapping}
                onAddCustomField={addCustomFieldMapping}
                onCustomFieldChange={updateCustomFieldMapping}
                onRemoveCustomField={removeCustomFieldMapping}
                closeLabel={hasPendingDataCommit ? 'Usar datos originales' : 'Cerrar'}
                onClose={handleCloseColumnMappingModal}
                onApply={applyColumnMapping}
            />

            {/* Loading modal */}
            {isPdfLoading && (
                <LoadingModal message={pdfLoadingMessage || 'Generando informe PDF...'} accentColor="#10b981" />
            )}
        </DashboardLayout>
    );
}
