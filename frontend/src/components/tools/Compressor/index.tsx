import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { formatBytes } from '@/utils/formatBytes';
import { downloadBlob } from '@/utils/downloadBlob';
import {
    Download,
    Trash2,
    FileDown,
    Loader2,
    CheckCircle,
    AlertCircle,
    X,
    RotateCcw,
    FileText,
    Archive,
    Info,
    Lock,
    RefreshCw,
    StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../DashboardLayout';
import {
    CompressedFile,
    CompressionOptions,
    CompressionStats,
    PDFQuality,
    PDF_QUALITY_OPTIONS,
    DEFAULT_OPTIONS,
    Toast
} from './types';

// ============================================================================
// CONSTANTES Y UTILIDADES
// ============================================================================
const STORAGE_KEY = 'pdf-compressor-options-v1';
const DEBUG_STORAGE_KEY = 'compressor-debug';
const MAX_WARN_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const LOW_REDUCTION_THRESHOLD = 5;
const MAX_FILES = 20;
const ALLOWED_PDF_QUALITIES: readonly PDFQuality[] = ['ultra', 'aggressive', 'screen', 'ebook', 'printer', 'prepress'];

// Order from least to most aggressive (for retry logic)
const QUALITY_ORDER: PDFQuality[] = ['prepress', 'printer', 'ebook', 'screen', 'aggressive', 'ultra'];

function isDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
}

function debugLog(message: string, payload?: Record<string, unknown>): void {
    if (!isDebugEnabled()) return;
    if (payload) {
        console.log(`[compressor:debug] ${message}`, payload);
    } else {
        console.log(`[compressor:debug] ${message}`);
    }
}

async function isPdfBlob(blob: Blob): Promise<boolean> {
    if (blob.size < 5) return false;
    const signature = await blob.slice(0, 5).text();
    return signature === '%PDF-';
}

function buildCompressionErrorMessage(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : 'Error desconocido';

    if (rawMessage.includes('413')) {
        return 'Archivo demasiado grande. Intenta con un PDF menor o divídelo antes de comprimir.';
    }

    if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
        return 'No se pudo conectar al servidor. Verifica tu red o vuelve a intentar en unos segundos.';
    }

    if (rawMessage.includes('tipo de respuesta')) {
        return 'El servidor devolvió un formato inesperado. Reintenta y, si persiste, activa modo debug.';
    }

    if (rawMessage.includes('archivo PDF válido')) {
        return 'La respuesta no parece un PDF válido. Reintenta con otra calidad o revisa el archivo fuente.';
    }

    return rawMessage;
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// COMPONENTE: TOAST NOTIFICATION
// ============================================================================
function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
    return (
        <div className="fixed top-20 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 50, scale: 0.9 }}
                        className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-2xl backdrop-blur ${
                            toast.type === 'error'
                                ? 'border-red-500/20 bg-neutral-950/95 text-red-400'
                                : toast.type === 'success'
                                ? 'border-emerald-500/20 bg-neutral-950/95 text-emerald-500'
                                : 'border-neutral-700 bg-neutral-950/95 text-neutral-300'
                        }`}
                    >
                        {toast.type === 'error' && <AlertCircle size={16} />}
                        {toast.type === 'success' && <CheckCircle size={16} />}
                        {toast.type === 'info' && <Info size={16} />}
                        <span className="flex-1 text-sm font-mono leading-snug">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

// ============================================================================
// COMPONENTE: PROGRESS BAR
// ============================================================================
function ProgressBar({ current, total }: { current: number; total: number }) {
    const percentage = total > 0 ? (current / total) * 100 : 0;

    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <motion.div
                className="h-full bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
            />
        </div>
    );
}

// ============================================================================
// COMPONENTE: METHOD BADGE
// ============================================================================
function MethodBadge({ method }: { method: 'ghostscript' | 'pypdf' | 'none' }) {
    if (method === 'none') return null;
    const isGs = method === 'ghostscript';
    return (
        <span
            title={isGs ? 'Comprimido con Ghostscript' : 'Comprimido con pypdf (fallback)'}
            className={`inline-flex cursor-default items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] ${
                isGs
                    ? 'border-white/20 bg-white text-black'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
            }`}
        >
            {isGs ? 'GS' : 'pypdf'}
        </span>
    );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Compressor() {
    const [files, setFiles] = useState<CompressedFile[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    return { ...DEFAULT_OPTIONS, ...JSON.parse(saved) };
                } catch {
                    return DEFAULT_OPTIONS;
                }
            }
        }
        return DEFAULT_OPTIONS;
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
    const [processingMessage, setProcessingMessage] = useState('');
    const [zipMode, setZipMode] = useState(false);
    const [downloadPopover, setDownloadPopover] = useState<{ fileId: string; name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const downloadPopoverRef = useRef<HTMLDivElement>(null);

    const API_BASE = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    }, [options]);

    // Close download popover on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (downloadPopoverRef.current && !downloadPopoverRef.current.contains(e.target as Node)) {
                setDownloadPopover(null);
            }
        };
        if (downloadPopover) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [downloadPopover]);

    // ============================================================================
    // TOAST HELPERS
    // ============================================================================
    const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 4000) => {
        const id = generateId();
        setToasts(prev => [...prev, { id, message, type }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ============================================================================
    // ESTADISTICAS OPTIMIZADAS
    // ============================================================================
    const stats: CompressionStats = useMemo(() => {
        const completed = files.filter(f => f.status === 'completed');
        const totalOriginalSize = completed.reduce((acc, f) => acc + f.originalSize, 0);
        const totalCompressedSize = completed.reduce((acc, f) => acc + (f.compressedSize || f.originalSize), 0);
        const totalSaved = totalOriginalSize - totalCompressedSize;
        const percentageSaved = totalOriginalSize > 0 ? (totalSaved / totalOriginalSize) * 100 : 0;

        return {
            totalOriginalSize,
            totalCompressedSize,
            totalSaved,
            percentageSaved,
            processedCount: completed.length,
            totalCount: files.length,
        };
    }, [files]);

    // ============================================================================
    // HANDLERS DE DRAG & DROP Y PEGAR
    // ============================================================================
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const processFiles = useCallback(async (inputFiles: FileList | File[] | null) => {
        if (!inputFiles || inputFiles.length === 0) return;

        const fileArray = Array.from(inputFiles);
        const currentCount = files.length;
        const availableSlots = MAX_FILES - currentCount;

        if (availableSlots <= 0) {
            addToast(`Límite de ${MAX_FILES} archivos alcanzado. Elimina algunos antes de agregar más.`, 'error', 5000);
            return;
        }

        const validFiles: File[] = [];
        const invalidFiles: string[] = [];
        const largeFiles: string[] = [];

        fileArray.forEach(file => {
            const ext = file.name.toLowerCase().split('.').pop() || '';
            if (ext === 'pdf') {
                validFiles.push(file);
                if (file.size > MAX_WARN_FILE_SIZE_BYTES) {
                    largeFiles.push(file.name);
                }
            } else {
                invalidFiles.push(file.name);
            }
        });

        if (invalidFiles.length > 0) {
            addToast(
                `Solo se admiten archivos PDF. ${invalidFiles.length} archivo(s) ignorado(s).`,
                'error',
                5000
            );
        }

        if (validFiles.length === 0) return;

        // Enforce MAX_FILES limit
        const filesToAdd = validFiles.slice(0, availableSlots);
        const discarded = validFiles.length - filesToAdd.length;
        if (discarded > 0) {
            addToast(
                `Máximo ${MAX_FILES} archivos. Se descartaron ${discarded} archivo(s).`,
                'error',
                5000
            );
        }

        if (largeFiles.length > 0) {
            addToast(
                `Advertencia: ${largeFiles.length} PDF(s) superan 50MB. La compresión puede tardar más o fallar por límite del servidor.`,
                'info',
                6000
            );
        }

        const newFiles: CompressedFile[] = filesToAdd.map(file => ({
            id: generateId(),
            file,
            originalSize: file.size,
            status: 'pending',
            originalName: file.name,
        }));

        setFiles(prev => [...prev, ...newFiles]);
        addToast(`${filesToAdd.length} PDF(s) agregado(s)`, 'success', 2000);
    }, [addToast, files.length]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, [processFiles]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
        e.target.value = '';
    }, [processFiles]);

    // Soporte para pegar archivos (Ctrl+V)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            const pastedFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file && file.name.toLowerCase().endsWith('.pdf')) {
                        pastedFiles.push(file);
                    }
                }
            }

            if (pastedFiles.length > 0) {
                processFiles(pastedFiles);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processFiles]);

    // ============================================================================
    // CANCELACION
    // ============================================================================
    const handleCancelCompression = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    // ============================================================================
    // REINTENTO CON CALIDAD INFERIOR
    // ============================================================================
    const retryWithLowerQuality = useCallback((fileId: string, currentQuality: PDFQuality) => {
        const currentIndex = QUALITY_ORDER.indexOf(currentQuality);
        if (currentIndex === -1 || currentIndex >= QUALITY_ORDER.length - 1) {
            addToast('Ya está en el nivel máximo de compresión (ultra).', 'info', 3000);
            return;
        }
        const nextQuality = QUALITY_ORDER[currentIndex + 1];
        setFiles(prev => prev.map(f =>
            f.id === fileId
                ? {
                    ...f,
                    status: 'pending',
                    appliedQuality: nextQuality,
                    error: undefined,
                    compressedBlob: undefined,
                    compressedSize: undefined,
                    compressionMethod: undefined,
                    processingTime: undefined,
                }
                : f
        ));
        addToast(`Reintentando con calidad "${nextQuality}"...`, 'info', 2000);
    }, [addToast]);

    // ============================================================================
    // PROCESO DE COMPRESION (modo secuencial / por archivo)
    // ============================================================================
    const handleCompress = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0 || isProcessing) return;

        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: pendingFiles.length });
        setProcessingMessage('Iniciando compresión...');

        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, status: 'processing' } : f
        ));

        let successCount = 0;
        let errorCount = 0;
        let unchangedCount = 0;
        let lowReductionCount = 0;

        const validatedQuality: PDFQuality = ALLOWED_PDF_QUALITIES.includes(options.pdfQuality)
            ? options.pdfQuality
            : 'aggressive';

        if (validatedQuality !== options.pdfQuality) {
            addToast('Calidad inválida detectada en configuración guardada. Se usará "aggressive".', 'info', 5000);
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const { signal } = abortController;

        for (let i = 0; i < pendingFiles.length; i++) {
            if (signal.aborted) {
                // Reset remaining unprocessed files to pending
                const remainingIds = new Set(pendingFiles.slice(i).map(f => f.id));
                setFiles(prev => prev.map(f =>
                    remainingIds.has(f.id) ? { ...f, status: 'pending' } : f
                ));
                break;
            }

            const fileItem = pendingFiles[i];
            // Use per-file quality override if set (from retry), otherwise global setting
            const fileQuality: PDFQuality = fileItem.appliedQuality || validatedQuality;

            setProcessingProgress({ current: i + 1, total: pendingFiles.length });
            setProcessingMessage(`Procesando ${fileItem.originalName}...`);

            const fetchStart = Date.now();

            try {
                const formData = new FormData();
                formData.append('file', fileItem.file);
                formData.append('pdf_quality', fileQuality);

                debugLog('Enviando solicitud de compresión', {
                    file: fileItem.originalName,
                    size: fileItem.originalSize,
                    pdf_quality: fileQuality,
                    endpoint: `${API_BASE}/compressor/compress-single`,
                });

                const response = await fetch(`${API_BASE}/compressor/compress-single`, {
                    method: 'POST',
                    body: formData,
                    signal,
                });

                if (!response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    let errorText = '';

                    if (contentType.includes('application/json')) {
                        const errorJson = await response.json();
                        errorText = typeof errorJson?.detail === 'string'
                            ? errorJson.detail
                            : JSON.stringify(errorJson);
                    } else {
                        errorText = await response.text();
                    }

                    throw new Error(errorText || `Error ${response.status}`);
                }

                const responseType = response.headers.get('content-type') || '';
                if (!responseType.includes('application/pdf') && !responseType.includes('application/octet-stream')) {
                    debugLog('Content-Type inesperado en respuesta', { responseType, file: fileItem.originalName });
                    throw new Error(`El servidor devolvió un tipo de respuesta inesperado: ${responseType || 'desconocido'}`);
                }

                const compressedBlob = await response.blob();
                const isValidPdf = await isPdfBlob(compressedBlob);
                if (!isValidPdf) {
                    throw new Error('La respuesta del servidor no contiene un archivo PDF válido.');
                }

                // Read response headers
                const headerOriginal = response.headers.get('X-Original-Size');
                const headerCompressed = response.headers.get('X-Compressed-Size');
                const originalSize = parseInt(headerOriginal || '0', 10) || fileItem.originalSize;
                const compressedSize = parseInt(headerCompressed || '0', 10) || compressedBlob.size;
                const rawErrorHeader = response.headers.get('X-Error');
                const errorHeader = rawErrorHeader ? decodeURIComponent(rawErrorHeader) : null;
                const missingHeaders = !headerOriginal || !headerCompressed;

                // X-Compression-Method header (2.1)
                const compressionMethodRaw = response.headers.get('X-Compression-Method') || 'none';
                const compressionMethod = (['ghostscript', 'pypdf', 'none'].includes(compressionMethodRaw)
                    ? compressionMethodRaw
                    : 'none') as 'ghostscript' | 'pypdf' | 'none';

                // X-Processing-Time header (2.2) — fall back to client-side measurement
                const serverTime = response.headers.get('X-Processing-Time');
                const processingTime = serverTime
                    ? parseFloat(serverTime)
                    : parseFloat(((Date.now() - fetchStart) / 1000).toFixed(1));

                // Detect encrypted PDF from error header
                const isEncrypted = errorHeader?.toLowerCase().includes('protegido') ||
                    errorHeader?.toLowerCase().includes('encrypted') || false;

                if (missingHeaders) {
                    debugLog('Headers esperados faltantes, usando fallback', {
                        file: fileItem.originalName,
                        headerOriginal,
                        headerCompressed,
                    });
                }

                const reductionPercent = originalSize > 0
                    ? ((originalSize - compressedSize) / originalSize) * 100
                    : 0;
                const isActuallyCompressed = compressedSize < originalSize;
                const lowReduction = isActuallyCompressed && reductionPercent > 0 && reductionPercent < LOW_REDUCTION_THRESHOLD;

                let fileWarning: string | undefined;
                if (isEncrypted) {
                    fileWarning = errorHeader || 'PDF protegido: no se puede comprimir';
                } else if (errorHeader) {
                    fileWarning = errorHeader;
                } else if (!isActuallyCompressed) {
                    fileWarning = 'Sin reducción (archivo ya optimizado o compresión no efectiva).';
                    unchangedCount++;
                } else if (lowReduction) {
                    fileWarning = `Reducción baja (${reductionPercent.toFixed(1)}%). Prueba calidad más agresiva.`;
                    lowReductionCount++;
                }

                debugLog('Resultado de compresión', {
                    file: fileItem.originalName,
                    originalSize,
                    compressedSize,
                    reductionPercent: Number(reductionPercent.toFixed(1)),
                    isActuallyCompressed,
                    compressionMethod,
                    processingTime,
                    errorHeader,
                });

                setProcessingMessage(
                    `${fileItem.originalName}: ${isActuallyCompressed ? `-${reductionPercent.toFixed(1)}%` : 'sin reducción'}`
                );

                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id
                        ? {
                            ...f,
                            status: 'completed',
                            compressedBlob,
                            compressedSize,
                            error: fileWarning,
                            compressionMethod,
                            processingTime,
                            isEncrypted,
                            appliedQuality: fileQuality,
                        }
                        : f
                ));

                if (isActuallyCompressed && !errorHeader) {
                    successCount++;
                }

            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    // Abort caught inside the loop — reset remaining files
                    const remainingIds = new Set(pendingFiles.slice(i).map(f => f.id));
                    setFiles(prev => prev.map(f =>
                        remainingIds.has(f.id) ? { ...f, status: 'pending' } : f
                    ));
                    addToast('Compresión cancelada.', 'info', 3000);
                    break;
                }

                const userErrorMessage = buildCompressionErrorMessage(error);
                debugLog('Error durante compresión', {
                    file: fileItem.originalName,
                    raw: error instanceof Error ? error.message : String(error),
                    userMessage: userErrorMessage,
                });
                errorCount++;
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id
                        ? {
                            ...f,
                            status: 'error',
                            error: userErrorMessage,
                        }
                        : f
                ));

                setProcessingMessage(`${fileItem.originalName}: error`);
            }
        }

        setIsProcessing(false);
        abortControllerRef.current = null;
        setProcessingProgress({ current: 0, total: 0 });
        setProcessingMessage('');

        if (successCount > 0 && errorCount === 0 && unchangedCount === 0 && lowReductionCount === 0) {
            addToast(`¡${successCount} PDF(s) comprimido(s) exitosamente!`, 'success');
        } else if (successCount > 0 && (errorCount > 0 || unchangedCount > 0 || lowReductionCount > 0)) {
            addToast(
                `${successCount} comprimido(s), ${unchangedCount} sin reducción, ${lowReductionCount} con reducción baja, ${errorCount} error(es).`,
                'info',
                6000
            );
        } else if (unchangedCount > 0 && errorCount === 0) {
            addToast(
                `Se procesaron ${unchangedCount} PDF(s), pero no hubo reducción real. Prueba otra calidad o divide el archivo.`,
                'info',
                6000
            );
        } else if (errorCount > 0) {
            addToast(
                `Error al comprimir ${errorCount} PDF(s). Revisa conexión, tamaño del archivo y vuelve a intentar.`,
                'error',
                7000
            );
        }
    };

    // ============================================================================
    // PROCESO DE COMPRESION (modo ZIP)
    // ============================================================================
    const handleZipDownload = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0 || isProcessing) return;

        setIsProcessing(true);
        setProcessingMessage('Comprimiendo y creando ZIP...');

        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, status: 'processing' } : f
        ));

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const formData = new FormData();
            pendingFiles.forEach(f => formData.append('files', f.file));
            formData.append('pdf_quality', options.pdfQuality);

            const response = await fetch(`${API_BASE}/compressor/compress`, {
                method: 'POST',
                body: formData,
                signal: abortController.signal,
            });

            if (!response.ok) {
                const errorJson = await response.json().catch(() => null);
                throw new Error(errorJson?.detail || `Error ${response.status}`);
            }

            const blob = await response.blob();
            downloadBlob(blob, 'pdfs_comprimidos.zip');

            // Mark all as completed (without individual stats — ZIP mode)
            setFiles(prev => prev.map(f =>
                pendingFiles.find(p => p.id === f.id)
                    ? { ...f, status: 'completed', compressionMethod: undefined }
                    : f
            ));

            addToast(`ZIP descargado: ${pendingFiles.length} PDFs comprimidos`, 'success');
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                setFiles(prev => prev.map(f =>
                    pendingFiles.find(p => p.id === f.id) ? { ...f, status: 'pending' } : f
                ));
                addToast('Descarga ZIP cancelada.', 'info', 3000);
            } else {
                setFiles(prev => prev.map(f =>
                    pendingFiles.find(p => p.id === f.id)
                        ? { ...f, status: 'error', error: 'Error al comprimir' }
                        : f
                ));
                addToast('Error al crear el ZIP. Intenta el modo individual.', 'error', 5000);
            }
        } finally {
            setIsProcessing(false);
            abortControllerRef.current = null;
            setProcessingMessage('');
        }
    };

    // ============================================================================
    // HANDLERS DE DESCARGA
    // ============================================================================
    const handleDownloadSingle = useCallback((f: CompressedFile, customName?: string) => {
        if (!f.compressedBlob) return;
        const name = customName?.trim() || f.originalName;
        downloadBlob(f.compressedBlob, name);
        addToast(`Descargado: ${name}`, 'success', 2000);
    }, [addToast]);

    const handleDownloadClick = useCallback((f: CompressedFile) => {
        // If there's only one completed file, download immediately
        const completedCount = files.filter(cf => cf.status === 'completed' && cf.compressedBlob).length;
        if (completedCount <= 1) {
            handleDownloadSingle(f);
            return;
        }
        // Otherwise open the rename popover
        setDownloadPopover({ fileId: f.id, name: f.originalName });
    }, [files, handleDownloadSingle]);

    const handlePopoverDownload = useCallback(() => {
        if (!downloadPopover) return;
        const f = files.find(cf => cf.id === downloadPopover.fileId);
        if (f) {
            handleDownloadSingle(f, downloadPopover.name);
        }
        setDownloadPopover(null);
    }, [downloadPopover, files, handleDownloadSingle]);

    const handleDownloadAll = useCallback(async () => {
        const completedFiles = files.filter(f => f.status === 'completed' && f.compressedBlob);
        if (completedFiles.length === 0) return;

        if (completedFiles.length === 1) {
            handleDownloadSingle(completedFiles[0]);
            return;
        }

        completedFiles.forEach((f, index) => {
            setTimeout(() => handleDownloadSingle(f), index * 200);
        });

        addToast(`Descargando ${completedFiles.length} PDFs...`, 'info', 2000);
    }, [files, handleDownloadSingle, addToast]);

    // ============================================================================
    // HANDLERS DE GESTION
    // ============================================================================
    const handleRemoveFile = useCallback((id: string) => {
        setFiles(prev => prev.filter(item => item.id !== id));
    }, []);

    const handleClearAll = useCallback(() => {
        setFiles([]);
        setProcessingMessage('');
        addToast('Lista limpiada', 'info', 2000);
    }, [addToast]);

    const handleResetOptions = useCallback(() => {
        setOptions(DEFAULT_OPTIONS);
        addToast('Configuración restaurada', 'info', 2000);
    }, [addToast]);

    // ============================================================================
    // CALCULOS MEMOIZADOS
    // ============================================================================
    const completedCount = useMemo(() => files.filter(f => f.status === 'completed').length, [files]);
    const pendingCount = useMemo(() => files.filter(f => f.status === 'pending').length, [files]);

    // ============================================================================
    // RENDER
    // ============================================================================
    return (
        <DashboardLayout>
            <div className="h-full px-4 py-6 text-white md:px-8 xl:px-10">
                <ToastContainer toasts={toasts} removeToast={removeToast} />

                <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 pb-28">
                    <section className="rounded-[28px] border border-neutral-800 bg-neutral-950/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur md:p-5">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.55)]" />
                                        <h1 className="font-[DotGothic16] text-4xl tracking-tight text-white">
                                            PDF COMPRESSOR
                                        </h1>
                                    </div>
                                    <p className="max-w-2xl text-xs font-mono uppercase tracking-[0.22em] text-neutral-500">
                                        Compresion PDF monocroma, cola compacta y control fino por lote.
                                    </p>
                                </div>

                                <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
                                    <label className="flex min-w-[17rem] flex-1 items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 sm:flex-none">
                                        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
                                            Calidad
                                        </span>
                                        <select
                                            value={options.pdfQuality}
                                            onChange={(e) => setOptions({ ...options, pdfQuality: e.target.value as PDFQuality })}
                                            className="min-w-0 flex-1 bg-transparent text-sm font-mono text-white outline-none transition-colors focus:text-white"
                                            aria-label="Nivel de compresion PDF"
                                        >
                                            {PDF_QUALITY_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value} className="bg-neutral-950 text-white">
                                                    {opt.label} - {opt.description}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
                                                ZIP
                                            </p>
                                            <p className="text-xs font-mono text-neutral-300">
                                                {pendingCount >= 3 || zipMode ? 'Salida agrupada' : 'Disponible con 3+ PDF'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setZipMode(z => !z)}
                                            disabled={pendingCount < 3 && !zipMode}
                                            className={`relative h-6 w-11 rounded-full border transition-all ${
                                                zipMode
                                                    ? 'border-white bg-white'
                                                    : 'border-neutral-700 bg-neutral-950'
                                            } ${(pendingCount < 3 && !zipMode) ? 'cursor-not-allowed opacity-40' : ''}`}
                                            aria-label={zipMode ? 'Desactivar modo ZIP' : 'Activar modo ZIP'}
                                        >
                                            <span
                                                className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
                                                    zipMode ? 'left-[22px] bg-black' : 'left-[3px] bg-neutral-500'
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleResetOptions}
                                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
                                        aria-label="Restaurar valores por defecto"
                                        title="Restaurar valores"
                                    >
                                        <RotateCcw size={15} />
                                    </button>

                                    <div className="hidden h-7 w-px bg-neutral-800 xl:block" />

                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500 sm:gap-3">
                                        <span>
                                            {files.length}/{MAX_FILES} archivos
                                        </span>
                                        <span className="h-1 w-1 rounded-full bg-neutral-700" />
                                        <span>{pendingCount} pendientes</span>
                                        <span className="h-1 w-1 rounded-full bg-neutral-700" />
                                        <span className="text-emerald-500">{stats.processedCount} procesados</span>
                                        {stats.processedCount > 0 && (
                                            <>
                                                <span className="h-1 w-1 rounded-full bg-neutral-700" />
                                                <span className={stats.percentageSaved > 0 ? 'text-emerald-500' : 'text-neutral-500'}>
                                                    {stats.percentageSaved > 0 ? `-${stats.percentageSaved.toFixed(1)}% ahorro` : '0% ahorro'}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <motion.div
                                className={`flex cursor-pointer flex-col gap-3 rounded-2xl border border-dashed px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                                    isDragActive
                                        ? 'border-white/60 bg-neutral-800/80'
                                        : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500'
                                }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                whileHover={!isDragActive ? { borderColor: '#737373' } : {}}
                                role="button"
                                tabIndex={0}
                                aria-label="Area para soltar archivos PDF. Haz clic o arrastra archivos aqui."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        fileInputRef.current?.click();
                                    }
                                }}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    id="fileInput"
                                    multiple
                                    accept="application/pdf"
                                    onChange={handleFileInput}
                                    className="hidden"
                                    aria-label="Seleccionar archivos PDF"
                                />

                                <div className="flex min-w-0 items-center gap-3">
                                    <motion.div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                            isDragActive ? 'border-white/30 bg-white/10' : 'border-neutral-800 bg-neutral-950/80'
                                        }`}
                                        animate={isDragActive ? { scale: [1, 1.05, 1] } : {}}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <FileText size={18} className={isDragActive ? 'text-white' : 'text-neutral-400'} />
                                    </motion.div>

                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-mono text-white">
                                            Arrastra PDFs o haz clic para cargar la cola
                                        </p>
                                        <p className="mt-0.5 text-xs font-mono text-neutral-500">
                                            Solo PDF, maximo {MAX_FILES} archivos, tambien puedes pegar con Ctrl+V
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                                    <span className="rounded-full border border-neutral-700 px-2.5 py-1">Drop</span>
                                    <span className="rounded-full border border-neutral-700 px-2.5 py-1">Click</span>
                                </div>
                            </motion.div>
                        </div>
                    </section>

                    <section className="min-h-[18rem] flex-1 overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-950/60 backdrop-blur">
                        <AnimatePresence mode="popLayout">
                            {files.length > 0 ? (
                                <div className="h-full overflow-y-auto">
                                    <div className="divide-y divide-neutral-800/80">
                                        {files.map((f, index) => {
                                            const reduction = f.compressedSize && f.compressedSize < f.originalSize
                                                ? ((f.originalSize - f.compressedSize) / f.originalSize * 100)
                                                : 0;

                                            const canRetry = f.status === 'completed' &&
                                                !f.isEncrypted &&
                                                (reduction === 0 || (f.error && f.error.includes('optimizado')));

                                            const currentQualityForRetry: PDFQuality = f.appliedQuality || options.pdfQuality;
                                            const isPopoverOpen = downloadPopover?.fileId === f.id;

                                            return (
                                                <motion.div
                                                    key={f.id}
                                                    layout
                                                    initial={{ opacity: 0, y: 16 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, x: -60 }}
                                                    transition={{ delay: index * 0.02 }}
                                                    className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-neutral-900/45 sm:px-4"
                                                >
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/80">
                                                        {f.isEncrypted
                                                            ? <Lock size={14} className="text-red-400" />
                                                            : <FileText size={14} className="text-neutral-300" />
                                                        }
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            <p className="max-w-full truncate text-sm font-mono text-white" title={f.originalName}>
                                                                {f.originalName}
                                                            </p>
                                                            {f.status === 'completed' && f.compressedSize && reduction > 0 && (
                                                                <motion.span
                                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    className="text-xs font-mono text-emerald-500"
                                                                >
                                                                    -{reduction.toFixed(1)}%
                                                                </motion.span>
                                                            )}
                                                            {f.compressionMethod && f.compressionMethod !== 'none' && (
                                                                <MethodBadge method={f.compressionMethod} />
                                                            )}
                                                        </div>

                                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-neutral-500">
                                                            <span>{formatBytes(f.originalSize)}</span>
                                                            {f.status === 'completed' && f.compressedSize && (
                                                                <>
                                                                    <span className="text-neutral-700">-&gt;</span>
                                                                    <span className={reduction > 0 ? 'text-emerald-500' : 'text-neutral-300'}>
                                                                        {formatBytes(f.compressedSize)}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {f.processingTime !== undefined && (
                                                                <span>{f.processingTime}s</span>
                                                            )}
                                                        </div>

                                                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-mono">
                                                            {f.isEncrypted && (
                                                                <span className="flex items-center gap-1 text-red-400">
                                                                    <Lock size={12} />
                                                                    PDF protegido con contrasena. No se puede comprimir.
                                                                </span>
                                                            )}
                                                            {!f.isEncrypted && f.status === 'completed' && f.error && (
                                                                <span className="text-amber-400">
                                                                    {f.error}
                                                                </span>
                                                            )}
                                                            {f.status === 'error' && f.error && (
                                                                <span className="truncate text-red-400" title={f.error}>
                                                                    {f.error}
                                                                </span>
                                                            )}
                                                            {canRetry && (
                                                                <button
                                                                    onClick={() => retryWithLowerQuality(f.id, currentQualityForRetry)}
                                                                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/80 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-white/40 hover:text-white"
                                                                    title="Reintentar con nivel de compresion inferior"
                                                                >
                                                                    <RefreshCw size={11} />
                                                                    Nivel inferior
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="hidden shrink-0 sm:block">
                                                        {f.status === 'pending' && (
                                                            <span className="rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                                                                Pendiente
                                                            </span>
                                                        )}
                                                        {f.status === 'processing' && (
                                                            <Loader2 size={16} className="animate-spin text-white" />
                                                        )}
                                                        {f.status === 'completed' && !f.isEncrypted && (
                                                            <CheckCircle size={16} className="text-emerald-500" />
                                                        )}
                                                        {f.status === 'completed' && f.isEncrypted && (
                                                            <Lock size={16} className="text-red-400" />
                                                        )}
                                                        {f.status === 'error' && (
                                                            <AlertCircle size={16} className="text-red-500" />
                                                        )}
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-1">
                                                        {f.status === 'completed' && f.compressedBlob && !f.isEncrypted && (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => handleDownloadClick(f)}
                                                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
                                                                    title="Descargar"
                                                                    aria-label={`Descargar ${f.originalName}`}
                                                                >
                                                                    <Download size={14} />
                                                                </button>

                                                                <AnimatePresence>
                                                                    {isPopoverOpen && (
                                                                        <motion.div
                                                                            ref={downloadPopoverRef}
                                                                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                                                            className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
                                                                            onClick={e => e.stopPropagation()}
                                                                        >
                                                                            <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                                                                                Nombre de salida
                                                                            </p>
                                                                            <input
                                                                                autoFocus
                                                                                type="text"
                                                                                value={downloadPopover.name}
                                                                                onChange={e => setDownloadPopover(p => p ? { ...p, name: e.target.value } : null)}
                                                                                onKeyDown={e => {
                                                                                    if (e.key === 'Enter') handlePopoverDownload();
                                                                                    if (e.key === 'Escape') setDownloadPopover(null);
                                                                                }}
                                                                                className="mb-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-mono text-white outline-none transition-colors focus:border-neutral-600"
                                                                                placeholder={f.originalName}
                                                                            />
                                                                            <div className="flex gap-2">
                                                                                <button
                                                                                    onClick={handlePopoverDownload}
                                                                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-mono text-black transition-colors hover:bg-neutral-200"
                                                                                >
                                                                                    <Download size={14} />
                                                                                    Descargar
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setDownloadPopover(null)}
                                                                                    className="rounded-xl border border-neutral-800 px-3 py-2 text-sm font-mono text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
                                                                                >
                                                                                    Cancelar
                                                                                </button>
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        )}

                                                        <button
                                                            onClick={() => handleRemoveFile(f.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-neutral-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                                                            title="Eliminar"
                                                            aria-label={`Eliminar ${f.originalName}`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex h-full flex-col items-center justify-center px-6 text-center"
                                >
                                    <motion.div
                                        animate={{ y: [0, -4, 0] }}
                                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                                        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/80"
                                    >
                                        <Archive size={24} className="text-neutral-500" />
                                    </motion.div>
                                    <p className="font-mono text-sm uppercase tracking-[0.2em] text-neutral-400">
                                        No hay PDFs en cola
                                    </p>
                                    <p className="mt-2 max-w-md text-sm font-mono text-neutral-600">
                                        Usa la barra superior para arrastrar, hacer clic, o pegar archivos PDF.
                                    </p>
                                    <p className="mt-5 flex items-center gap-2 text-xs font-mono text-neutral-500">
                                        <kbd className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">Ctrl</kbd>
                                        <span>+</span>
                                        <kbd className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">V</kbd>
                                        <span>para pegar</span>
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </section>

                    <section className="sticky bottom-0">
                        <div className="rounded-[26px] border border-neutral-800 bg-black/85 px-4 py-3 shadow-[0_-16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={handleDownloadAll}
                                            disabled={!files.some(f => f.status === 'completed' && f.compressedBlob) || isProcessing}
                                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-2 text-sm font-mono text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                            aria-label={`Descargar ${completedCount} archivos`}
                                        >
                                            <FileDown size={14} />
                                            Descargar todo
                                        </button>

                                        <button
                                            onClick={handleClearAll}
                                            disabled={files.length === 0 || isProcessing}
                                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-2 text-sm font-mono text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                            aria-label="Limpiar todos los archivos"
                                        >
                                            <Trash2 size={14} />
                                            Limpiar
                                        </button>
                                        <AnimatePresence>
                                            {isProcessing && (
                                                <motion.button
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 6 }}
                                                    onClick={handleCancelCompression}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-sm font-mono text-red-400 transition-colors hover:border-red-400/40 hover:text-red-300"
                                                    aria-label="Cancelar compresion"
                                                >
                                                    <StopCircle size={14} />
                                                    Cancelar
                                                </motion.button>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="min-w-0 flex-1 xl:min-w-[20rem]">
                                        {isProcessing ? (
                                            <div className="space-y-2">
                                                {processingProgress.total > 0 && (
                                                    <>
                                                        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                                                            <span>Progreso</span>
                                                            <span>{processingProgress.current} / {processingProgress.total}</span>
                                                        </div>
                                                        <ProgressBar current={processingProgress.current} total={processingProgress.total} />
                                                    </>
                                                )}
                                                {processingMessage && (
                                                    <p className="truncate text-xs font-mono text-neutral-400" title={processingMessage}>
                                                        {processingMessage}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs font-mono uppercase tracking-[0.18em] text-neutral-500">
                                                {zipMode
                                                    ? 'Modo ZIP listo para el siguiente lote.'
                                                    : pendingCount > 0
                                                        ? `${pendingCount} PDF(s) listos en cola.`
                                                        : 'Carga PDFs para habilitar la compresion.'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <motion.button
                                    onClick={zipMode ? handleZipDownload : handleCompress}
                                    disabled={isProcessing || pendingCount === 0}
                                    whileHover={!isProcessing && pendingCount > 0 ? { scale: 1.01 } : {}}
                                    whileTap={!isProcessing && pendingCount > 0 ? { scale: 0.99 } : {}}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-[DotGothic16] uppercase tracking-[0.2em] text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 xl:w-auto xl:min-w-[15rem]"
                                    aria-label={isProcessing ? 'Comprimiendo archivos' : `Comprimir ${pendingCount} archivos pendientes`}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            {zipMode ? 'Creando ZIP' : 'Comprimiendo'}
                                        </>
                                    ) : (
                                        <>
                                            <Archive size={16} />
                                            {zipMode ? `Comprimir ZIP (${pendingCount})` : `Comprimir (${pendingCount})`}
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </DashboardLayout>
    );


}
