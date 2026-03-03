import React, { useState, useRef, useCallback } from 'react';
import {
    ScanLine,
    FileText,
    Download,
    AlertCircle,
    CheckCircle,
    Upload,
    X,
    Loader2,
    BookOpen,
    Code2,
    User,
    DollarSign,
    FileCheck,
    Info,
} from 'lucide-react';
import DashboardLayout from '../../DashboardLayout';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE_MB = 25;

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.heic,.heif';

const SCHEMA_OPTIONS = [
    {
        value: 'general',
        label: 'General',
        Icon: BookOpen,
        desc: 'Título, resumen, entidades y valores clave del documento',
    },
    {
        value: 'factura',
        label: 'Factura',
        Icon: DollarSign,
        desc: 'Proveedor, cliente, ítems, subtotal, impuestos y total',
    },
    {
        value: 'identidad',
        label: 'Documento de Identidad',
        Icon: User,
        desc: 'Nombres, apellidos, fechas, número y dirección',
    },
];

const OUTPUT_FORMATS = [
    { value: 'txt', label: 'TXT', hint: 'Texto plano' },
    { value: 'docx', label: 'Word (.docx)', hint: 'Documento editable' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function filenameFromHeaders(headers) {
    const cd = headers.get('Content-Disposition') || '';
    const match = cd.match(/filename[^;=\n]*=(?:(['"])(?<q>[^'"]*)\1|(?<bare>[^;\n]*))/i);
    return match?.groups?.q || match?.groups?.bare?.trim() || null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeTab({ active, onClick, icon: Icon, label }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-mono font-medium transition-all
                ${active
                    ? 'bg-white text-black shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600'
                }`}
        >
            <Icon size={15} />
            {label}
        </button>
    );
}

function Dropzone({ file, isDragging, onDropzoneDrop, onDragOver, onDragLeave, onClear, fileInputRef, onChange }) {
    return (
        <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDropzoneDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`relative rounded-lg border-2 border-dashed cursor-pointer transition-all p-6 flex flex-col items-center justify-center gap-3 text-center min-h-[160px]
                ${isDragging
                    ? 'border-white bg-white/5 scale-[1.01]'
                    : file
                        ? 'border-neutral-600 bg-neutral-900/80'
                        : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500 hover:bg-neutral-900/60'
                }`}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={e => onChange(e.target.files[0])}
            />
            {file ? (
                <>
                    <div className="w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                        <FileCheck size={20} className="text-white" />
                    </div>
                    <div className="flex flex-col items-center gap-1 max-w-full px-4">
                        <span className="text-sm text-white font-mono font-medium truncate max-w-[220px]">{file.name}</span>
                        <span className="text-xs text-neutral-500">{formatBytes(file.size)}</span>
                    </div>
                    <button
                        onClick={e => { e.stopPropagation(); onClear(); }}
                        className="absolute top-2.5 right-2.5 text-neutral-600 hover:text-white transition-colors p-1 rounded hover:bg-neutral-800"
                        title="Quitar archivo"
                    >
                        <X size={14} />
                    </button>
                </>
            ) : (
                <>
                    <div className="w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                        <Upload size={20} className="text-neutral-400" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-sm text-neutral-300 font-mono">Arrastra o haz clic para seleccionar</span>
                        <span className="text-xs text-neutral-600">PDF, PNG, JPG, TIFF, BMP, WEBP, HEIC · máx. {MAX_SIZE_MB} MB</span>
                    </div>
                </>
            )}
        </div>
    );
}

function SectionLabel({ children }) {
    return (
        <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest block mb-2">
            {children}
        </span>
    );
}

function ResultPanel({ loading, result, onDownload }) {
    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border border-neutral-800 flex items-center justify-center">
                        <Loader2 size={28} className="animate-spin text-white" />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-mono text-white">Procesando documento</span>
                    <span className="text-xs font-mono text-neutral-500">El tiempo varía según el tamaño del archivo</span>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-700 select-none">
                <ScanLine size={52} strokeWidth={1} />
                <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-sm font-mono text-neutral-600">Resultado aparecerá aquí</span>
                    <span className="text-xs font-mono text-neutral-700">Sube un archivo y ejecuta la extracción</span>
                </div>
            </div>
        );
    }

    if (!result.ok) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center">
                    <AlertCircle size={26} className="text-red-400" />
                </div>
                <div className="flex flex-col gap-2 max-w-sm">
                    <span className="text-white font-mono font-semibold">Error en la extracción</span>
                    <span className="text-neutral-400 text-sm font-mono leading-relaxed">{result.error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 text-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
                    <CheckCircle size={26} className="text-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-white font-mono font-semibold text-lg">Extracción completada</span>
                    <span className="text-neutral-500 text-xs font-mono truncate max-w-[260px]">{result.filename}</span>
                </div>
            </div>

            {/* Metadata chips */}
            <div className="flex gap-6">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Motor OCR</span>
                    <span className="text-sm font-mono text-white bg-neutral-900 border border-neutral-800 rounded px-3 py-1">
                        {result.model}
                    </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Páginas</span>
                    <span className="text-sm font-mono text-white bg-neutral-900 border border-neutral-800 rounded px-3 py-1">
                        {result.pages}
                    </span>
                </div>
            </div>

            <button
                onClick={onDownload}
                className="flex items-center gap-2 px-8 py-3 bg-white text-black rounded-md font-mono text-sm font-semibold hover:bg-neutral-100 active:scale-95 transition-all"
            >
                <Download size={16} />
                DESCARGAR
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OCRTool() {
    const [file, setFile] = useState(null);
    const [mode, setMode] = useState('text'); // 'text' | 'structured'
    const [outputFormat, setOutputFormat] = useState('txt');
    const [schemaType, setSchemaType] = useState('general');
    const [instructions, setInstructions] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const fileInputRef = useRef(null);

    const handleFileSelect = useCallback((f) => {
        if (!f) return;
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
            setResult({ ok: false, error: `El archivo supera el límite de ${MAX_SIZE_MB} MB.` });
            return;
        }
        setFile(f);
        setResult(null);
    }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files[0]);
    }, [handleFileSelect]);

    const onDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const onDragLeave = useCallback(() => setIsDragging(false), []);
    const clearFile = useCallback(() => { setFile(null); setResult(null); }, []);

    const execute = async () => {
        if (!file || loading) return;
        setLoading(true);
        setResult(null);

        try {
            const form = new FormData();
            form.append('file', file);

            let url;
            if (mode === 'text') {
                form.append('output_format', outputFormat);
                url = '/api/tools/ocr-extract';
            } else {
                form.append('schema_type', schemaType);
                if (instructions.trim()) form.append('instructions', instructions.trim());
                url = '/api/tools/ocr-extract-structured';
            }

            const resp = await fetch(url, { method: 'POST', body: form });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({ detail: `Error HTTP ${resp.status}` }));
                throw new Error(errData.detail || `Error HTTP ${resp.status}`);
            }

            const blob = await resp.blob();
            const model = resp.headers.get('X-OCR-Model') || 'N/D';
            const pages = resp.headers.get('X-OCR-Pages') || '?';
            const filename = filenameFromHeaders(resp.headers)
                || `${file.name.replace(/\.[^.]+$/, '')}_ocr`;

            setResult({ ok: true, blob, filename, model, pages });
        } catch (err) {
            setResult({ ok: false, error: err.message });
        } finally {
            setLoading(false);
        }
    };

    const downloadResult = () => {
        if (!result?.blob) return;
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const canExecute = !!file && !loading;

    return (
        <DashboardLayout>
            <div className="p-6 h-full flex flex-col gap-5 max-w-5xl mx-auto w-full">

                {/* ── Header ── */}
                <div className="flex items-end justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <ScanLine size={22} className="text-white" />
                            <h1 className="text-xl font-bold tracking-tight text-white font-mono">OCR</h1>
                        </div>
                        <p className="text-sm text-neutral-500 font-mono">
                            Extracción de texto e información estructurada desde PDFs e imágenes
                        </p>
                    </div>
                </div>

                {/* ── Mode toggle ── */}
                <div className="flex gap-2">
                    <ModeTab
                        active={mode === 'text'}
                        onClick={() => { setMode('text'); setResult(null); }}
                        icon={FileText}
                        label="EXTRAER TEXTO"
                    />
                    <ModeTab
                        active={mode === 'structured'}
                        onClick={() => { setMode('structured'); setResult(null); }}
                        icon={Code2}
                        label="EXTRAER JSON"
                    />
                </div>

                {/* ── Two-panel workspace ── */}
                <div className="flex gap-5 flex-1 min-h-0">

                    {/* ── Left: Upload + Config ── */}
                    <div className="flex flex-col gap-4 w-72 flex-shrink-0">

                        <Dropzone
                            file={file}
                            isDragging={isDragging}
                            onDropzoneDrop={onDrop}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onClear={clearFile}
                            fileInputRef={fileInputRef}
                            onChange={handleFileSelect}
                        />

                        {/* Config depending on mode */}
                        {mode === 'text' ? (
                            <div>
                                <SectionLabel>Formato de salida</SectionLabel>
                                <div className="flex gap-2">
                                    {OUTPUT_FORMATS.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setOutputFormat(f.value)}
                                            className={`flex-1 py-2.5 px-3 rounded border text-sm font-mono transition-all
                                                ${outputFormat === f.value
                                                    ? 'bg-neutral-100 text-black border-neutral-100 font-semibold'
                                                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <SectionLabel>Plantilla estructurada</SectionLabel>
                                <div className="flex flex-col gap-1.5">
                                    {SCHEMA_OPTIONS.map(({ value, label, Icon, desc }) => (
                                        <button
                                            key={value}
                                            onClick={() => setSchemaType(value)}
                                            className={`flex items-start gap-3 p-3 rounded border text-left transition-all
                                                ${schemaType === value
                                                    ? 'bg-white text-black border-white'
                                                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'
                                                }`}
                                        >
                                            <Icon size={15} className="mt-0.5 flex-shrink-0" />
                                            <div>
                                                <div className="text-sm font-mono font-medium">{label}</div>
                                                <div className={`text-xs mt-0.5 leading-snug ${schemaType === value ? 'text-neutral-500' : 'text-neutral-600'}`}>
                                                    {desc}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-1">
                                    <SectionLabel>Instrucciones adicionales (opcional)</SectionLabel>
                                    <textarea
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                        placeholder="Ej: Prioriza número de factura y total final."
                                        rows={3}
                                        className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs font-mono rounded px-3 py-2.5 resize-none focus:border-neutral-500 focus:outline-none placeholder:text-neutral-700 transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Execute button */}
                        <button
                            onClick={execute}
                            disabled={!canExecute}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-md font-mono text-sm font-semibold transition-all
                                disabled:opacity-30 disabled:cursor-not-allowed
                                bg-white text-black hover:bg-neutral-100 active:scale-[0.98]"
                        >
                            {loading
                                ? <><Loader2 size={15} className="animate-spin" /> PROCESANDO...</>
                                : <><ScanLine size={15} /> {mode === 'text' ? 'EXTRAER TEXTO' : 'EXTRAER JSON'}</>
                            }
                        </button>

                        {/* Info note */}
                        <div className="flex items-start gap-2 text-neutral-600 text-xs font-mono">
                            <Info size={12} className="mt-0.5 flex-shrink-0" />
                            <span>Motor: RapidOCR local (gratis) · Ollama opcional vía variable de entorno</span>
                        </div>
                    </div>

                    {/* ── Right: Result ── */}
                    <div className="flex-1 min-h-0 bg-neutral-900/30 border border-neutral-800 rounded-lg flex flex-col overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                            <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Resultado</span>
                            {result?.ok && (
                                <span className="text-xs font-mono text-emerald-500 flex items-center gap-1.5">
                                    <CheckCircle size={11} />
                                    listo
                                </span>
                            )}
                            {result && !result.ok && (
                                <span className="text-xs font-mono text-red-500 flex items-center gap-1.5">
                                    <AlertCircle size={11} />
                                    error
                                </span>
                            )}
                        </div>
                        <ResultPanel
                            loading={loading}
                            result={result}
                            onDownload={downloadResult}
                        />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
