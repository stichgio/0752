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
    FileText,
    Archive,
    Info
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

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const API_BASE = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    }, [options]);

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
            if (ext === 'pdf') {
                validFiles.push(file);
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

        const newFiles: CompressedFile[] = validFiles.map(file => ({
            id: generateId(),
            file,
            originalSize: file.size,
            status: 'pending',
            originalName: file.name,
        }));

        setFiles(prev => [...prev, ...newFiles]);
        addToast(`${validFiles.length} PDF(s) agregado(s)`, 'success', 2000);
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
                    if (file && file.name.toLowerCase().endsWith('.pdf')) {
                        files.push(file);
                    }
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

        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, status: 'processing' } : f
        ));

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < pendingFiles.length; i++) {
            const fileItem = pendingFiles[i];
            setProcessingProgress({ current: i + 1, total: pendingFiles.length });

            try {
                const formData = new FormData();
                formData.append('file', fileItem.file);
                formData.append('pdf_quality', options.pdfQuality);

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

        if (successCount > 0 && errorCount === 0) {
            addToast(`¡${successCount} PDF(s) comprimido(s) exitosamente!`, 'success');
        } else if (successCount > 0 && errorCount > 0) {
            addToast(`${successCount} exitoso(s), ${errorCount} error(es)`, 'info');
        } else if (errorCount > 0) {
            addToast(`Error al comprimir ${errorCount} PDF(s)`, 'error');
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
                                        <span className="text-white font-semibold">{files.length}</span>
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
                    {isProcessing && processingProgress.total > 0 && (
                        <div className="mb-4">
                            <div className="flex justify-between text-sm text-[#888] font-mono mb-2">
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
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-[#222] disabled:text-[#555] text-white rounded-lg font-mono text-lg font-semibold transition-colors disabled:cursor-not-allowed"
                        aria-label={isProcessing ? 'Comprimiendo archivos' : `Comprimir ${pendingCount} archivos pendientes`}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={22} className="animate-spin" />
                                Comprimiendo...
                            </>
                        ) : (
                            <>
                                <Archive size={22} />
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
                                    Solo archivos PDF son soportados
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
                                                <FileText size={32} className="text-red-500" />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-lg font-mono text-white truncate" title={f.originalName}>
                                                    {f.originalName}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 flex-wrap">
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
                                                        </>
                                                    )}
                                                    {f.status === 'completed' && f.error && (
                                                        <span className="text-sm font-mono text-yellow-500">
                                                            {f.error}
                                                        </span>
                                                    )}
                                                    {f.status === 'error' && f.error && (
                                                        <span className="text-base font-mono text-red-400 truncate" title={f.error}>
                                                            {f.error}
                                                        </span>
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
                                                {f.status === 'completed' && (
                                                    <CheckCircle size={24} className="text-green-500" />
                                                )}
                                                {f.status === 'error' && (
                                                    <AlertCircle size={24} className="text-red-500" />
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="shrink-0 flex items-center gap-2">
                                                {f.status === 'completed' && (
                                                    <button
                                                        onClick={() => handleDownloadSingle(f)}
                                                        className="p-3 hover:bg-[#222] rounded-lg transition-colors"
                                                        title="Descargar"
                                                        aria-label={`Descargar ${f.originalName}`}
                                                    >
                                                        <Download size={22} className="text-[#888] hover:text-white" />
                                                    </button>
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
