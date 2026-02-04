import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    ChevronLeft,
    Upload,
    Download,
    Trash2,
    FileDown,
    Loader2,
    CheckCircle,
    AlertCircle,
    X,
    Sliders,
    RotateCcw,
    FileImage,
    FileText,
    Archive,
    Info,
    Eye,
    Settings2
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
const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'pdf'];
const STORAGE_KEY = 'compressor-options-v1';

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileType(filename: string): 'image' | 'pdf' | 'unknown' {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)) {
        return 'image';
    }
    if (ext === 'pdf') {
        return 'pdf';
    }
    return 'unknown';
}

function getFileIcon(type: 'image' | 'pdf' | 'unknown') {
    switch (type) {
        case 'image':
            return FileImage;
        case 'pdf':
            return FileText;
        default:
            return Archive;
    }
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
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-sm ${
                            toast.type === 'error'
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : toast.type === 'success'
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                    >
                        {toast.type === 'error' && <AlertCircle size={18} />}
                        {toast.type === 'success' && <CheckCircle size={18} />}
                        {toast.type === 'info' && <Info size={18} />}
                        <span className="text-sm font-mono flex-1">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
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
// COMPONENTE: MODAL DE PREVIEW
// ============================================================================
function ImagePreviewModal({
    src,
    filename,
    onClose
}: {
    src: string;
    filename: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="relative max-w-4xl max-h-full"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt={filename}
                    className="max-w-full max-h-[85vh] object-contain rounded-lg"
                />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
                    <p className="text-white font-mono text-sm">{filename}</p>
                </div>
                <button
                    onClick={onClose}
                    className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </motion.div>
        </motion.div>
    );
}

// ============================================================================
// COMPONENTE: PROGRESS BAR
// ============================================================================
function ProgressBar({ current, total }: { current: number; total: number }) {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    
    return (
        <div className="w-full bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
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
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Compressor() {
    const [files, setFiles] = useState<CompressedFile[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(() => {
        // Cargar opciones guardadas
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
    const [previewImage, setPreviewImage] = useState<{ src: string; filename: string } | null>(null);
    const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const API_BASE = import.meta.env.VITE_API_URL || '/api';

    // Guardar opciones cuando cambien
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    }, [options]);

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            files.forEach(f => {
                if (f.preview) URL.revokeObjectURL(f.preview);
            });
        };
    }, []);

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
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];

        fileArray.forEach(file => {
            const ext = file.name.toLowerCase().split('.').pop() || '';
            if (VALID_EXTENSIONS.includes(ext)) {
                validFiles.push(file);
            } else {
                invalidFiles.push(file.name);
            }
        });

        if (invalidFiles.length > 0) {
            addToast(
                `${invalidFiles.length} archivo(s) no soportado(s): ${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}`,
                'error'
            );
        }

        if (validFiles.length === 0) return;

        const newFiles: CompressedFile[] = validFiles.map(file => {
            const type = getFileType(file.name);
            return {
                id: generateId(),
                file,
                preview: type === 'image' ? URL.createObjectURL(file) : undefined,
                originalSize: file.size,
                status: 'pending',
                originalName: file.name,
                type,
            };
        });

        setFiles(prev => [...prev, ...newFiles]);
        addToast(`${validFiles.length} archivo(s) agregado(s)`, 'success', 2000);
    }, [addToast]);

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
        // Reset input
        e.target.value = '';
    }, [processFiles]);

    // Soporte para pegar archivos (Ctrl+V)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }

            if (files.length > 0) {
                processFiles(files);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processFiles]);

    // ============================================================================
    // PROCESO DE COMPRESION
    // ============================================================================
    const handleCompress = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0 || isProcessing) return;

        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: pendingFiles.length });

        // Marcar como processing
        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, status: 'processing' } : f
        ));

        let successCount = 0;
        let errorCount = 0;

        // Comprimir archivos uno por uno
        for (let i = 0; i < pendingFiles.length; i++) {
            const fileItem = pendingFiles[i];
            setProcessingProgress({ current: i + 1, total: pendingFiles.length });

            try {
                const formData = new FormData();
                formData.append('file', fileItem.file);
                formData.append('quality', options.quality.toString());
                formData.append('pdf_quality', options.pdfQuality);
                if (options.maxDimension) {
                    formData.append('max_dimension', options.maxDimension.toString());
                }

                const response = await fetch(`${API_BASE}/compressor/compress-single`, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || `Error ${response.status}`);
                }

                const compressedBlob = await response.blob();
                const originalSize = parseInt(response.headers.get('X-Original-Size') || '0') || fileItem.originalSize;
                const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0') || compressedBlob.size;
                const errorHeader = response.headers.get('X-Error');

                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id
                        ? {
                            ...f,
                            status: 'completed',
                            compressedBlob,
                            compressedSize,
                            error: errorHeader || undefined,
                        }
                        : f
                ));

                if (!errorHeader) {
                    successCount++;
                }

            } catch (error) {
                console.error(`Error compressing ${fileItem.originalName}:`, error);
                errorCount++;
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id
                        ? {
                            ...f,
                            status: 'error',
                            error: error instanceof Error ? error.message : 'Error de conexion',
                        }
                        : f
                ));
            }
        }

        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });

        // Mostrar resumen
        if (successCount > 0 && errorCount === 0) {
            addToast(`¡${successCount} archivo(s) comprimido(s) exitosamente!`, 'success');
        } else if (successCount > 0 && errorCount > 0) {
            addToast(`${successCount} exitoso(s), ${errorCount} error(es)`, 'info');
        } else if (errorCount > 0) {
            addToast(`Error al comprimir ${errorCount} archivo(s)`, 'error');
        }
    };

    // ============================================================================
    // HANDLERS DE DESCARGA
    // ============================================================================
    const handleDownloadSingle = useCallback((f: CompressedFile) => {
        if (!f.compressedBlob) return;

        const url = URL.createObjectURL(f.compressedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = f.originalName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        
        addToast(`Descargado: ${f.originalName}`, 'success', 2000);
    }, [addToast]);

    const handleDownloadAll = useCallback(async () => {
        const completedFiles = files.filter(f => f.status === 'completed' && f.compressedBlob);
        if (completedFiles.length === 0) return;

        if (completedFiles.length === 1) {
            handleDownloadSingle(completedFiles[0]);
            return;
        }

        // Descargar cada archivo individualmente
        completedFiles.forEach((f, index) => {
            setTimeout(() => handleDownloadSingle(f), index * 200);
        });
        
        addToast(`Descargando ${completedFiles.length} archivos...`, 'info', 2000);
    }, [files, handleDownloadSingle, addToast]);

    // ============================================================================
    // HANDLERS DE GESTION
    // ============================================================================
    const handleRemoveFile = useCallback((id: string) => {
        setFiles(prev => {
            const f = prev.find(item => item.id === id);
            if (f?.preview) URL.revokeObjectURL(f.preview);
            return prev.filter(item => item.id !== id);
        });
    }, []);

    const handleClearAll = useCallback(() => {
        files.forEach(f => {
            if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setFiles([]);
        addToast('Lista limpiada', 'info', 2000);
    }, [files, addToast]);

    const handleResetOptions = useCallback(() => {
        setOptions(DEFAULT_OPTIONS);
        addToast('Configuración restaurada', 'info', 2000);
    }, [addToast]);

    // ============================================================================
    // CALCULOS MEMOIZADOS
    // ============================================================================
    const completedCount = useMemo(() => files.filter(f => f.status === 'completed').length, [files]);
    const pendingCount = useMemo(() => files.filter(f => f.status === 'pending').length, [files]);
    const imageCount = useMemo(() => files.filter(f => f.type === 'image').length, [files]);
    const pdfCount = useMemo(() => files.filter(f => f.type === 'pdf').length, [files]);

    // ============================================================================
    // RENDER
    // ============================================================================
    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme flex">
            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            
            {/* Preview Modal */}
            <AnimatePresence>
                {previewImage && (
                    <ImagePreviewModal
                        src={previewImage.src}
                        filename={previewImage.filename}
                        onClose={() => setPreviewImage(null)}
                    />
                )}
            </AnimatePresence>

            {/* ============================================================ */}
            {/* SIDEBAR IZQUIERDO */}
            {/* ============================================================ */}
            <aside className="w-[320px] bg-[#0a0a0a] border-r border-[#333] flex flex-col h-screen sticky top-0 shrink-0">
                {/* Header */}
                <div className="p-4 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <a 
                            href="/" 
                            className="text-[#666] hover:text-[#eee] transition-colors"
                            aria-label="Volver al inicio"
                        >
                            <ChevronLeft size={20} />
                        </a>
                        <h1 className="text-sm font-bold font-mono tracking-wide text-[#eee] uppercase">
                            Compresor
                        </h1>
                    </div>
                    <p className="text-[10px] text-[#555] font-mono mt-2">
                        Reduce el peso de imagenes y PDFs manteniendo la calidad
                    </p>
                </div>

                {/* Contenido Scrolleable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* ================================================== */}
                    {/* SECCION: CALIDAD DE IMAGENES */}
                    {/* ================================================== */}
                    <motion.div 
                        className="space-y-3"
                        initial={false}
                    >
                        <div className="flex items-center gap-2 text-[#888]">
                            <FileImage size={14} />
                            <span className="text-xs font-mono uppercase tracking-wider">Imagenes</span>
                        </div>

                        {/* Calidad */}
                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">
                                Calidad: {options.quality}%
                            </label>
                            <input
                                type="range"
                                min="50"
                                max="100"
                                step="5"
                                value={options.quality}
                                onChange={(e) => setOptions({ ...options, quality: parseInt(e.target.value) })}
                                className="w-full accent-blue-500 h-2 cursor-pointer"
                                aria-label="Calidad de compresión"
                            />
                            <div className="flex justify-between text-[10px] text-[#555] font-mono mt-1">
                                <span>Menor peso</span>
                                <span>Mayor calidad</span>
                            </div>
                        </div>

                        {/* Dimension Maxima */}
                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">
                                Dimension maxima (px)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="4096"
                                step="100"
                                placeholder="Sin limite"
                                value={options.maxDimension || ''}
                                onChange={(e) => setOptions({
                                    ...options,
                                    maxDimension: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-[#444] transition-all"
                                aria-label="Dimensión máxima"
                            />
                            <p className="text-[9px] text-[#444] font-mono mt-1">
                                Dejar vacio para mantener tamano original
                            </p>
                        </div>
                    </motion.div>

                    {/* ================================================== */}
                    {/* SECCION: CONFIGURACION PDF */}
                    {/* ================================================== */}
                    <motion.div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#888]">
                            <FileText size={14} />
                            <span className="text-xs font-mono uppercase tracking-wider">PDF</span>
                        </div>

                        {/* Toggle comprimir PDFs */}
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-[#666] font-mono">Comprimir PDFs</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={options.compressPdfs}
                                    onChange={(e) => setOptions({ ...options, compressPdfs: e.target.checked })}
                                    className="sr-only peer"
                                    aria-label="Comprimir PDFs"
                                />
                                <div className="w-9 h-5 bg-[#333] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#666] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                            </label>
                        </div>

                        {/* Calidad PDF */}
                        <AnimatePresence>
                            {options.compressPdfs && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    <label className="block text-xs text-[#666] mb-1.5 font-mono">
                                        Nivel de compresion
                                    </label>
                                    <select
                                        value={options.pdfQuality}
                                        onChange={(e) => setOptions({ ...options, pdfQuality: e.target.value as PDFQuality })}
                                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                        aria-label="Nivel de compresión PDF"
                                    >
                                        {PDF_QUALITY_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label} - {opt.description}
                                            </option>
                                        ))}
                                    </select>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Info sobre Ghostscript */}
                        <div className="flex items-start gap-2 p-2 bg-[#111] border border-[#222] rounded text-[9px] text-[#555]">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            <span>PDFs requieren Ghostscript en el servidor. Sin el, se devuelve el archivo original.</span>
                        </div>
                    </motion.div>

                    {/* Boton Reset */}
                    <button
                        onClick={handleResetOptions}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-[#333] text-[#666] hover:text-white hover:border-[#555] rounded text-xs font-mono transition-all hover:bg-[#1a1a1a]"
                        aria-label="Restaurar valores por defecto"
                    >
                        <RotateCcw size={12} />
                        Restaurar Valores
                    </button>

                    {/* ================================================== */}
                    {/* ESTADISTICAS */}
                    {/* ================================================== */}
                    <AnimatePresence>
                        {files.length > 0 && (
                            <motion.div 
                                className="space-y-3 pt-2 border-t border-[#222]"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <div className="flex items-center gap-2 text-[#888]">
                                    <Sliders size={14} />
                                    <span className="text-xs font-mono uppercase tracking-wider">Resumen</span>
                                </div>

                                <div className="bg-[#111] border border-[#222] rounded-lg p-3 space-y-2">
                                    <div className="flex justify-between text-xs font-mono">
                                        <span className="text-[#666]">Archivos</span>
                                        <span className="text-white">{files.length}</span>
                                    </div>
                                    {imageCount > 0 && (
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-[#666]">Imagenes</span>
                                            <span className="text-blue-400">{imageCount}</span>
                                        </div>
                                    )}
                                    {pdfCount > 0 && (
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-[#666]">PDFs</span>
                                            <span className="text-red-400">{pdfCount}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-xs font-mono">
                                        <span className="text-[#666]">Procesados</span>
                                        <span className="text-green-500">{stats.processedCount}</span>
                                    </div>
                                    {stats.processedCount > 0 && (
                                        <>
                                            <div className="border-t border-[#222] pt-2">
                                                <div className="flex justify-between text-xs font-mono">
                                                    <span className="text-[#666]">Original</span>
                                                    <span className="text-white">{formatBytes(stats.totalOriginalSize)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-mono mt-1">
                                                    <span className="text-[#666]">Comprimido</span>
                                                    <span className="text-white">{formatBytes(stats.totalCompressedSize)}</span>
                                                </div>
                                            </div>
                                            <div className="border-t border-[#222] pt-2 flex justify-between text-xs font-mono">
                                                <span className="text-[#666]">Reduccion</span>
                                                <span className={`font-bold ${stats.percentageSaved > 0 ? 'text-green-500' : 'text-[#666]'}`}>
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
                <div className="p-4 border-t border-[#333] space-y-2">
                    {/* Progress Bar durante procesamiento */}
                    {isProcessing && processingProgress.total > 0 && (
                        <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-[#666] font-mono mb-1">
                                <span>Progreso</span>
                                <span>{processingProgress.current} / {processingProgress.total}</span>
                            </div>
                            <ProgressBar current={processingProgress.current} total={processingProgress.total} />
                        </div>
                    )}

                    <motion.button
                        onClick={handleCompress}
                        disabled={isProcessing || pendingCount === 0}
                        whileHover={!isProcessing && pendingCount > 0 ? { scale: 1.02 } : {}}
                        whileTap={!isProcessing && pendingCount > 0 ? { scale: 0.98 } : {}}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-[#222] disabled:text-[#555] text-white rounded font-mono text-sm transition-colors disabled:cursor-not-allowed"
                        aria-label={isProcessing ? 'Comprimiendo archivos' : `Comprimir ${pendingCount} archivos pendientes`}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Comprimiendo...
                            </>
                        ) : (
                            <>
                                <Archive size={16} />
                                Comprimir ({pendingCount})
                            </>
                        )}
                    </motion.button>

                    <AnimatePresence>
                        {completedCount > 0 && (
                            <motion.button
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                onClick={handleDownloadAll}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white rounded font-mono text-sm transition-colors"
                                aria-label={`Descargar ${completedCount} archivos`}
                            >
                                <FileDown size={16} />
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
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/30 text-red-500/80 hover:text-red-500 hover:border-red-500/50 hover:bg-red-500/5 disabled:opacity-50 rounded font-mono text-xs transition-colors"
                                aria-label="Limpiar todos los archivos"
                            >
                                <Trash2 size={14} />
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
                <div className="p-6 pb-4">
                    <motion.div
                        ref={dropZoneRef}
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${isDragActive
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
                        aria-label="Área para soltar archivos. Haz clic o arrastra archivos aquí."
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
                            accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/pdf"
                            onChange={handleFileInput}
                            className="hidden"
                            aria-label="Seleccionar archivos"
                        />
                        <div className="flex flex-col items-center gap-3">
                            <motion.div 
                                className={`p-3 rounded-full ${isDragActive ? 'bg-blue-500/20' : 'bg-[#1a1a1a]'}`}
                                animate={isDragActive ? { scale: [1, 1.1, 1] } : {}}
                                transition={{ duration: 0.3 }}
                            >
                                <Upload size={32} className={isDragActive ? 'text-blue-500' : 'text-[#444]'} />
                            </motion.div>
                            <div>
                                <p className="text-sm font-mono text-white mb-1">
                                    Arrastra archivos o haz clic para seleccionar
                                </p>
                                <p className="text-xs text-[#555] font-mono">
                                    JPG, PNG, WEBP, BMP, TIFF, PDF
                                </p>
                                <p className="text-[10px] text-[#444] font-mono mt-1">
                                    También puedes pegar con Ctrl+V
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Lista de Archivos */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    <AnimatePresence mode="popLayout">
                        {files.length > 0 ? (
                            <div className="space-y-2">
                                {files.map((f, index) => {
                                    const FileIcon = getFileIcon(f.type);
                                    const reduction = f.compressedSize && f.compressedSize < f.originalSize
                                        ? ((f.originalSize - f.compressedSize) / f.originalSize * 100)
                                        : 0;

                                    return (
                                        <motion.div
                                            key={f.id}
                                            layout
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -100 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="bg-[#111] border border-[#222] rounded-lg p-3 flex items-center gap-4 group hover:border-[#333] transition-colors"
                                        >
                                            {/* Preview / Icon */}
                                            <motion.div 
                                                className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                                                whileHover={{ scale: f.preview ? 1.05 : 1 }}
                                                onClick={() => f.preview && setPreviewImage({ src: f.preview, filename: f.originalName })}
                                            >
                                                {f.preview ? (
                                                    <img
                                                        src={f.preview}
                                                        alt={f.originalName}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <FileIcon size={24} className={f.type === 'pdf' ? 'text-red-400' : 'text-[#444]'} />
                                                )}
                                            </motion.div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-mono text-white truncate" title={f.originalName}>
                                                    {f.originalName}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                    <span className="text-xs font-mono text-[#555]">
                                                        {formatBytes(f.originalSize)}
                                                    </span>
                                                    {f.status === 'completed' && f.compressedSize && (
                                                        <>
                                                            <span className="text-[#333]">→</span>
                                                            <span className="text-xs font-mono text-green-500">
                                                                {formatBytes(f.compressedSize)}
                                                            </span>
                                                            {reduction > 0 && (
                                                                <motion.span 
                                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    className="text-xs font-mono text-green-500/70"
                                                                >
                                                                    (-{reduction.toFixed(1)}%)
                                                                </motion.span>
                                                            )}
                                                        </>
                                                    )}
                                                    {f.status === 'completed' && f.error && (
                                                        <span className="text-[10px] font-mono text-yellow-500">
                                                            {f.error}
                                                        </span>
                                                    )}
                                                    {f.status === 'error' && f.error && (
                                                        <span className="text-xs font-mono text-red-400 truncate" title={f.error}>
                                                            {f.error}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status */}
                                            <div className="shrink-0">
                                                {f.status === 'pending' && (
                                                    <span className="text-[10px] font-mono text-[#555] px-2 py-1 bg-[#1a1a1a] rounded">
                                                        Pendiente
                                                    </span>
                                                )}
                                                {f.status === 'processing' && (
                                                    <Loader2 size={18} className="text-blue-500 animate-spin" />
                                                )}
                                                {f.status === 'completed' && (
                                                    <CheckCircle size={18} className="text-green-500" />
                                                )}
                                                {f.status === 'error' && (
                                                    <AlertCircle size={18} className="text-red-500" />
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="shrink-0 flex items-center gap-1">
                                                {f.status === 'completed' && (
                                                    <>
                                                        {f.preview && (
                                                            <button
                                                                onClick={() => setPreviewImage({ src: f.preview!, filename: f.originalName })}
                                                                className="p-2 hover:bg-[#222] rounded transition-colors"
                                                                title="Ver preview"
                                                                aria-label={`Ver preview de ${f.originalName}`}
                                                            >
                                                                <Eye size={16} className="text-[#666] hover:text-white" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDownloadSingle(f)}
                                                            className="p-2 hover:bg-[#222] rounded transition-colors"
                                                            title="Descargar"
                                                            aria-label={`Descargar ${f.originalName}`}
                                                        >
                                                            <Download size={16} className="text-[#666] hover:text-white" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleRemoveFile(f.id)}
                                                    className="p-2 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar"
                                                    aria-label={`Eliminar ${f.originalName}`}
                                                >
                                                    <X size={16} className="text-[#666] hover:text-red-500" />
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
                                    <Archive size={56} className="text-[#222] mb-4" />
                                </motion.div>
                                <p className="text-[#444] font-mono text-sm">
                                    No hay archivos cargados
                                </p>
                                <p className="text-[#333] font-mono text-xs mt-1">
                                    Arrastra archivos o usa el area de arriba
                                </p>
                                <p className="text-[#444] font-mono text-xs mt-3">
                                    <kbd className="px-2 py-1 bg-[#1a1a1a] rounded border border-[#333]">Ctrl</kbd>
                                    {' + '}
                                    <kbd className="px-2 py-1 bg-[#1a1a1a] rounded border border-[#333]">V</kbd>
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
