import React, { useState, useCallback, useEffect } from 'react';
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
    Info
} from 'lucide-react';
import {
    CompressedFile,
    CompressionOptions,
    CompressionStats,
    PDFQuality,
    PDF_QUALITY_OPTIONS,
    DEFAULT_OPTIONS
} from './types';

// ============================================================================
// UTILIDADES
// ============================================================================
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
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) {
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

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Compressor() {
    const [files, setFiles] = useState<CompressedFile[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(DEFAULT_OPTIONS);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);

    const API_BASE = import.meta.env.VITE_API_URL || '/api';

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            files.forEach(f => {
                if (f.preview) URL.revokeObjectURL(f.preview);
            });
        };
    }, []);

    // Estadisticas calculadas
    const stats: CompressionStats = React.useMemo(() => {
        const completed = files.filter(f => f.status === 'completed');
        const totalOriginalSize = completed.reduce((acc, f) => acc + f.originalSize, 0);
        const totalCompressedSize = completed.reduce((acc, f) => acc + (f.compressedSize || 0), 0);
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

    // ========================================================================
    // HANDLERS DE DRAG & DROP
    // ========================================================================
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const processFiles = useCallback(async (inputFiles: FileList | File[]) => {
        const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'pdf'];
        const validFiles = Array.from(inputFiles).filter(file => {
            const ext = file.name.toLowerCase().split('.').pop() || '';
            return validExtensions.includes(ext);
        });

        const newFiles: CompressedFile[] = validFiles.map(file => {
            const type = getFileType(file.name);
            return {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                file,
                preview: type === 'image' ? URL.createObjectURL(file) : undefined,
                originalSize: file.size,
                status: 'pending' as const,
                originalName: file.name,
                type,
            };
        });

        setFiles(prev => [...prev, ...newFiles]);
    }, []);

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
    }, [processFiles]);

    // ========================================================================
    // PROCESO DE COMPRESION
    // ========================================================================
    const handleCompress = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0 || isProcessing) return;

        setIsProcessing(true);

        // Marcar como processing
        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, status: 'processing' } : f
        ));

        try {
            // Comprimir archivos uno por uno para mejor UX
            for (const fileItem of pendingFiles) {
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
                        throw new Error(`Error del servidor: ${response.status}`);
                    }

                    const compressedBlob = await response.blob();
                    const originalSize = parseInt(response.headers.get('X-Original-Size') || '0');
                    const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0');

                    setFiles(prev => prev.map(f =>
                        f.id === fileItem.id
                            ? {
                                ...f,
                                status: 'completed',
                                compressedBlob,
                                compressedSize: compressedSize || compressedBlob.size,
                            }
                            : f
                    ));

                } catch (error) {
                    console.error(`Error compressing ${fileItem.originalName}:`, error);
                    setFiles(prev => prev.map(f =>
                        f.id === fileItem.id
                            ? {
                                ...f,
                                status: 'error',
                                error: error instanceof Error ? error.message : 'Error desconocido',
                            }
                            : f
                    ));
                }
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // ========================================================================
    // HANDLERS DE DESCARGA
    // ========================================================================
    const handleDownloadSingle = (f: CompressedFile) => {
        if (!f.compressedBlob) return;

        const url = URL.createObjectURL(f.compressedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = f.originalName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleDownloadAll = async () => {
        const completedFiles = files.filter(f => f.status === 'completed' && f.compressedBlob);
        if (completedFiles.length === 0) return;

        if (completedFiles.length === 1) {
            handleDownloadSingle(completedFiles[0]);
            return;
        }

        // Crear ZIP con todos los archivos comprimidos
        const formData = new FormData();
        completedFiles.forEach(f => {
            if (f.compressedBlob) {
                formData.append('files', f.compressedBlob, f.originalName);
            }
        });
        formData.append('quality', options.quality.toString());
        formData.append('compress_pdfs', options.compressPdfs.toString());
        formData.append('pdf_quality', options.pdfQuality);

        try {
            const response = await fetch(`${API_BASE}/compressor/compress`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Error al crear ZIP');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `comprimidos_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading ZIP:', error);
            // Fallback: descargar individualmente
            completedFiles.forEach(f => handleDownloadSingle(f));
        }
    };

    // ========================================================================
    // HANDLERS DE GESTION
    // ========================================================================
    const handleRemoveFile = (id: string) => {
        setFiles(prev => {
            const f = prev.find(item => item.id === id);
            if (f?.preview) URL.revokeObjectURL(f.preview);
            return prev.filter(item => item.id !== id);
        });
    };

    const handleClearAll = () => {
        files.forEach(f => {
            if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setFiles([]);
    };

    const handleResetOptions = () => {
        setOptions(DEFAULT_OPTIONS);
    };

    const completedCount = files.filter(f => f.status === 'completed').length;
    const pendingCount = files.filter(f => f.status === 'pending').length;
    const imageCount = files.filter(f => f.type === 'image').length;
    const pdfCount = files.filter(f => f.type === 'pdf').length;

    // ========================================================================
    // RENDER
    // ========================================================================
    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme flex">
            {/* ============================================================ */}
            {/* SIDEBAR IZQUIERDO */}
            {/* ============================================================ */}
            <aside className="w-[320px] bg-[#0a0a0a] border-r border-[#333] flex flex-col h-screen sticky top-0 shrink-0">
                {/* Header */}
                <div className="p-4 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <a href="/" className="text-[#666] hover:text-[#eee] transition-colors">
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
                    <div className="space-y-3">
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
                                className="w-full accent-blue-500 h-2"
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
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none placeholder:text-[#444]"
                            />
                            <p className="text-[9px] text-[#444] font-mono mt-1">
                                Dejar vacio para mantener tamaño original
                            </p>
                        </div>
                    </div>

                    {/* ================================================== */}
                    {/* SECCION: CONFIGURACION PDF */}
                    {/* ================================================== */}
                    <div className="space-y-3">
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
                                />
                                <div className="w-9 h-5 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#666] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                            </label>
                        </div>

                        {/* Calidad PDF */}
                        {options.compressPdfs && (
                            <div>
                                <label className="block text-xs text-[#666] mb-1.5 font-mono">
                                    Nivel de compresion
                                </label>
                                <select
                                    value={options.pdfQuality}
                                    onChange={(e) => setOptions({ ...options, pdfQuality: e.target.value as PDFQuality })}
                                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                                >
                                    {PDF_QUALITY_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label} - {opt.description}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Info sobre Ghostscript */}
                        <div className="flex items-start gap-2 p-2 bg-[#111] border border-[#222] rounded text-[9px] text-[#555]">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            <span>La compresion de PDFs requiere Ghostscript instalado en el servidor.</span>
                        </div>
                    </div>

                    {/* Boton Reset */}
                    <button
                        onClick={handleResetOptions}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-[#333] text-[#666] hover:text-white hover:border-[#555] rounded text-xs font-mono transition-colors"
                    >
                        <RotateCcw size={12} />
                        Restaurar Valores
                    </button>

                    {/* ================================================== */}
                    {/* ESTADISTICAS */}
                    {/* ================================================== */}
                    {files.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-[#222]">
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
                                    <span className="text-green-500 font-bold">
                                        {stats.percentageSaved > 0 ? `-${stats.percentageSaved.toFixed(1)}%` : '0%'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ================================================== */}
                {/* FOOTER: BOTONES DE ACCION */}
                {/* ================================================== */}
                <div className="p-4 border-t border-[#333] space-y-2">
                    <button
                        onClick={handleCompress}
                        disabled={isProcessing || pendingCount === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-[#222] disabled:text-[#555] text-white rounded font-mono text-sm transition-colors disabled:cursor-not-allowed"
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
                    </button>

                    {completedCount > 0 && (
                        <button
                            onClick={handleDownloadAll}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white rounded font-mono text-sm transition-colors"
                        >
                            <FileDown size={16} />
                            Descargar {completedCount > 1 ? `Todo (${completedCount})` : ''}
                        </button>
                    )}

                    {files.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            disabled={isProcessing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/30 text-red-500/80 hover:text-red-500 hover:border-red-500/50 hover:bg-red-500/5 disabled:opacity-50 rounded font-mono text-xs transition-colors"
                        >
                            <Trash2 size={14} />
                            Limpiar Todo
                        </button>
                    )}
                </div>
            </aside>

            {/* ============================================================ */}
            {/* AREA PRINCIPAL (DERECHA) */}
            {/* ============================================================ */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Drop Zone */}
                <div className="p-6 pb-4">
                    <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragActive
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-[#333] hover:border-[#444]'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            id="fileInput"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/pdf"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                        <label htmlFor="fileInput" className="cursor-pointer">
                            <div className="flex flex-col items-center gap-3">
                                <div className={`p-3 rounded-full ${isDragActive ? 'bg-blue-500/20' : 'bg-[#1a1a1a]'}`}>
                                    <Upload size={32} className={isDragActive ? 'text-blue-500' : 'text-[#444]'} />
                                </div>
                                <div>
                                    <p className="text-sm font-mono text-white mb-1">
                                        Arrastra archivos o haz clic para seleccionar
                                    </p>
                                    <p className="text-xs text-[#555] font-mono">
                                        JPG, PNG, WEBP, BMP, TIFF, PDF
                                    </p>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Lista de Archivos */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {files.length > 0 ? (
                        <div className="space-y-2">
                            {files.map((f) => {
                                const FileIcon = getFileIcon(f.type);
                                const reduction = f.compressedSize
                                    ? ((f.originalSize - f.compressedSize) / f.originalSize * 100)
                                    : 0;

                                return (
                                    <div
                                        key={f.id}
                                        className="bg-[#111] border border-[#222] rounded-lg p-3 flex items-center gap-4 group"
                                    >
                                        {/* Preview / Icon */}
                                        <div className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center overflow-hidden shrink-0">
                                            {f.preview ? (
                                                <img
                                                    src={f.preview}
                                                    alt={f.originalName}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <FileIcon size={24} className={f.type === 'pdf' ? 'text-red-400' : 'text-[#444]'} />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-mono text-white truncate" title={f.originalName}>
                                                {f.originalName}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs font-mono text-[#555]">
                                                    {formatBytes(f.originalSize)}
                                                </span>
                                                {f.status === 'completed' && f.compressedSize && (
                                                    <>
                                                        <span className="text-[#333]">→</span>
                                                        <span className="text-xs font-mono text-green-500">
                                                            {formatBytes(f.compressedSize)}
                                                        </span>
                                                        <span className="text-xs font-mono text-green-500/70">
                                                            (-{reduction.toFixed(1)}%)
                                                        </span>
                                                    </>
                                                )}
                                                {f.status === 'error' && f.error && (
                                                    <span className="text-xs font-mono text-red-400 truncate">
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
                                                <button
                                                    onClick={() => handleDownloadSingle(f)}
                                                    className="p-2 hover:bg-[#222] rounded transition-colors"
                                                    title="Descargar"
                                                >
                                                    <Download size={16} className="text-[#666] hover:text-white" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRemoveFile(f.id)}
                                                className="p-2 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                title="Eliminar"
                                            >
                                                <X size={16} className="text-[#666] hover:text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <Archive size={56} className="text-[#222] mb-4" />
                            <p className="text-[#444] font-mono text-sm">
                                No hay archivos cargados
                            </p>
                            <p className="text-[#333] font-mono text-xs mt-1">
                                Arrastra archivos o usa el area de arriba
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
