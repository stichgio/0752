import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    FileSpreadsheet,
    Image as ImageIcon,
    Printer,
    Settings,
    CheckCircle,
    AlertCircle,
    RotateCcw,
    Search,
    X,
    ChevronDown,
    ChevronUp,
    Download,
    FileCode,
    Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { downloadBlob } from '@/utils/downloadBlob';
import {
    normalizeEditorTemplate,
    normalizeTemplateStatus,
    selectEditorTemplatesForDropdown,
} from '@/utils/editorTemplateSelector';
import { excelSerialToDate, formatDateValue, isDateColumn } from '@/utils';
import { templateEditorApi } from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/* ── Report fields & mappings (mirrored from App.jsx constants) ─── */
const REPORT_FIELDS = [
    { id: 'centro', label: 'CENTRO' },
    { id: 'nis', label: 'NIS' },
    { id: 'ot', label: 'OT' },
];

const DATE_FIELDS: string[] = [];

const TEMPLATE_KEY_MAP: Record<string, string> = {
    centro: 'CENTRO',
    nis: 'NIS',
    ot: 'Nro OT',
};

/* ── Custom Step component ────────────────────────────────────── */
function Step({
    number,
    title,
    icon,
    children,
    disabled = false,
    defaultOpen = true,
}: {
    number: string;
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    disabled?: boolean;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`border-b border-[#111] ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-3 w-full text-left py-3 px-4 hover:bg-[#0a0a0a] transition-colors group"
            >
                <span className="w-5 h-5 flex items-center justify-center border border-[#333] group-hover:border-white text-[10px] font-mono font-bold text-[#666] group-hover:text-white transition-all flex-shrink-0">
                    {number}
                </span>
                {icon && <span className="text-[#555] group-hover:text-white transition-colors">{icon}</span>}
                <span className="text-[11px] font-mono font-medium tracking-wider uppercase text-[#888] group-hover:text-white flex-1 transition-colors">
                    {title}
                </span>
                {open
                    ? <ChevronUp size={10} className="text-[#333]" />
                    : <ChevronDown size={10} className="text-[#333]" />
                }
            </button>
            {open && (
                <div className="px-4 pb-4 pt-2 space-y-3 bg-[#050505]">
                    {children}
                </div>
            )}
        </div>
    );
}

/* ── Loading modal ─────────────────────────────────────────────── */
function LoadingModal({ message }: { message: string }) {
    return (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center">
            <div className="border border-[#1a1a1a] bg-black p-8 flex flex-col items-center gap-4 min-w-[200px]">
                <div className="w-8 h-8 border border-[#333] border-t-white rounded-full animate-spin" />
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#666]">{message}</p>
            </div>
        </div>
    );
}

/* ── Preview Panel for custom template rendering ───────────────── */
function TemplatePreview({
    renderedHtml,
    panelRef,
}: {
    renderedHtml: string;
    panelRef: React.RefObject<HTMLIFrameElement>;
}) {
    if (!renderedHtml) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border border-[#ccc] flex items-center justify-center mx-auto">
                        <div className="w-5 h-px bg-[#ccc]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#999]">
                            Sin Plantilla
                        </p>
                        <p className="text-[10px] font-mono text-[#bbb] max-w-[200px]">
                            Selecciona una plantilla publicada para ver la estructura
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <iframe
            ref={panelRef}
            srcDoc={renderedHtml}
            sandbox="allow-same-origin"
            title="Template Preview"
            className="bg-white text-black shadow-2xl mx-auto"
            onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement;
                try {
                    const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iDoc?.body) {
                        setTimeout(() => {
                            const h = iDoc.documentElement.scrollHeight || iDoc.body.scrollHeight;
                            iframe.style.height = Math.max(h, 1122) + 'px';
                        }, 150);
                    }
                } catch { }
            }}
            style={{
                width: '210mm',
                minHeight: '297mm',
                border: 'none',
                display: 'block',
            }}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ReportGenerator – Independent PDF generator for Template Editor
   ═══════════════════════════════════════════════════════════════════ */

function extractCompiledTemplate(record: any): { content: string; templateJson: any } {
    if (!record || !Array.isArray(record.versions) || record.versions.length === 0) {
        return { content: '', templateJson: null };
    }
    const versions = record.versions;
    const currentVersion = Number(record.currentVersion);
    const current = versions.find((v: any) => Number(v?.version) === currentVersion) || versions[versions.length - 1];
    const content = typeof current?.compiledJinja === 'string' ? current.compiledJinja : '';
    return { content, templateJson: current?.templateJson ?? null };
}

interface ReportGeneratorProps {
    isVisible: boolean;
    onClose: () => void;
}

export default function ReportGenerator({ isVisible, onClose }: ReportGeneratorProps) {
    const panelRef = useRef<HTMLIFrameElement>(null);

    // Data State
    const [data, setData] = useState<Record<string, any>[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [images, setImages] = useState<File[]>([]);

    // Configuration State
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const idColumn = useMemo(() => {
        if (headers.length === 0) return '';
        const autoMatch = headers.find(h =>
            /\bot\b|orden|^id/i.test(h)
        );
        return autoMatch || headers[0];
    }, [headers]);

    // Selection State
    const [selectedIndex, setSelectedIndex] = useState('');
    const [searchOrder, setSearchOrder] = useState('');

    // Custom Logos State
    const [logoLeft, setLogoLeft] = useState<string | null>(null);
    const [logoRight, setLogoRight] = useState<string | null>(null);
    const [logoLeftFile, setLogoLeftFile] = useState<File | null>(null);
    const [logoRightFile, setLogoRightFile] = useState<File | null>(null);

    // Export Mode State
    const [exportScope, setExportScope] = useState<'single' | 'all'>('single');
    const [exportFormat, setExportFormat] = useState<'consolidated' | 'individual'>('consolidated');

    // Template State — ONLY editor templates
    const [editorTemplates, setEditorTemplates] = useState<{ id: string; name: string; status: string }[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<{
        name: string;
        content: string;
        editorTemplateId: string;
        editorTemplateStatus: string;
        editorTemplateJson: any;
    } | null>(null);
    const [templateStatus, setTemplateStatus] = useState<'valid' | 'invalid' | null>(null);
    const [templateError, setTemplateError] = useState('');
    const [requiresImages, setRequiresImages] = useState(true);

    // Custom Columns State
    const [customColumns, setCustomColumns] = useState<{ id: string; name: string; mappedTo: string }[]>(() => {
        const saved = localStorage.getItem('generatorCustomColumns');
        return saved ? JSON.parse(saved) : [];
    });
    const [showColumnModal, setShowColumnModal] = useState(false);
    const [newColumnName, setNewColumnName] = useState('');
    const [newColumnMapping, setNewColumnMapping] = useState('');
    const [columnError, setColumnError] = useState('');

    // PDF Loading State
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [pdfLoadingMessage, setPdfLoadingMessage] = useState('');

    // Rendered preview
    const [renderedHtml, setRenderedHtml] = useState('');

    // Store blob URLs for cleanup
    const blobUrlsRef = useRef<string[]>([]);

    // Save custom columns
    useEffect(() => {
        localStorage.setItem('generatorCustomColumns', JSON.stringify(customColumns));
    }, [customColumns]);

    // Cleanup blob URLs on unmount
    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach((url) => {
                try {
                    URL.revokeObjectURL(url);
                } catch { }
            });
            blobUrlsRef.current = [];
        };
    }, []);

    // ── Fetch ONLY editor templates (published) ──────────────────────
    useEffect(() => {
        if (!isVisible) return;
        let cancelled = false;

        const loadTemplates = async () => {
            try {
                const [editorResult, publishedResult] = await Promise.allSettled([
                    fetch(`${API_BASE_URL}/template-editor/templates`),
                    fetch(`${API_BASE_URL}/templates/published`),
                ]);

                let dbEditorTemplates: any[] = [];
                if (editorResult.status === 'fulfilled' && editorResult.value.ok) {
                    const editorData = await editorResult.value.json();
                    dbEditorTemplates = Array.isArray(editorData.templates)
                        ? editorData.templates
                            .map((item: any) => normalizeEditorTemplate(item, item?.status || 'draft'))
                            .filter((item: any) => item.id && item.name)
                        : [];
                }

                let publishedEditorTemplates: any[] = [];
                if (publishedResult.status === 'fulfilled' && publishedResult.value.ok) {
                    const publishedData = await publishedResult.value.json();
                    publishedEditorTemplates = Array.isArray(publishedData.templates)
                        ? publishedData.templates
                            .map((item: any) => normalizeEditorTemplate(item, item?.status || 'published'))
                            .filter((item: any) => item.id && item.name)
                        : [];
                }

                const visibleEditorTemplates = selectEditorTemplatesForDropdown(
                    publishedEditorTemplates.length > 0 ? publishedEditorTemplates : dbEditorTemplates,
                    []
                );

                if (!cancelled) {
                    setEditorTemplates(visibleEditorTemplates);
                }
            } catch (err) {
                console.error('Error fetching editor templates:', err);
            }
        };

        loadTemplates();
        return () => { cancelled = true; };
    }, [isVisible]);

    // ── Select an editor template ──────────────────────────────────
    const handleEditorTemplateSelect = useCallback(async (editorTemplateId: string) => {
        if (!editorTemplateId) return;

        try {
            let content = '';
            let templateJson: any = null;
            let resolvedName = '';
            let resolvedStatus = '';
            let lastError: Error | null = null;

            try {
                const payload = await templateEditorApi.getRenderedPublishedTemplate(editorTemplateId);
                const payloadPreview = (payload as { previewHtml?: string }).previewHtml;
                resolvedName = typeof payload?.name === 'string' ? payload.name : '';
                resolvedStatus = typeof payload?.status === 'string' ? payload.status : '';
                if (typeof payload?.content === 'string') {
                    content = payload.content;
                } else if (typeof payloadPreview === 'string') {
                    content = payloadPreview;
                }
                if (payload?.templateJson) templateJson = payload.templateJson;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error('Failed to load published template');
            }

            if (!content) {
                try {
                    const rawTemplate = await templateEditorApi.getTemplateRaw(editorTemplateId) as any;
                    if (rawTemplate?.name) resolvedName = resolvedName || String(rawTemplate.name);
                    if (rawTemplate?.status) resolvedStatus = resolvedStatus || String(rawTemplate.status);
                    const fallback = extractCompiledTemplate(rawTemplate);
                    if (fallback.content) content = fallback.content;
                    if (!templateJson && fallback.templateJson) templateJson = fallback.templateJson;
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error('Failed to load template metadata');
                }
            }

            if (!content) {
                setTemplateStatus('invalid');
                if (lastError) {
                    setTemplateError('Error al cargar plantilla: ' + lastError.message);
                } else {
                    setTemplateError('La plantilla publicada no tiene HTML renderizado.');
                }
                return;
            }

            const listedTemplate = editorTemplates.find((tpl) => tpl.id === editorTemplateId);
            setSelectedTemplate({
                name: resolvedName || listedTemplate?.name || 'Plantilla publicada',
                content,
                editorTemplateId,
                editorTemplateStatus: normalizeTemplateStatus(resolvedStatus || listedTemplate?.status || 'published'),
                editorTemplateJson: templateJson,
            });
            setTemplateStatus('valid');
            setTemplateError('');

            // Auto-detect if template requires images
            const templateContent = content.toLowerCase();
            const hasImageBlocks =
                templateContent.includes('report.images') ||
                templateContent.includes('photo-grid') ||
                templateContent.includes('photo-cell') ||
                templateContent.includes('panel-fotografico') ||
                templateContent.includes('photo-section');
            setRequiresImages(hasImageBlocks);
        } catch (err: any) {
            console.error(err);
            setTemplateStatus('invalid');
            setTemplateError('Error al cargar plantilla: ' + err.message);
        }
    }, [editorTemplates]);

    // ── Reset template ────────────────────────────────────────────
    const handleResetTemplate = useCallback(() => {
        setSelectedTemplate(null);
        setTemplateStatus(null);
        setTemplateError('');
        setRequiresImages(true);
        setRenderedHtml('');
    }, []);

    // ── Logo upload ────────────────────────────────────────────────
    const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (side === 'left') setLogoLeftFile(file);
        else setLogoRightFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            if (side === 'left') setLogoLeft(evt.target?.result as string);
            else setLogoRight(evt.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    // ── File upload ────────────────────────────────────────────────
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: false, cellNF: true });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'dd/mm/yy' }) as any[][];

                if (jsonData.length > 0) {
                    const _headers = jsonData[0] as string[];
                    const _data = jsonData.slice(1).map((row: any[]) => {
                        const obj: Record<string, any> = {};
                        _headers.forEach((h, i) => {
                            let cellValue = row[i];
                            if (isDateColumn(h) && typeof cellValue === 'number' && cellValue > 1000 && cellValue < 100000) {
                                cellValue = excelSerialToDate(cellValue);
                            }
                            obj[h] = cellValue;
                        });
                        return obj;
                    });
                    setHeaders(_headers);
                    setData(_data);
                    autoMapFields(_headers);
                }
            } catch (err) {
                console.error('Error parsing Excel file:', err);
                alert('Error al parsear el archivo Excel. Asegúrate de que el formato sea correcto.');
            }
        };
        reader.onerror = () => {
            alert('Error al leer el archivo. Por favor intenta de nuevo.');
        };
        reader.readAsBinaryString(file);
    }, []);

    const autoMapFields = (hdrs: string[]) => {
        const newMap: Record<string, string> = {};
        REPORT_FIELDS.forEach((field) => {
            const match = hdrs.find(
                (h) =>
                    h.toLowerCase().includes(field.id) ||
                    h.toLowerCase().includes(field.label.toLowerCase())
            );
            if (match) newMap[field.id] = match;
        });
        setMappings(newMap);
    };

    // ── Image upload ───────────────────────────────────────────────
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setImages(Array.from(e.target.files));
    }, []);

    // ── Match image name to record ID ──────────────────────────────
    const matchesRecordId = useCallback((imageName: string, recordId: string) => {
        const id = String(recordId).trim();
        const name = imageName.toLowerCase();
        const regex = new RegExp(
            `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[-_]\\d+)?\\.(jpg|jpeg|png|gif|webp)$`,
            'i'
        );
        return regex.test(name);
    }, []);

    const getFilteredImages = useCallback(() => {
        if (selectedIndex === '') return [];
        const index = Number(selectedIndex);
        if (Number.isNaN(index) || index < 0 || index >= data.length) return [];
        const row = data[index];
        if (!row || !idColumn) return [];
        const recordId = String(row[idColumn]);
        const filtered = images.filter((img) => matchesRecordId(img.name, recordId));
        const seen = new Set<string>();
        return filtered.filter((img) => {
            if (seen.has(img.name)) return false;
            seen.add(img.name);
            return true;
        });
    }, [data, selectedIndex, idColumn, images, matchesRecordId]);

    useEffect(() => {
        if (!selectedTemplate) {
            setRenderedHtml('');
            return;
        }

        // Si hay plantilla pero no hay fila seleccionada → mostrar estructura
        if (selectedIndex === '' || data.length === 0) {
            let previewHtml = selectedTemplate.content;
            // Reemplazar variables Jinja con placeholders visuales
            previewHtml = previewHtml.replace(
                /\{\{\s*report\.data\.get\('([^']+)'[^)]*\)\s*\}\}/g,
                (_m, key) => `<span style="background:#f0f0f0;color:#999;
                            font-size:11px;padding:1px 4px;border-radius:2px;
                            font-family:monospace">[${key}]</span>`
            );
            previewHtml = previewHtml.replace(
                /\{\{(?!%)[^}]+\}\}/g,
                '<span style="background:#f0f0f0;color:#bbb;font-size:10px;padding:1px 3px;font-family:monospace">[···]</span>'
            );
            // Eliminar bloques de control Jinja que no se pueden resolver
            previewHtml = previewHtml.replace(/\{%[\s\S]*?%\}/g, '');
            // Eliminar loops for que quedaron sin procesar
            previewHtml = previewHtml.replace(/\{#[\s\S]*?#\}/g, '');
            setRenderedHtml(previewHtml);
            return;
        }

        // Clean up previous blob URLs
        blobUrlsRef.current.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch { }
        });
        blobUrlsRef.current = [];

        const row = data[Number(selectedIndex)];
        if (!row) {
            setRenderedHtml('');
            return;
        }

        let html = selectedTemplate.content;
        const reportData: Record<string, any> = {};

        // Build report data from mappings
        Object.keys(mappings).forEach((key) => {
            const excelHeader = mappings[key];
            let value = row[excelHeader] || '-';
            if (DATE_FIELDS.includes(key)) value = formatDateValue(value);
            if (TEMPLATE_KEY_MAP[key]) reportData[TEMPLATE_KEY_MAP[key]] = value;
            reportData[key.toUpperCase()] = value;
            reportData[key] = value;
        });

        // Add custom columns
        customColumns.forEach((col) => {
            if (mappings[col.id]) {
                let value = row[mappings[col.id]] || '-';
                const colNameUpper = col.name.toUpperCase();
                if (colNameUpper.includes('FECHA') || colNameUpper.includes('DATE')) {
                    value = formatDateValue(value);
                }
                reportData[col.name] = value;
                reportData[col.name.toLowerCase()] = value;
            }
        });

        if (idColumn) reportData['Nro OT'] = row[idColumn];

        const emptyPixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
        const currentImages = getFilteredImages();
        const imageCount = currentImages.length;

        // Logo conditionals
        const logoLeftRegex = /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(logoLeftRegex, (_m: string, ifPart: string, elsePart: string) => (logoLeft ? ifPart : elsePart));
        const logoRightRegex = /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(logoRightRegex, (_m: string, ifPart: string, elsePart: string) => (logoRight ? ifPart : elsePart));
        const logoLeftNoElse = /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(logoLeftNoElse, (_m: string, c: string) => (logoLeft ? c : ''));
        const logoRightNoElse = /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(logoRightNoElse, (_m: string, c: string) => (logoRight ? c : ''));

        // Image conditionals
        const photosIfRegex = /\{%\s*if\s+report\.images\s+and\s+report\.images\|length\s*>\s*0\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(photosIfRegex, (_m: string, ifC: string, elseC: string) => (imageCount > 0 ? ifC : elseC));

        const imageCountGtElse = /\{%\s*if\s+report\.images\|length\s*>\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(imageCountGtElse, (_m: string, c: string, ifC: string, elseC: string) => (imageCount > parseInt(c, 10) ? ifC : elseC));
        const imageCountGt = /\{%\s*if\s+report\.images\|length\s*>\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(imageCountGt, (_m: string, c: string, content: string) => (imageCount > parseInt(c, 10) ? content : ''));

        const reportImagesIfElse = /\{%\s*if\s+report\.images\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        html = html.replace(reportImagesIfElse, (_m: string, ifC: string, elseC: string) => (imageCount > 0 ? ifC : elseC));

        // Simple replacements
        html = html.split('{{ title }}').join('PANEL FOTOGRÁFICO');
        html = html.split('{{ logo_left }}').join(logoLeft || emptyPixel);
        html = html.split('{{ logo_right }}').join(logoRight || emptyPixel);

        // Replace data.get patterns
        html = html.replace(/\{\{\s*report\.data\.get\('([^']+)',\s*'([^']*)'\)\s*\}\}/g, (_m: string, key: string, def: string) => reportData[key] || def || '-');
        html = html.replace(/\{\{\s*report\.data\.get\('([^']+)',\s*([^)]+)\)\s*\}\}/g, (_m: string, key: string) => reportData[key] || '-');

        // Direct image access
        const directImageRegex = /\{\{\s*report\.images\[(\d+)\]\.(path|name)\s*\}\}/g;
        html = html.replace(directImageRegex, (_m: string, indexStr: string, property: string) => {
            const index = parseInt(indexStr);
            if (currentImages[index]) {
                if (property === 'path') {
                    const url = URL.createObjectURL(currentImages[index]);
                    blobUrlsRef.current.push(url);
                    return url;
                }
                if (property === 'name') return currentImages[index].name;
            }
            return '';
        });

        // Image loops
        const loopRegex = /\{%\s*for\s+img\s+in\s+report\.images.*?\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;
        const matches = [...html.matchAll(loopRegex)];
        for (const match of matches) {
            const fullMatch = match[0];
            const loopContent = match[1];
            const limitMatch = match[0].match(/\[:(\d+)\]/);
            const limit = limitMatch ? parseInt(limitMatch[1]) : currentImages.length;
            const imagesToRender = currentImages.slice(0, limit);

            let generatedLoopHtml = '';
            for (let i = 0; i < imagesToRender.length; i++) {
                const img = imagesToRender[i];
                const imgUrl = URL.createObjectURL(img);
                blobUrlsRef.current.push(imgUrl);
                let itemHtml = loopContent;
                itemHtml = itemHtml.split('{{ img.path }}').join(imgUrl);
                itemHtml = itemHtml.split('{{ img.name }}').join(img.name);
                const dateStr = new Date(img.lastModified).toLocaleString();
                itemHtml = itemHtml.replace(/\{\{\s*img\.date.*\}\}/g, dateStr);
                itemHtml = itemHtml.replace(/\{\{\s*img\.coords.*\}\}/g, '');
                itemHtml = itemHtml.split('{{ loop.index }}').join(String(i + 1));
                generatedLoopHtml += itemHtml;
            }
            html = html.replace(fullMatch, generatedLoopHtml);
        }

        // Cleanup
        html = html.replace(/\{%\s*for\s+report\s+in\s+.*%\}/g, '');
        html = html.replace(/\{%\s*[\s\S]*?\s*%\}/g, '');
        html = html.replace(/\{#.*?#\}/g, '');
        if (currentImages.length > 0) {
            html = html.replace(/<div class="photo-placeholder">Sin imagen<\/div>/g, '');
            html = html.replace(/<div class="photo-placeholder">\s*Sin imagen\s*<\/div>/g, '');
        }

        setRenderedHtml(html);
    }, [selectedTemplate, data, selectedIndex, mappings, logoLeft, logoRight, images, customColumns, getFilteredImages, idColumn]);

    // ── PDF Generation ─────────────────────────────────────────────
    const handleBackendDownload = useCallback(async () => {
        if (exportScope === 'single' && selectedIndex === '') return;
        if (exportScope === 'all' && data.length === 0) return;
        if (!selectedTemplate) return;
        if (requiresImages && images.length === 0 && exportScope === 'single') return;

        const formatRowData = (row: Record<string, any>) => {
            const rowData: Record<string, any> = {};
            Object.keys(mappings).forEach((key) => {
                const excelHeader = mappings[key];
                let value = row[excelHeader];
                if (DATE_FIELDS.includes(key)) value = formatDateValue(value);
                if (TEMPLATE_KEY_MAP[key]) rowData[TEMPLATE_KEY_MAP[key]] = value;
            });
            customColumns.forEach((col) => {
                if (mappings[col.id]) {
                    let value = row[mappings[col.id]];
                    const colNameUpper = col.name.toUpperCase();
                    if (colNameUpper.includes('FECHA') || colNameUpper.includes('DATE')) {
                        value = formatDateValue(value);
                    }
                    rowData[col.name] = value;
                }
            });
            if (idColumn) rowData['Nro OT'] = row[idColumn];
            return rowData;
        };

        const formData = new FormData();
        const payload: any[] = [];
        const allImages = new Set<File>();

        if (exportScope === 'single') {
            const row = data[Number(selectedIndex)];
            const rowData = formatRowData(row);
            const rowImages = requiresImages ? getFilteredImages() : [];
            payload.push({ row_data: rowData, image_filenames: rowImages.map((f) => f.name) });
            rowImages.forEach((img) => allImages.add(img));
        } else {
            data.forEach((row) => {
                const recordId = String(row[idColumn]);
                if (requiresImages) {
                    const rowImages = images.filter((img) => matchesRecordId(img.name, recordId));
                    if (rowImages.length > 0) {
                        payload.push({ row_data: formatRowData(row), image_filenames: rowImages.map((f) => f.name) });
                        rowImages.forEach((img) => allImages.add(img));
                    }
                } else {
                    payload.push({ row_data: formatRowData(row), image_filenames: [] });
                }
            });
        }

        formData.append('data', JSON.stringify(payload));
        allImages.forEach((img) => formData.append('files', img));
        if (logoLeftFile) formData.append('logoLeft', logoLeftFile);
        if (logoRightFile) formData.append('logoRight', logoRightFile);

        // Always send the template name for editor templates
        formData.append('templateName', selectedTemplate.name);

        try {
            setIsPdfLoading(true);
            setPdfLoadingMessage(
                exportScope === 'single'
                    ? 'Generando PDF...'
                    : `Generando PDF consolidado (${payload.length} registros)...`
            );

            const response = await fetch(`${API_BASE_URL}/generate-pdf`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }

            const blob = await response.blob();
            const filename =
                exportScope === 'single'
                    ? `Reporte_${data[Number(selectedIndex)][idColumn] || 'Output'}.pdf`
                    : `Paneles_Consolidado_${new Date().toISOString().split('T')[0]}.pdf`;
            downloadBlob(blob, filename);
        } catch (err: any) {
            let errorMessage = 'Error al generar PDF: ';
            if (err.message.includes('Failed to fetch')) {
                errorMessage += 'No se puede conectar con el servidor.';
            } else {
                errorMessage += err.message;
            }
            alert(errorMessage);
        } finally {
            setIsPdfLoading(false);
        }
    }, [data, selectedIndex, exportScope, selectedTemplate, mappings, customColumns, idColumn, images, requiresImages, logoLeftFile, logoRightFile, matchesRecordId, getFilteredImages]);

    // ── Custom column handlers ─────────────────────────────────────
    const addCustomColumn = useCallback(() => {
        if (!newColumnName.trim()) {
            setColumnError('El nombre de la columna es requerido');
            return;
        }
        if (!newColumnMapping) {
            setColumnError('Debe seleccionar una columna del CSV');
            return;
        }
        const allNames = [
            ...REPORT_FIELDS.map((f) => f.label.toLowerCase()),
            ...customColumns.map((c) => c.name.toLowerCase()),
        ];
        if (allNames.includes(newColumnName.trim().toLowerCase())) {
            setColumnError('Ya existe una columna con ese nombre');
            return;
        }
        const newCol = { id: `custom_${Date.now()}`, name: newColumnName.trim().toUpperCase(), mappedTo: newColumnMapping };
        setCustomColumns([...customColumns, newCol]);
        setMappings({ ...mappings, [newCol.id]: newColumnMapping });
        setShowColumnModal(false);
        setNewColumnName('');
        setNewColumnMapping('');
        setColumnError('');
    }, [newColumnName, newColumnMapping, customColumns, mappings]);

    const removeCustomColumn = useCallback(
        (colId: string) => {
            setCustomColumns(customColumns.filter((c) => c.id !== colId));
            const newMappings = { ...mappings };
            delete newMappings[colId];
            setMappings(newMappings);
        },
        [customColumns, mappings]
    );

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[90] flex bg-black">
            <div className="flex w-full h-full bg-[#000] animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* ═══ Sidebar ═══ */}
                <aside className="w-[280px] bg-[#000] border-r border-[#1a1a1a] flex flex-col flex-shrink-0">
                    {/* Header */}
                    <div className="h-11 flex items-center justify-between px-4 border-b border-[#1a1a1a] flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <Printer size={14} className="text-white" />
                            <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-white">Generador de Reportes</span>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 flex items-center justify-center text-[#444] hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Steps */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-4 text-white">
                        {/* Step 0: Logos */}
                        <Step number="0" title="Logos y Cabecera" icon={<Settings size={14} />}>
                            <div className="grid grid-cols-2 gap-2">
                                {['Izq', 'Der'].map((side) => (
                                    <div key={side} className="flex flex-col gap-1">
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-[#444]">Logo {side}</span>
                                        <div className="border border-[#222] hover:border-[#444] h-14 flex items-center justify-center cursor-pointer transition-colors overflow-hidden bg-[#050505]"
                                            onClick={() => document.getElementById(`genLogo${side === 'Izq' ? 'Left' : 'Right'}`)?.click()}
                                        >
                                            {(side === 'Izq' ? logoLeft : logoRight) ? (
                                                <img src={side === 'Izq' ? logoLeft! : logoRight!} className="h-full object-contain p-1" />
                                            ) : (
                                                <span className="text-[9px] font-mono uppercase tracking-widest text-[#333]">Subir</span>
                                            )}
                                        </div>
                                        <input id={`genLogo${side === 'Izq' ? 'Left' : 'Right'}`} type="file" hidden accept="image/*" onChange={(e) => handleLogoUpload(e, side === 'Izq' ? 'left' : 'right')} />
                                    </div>
                                ))}
                            </div>
                        </Step>

                        {/* Step 1: Template selection (ONLY editor templates) */}
                        <Step number="1" title="Seleccionar Plantilla" icon={<FileCode size={14} />}>
                            <div className="space-y-2">
                                <select
                                    className="w-full bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors disabled:opacity-30"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) handleEditorTemplateSelect(val);
                                        else handleResetTemplate();
                                    }}
                                    value={selectedTemplate?.editorTemplateId || ''}
                                    disabled={editorTemplates.length === 0}
                                >
                                    <option value="">
                                        {editorTemplates.length === 0 ? 'Sin plantillas publicadas' : '-- Seleccionar Plantilla --'}
                                    </option>
                                    {editorTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} [{normalizeTemplateStatus(t.status)}]
                                        </option>
                                    ))}
                                </select>

                                {templateStatus === 'invalid' && templateError && (
                                    <div className="border border-[#ff3b30]/30 bg-[#ff3b30]/5 text-[#ff3b30] text-[10px] font-mono rounded-none p-2 mb-3 flex items-center gap-2">⚠️ {templateError}</div>
                                )}

                                <div className="flex items-center justify-between py-2 px-3 border border-[#1a1a1a] bg-[#050505]">
                                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#444]">Activa</span>
                                    <span className={`text-[10px] font-mono truncate max-w-[160px] ${selectedTemplate ? 'text-white' : 'text-[#333]'}`}>
                                        {selectedTemplate ? selectedTemplate.name : '—'}
                                    </span>
                                </div>

                                {selectedTemplate && (
                                    <button
                                        onClick={handleResetTemplate}
                                        className="w-full flex items-center justify-center gap-2 border border-[#222] hover:border-white text-[#666] hover:text-white font-mono text-[10px] tracking-wider uppercase py-2 px-4 rounded-none transition-all duration-150"
                                    >
                                        <RotateCcw size={10} /> Quitar Plantilla
                                    </button>
                                )}

                                {/* Images Required Toggle */}
                                <div className="flex items-center justify-between py-2 px-3 border border-[#1a1a1a]">
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#666] flex items-center gap-2">
                                        <ImageIcon size={10} /> Requiere imágenes
                                    </span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={requiresImages}
                                            onChange={(e) => setRequiresImages(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-7 h-3.5 bg-[#222] peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-none after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-white" />
                                    </label>
                                </div>
                            </div>
                        </Step>

                        {/* Step 2: Data */}
                        <Step number="2" title="Cargar Datos" icon={<FileSpreadsheet size={14} />}>
                            <label className="block w-full cursor-pointer group">
                                <div className="border border-[#222] hover:border-white rounded-none p-2.5 text-center bg-[#050505] transition-colors">
                                    <span className="text-[#666] font-mono text-[10px] uppercase tracking-wider group-hover:text-white transition-colors">
                                        {headers.length > 0 ? `${data.length} registros cargados` : 'Seleccionar Excel / CSV'}
                                    </span>
                                </div>
                                <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                            </label>
                        </Step>

                        {/* Step 3: Mapping */}
                        <Step number="3" title="Mapeo de Columnas" icon={<Settings size={14} />} disabled={headers.length === 0}>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-1 mt-2">
                                {REPORT_FIELDS.map((field) => (
                                    <div key={field.id} className="grid grid-cols-2 gap-1 items-center">
                                        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#555] truncate block">{field.label}</span>
                                        <select
                                            className="w-full bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors disabled:opacity-30"
                                            value={mappings[field.id] || ''}
                                            onChange={(e) => setMappings({ ...mappings, [field.id]: e.target.value })}
                                        >
                                            <option value="">Ignorar</option>
                                            {headers.map((h) => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}

                                {customColumns.map((col) => (
                                    <div key={col.id} className="grid grid-cols-[1fr_auto_auto] gap-1 items-center bg-[#050505] p-1 border border-[#111]">
                                        <span className="text-white text-[10px] font-mono uppercase tracking-[0.15em]">{col.name}</span>
                                        <select
                                            className="bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors"
                                            value={mappings[col.id] || col.mappedTo || ''}
                                            onChange={(e) => setMappings({ ...mappings, [col.id]: e.target.value })}
                                        >
                                            <option value="">Ignorar</option>
                                            {headers.map((h) => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => removeCustomColumn(col.id)}
                                            className="text-[#ff3b30] hover:text-white text-[10px] px-2 hover:bg-[#ff3b30] rounded-none transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowColumnModal(true)}
                                disabled={headers.length === 0}
                                className="w-full flex items-center justify-center gap-2 border border-[#222] hover:border-white text-[#666] hover:text-white font-mono text-[10px] tracking-wider uppercase py-2 px-4 rounded-none transition-all duration-150 mt-2"
                            >
                                + Agregar Columna Personalizada
                            </button>
                        </Step>

                        {/* Step 4: Images */}
                        <Step
                            number="4"
                            title={requiresImages ? 'Cargar Imágenes' : 'Imágenes (Opcional)'}
                            disabled={headers.length === 0 || !requiresImages}
                            icon={<ImageIcon size={14} />}
                        >
                            {requiresImages ? (
                                <label className="block w-full cursor-pointer group">
                                    <div className="border border-[#222] hover:border-white rounded-none p-2.5 text-center bg-[#050505] transition-colors">
                                        <span className="text-[#666] font-mono text-[10px] uppercase tracking-wider group-hover:text-white transition-colors">
                                            {images.length > 0 ? `${images.length} imágenes` : 'Subir Carpeta de Fotos'}
                                        </span>
                                    </div>
                                    <input type="file" hidden multiple accept="image/*" onChange={handleImageUpload} />
                                </label>
                            ) : (
                                <div className="border border-[#111] bg-[#050505] rounded-none p-2.5 text-center">
                                    <span className="text-[#444] font-mono text-[10px] uppercase tracking-wider">No requerido para esta plantilla</span>
                                </div>
                            )}
                        </Step>

                        {/* Step 5: Select & Export */}
                        <Step
                            number="5"
                            title="Seleccionar y Exportar"
                            disabled={!selectedTemplate || (requiresImages ? images.length === 0 : data.length === 0)}
                        >
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#333]" size={11} />
                                <input
                                    type="text"
                                    placeholder="Buscar orden..."
                                    value={searchOrder}
                                    onChange={(e) => {
                                        const term = e.target.value;
                                        setSearchOrder(term);
                                        if (term) {
                                            const matchIdx = data.findIndex((row, idx) => {
                                                const label = idColumn ? String(row[idColumn]) : `Fila ${idx + 1}`;
                                                return label.toLowerCase().includes(term.toLowerCase());
                                            });
                                            if (matchIdx !== -1) {
                                                setSelectedIndex(String(matchIdx));
                                                setExportScope('single');
                                            }
                                        }
                                    }}
                                    className="w-full pl-8 pr-3 py-2 bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none text-[11px] font-mono text-white outline-none placeholder:text-[#333] transition-colors"
                                />
                            </div>

                            <select
                                className="w-full bg-white text-black font-mono font-bold border-0 rounded-none p-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-30 disabled:cursor-not-allowed"
                                value={selectedIndex}
                                onChange={(e) => {
                                    setSelectedIndex(e.target.value);
                                    setExportScope('single');
                                }}
                                disabled={exportScope === 'all'}
                            >
                                <option value="">-- Seleccionar Fila --</option>
                                {data.map((row, idx) => (
                                    <option key={idx} value={idx}>
                                        {idx + 1}. {idColumn ? row[idColumn] : `Fila ${idx + 1}`}
                                    </option>
                                ))}
                            </select>

                            {/* Export Options */}
                            <div className="bg-[#050505] border border-[#1a1a1a] rounded-none p-2 mt-2">
                                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#555] mb-2">Exportación</h4>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        className={`flex-1 ${exportScope === 'single' ? 'bg-white text-black font-mono font-bold text-[10px] tracking-wider uppercase py-2 px-3 rounded-none transition-all' : 'bg-transparent border border-[#222] text-[#555] hover:border-[#444] hover:text-white font-mono text-[10px] tracking-wider uppercase py-2 px-3 rounded-none transition-all'}`}
                                        onClick={() => setExportScope('single')}
                                    >
                                        Solo Actual
                                    </button>
                                    <button
                                        className={`flex-1 ${exportScope === 'all' ? 'bg-white text-black font-mono font-bold text-[10px] tracking-wider uppercase py-2 px-3 rounded-none transition-all' : 'bg-transparent border border-[#222] text-[#555] hover:border-[#444] hover:text-white font-mono text-[10px] tracking-wider uppercase py-2 px-3 rounded-none transition-all'}`}
                                        onClick={() => setExportScope('all')}
                                    >
                                        Todo ({data.length})
                                    </button>
                                </div>

                                {exportScope === 'all' && (
                                    <div className="flex flex-col gap-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="genFormat"
                                                checked={exportFormat === 'consolidated'}
                                                onChange={() => setExportFormat('consolidated')}
                                                className="text-white bg-[#000] border-[#222]"
                                            />
                                            <span className="text-white text-[10px] font-mono uppercase tracking-wider">PDF Consolidado</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer opacity-30">
                                            <input
                                                type="radio"
                                                name="genFormat"
                                                checked={exportFormat === 'individual'}
                                                onChange={() => setExportFormat('individual')}
                                                className="text-white bg-[#000] border-[#222]"
                                            />
                                            <span className="text-white text-[10px] font-mono uppercase tracking-wider">PDFs Individuales (ZIP)</span>
                                        </label>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleBackendDownload}
                                disabled={(exportScope === 'single' && selectedIndex === '') || (requiresImages ? images.length === 0 : data.length === 0) || !selectedTemplate}
                                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-[#e5e5e5] text-black font-mono font-bold text-[11px] tracking-wider uppercase py-3 px-4 rounded-none disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 mt-2"
                            >
                                <Download size={14} /> Descargar PDF
                            </button>
                        </Step>
                    </div>
                </aside>

                {/* ═══ Preview Area ═══ */}
                <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f5f5f5]">
                    {/* Preview header */}
                    <div className="h-10 flex items-center justify-between px-5 bg-[#000] border-b border-[#111] flex-shrink-0">
                        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#555]">
                            Vista Previa
                            {selectedTemplate && (
                                <span className="text-white ml-3 normal-case tracking-normal">
                                    — {selectedTemplate.name}
                                </span>
                            )}
                            {selectedIndex !== '' && data[Number(selectedIndex)] && idColumn && ` | ${data[Number(selectedIndex)][idColumn]}`}
                        </span>
                        <button
                            onClick={onClose}
                            className="text-[9px] font-mono uppercase tracking-widest text-[#333] hover:text-white transition-colors"
                        >
                            ESC · cerrar
                        </button>
                    </div>

                    {/* Preview content */}
                    <div className="flex-1 overflow-auto flex justify-center items-start p-4">
                        <TemplatePreview renderedHtml={renderedHtml} panelRef={panelRef} />
                    </div>
                </main>
            </div>

            {/* Column modal */}
            {showColumnModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200]">
                    <div className="bg-black border border-[#222] p-6 w-full max-w-[320px] mx-4 shadow-2xl">
                        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-white font-bold mb-5">
                            + Agregar Columna
                        </h3>

                        {columnError && (
                            <div className="border border-[#ff3b30]/30 bg-[#ff3b30]/5 text-[#ff3b30] text-[10px] font-mono rounded-none p-2 mb-3 flex items-center gap-2">
                                <AlertCircle size={10} /> {columnError}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#555] mb-1 block">Nombre</label>
                                <input
                                    type="text"
                                    value={newColumnName}
                                    onChange={(e) => setNewColumnName(e.target.value)}
                                    placeholder="Ej: FECHA CORTE"
                                    className="w-full bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#555] mb-1 block">Columna CSV</label>
                                <select
                                    value={newColumnMapping}
                                    onChange={(e) => setNewColumnMapping(e.target.value)}
                                    className="w-full bg-[#000] border border-[#222] hover:border-[#444] focus:border-white rounded-none px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors"
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {headers.map((h) => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => {
                                    setShowColumnModal(false);
                                    setNewColumnName('');
                                    setNewColumnMapping('');
                                    setColumnError('');
                                }}
                                className="flex-1 flex items-center justify-center gap-2 border border-[#222] hover:border-white text-[#666] hover:text-white font-mono text-[10px] tracking-wider uppercase py-2 px-4 rounded-none transition-all duration-150"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={addCustomColumn}
                                className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-[#e5e5e5] text-black font-mono font-bold text-[11px] tracking-wider uppercase py-3 px-4 rounded-none disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PDF Loading */}
            {isPdfLoading && <LoadingModal message={pdfLoadingMessage} />}
        </div>
    );
}
