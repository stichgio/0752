import React, { useState, useRef, useCallback, useEffect } from 'react';
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
    Settings,
    ChevronDown,
    ChevronUp,
    Wifi,
    WifiOff,
    Cpu,
    ExternalLink,
    Copy,
    Check,
} from 'lucide-react';
import DashboardLayout from '../../DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE_MB = 25;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.heic,.heif';
const LS_KEY = 'ocr_ollama_config';

const COMMON_MODELS = [
    { value: 'llava:latest', label: 'LLaVA 7B', hint: 'Uso general, buena calidad' },
    { value: 'llava-phi3:latest', label: 'LLaVA-Phi3', hint: 'Más rápido, menor RAM' },
    { value: 'llava:13b', label: 'LLaVA 13B', hint: 'Mayor precisión, lento' },
    { value: 'moondream:latest', label: 'Moondream', hint: 'Muy rápido, ~1.7 GB' },
    { value: 'minicpm-v:latest', label: 'MiniCPM-V', hint: 'Bueno en documentos' },
    { value: 'bakllava:latest', label: 'BakLLaVA', hint: 'LLaVA sobre Mistral' },
];

const SCHEMA_OPTIONS = [
    { value: 'general', label: 'General', Icon: BookOpen, desc: 'Título, resumen, entidades y valores clave' },
    { value: 'factura', label: 'Factura', Icon: DollarSign, desc: 'Proveedor, cliente, ítems, subtotal y total' },
    { value: 'identidad', label: 'Doc. de Identidad', Icon: User, desc: 'Nombres, fechas, número y dirección' },
];

const OUTPUT_FORMATS = [
    { value: 'txt', label: 'TXT' },
    { value: 'docx', label: 'Word (.docx)' },
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

function loadStoredConfig() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
    return <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest block mb-2">{children}</span>;
}

function Dropzone({ file, isDragging, onDrop, onDragOver, onDragLeave, onClear, fileInputRef, onChange }) {
    return (
        <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`relative rounded-lg border-2 border-dashed cursor-pointer transition-all p-5 flex flex-col items-center justify-center gap-2.5 text-center min-h-[140px]
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
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                        <FileCheck size={18} className="text-white" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5 max-w-full px-4">
                        <span className="text-sm text-white font-mono font-medium truncate max-w-[210px]">{file.name}</span>
                        <span className="text-xs text-neutral-500">{formatBytes(file.size)}</span>
                    </div>
                    <button
                        onClick={e => { e.stopPropagation(); onClear(); }}
                        className="absolute top-2 right-2 text-neutral-600 hover:text-white transition-colors p-1 rounded hover:bg-neutral-800"
                    >
                        <X size={13} />
                    </button>
                </>
            ) : (
                <>
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                        <Upload size={18} className="text-neutral-400" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                        <span className="text-sm text-neutral-300 font-mono">Arrastra o haz clic</span>
                        <span className="text-xs text-neutral-600">PDF, PNG, JPG, TIFF, BMP, WEBP, HEIC · máx {MAX_SIZE_MB} MB</span>
                    </div>
                </>
            )}
        </div>
    );
}

function ResultPanel({ loading, result, onDownload }) {
    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
                <div className="w-14 h-14 rounded-full border border-neutral-800 flex items-center justify-center">
                    <Loader2 size={26} className="animate-spin text-white" />
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-sm font-mono text-white">Procesando documento…</span>
                    <span className="text-xs font-mono text-neutral-500">El tiempo varía según el tamaño y el modelo</span>
                </div>
            </div>
        );
    }
    if (!result) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-700 select-none">
                <ScanLine size={48} strokeWidth={1} />
                <div className="text-center">
                    <p className="text-sm font-mono text-neutral-600">El resultado aparecerá aquí</p>
                    <p className="text-xs font-mono text-neutral-700 mt-1">Sube un archivo y ejecuta la extracción</p>
                </div>
            </div>
        );
    }
    if (!result.ok) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center">
                    <AlertCircle size={24} className="text-red-400" />
                </div>
                <div className="flex flex-col gap-2 max-w-sm">
                    <span className="text-white font-mono font-semibold">Error en la extracción</span>
                    <span className="text-neutral-400 text-sm font-mono leading-relaxed">{result.error}</span>
                </div>
            </div>
        );
    }
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-7 p-8 text-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
                    <CheckCircle size={24} className="text-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-white font-mono font-semibold text-base">Extracción completada</span>
                    <span className="text-neutral-500 text-xs font-mono truncate max-w-[240px]">{result.filename}</span>
                </div>
            </div>
            <div className="flex gap-6">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Motor OCR</span>
                    <span className="text-xs font-mono text-white bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 max-w-[180px] truncate">
                        {result.model}
                    </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Páginas</span>
                    <span className="text-xs font-mono text-white bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1">
                        {result.pages}
                    </span>
                </div>
            </div>
            <button
                onClick={onDownload}
                className="flex items-center gap-2 px-7 py-2.5 bg-white text-black rounded-md font-mono text-sm font-semibold hover:bg-neutral-100 active:scale-95 transition-all"
            >
                <Download size={15} />
                DESCARGAR
            </button>
        </div>
    );
}

// ─── Ollama Configuration Panel ───────────────────────────────────────────────

function OllamaConfigPanel({ config, onChange }) {
    const [probeState, setProbeState] = useState('idle'); // 'idle' | 'testing' | 'ok' | 'fail'
    const [probeError, setProbeError] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    const [showTunnelGuide, setShowTunnelGuide] = useState(false);
    const [copiedCmd, setCopiedCmd] = useState('');

    const handleProbe = async () => {
        if (!config.url.trim()) return;
        setProbeState('testing');
        setProbeError('');
        setAvailableModels([]);
        try {
            const form = new FormData();
            form.append('ollama_url', config.url.trim());
            const resp = await fetch(`${API_BASE}/tools/ocr-probe`, { method: 'POST', body: form });
            const data = await resp.json();
            if (data.ok) {
                setProbeState('ok');
                setAvailableModels(data.models || []);
            } else {
                setProbeState('fail');
                setProbeError(data.error || 'Sin detalle');
            }
        } catch (err) {
            setProbeState('fail');
            setProbeError(err.message);
        }
    };

    const copyCmd = (cmd) => {
        navigator.clipboard.writeText(cmd).then(() => {
            setCopiedCmd(cmd);
            setTimeout(() => setCopiedCmd(''), 2000);
        });
    };

    const TUNNEL_CMDS = [
        { tool: 'ngrok', cmd: 'ngrok http 11434' },
        { tool: 'Cloudflare', cmd: 'cloudflared tunnel --url http://localhost:11434' },
        { tool: 'bore.pub', cmd: 'bore local 11434 --to bore.pub' },
    ];

    return (
        <div className="flex flex-col gap-3">

            {/* Ollama URL */}
            <div>
                <SectionLabel>URL de Ollama</SectionLabel>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={config.url}
                        onChange={e => onChange({ ...config, url: e.target.value })}
                        placeholder="https://xxxx.ngrok-free.app"
                        className="flex-1 bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs font-mono rounded px-3 py-2 focus:border-neutral-500 focus:outline-none placeholder:text-neutral-700"
                    />
                    <button
                        onClick={handleProbe}
                        disabled={!config.url.trim() || probeState === 'testing'}
                        className="flex items-center gap-1.5 px-3 py-2 rounded border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-500 text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Probar conexión"
                    >
                        {probeState === 'testing'
                            ? <Loader2 size={13} className="animate-spin" />
                            : probeState === 'ok'
                                ? <Wifi size={13} className="text-emerald-400" />
                                : probeState === 'fail'
                                    ? <WifiOff size={13} className="text-red-400" />
                                    : <Wifi size={13} />
                        }
                        Probar
                    </button>
                </div>
                {probeState === 'ok' && (
                    <p className="text-emerald-500 text-xs font-mono mt-1.5 flex items-center gap-1">
                        <CheckCircle size={11} /> Conectado · {availableModels.length} modelo(s) disponible(s)
                    </p>
                )}
                {probeState === 'fail' && (
                    <p className="text-red-400 text-xs font-mono mt-1.5 flex items-center gap-1">
                        <AlertCircle size={11} /> {probeError}
                    </p>
                )}
            </div>

            {/* Model */}
            <div>
                <SectionLabel>Modelo</SectionLabel>
                <input
                    type="text"
                    value={config.model}
                    onChange={e => onChange({ ...config, model: e.target.value })}
                    placeholder="llava:latest"
                    className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs font-mono rounded px-3 py-2 focus:border-neutral-500 focus:outline-none placeholder:text-neutral-700"
                />
                {/* Available models from probe */}
                {availableModels.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                        <span className="text-xs font-mono text-neutral-600">Modelos instalados:</span>
                        <div className="flex flex-wrap gap-1">
                            {availableModels.map(m => (
                                <button
                                    key={m}
                                    onClick={() => onChange({ ...config, model: m })}
                                    className={`text-xs font-mono px-2 py-0.5 rounded border transition-all
                                        ${config.model === m
                                            ? 'bg-white text-black border-white'
                                            : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {/* Suggested models when no probe done */}
                {availableModels.length === 0 && (
                    <div className="mt-2">
                        <span className="text-xs font-mono text-neutral-600">Modelos recomendados para OCR:</span>
                        <div className="mt-1 flex flex-col gap-1">
                            {COMMON_MODELS.map(m => (
                                <button
                                    key={m.value}
                                    onClick={() => onChange({ ...config, model: m.value })}
                                    className={`flex items-center justify-between text-xs font-mono px-2.5 py-1.5 rounded border transition-all text-left
                                        ${config.model === m.value
                                            ? 'bg-white text-black border-white'
                                            : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'
                                        }`}
                                >
                                    <span className="font-medium">{m.label}</span>
                                    <span className={`text-xs ${config.model === m.value ? 'text-neutral-600' : 'text-neutral-700'}`}>{m.hint}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Tunnel guide */}
            <div className="border border-neutral-800 rounded-md overflow-hidden">
                <button
                    onClick={() => setShowTunnelGuide(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-900 transition-colors"
                >
                    <span className="text-xs font-mono text-neutral-500 flex items-center gap-2">
                        <ExternalLink size={12} />
                        ¿Cómo exponer Ollama al backend en HuggingFace?
                    </span>
                    {showTunnelGuide ? <ChevronUp size={12} className="text-neutral-600" /> : <ChevronDown size={12} className="text-neutral-600" />}
                </button>
                {showTunnelGuide && (
                    <div className="px-3 pb-3 pt-1 bg-neutral-950/50 flex flex-col gap-2 border-t border-neutral-800">
                        <p className="text-xs font-mono text-neutral-500 leading-relaxed">
                            El backend en HuggingFace no puede alcanzar <code className="text-neutral-300">localhost:11434</code>. Expón tu Ollama local con un túnel:
                        </p>
                        <ol className="flex flex-col gap-1">
                            {TUNNEL_CMDS.map(({ tool, cmd }) => (
                                <li key={tool} className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-neutral-600 w-20 shrink-0">{tool}</span>
                                    <code className="flex-1 text-xs font-mono text-neutral-300 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 truncate">
                                        {cmd}
                                    </code>
                                    <button
                                        onClick={() => copyCmd(cmd)}
                                        className="text-neutral-600 hover:text-white transition-colors shrink-0"
                                        title="Copiar"
                                    >
                                        {copiedCmd === cmd ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    </button>
                                </li>
                            ))}
                        </ol>
                        <p className="text-xs font-mono text-neutral-600 leading-relaxed">
                            Pega la URL pública que genera el túnel en el campo URL de arriba. Asegúrate también de iniciar Ollama con <code className="text-neutral-400">OLLAMA_ORIGINS=* ollama serve</code>.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OCRTool() {
    const stored = loadStoredConfig();

    const [file, setFile] = useState(null);
    const [mode, setMode] = useState('text');
    const [outputFormat, setOutputFormat] = useState('txt');
    const [schemaType, setSchemaType] = useState('general');
    const [instructions, setInstructions] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Ollama config
    const [useOllama, setUseOllama] = useState(stored?.useOllama ?? false);
    const [ollamaConfig, setOllamaConfig] = useState({
        url: stored?.url ?? '',
        model: stored?.model ?? 'llava:latest',
    });
    const [showSettings, setShowSettings] = useState(false);

    const fileInputRef = useRef(null);

    // Persist Ollama config whenever it changes
    useEffect(() => {
        saveConfig({ useOllama, ...ollamaConfig });
    }, [useOllama, ollamaConfig]);

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

            // Inject Ollama overrides if enabled
            if (useOllama && ollamaConfig.url.trim() && ollamaConfig.model.trim()) {
                form.append('ollama_url', ollamaConfig.url.trim());
                form.append('ollama_model', ollamaConfig.model.trim());
            }

            let url;
            if (mode === 'text') {
                form.append('output_format', outputFormat);
                url = `${API_BASE}/tools/ocr-extract`;
            } else {
                form.append('schema_type', schemaType);
                if (instructions.trim()) form.append('instructions', instructions.trim());
                url = `${API_BASE}/tools/ocr-extract-structured`;
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

    const ollamaReady = useOllama && ollamaConfig.url.trim() && ollamaConfig.model.trim();

    return (
        <DashboardLayout>
            <div className="p-6 h-full flex flex-col gap-4 max-w-5xl mx-auto w-full">

                {/* ── Header ── */}
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <ScanLine size={20} className="text-white" />
                            <h1 className="text-xl font-bold tracking-tight text-white font-mono">OCR</h1>
                        </div>
                        <p className="text-sm text-neutral-500 font-mono">
                            Extracción de texto e información estructurada desde PDFs e imágenes
                        </p>
                    </div>

                    {/* Settings toggle */}
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono transition-all
                            ${showSettings
                                ? 'bg-neutral-800 border-neutral-600 text-white'
                                : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-600'
                            }`}
                    >
                        <Settings size={13} />
                        Motor OCR
                        {useOllama && ollamaReady
                            ? <span className="flex items-center gap-1 text-emerald-400"><Wifi size={11} />Ollama</span>
                            : <span className="flex items-center gap-1 text-neutral-500"><Cpu size={11} />RapidOCR</span>
                        }
                    </button>
                </div>

                {/* ── Settings panel (collapsible) ── */}
                {showSettings && (
                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">Motor OCR</span>
                        </div>

                        {/* Backend selector */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setUseOllama(false)}
                                className={`flex items-center gap-2 px-4 py-2 rounded border text-sm font-mono transition-all
                                    ${!useOllama
                                        ? 'bg-white text-black border-white font-semibold'
                                        : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-500'
                                    }`}
                            >
                                <Cpu size={14} />
                                RapidOCR Local
                            </button>
                            <button
                                onClick={() => setUseOllama(true)}
                                className={`flex items-center gap-2 px-4 py-2 rounded border text-sm font-mono transition-all
                                    ${useOllama
                                        ? 'bg-white text-black border-white font-semibold'
                                        : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-500'
                                    }`}
                            >
                                <Wifi size={14} />
                                Ollama (visión)
                            </button>
                        </div>

                        {!useOllama && (
                            <div className="flex items-start gap-2 text-neutral-600 text-xs font-mono bg-neutral-950/40 border border-neutral-800 rounded p-3">
                                <Info size={12} className="mt-0.5 shrink-0" />
                                <span>
                                    <strong className="text-neutral-400">RapidOCR</strong> corre directamente en el servidor de HuggingFace — sin configuración extra.
                                    Usa regex para la extracción estructurada; funciona bien en documentos en inglés/español con texto impreso claro.
                                </span>
                            </div>
                        )}

                        {useOllama && (
                            <>
                                <div className="flex items-start gap-2 text-neutral-500 text-xs font-mono bg-neutral-950/40 border border-amber-900/40 rounded p-3">
                                    <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
                                    <span>
                                        <strong className="text-amber-400">Ollama</strong> necesita un modelo de visión (<code className="text-neutral-300">llava</code>, <code className="text-neutral-300">moondream</code>…)
                                        corriendo en un servidor accesible desde internet. El backend en HuggingFace no puede usar <code className="text-neutral-300">localhost</code>.
                                    </span>
                                </div>
                                <OllamaConfigPanel
                                    config={ollamaConfig}
                                    onChange={setOllamaConfig}
                                />
                            </>
                        )}
                    </div>
                )}

                {/* ── Mode toggle ── */}
                <div className="flex gap-2">
                    {[
                        { value: 'text', icon: FileText, label: 'EXTRAER TEXTO' },
                        { value: 'structured', icon: Code2, label: 'EXTRAER JSON' },
                    ].map(({ value, icon: Icon, label }) => (
                        <button
                            key={value}
                            onClick={() => { setMode(value); setResult(null); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-mono font-medium transition-all
                                ${mode === value
                                    ? 'bg-white text-black shadow-sm'
                                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600'
                                }`}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Two-panel workspace ── */}
                <div className="flex gap-5 flex-1 min-h-0">

                    {/* ── Left: Upload + Config ── */}
                    <div className="flex flex-col gap-3 w-72 flex-shrink-0">

                        <Dropzone
                            file={file}
                            isDragging={isDragging}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onClear={clearFile}
                            fileInputRef={fileInputRef}
                            onChange={handleFileSelect}
                        />

                        {mode === 'text' ? (
                            <div>
                                <SectionLabel>Formato de salida</SectionLabel>
                                <div className="flex gap-2">
                                    {OUTPUT_FORMATS.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setOutputFormat(f.value)}
                                            className={`flex-1 py-2 px-3 rounded border text-sm font-mono transition-all
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
                            <div className="flex flex-col gap-2.5">
                                <div>
                                    <SectionLabel>Plantilla estructurada</SectionLabel>
                                    <div className="flex flex-col gap-1.5">
                                        {SCHEMA_OPTIONS.map(({ value, label, Icon, desc }) => (
                                            <button
                                                key={value}
                                                onClick={() => setSchemaType(value)}
                                                className={`flex items-start gap-3 p-2.5 rounded border text-left transition-all
                                                    ${schemaType === value
                                                        ? 'bg-white text-black border-white'
                                                        : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'
                                                    }`}
                                            >
                                                <Icon size={14} className="mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <div className="text-sm font-mono font-medium">{label}</div>
                                                    <div className={`text-xs mt-0.5 leading-snug ${schemaType === value ? 'text-neutral-600' : 'text-neutral-600'}`}>{desc}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <SectionLabel>Instrucciones adicionales (opcional)</SectionLabel>
                                    <textarea
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                        placeholder="Ej: Prioriza número de factura y total final."
                                        rows={3}
                                        className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs font-mono rounded px-3 py-2 resize-none focus:border-neutral-500 focus:outline-none placeholder:text-neutral-700 transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            onClick={execute}
                            disabled={!file || loading || (useOllama && !ollamaReady)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-md font-mono text-sm font-semibold transition-all
                                disabled:opacity-30 disabled:cursor-not-allowed
                                bg-white text-black hover:bg-neutral-100 active:scale-[0.98]"
                        >
                            {loading
                                ? <><Loader2 size={14} className="animate-spin" /> PROCESANDO…</>
                                : <><ScanLine size={14} /> {mode === 'text' ? 'EXTRAER TEXTO' : 'EXTRAER JSON'}</>
                            }
                        </button>

                        {useOllama && !ollamaReady && (
                            <p className="text-xs font-mono text-amber-500 flex items-center gap-1.5">
                                <AlertCircle size={11} />
                                Configura la URL y el modelo de Ollama primero
                            </p>
                        )}
                    </div>

                    {/* ── Right: Result ── */}
                    <div className="flex-1 min-h-0 bg-neutral-900/30 border border-neutral-800 rounded-lg flex flex-col overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between shrink-0">
                            <span className="text-xs font-mono text-neutral-600 uppercase tracking-widest">Resultado</span>
                            {result?.ok && (
                                <span className="text-xs font-mono text-emerald-500 flex items-center gap-1.5">
                                    <CheckCircle size={10} /> listo
                                </span>
                            )}
                            {result && !result.ok && (
                                <span className="text-xs font-mono text-red-500 flex items-center gap-1.5">
                                    <AlertCircle size={10} /> error
                                </span>
                            )}
                        </div>
                        <ResultPanel loading={loading} result={result} onDownload={downloadResult} />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
