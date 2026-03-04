/**
 * MultiSheetReportApp.jsx
 * Herramienta "Informe Multi-Hoja" — genera un PDF con N secciones bajo un
 * encabezado principal único y mini-encabezados opcionales por hoja.
 *
 * Cómo añadir una nueva hoja al informe (runtime):
 *   Pulsar "+ Agregar Hoja" en el Step 1 y asignarle una plantilla desde el
 *   dropdown. La hoja aparece automáticamente en el preview y se incluye en el
 *   PDF al exportar.
 *
 * Cómo extender el mini-encabezado alternativo:
 *   Añadir campos al objeto altHeaderConfig y referenciarlos en el backend
 *   (routers/multi_sheet_report.py → _build_alt_header_html).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
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
        /\{%\s*for\s+img\s+in\s+images\[:\d+\]\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
        (_, loopContent) =>
            images.slice(0, 4).map((img, i) => {
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
    const getImagesForRow = () => {
        if (!rowData || !allImages || allImages.length === 0) return [];
        const recordId = idColumn ? rowData[idColumn] : (rowData.ID_UNICO || rowData.id || rowData.ID);
        if (!recordId) return [];

        const filtered = allImages.filter(img => matchesRecordId(img.name, recordId));

        // Aplicar paginación si viene de la vista dividida
        if (sheet.pageNum && sheet.totalPages) {
            const p = sheet.pageNum - 1;
            const size = sheet.imagesPerPage || 4;
            return filtered.slice(p * size, (p + 1) * size);
        }
        return filtered;
    };

    const rowImages = getImagesForRow();
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
                        <div className="border border-emerald-200 rounded bg-emerald-50 px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText size={14} className="text-emerald-600 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[10px] font-mono text-emerald-700 font-semibold truncate">{sheet.templateName}</div>
                                    <div className="text-[9px] text-emerald-600 mt-0.5">Plantilla asignada</div>
                                </div>
                            </div>
                            {isGridTemplate && (
                                <div className="bg-white/50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                    <Grid2X2 size={10} className="text-emerald-600" />
                                    <span className="text-[9px] font-bold text-emerald-700 underline underline-offset-2">{sheet.imagesPerPage || 4} fotos</span>
                                </div>
                            )}
                            {isVolanteoTemplate && (
                                <div className="bg-white/50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                    <Grid2X2 size={10} className="text-emerald-600" />
                                    <span className="text-[9px] font-bold text-emerald-700 underline underline-offset-2">4 fotos</span>
                                </div>
                            )}
                            {isLocalTemplate && (
                                <div className="bg-white/50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                    <FileText size={10} className="text-emerald-600" />
                                    <span className="text-[9px] font-bold text-emerald-700">Plantilla local</span>
                                </div>
                            )}
                        </div>

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
     */
    const [sheets, setSheets] = useState([]);

    // ── Datos globales (Excel/CSV) ────────────────────────────────────────────
    const [data, setData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [idColumn, setIdColumn] = useState('');
    const [isDraggingData, setIsDraggingData] = useState(false);

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
                const templates = Array.isArray(json.templates)
                    ? Array.from(new Set(json.templates.map(t => String(t || '').trim()).filter(Boolean)))
                    : [];
                const sections = normalizeTemplateSections(json.sections);
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
    const processExcelFile = useCallback((file) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary', cellDates: false, cellNF: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

            if (jsonData.length > 0) {
                const _headers = jsonData[0];
                const _data = jsonData.slice(1).map(row => {
                    const obj = {};
                    _headers.forEach((h, i) => {
                        let val = row[i];
                        if (isDateColumn(h) && typeof val === 'number' && val > 1000 && val < 100000) {
                            val = excelSerialToDate(val);
                        }
                        obj[h] = val;
                    });
                    return obj;
                });
                setHeaders(_headers);
                setData(_data);
                toast.success(`${_data.length} registros cargados`);
            }
        };
        reader.readAsBinaryString(file);
    }, []);

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
    const addSheet = useCallback(() => {
        // Auto-assign the first available layout so the sheet is immediately
        // active and Step 4 is unlocked without an extra manual selection.
        const defaultTemplate = availableTemplates.includes(GRID_TEMPLATE_NAME)
            ? GRID_TEMPLATE_NAME
            : (availableTemplates[0] ?? null);
        setSheets(prev => [...prev, {
            id: String(Date.now()),
            title: `Hoja ${prev.length + 1}`,
            templateName: defaultTemplate,
            useAltHeader: false,
            imagesPerPage: 4,
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

        const activeSheets = sheets
            .map((s, sheetIdx) => ({ ...s, _sheetIdx: sheetIdx }));

        let globalOrder = 0;
        const sheetsConfig = [];
        const allImages = new Set();

        rowIndices.forEach(rowIdx => {
            const row = data[rowIdx];
            if (!row) return;
            const rowData = { ...row };  // pasar toda la fila sin transformación

            const rowImages = getImagesForRow(row);
            rowImages.forEach(img => allImages.add(img));
            const imageFilenames = rowImages.map(img => img.name);

            activeSheets.forEach(s => {
                const photosPerPage = s.imagesPerPage || 4;
                const sheetImages = s.templateName === VOLANTEO_TEMPLATE_NAME
                    ? rowImages.slice(0, 4)
                    : rowImages;

                // Si es plantilla de grilla, dividimos por páginas si hay muchas fotos
                if (s.templateName === GRID_TEMPLATE_NAME && sheetImages.length > photosPerPage) {
                    const totalPages = Math.ceil(sheetImages.length / photosPerPage);
                    for (let p = 0; p < totalPages; p++) {
                        const chunk = sheetImages.slice(p * photosPerPage, (p + 1) * photosPerPage);
                        sheetsConfig.push({
                            order: globalOrder++,
                            title: s.title,
                            templateName: s.templateName,
                            useAltHeader: s.useAltHeader,
                            imagesPerPage: photosPerPage,
                            rowData,
                            imageFilenames: chunk.map(img => img.name),
                            pageNum: p + 1,
                            totalPages: totalPages
                        });
                    }
                } else {
                    // Una sola página para plantillas que no son grilla o si el total cabe en una
                    sheetsConfig.push({
                        order: globalOrder++,
                        title: s.title,
                        templateName: s.templateName,
                        useAltHeader: s.useAltHeader,
                        imagesPerPage: photosPerPage,
                        rowData,
                        imageFilenames: sheetImages.map(img => img.name),
                        pageNum: 1,
                        totalPages: 1
                    });
                }
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

        return { formData, count: rowIndices.length * activeSheets.length };
    }, [sheets, data, getImagesForRow, headerTitle, headerSubtitle, logoLeft, logoRight, altHeaderConfig, logoLeftFile, logoRightFile]);

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
                                {sheets.length === 0 && (
                                    <div className="text-center text-neutral-600 text-xs py-3 border border-dashed border-neutral-800 rounded">
                                        Sin hojas — pulsa "+ Agregar Hoja"
                                    </div>
                                )}

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

                                        {/* Selector de plantilla */}
                                        <select
                                            className={`w-full bg-neutral-800 border rounded px-2 py-1 text-xs text-white outline-none transition-colors
                                                ${sheet.templateName ? 'border-emerald-600' : 'border-neutral-700'}`}
                                            value={sheet.templateName || ''}
                                            onChange={e => updateSheet(sheet.id, { templateName: e.target.value || null })}
                                        >
                                            <option value="">-- Asignar Plantilla --</option>
                                            {templateSections.length > 0
                                                ? templateSections.map(section => (
                                                    <optgroup key={section.id} label={section.label}>
                                                        {section.templates.map(t => (
                                                            <option key={`${section.id}-${t}`} value={t}>{t}</option>
                                                        ))}
                                                    </optgroup>
                                                ))
                                                : availableTemplates.map(t => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))
                                            }
                                        </select>

                                        {/* Selector de tamaño de grilla (solo si es "Grilla de Imágenes") */}
                                        {sheet.templateName === GRID_TEMPLATE_NAME && (
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
                                        </div>
                                    </div>
                                ))}

                                {/* Botón agregar hoja */}
                                <button
                                    onClick={addSheet}
                                    className="w-full mt-1 border border-dashed border-white/40 hover:border-white text-white/60 hover:text-white rounded p-2 text-center hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-xs"
                                >
                                    <Plus size={14} /> Agregar Hoja
                                </button>
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

                                sheets.forEach((sheet) => {
                                    const recordId = idColumn ? selectedRow?.[idColumn] : null;
                                    const rowImages = (recordId && images)
                                        ? images.filter(img => matchesRecordId(img.name, String(recordId)))
                                        : [];

                                    const photosPerPage = sheet.imagesPerPage || 4;
                                    const isGrid = sheet.templateName === GRID_TEMPLATE_NAME;

                                    if (isGrid && rowImages.length > photosPerPage) {
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

            {/* Loading modal */}
            {isPdfLoading && (
                <LoadingModal message={pdfLoadingMessage || 'Generando informe PDF...'} accentColor="#10b981" />
            )}
        </DashboardLayout>
    );
}
