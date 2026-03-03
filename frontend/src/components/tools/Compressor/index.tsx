import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { formatBytes } from '@/utils/formatBytes';
import { downloadBlob } from '@/utils/downloadBlob';
import {
    ChevronLeft,
    Download,
    Trash2,
    FileDown,
    Loader2,
    CheckCircle,
    AlertCircle,
    X,
    Sliders,
    RotateCcw,
    FileText,
    Archive,
    Info,
    Lock,
    RefreshCw,
    StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 50, scale: 0.9 }}
                        className={`flex items-center gap-3 px-5 py-4 rounded-lg border shadow-lg max-w-md ${
                            toast.type === 'error'
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : toast.type === 'success'
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                    >
                        {toast.type === 'error' && <AlertCircle size={22} />}
                        {toast.type === 'success' && <CheckCircle size={22} />}
                        {toast.type === 'info' && <Info size={22} />}
                        <span className="text-base font-mono flex-1">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-2 hover:bg-white/10 rounded transition-colors"
                        >
                            <X size={18} />
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
        <div className="w-full bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
            <motion.div
                className="h-full bg-blue-600"
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
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold cursor-default ${
                isGs
                    ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                    : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
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
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme flex">
            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* ============================================================ */}
            {/* SIDEBAR IZQUIERDO */}
            {/* ============================================================ */}
            <aside className="w-[380px] bg-[#0a0a0a] border-r border-[#333] flex flex-col h-screen sticky top-0 shrink-0">
                {/* Header */}
                <div className="p-6 border-b border-[#333]">
                    <div className="flex items-center gap-4">
                        <a
                            href="/"
                            className="text-[#666] hover:text-[#eee] transition-colors"
                            aria-label="Volver al inicio"
                        >
                            <ChevronLeft size={24} />
                        </a>
                        <h1 className="text-xl font-bold font-mono tracking-wide text-[#eee] uppercase">
                            PDF Compressor
                        </h1>
                    </div>
                    <p className="text-sm text-[#555] font-mono mt-3 leading-relaxed">
                        Reduce el tamaño de tus archivos PDF manteniendo la calidad del documento
                    </p>
                </div>

                {/* Contenido Scrolleable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* ================================================== */}
                    {/* SECCION: CONFIGURACION PDF */}
                    {/* ================================================== */}
                    <motion.div className="space-y-4">
                        <div className="flex items-center gap-3 text-[#888]">
                            <FileText size={20} />
                            <span className="text-base font-mono uppercase tracking-wider">Configuración PDF</span>
                        </div>

                        {/* Calidad PDF */}
                        <div>
                            <label className="block text-sm text-[#888] mb-2 font-mono">
                                Nivel de compresión
                            </label>
                            <select
                                value={options.pdfQuality}
                                onChange={(e) => setOptions({ ...options, pdfQuality: e.target.value as PDFQuality })}
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-base text-white font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                                aria-label="Nivel de compresión PDF"
                            >
                                {PDF_QUALITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label} - {opt.description}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Modo ZIP toggle (visible solo con 3+ archivos pendientes) */}
                        <AnimatePresence>
                            {pendingCount >= 3 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center justify-between px-4 py-3 bg-[#111] border border-[#222] rounded-lg"
                                >
                                    <div>
                                        <p className="text-sm font-mono text-[#ccc]">Modo ZIP</p>
                                        <p className="text-xs font-mono text-[#555] mt-0.5">
                                            Descarga todos en un .zip
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setZipMode(z => !z)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${zipMode ? 'bg-blue-600' : 'bg-[#333]'}`}
                                        aria-label={zipMode ? 'Desactivar modo ZIP' : 'Activar modo ZIP'}
                                    >
                                        <span
                                            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${zipMode ? 'left-7' : 'left-1'}`}
                                        />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                    </motion.div>

                    {/* Boton Reset */}
                    <button
                        onClick={handleResetOptions}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-dashed border-[#333] text-[#666] hover:text-white hover:border-[#555] rounded-lg text-base font-mono transition-all hover:bg-[#1a1a1a]"
                        aria-label="Restaurar valores por defecto"
                    >
                        <RotateCcw size={18} />
                        Restaurar Valores
                    </button>

                    {/* ================================================== */}
                    {/* ESTADISTICAS */}
                    {/* ================================================== */}
                    <AnimatePresence>
                        {files.length > 0 && (
                            <motion.div
                                className="space-y-4 pt-4 border-t border-[#222]"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <div className="flex items-center gap-3 text-[#888]">
                                    <Sliders size={20} />
                                    <span className="text-base font-mono uppercase tracking-wider">Resumen</span>
                                </div>

                                <div className="bg-[#111] border border-[#222] rounded-lg p-5 space-y-3">
                                    <div className="flex justify-between text-base font-mono">
                                        <span className="text-[#666]">Archivos PDF</span>
                                        <span className="text-white font-semibold">
                                            {files.length}
                                            {files.length >= MAX_FILES && (
                                                <span className="text-yellow-500 ml-1 text-xs">(máx)</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-base font-mono">
                                        <span className="text-[#666]">Procesados</span>
                                        <span className="text-green-500 font-semibold">{stats.processedCount}</span>
                                    </div>
                                    {stats.processedCount > 0 && (
                                        <>
                                            <div className="border-t border-[#222] pt-3 mt-3">
                                                <div className="flex justify-between text-base font-mono">
                                                    <span className="text-[#666]">Tamaño original</span>
                                                    <span className="text-white">{formatBytes(stats.totalOriginalSize)}</span>
                                                </div>
                                                <div className="flex justify-between text-base font-mono mt-2">
                                                    <span className="text-[#666]">Tamaño final</span>
                                                    <span className="text-white">{formatBytes(stats.totalCompressedSize)}</span>
                                                </div>
                                            </div>
                                            <div className="border-t border-[#222] pt-3 flex justify-between text-base font-mono">
                                                <span className="text-[#666]">Reducción total</span>
                                                <span className={`font-bold text-lg ${stats.percentageSaved > 0 ? 'text-green-500' : 'text-[#666]'}`}>
                                                    {stats.percentageSaved > 0 ? `-${stats.percentageSaved.toFixed(1)}%` : '0%'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ================================================== */}
                {/* FOOTER: BOTONES DE ACCION */}
                {/* ================================================== */}
                <div className="p-6 border-t border-[#333] space-y-3">
                    {/* Progress Bar durante procesamiento */}
                    {isProcessing && (
                        <div className="mb-4">
                            {processingProgress.total > 0 && (
                                <>
                                    <div className="flex justify-between text-sm text-[#888] font-mono mb-2">
                                        <span>Progreso</span>
                                        <span>{processingProgress.current} / {processingProgress.total}</span>
                                    </div>
                                    <ProgressBar current={processingProgress.current} total={processingProgress.total} />
                                </>
                            )}
                            {processingMessage && (
                                <p className="text-xs text-[#777] font-mono mt-2 truncate" title={processingMessage}>
                                    {processingMessage}
                                </p>
                            )}
                            {/* Cancel button */}
                            <button
                                onClick={handleCancelCompression}
                                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/40 text-red-400 hover:text-red-300 hover:border-red-400/60 rounded-lg font-mono text-sm transition-colors"
                                aria-label="Cancelar compresión"
                            >
                                <StopCircle size={16} />
                                Cancelar
                            </button>
                        </div>
                    )}

                    <motion.button
                        onClick={zipMode ? handleZipDownload : handleCompress}
                        disabled={isProcessing || pendingCount === 0}
                        whileHover={!isProcessing && pendingCount > 0 ? { scale: 1.02 } : {}}
                        whileTap={!isProcessing && pendingCount > 0 ? { scale: 0.98 } : {}}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-[#222] disabled:text-[#555] text-white rounded-lg font-mono text-lg font-semibold transition-colors disabled:cursor-not-allowed"
                        aria-label={isProcessing ? 'Comprimiendo archivos' : `Comprimir ${pendingCount} archivos pendientes`}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={22} className="animate-spin" />
                                {zipMode ? 'Creando ZIP...' : 'Comprimiendo...'}
                            </>
                        ) : (
                            <>
                                {zipMode ? <Archive size={22} /> : <Archive size={22} />}
                                {zipMode ? `ZIP (${pendingCount})` : `Comprimir (${pendingCount})`}
                            </>
                        )}
                    </motion.button>

                    <AnimatePresence>
                        {completedCount > 0 && !zipMode && (
                            <motion.button
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                onClick={handleDownloadAll}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white rounded-lg font-mono text-base font-semibold transition-colors"
                                aria-label={`Descargar ${completedCount} archivos`}
                            >
                                <FileDown size={22} />
                                Descargar {completedCount > 1 ? `Todo (${completedCount})` : ''}
                            </motion.button>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {files.length > 0 && (
                            <motion.button
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                onClick={handleClearAll}
                                disabled={isProcessing}
                                className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-red-500/30 text-red-500/80 hover:text-red-500 hover:border-red-500/50 hover:bg-red-500/5 disabled:opacity-50 rounded-lg font-mono text-base transition-colors"
                                aria-label="Limpiar todos los archivos"
                            >
                                <Trash2 size={20} />
                                Limpiar Todo
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </aside>

            {/* ============================================================ */}
            {/* AREA PRINCIPAL (DERECHA) */}
            {/* ============================================================ */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Drop Zone */}
                <div className="p-8 pb-6">
                    <motion.div
                        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${isDragActive
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-[#333] hover:border-[#444]'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        whileHover={!isDragActive ? { borderColor: '#444' } : {}}
                        role="button"
                        tabIndex={0}
                        aria-label="Área para soltar archivos PDF. Haz clic o arrastra archivos aquí."
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
                        <div className="flex flex-col items-center gap-5">
                            <motion.div
                                className={`p-5 rounded-full ${isDragActive ? 'bg-blue-500/20' : 'bg-[#1a1a1a]'}`}
                                animate={isDragActive ? { scale: [1, 1.1, 1] } : {}}
                                transition={{ duration: 0.3 }}
                            >
                                <FileText size={48} className={isDragActive ? 'text-blue-500' : 'text-[#555]'} />
                            </motion.div>
                            <div>
                                <p className="text-xl font-mono text-white mb-2">
                                    Arrastra archivos PDF o haz clic para seleccionar
                                </p>
                                <p className="text-base text-[#666] font-mono">
                                    Solo archivos PDF — máximo {MAX_FILES} archivos
                                </p>
                                <p className="text-sm text-[#555] font-mono mt-3">
                                    También puedes pegar archivos con Ctrl+V
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Lista de Archivos */}
                <div className="flex-1 overflow-y-auto px-8 pb-8">
                    <AnimatePresence mode="popLayout">
                        {files.length > 0 ? (
                            <div className="space-y-3">
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
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -100 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="bg-[#111] border border-[#222] rounded-xl p-5 flex items-center gap-5 group hover:border-[#333] transition-colors"
                                        >
                                            {/* Icon */}
                                            <div className="w-14 h-14 bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                                {f.isEncrypted
                                                    ? <Lock size={28} className="text-red-400" />
                                                    : <FileText size={32} className="text-red-500" />
                                                }
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-lg font-mono text-white truncate" title={f.originalName}>
                                                    {f.originalName}
                                                </p>
                                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                    <span className="text-base font-mono text-[#666]">
                                                        {formatBytes(f.originalSize)}
                                                    </span>
                                                    {f.status === 'completed' && f.compressedSize && (
                                                        <>
                                                            <span className="text-[#444] text-lg">→</span>
                                                            <span className="text-base font-mono text-green-500 font-semibold">
                                                                {formatBytes(f.compressedSize)}
                                                            </span>
                                                            {reduction > 0 && (
                                                                <motion.span
                                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    className="text-base font-mono text-green-400"
                                                                >
                                                                    (-{reduction.toFixed(1)}%)
                                                                </motion.span>
                                                            )}
                                                            {/* Processing time (2.2) */}
                                                            {f.processingTime !== undefined && (
                                                                <span className="text-xs font-mono text-[#555]">
                                                                    {f.processingTime}s
                                                                </span>
                                                            )}
                                                            {/* Method badge (2.1) */}
                                                            {f.compressionMethod && f.compressionMethod !== 'none' && (
                                                                <MethodBadge method={f.compressionMethod} />
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                {/* Status messages */}
                                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                                    {f.isEncrypted && (
                                                        <span className="text-sm font-mono text-red-400 flex items-center gap-1">
                                                            <Lock size={12} />
                                                            PDF protegido con contraseña. No se puede comprimir.
                                                        </span>
                                                    )}
                                                    {!f.isEncrypted && f.status === 'completed' && f.error && (
                                                        <span className="text-sm font-mono text-yellow-500">
                                                            {f.error}
                                                        </span>
                                                    )}
                                                    {f.status === 'error' && f.error && (
                                                        <span className="text-base font-mono text-red-400 truncate" title={f.error}>
                                                            {f.error}
                                                        </span>
                                                    )}
                                                    {/* Retry button (2.4) */}
                                                    {canRetry && (
                                                        <button
                                                            onClick={() => retryWithLowerQuality(f.id, currentQualityForRetry)}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-blue-400 border border-blue-500/30 hover:border-blue-400/60 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                            title="Reintentar con nivel de compresión inferior"
                                                        >
                                                            <RefreshCw size={11} />
                                                            Reintentar con nivel inferior
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status */}
                                            <div className="shrink-0">
                                                {f.status === 'pending' && (
                                                    <span className="text-sm font-mono text-[#666] px-4 py-2 bg-[#1a1a1a] rounded-lg">
                                                        Pendiente
                                                    </span>
                                                )}
                                                {f.status === 'processing' && (
                                                    <Loader2 size={24} className="text-blue-500 animate-spin" />
                                                )}
                                                {f.status === 'completed' && !f.isEncrypted && (
                                                    <CheckCircle size={24} className="text-green-500" />
                                                )}
                                                {f.status === 'completed' && f.isEncrypted && (
                                                    <Lock size={24} className="text-red-400" />
                                                )}
                                                {f.status === 'error' && (
                                                    <AlertCircle size={24} className="text-red-500" />
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="shrink-0 flex items-center gap-2">
                                                {f.status === 'completed' && f.compressedBlob && !f.isEncrypted && (
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => handleDownloadClick(f)}
                                                            className="p-3 hover:bg-[#222] rounded-lg transition-colors"
                                                            title="Descargar"
                                                            aria-label={`Descargar ${f.originalName}`}
                                                        >
                                                            <Download size={22} className="text-[#888] hover:text-white" />
                                                        </button>

                                                        {/* Download rename popover (2.3) */}
                                                        <AnimatePresence>
                                                            {isPopoverOpen && (
                                                                <motion.div
                                                                    ref={downloadPopoverRef}
                                                                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                                                    className="absolute right-0 top-full mt-2 z-30 bg-[#1a1a1a] border border-[#333] rounded-xl p-4 shadow-2xl w-72"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    <p className="text-xs text-[#666] font-mono mb-2">
                                                                        Nombre del archivo
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
                                                                        className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none mb-3"
                                                                        placeholder={f.originalName}
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={handlePopoverDownload}
                                                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-mono transition-colors"
                                                                        >
                                                                            <Download size={14} />
                                                                            Descargar
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setDownloadPopover(null)}
                                                                            className="px-3 py-2 bg-[#222] hover:bg-[#2a2a2a] text-[#888] rounded-lg text-sm font-mono transition-colors"
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
                                                    className="p-3 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar"
                                                    aria-label={`Eliminar ${f.originalName}`}
                                                >
                                                    <X size={22} className="text-[#666] hover:text-red-500" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center h-full text-center"
                            >
                                <motion.div
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <Archive size={72} className="text-[#222] mb-6" />
                                </motion.div>
                                <p className="text-[#555] font-mono text-xl">
                                    No hay archivos cargados
                                </p>
                                <p className="text-[#444] font-mono text-lg mt-2">
                                    Arrastra archivos PDF o usa el área de arriba
                                </p>
                                <p className="text-[#555] font-mono text-base mt-6">
                                    <kbd className="px-3 py-2 bg-[#1a1a1a] rounded border border-[#333] text-sm">Ctrl</kbd>
                                    {' + '}
                                    <kbd className="px-3 py-2 bg-[#1a1a1a] rounded border border-[#333] text-sm">V</kbd>
                                    {' para pegar'}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
