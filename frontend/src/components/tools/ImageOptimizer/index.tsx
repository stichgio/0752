import React, { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, Upload, Download, Trash2, Image as ImageIcon, FileDown, Loader2, CheckCircle, AlertCircle, X, Sliders, RotateCcw, Crop, Maximize2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ImageFile, CompressionOptions, CompressionStats, OutputFormat, AspectRatio, ASPECT_RATIO_OPTIONS } from './types';

// ============================================================================
// CONFIGURACION POR DEFECTO
// ============================================================================
const DEFAULT_OPTIONS: CompressionOptions = {
    maxSizeMB: 1,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.7,
    outputFormat: 'jpeg',
    aspectRatio: 'original',
    useWebWorker: true,
};

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

function getOutputMimeType(format: OutputFormat, originalType: string): string {
    switch (format) {
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'webp': return 'image/webp';
        default: return originalType;
    }
}

function getOutputExtension(format: OutputFormat, originalName: string): string {
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    switch (format) {
        case 'jpeg': return `${baseName}.jpg`;
        case 'png': return `${baseName}.png`;
        case 'webp': return `${baseName}.webp`;
        default: return originalName;
    }
}

function getAspectRatioValue(ratio: AspectRatio): number | null {
    const option = ASPECT_RATIO_OPTIONS.find(o => o.value === ratio);
    return option?.ratio ?? null;
}

// ============================================================================
// FUNCION DE RECORTE CON CANVAS (Center Crop)
// ============================================================================
async function cropImageToRatio(file: File, targetRatio: number): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            try {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                const originalRatio = originalWidth / originalHeight;

                let cropWidth: number;
                let cropHeight: number;
                let offsetX: number;
                let offsetY: number;

                if (originalRatio > targetRatio) {
                    // Imagen mas ancha que el ratio objetivo -> recortar lados
                    cropHeight = originalHeight;
                    cropWidth = Math.round(originalHeight * targetRatio);
                    offsetX = Math.round((originalWidth - cropWidth) / 2);
                    offsetY = 0;
                } else {
                    // Imagen mas alta que el ratio objetivo -> recortar arriba/abajo
                    cropWidth = originalWidth;
                    cropHeight = Math.round(originalWidth / targetRatio);
                    offsetX = 0;
                    offsetY = Math.round((originalHeight - cropHeight) / 2);
                }

                // Crear canvas con las dimensiones del recorte
                const canvas = document.createElement('canvas');
                canvas.width = cropWidth;
                canvas.height = cropHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error('No se pudo obtener contexto 2D del canvas');
                }

                // Dibujar la porcion recortada (center crop)
                ctx.drawImage(
                    img,
                    offsetX, offsetY, cropWidth, cropHeight,  // Source rect
                    0, 0, cropWidth, cropHeight               // Dest rect
                );

                // Convertir canvas a Blob
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Error al convertir canvas a blob'));
                            return;
                        }

                        // Crear nuevo File con el mismo nombre
                        const croppedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now(),
                        });

                        URL.revokeObjectURL(url);
                        resolve(croppedFile);
                    },
                    file.type,
                    0.95 // Alta calidad para el crop intermedio
                );
            } catch (error) {
                URL.revokeObjectURL(url);
                reject(error);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Error al cargar imagen para recorte'));
        };

        img.src = url;
    });
}

// ============================================================================
// FUNCION PARA OBTENER DIMENSIONES DE IMAGEN
// ============================================================================
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Error al cargar imagen'));
        };

        img.src = url;
    });
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function ImageOptimizer() {
    const [images, setImages] = useState<ImageFile[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(DEFAULT_OPTIONS);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            images.forEach(img => {
                URL.revokeObjectURL(img.preview);
            });
        };
    }, []);

    // Estadisticas calculadas
    const stats: CompressionStats = React.useMemo(() => {
        const completed = images.filter(img => img.status === 'completed');
        const totalOriginalSize = completed.reduce((acc, img) => acc + img.originalSize, 0);
        const totalCompressedSize = completed.reduce((acc, img) => acc + (img.compressedSize || 0), 0);
        const totalSaved = totalOriginalSize - totalCompressedSize;
        const percentageSaved = totalOriginalSize > 0 ? (totalSaved / totalOriginalSize) * 100 : 0;

        return {
            totalOriginalSize,
            totalCompressedSize,
            totalSaved,
            percentageSaved,
            processedCount: completed.length,
            totalCount: images.length,
        };
    }, [images]);

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

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const validFiles = Array.from(files).filter(file =>
            file.type.startsWith('image/') && !file.type.includes('gif')
        );

        // Crear ImageFiles con dimensiones
        const newImages: ImageFile[] = await Promise.all(
            validFiles.map(async (file) => {
                let dimensions = { width: 0, height: 0 };
                try {
                    dimensions = await getImageDimensions(file);
                } catch (e) {
                    console.warn('No se pudieron obtener dimensiones:', e);
                }

                return {
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    file,
                    preview: URL.createObjectURL(file),
                    originalSize: file.size,
                    status: 'pending' as const,
                    originalName: file.name,
                    originalWidth: dimensions.width,
                    originalHeight: dimensions.height,
                };
            })
        );

        setImages(prev => [...prev, ...newImages]);
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
    // PROCESO DE COMPRESION: Original -> Crop -> Resize/Compress -> Output
    // ========================================================================
    const compressImage = async (imageFile: ImageFile): Promise<ImageFile> => {
        try {
            let fileToProcess: File = imageFile.file;

            // PASO 1: Recortar si hay un aspect ratio definido
            const targetRatio = getAspectRatioValue(options.aspectRatio);
            if (targetRatio !== null) {
                fileToProcess = await cropImageToRatio(fileToProcess, targetRatio);
            }

            // PASO 2: Determinar configuracion de compresion
            const outputMimeType = getOutputMimeType(options.outputFormat, imageFile.file.type);
            const maxDimension = Math.min(options.maxWidth, options.maxHeight);

            const compressionOptions: any = {
                maxSizeMB: options.maxSizeMB,
                maxWidthOrHeight: maxDimension,
                useWebWorker: options.useWebWorker,
                initialQuality: options.quality,
            };

            // Agregar fileType solo si no es 'original'
            if (options.outputFormat !== 'original') {
                compressionOptions.fileType = outputMimeType;
            }

            // PASO 3: Comprimir
            const compressedBlob = await imageCompression(fileToProcess, compressionOptions);

            // PASO 4: Obtener dimensiones finales
            let finalDimensions = { width: 0, height: 0 };
            try {
                const tempFile = new File([compressedBlob], 'temp.jpg', { type: compressedBlob.type });
                finalDimensions = await getImageDimensions(tempFile);
            } catch (e) {
                console.warn('No se pudieron obtener dimensiones finales:', e);
            }

            return {
                ...imageFile,
                compressedSize: compressedBlob.size,
                compressedBlob,
                status: 'completed',
                finalWidth: finalDimensions.width,
                finalHeight: finalDimensions.height,
            };
        } catch (error) {
            console.error('Error en compresion:', error);
            return {
                ...imageFile,
                status: 'error',
                error: error instanceof Error ? error.message : 'Error desconocido',
            };
        }
    };

    const handleCompress = async () => {
        if (images.length === 0 || isProcessing) return;

        setIsProcessing(true);

        // Marcar pendientes como processing
        setImages(prev => prev.map(img =>
            img.status === 'pending' ? { ...img, status: 'processing' } : img
        ));

        // Procesar imagenes secuencialmente
        const pendingImages = images.filter(img => img.status === 'pending' || img.status === 'processing');

        for (const img of pendingImages) {
            const result = await compressImage(img);
            setImages(prev => prev.map(i => i.id === img.id ? result : i));
        }

        setIsProcessing(false);
    };

    // ========================================================================
    // HANDLERS DE DESCARGA
    // ========================================================================
    const handleDownloadSingle = (img: ImageFile) => {
        if (!img.compressedBlob) return;

        const url = URL.createObjectURL(img.compressedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getOutputExtension(options.outputFormat, img.originalName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleDownloadAll = async () => {
        const completedImages = images.filter(img => img.status === 'completed' && img.compressedBlob);
        if (completedImages.length === 0) return;

        if (completedImages.length === 1) {
            handleDownloadSingle(completedImages[0]);
            return;
        }

        // Para multiples imagenes, crear ZIP via backend
        const formData = new FormData();
        completedImages.forEach((img) => {
            if (img.compressedBlob) {
                const fileName = getOutputExtension(options.outputFormat, img.originalName);
                formData.append('files', img.compressedBlob, fileName);
            }
        });

        try {
            const API_BASE = import.meta.env.VITE_API_URL || '/api';
            const response = await fetch(`${API_BASE}/image-optimizer/download-zip`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Error al crear ZIP');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `imagenes_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('ZIP download failed, downloading individually:', error);
            completedImages.forEach(img => handleDownloadSingle(img));
        }
    };

    // ========================================================================
    // HANDLERS DE GESTION
    // ========================================================================
    const handleRemoveImage = (id: string) => {
        setImages(prev => {
            const img = prev.find(i => i.id === id);
            if (img) {
                URL.revokeObjectURL(img.preview);
            }
            return prev.filter(i => i.id !== id);
        });
    };

    const handleClearAll = () => {
        images.forEach(img => URL.revokeObjectURL(img.preview));
        setImages([]);
    };

    const handleResetOptions = () => {
        setOptions(DEFAULT_OPTIONS);
    };

    const completedCount = images.filter(img => img.status === 'completed').length;
    const pendingCount = images.filter(img => img.status === 'pending').length;

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
                            Optimizador de Imagenes
                        </h1>
                    </div>
                </div>

                {/* Contenido Scrolleable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* ================================================== */}
                    {/* SECCION: RECORTE */}
                    {/* ================================================== */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#888]">
                            <Crop size={14} />
                            <span className="text-xs font-mono uppercase tracking-wider">Recorte</span>
                        </div>

                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">Relacion de Aspecto</label>
                            <select
                                value={options.aspectRatio}
                                onChange={(e) => setOptions({ ...options, aspectRatio: e.target.value as AspectRatio })}
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                            >
                                {ASPECT_RATIO_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            {options.aspectRatio !== 'original' && (
                                <p className="text-[10px] text-[#555] mt-1.5 font-mono">
                                    Se aplicara un recorte centrado automatico
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ================================================== */}
                    {/* SECCION: REDIMENSIONAR */}
                    {/* ================================================== */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#888]">
                            <Maximize2 size={14} />
                            <span className="text-xs font-mono uppercase tracking-wider">Redimensionar</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs text-[#666] mb-1.5 font-mono">Ancho Max (px)</label>
                                <input
                                    type="number"
                                    min="100"
                                    max="4096"
                                    step="100"
                                    value={options.maxWidth}
                                    onChange={(e) => setOptions({ ...options, maxWidth: parseInt(e.target.value) || 1920 })}
                                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#666] mb-1.5 font-mono">Alto Max (px)</label>
                                <input
                                    type="number"
                                    min="100"
                                    max="4096"
                                    step="100"
                                    value={options.maxHeight}
                                    onChange={(e) => setOptions({ ...options, maxHeight: parseInt(e.target.value) || 1080 })}
                                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ================================================== */}
                    {/* SECCION: COMPRESION */}
                    {/* ================================================== */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#888]">
                            <Sliders size={14} />
                            <span className="text-xs font-mono uppercase tracking-wider">Compresion</span>
                        </div>

                        {/* Formato de Salida */}
                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">Formato de Salida</label>
                            <select
                                value={options.outputFormat}
                                onChange={(e) => setOptions({ ...options, outputFormat: e.target.value as OutputFormat })}
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                            >
                                <option value="original">Original</option>
                                <option value="jpeg">JPEG (Recomendado)</option>
                                <option value="png">PNG</option>
                                <option value="webp">WEBP (Mejor compresion)</option>
                            </select>
                        </div>

                        {/* Calidad */}
                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">
                                Calidad: {Math.round(options.quality * 100)}%
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={options.quality}
                                onChange={(e) => setOptions({ ...options, quality: parseFloat(e.target.value) })}
                                className="w-full accent-green-500 h-2"
                            />
                            <div className="flex justify-between text-[10px] text-[#555] font-mono mt-1">
                                <span>Menor peso</span>
                                <span>Mayor calidad</span>
                            </div>
                        </div>

                        {/* Tamano Maximo */}
                        <div>
                            <label className="block text-xs text-[#666] mb-1.5 font-mono">Peso Maximo (MB)</label>
                            <input
                                type="number"
                                min="0.1"
                                max="10"
                                step="0.1"
                                value={options.maxSizeMB}
                                onChange={(e) => setOptions({ ...options, maxSizeMB: parseFloat(e.target.value) || 1 })}
                                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                            />
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
                    {images.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-[#222]">
                            <div className="flex items-center gap-2 text-[#888]">
                                <ImageIcon size={14} />
                                <span className="text-xs font-mono uppercase tracking-wider">Estadisticas</span>
                            </div>

                            <div className="bg-[#111] border border-[#222] rounded-lg p-3 space-y-2">
                                <div className="flex justify-between text-xs font-mono">
                                    <span className="text-[#666]">Imagenes</span>
                                    <span className="text-white">{images.length}</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                    <span className="text-[#666]">Procesadas</span>
                                    <span className="text-green-500">{stats.processedCount}</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                    <span className="text-[#666]">Original</span>
                                    <span className="text-white">{formatBytes(stats.totalOriginalSize)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                    <span className="text-[#666]">Comprimido</span>
                                    <span className="text-white">{formatBytes(stats.totalCompressedSize)}</span>
                                </div>
                                <div className="border-t border-[#222] pt-2 flex justify-between text-xs font-mono">
                                    <span className="text-[#666]">Ahorro</span>
                                    <span className="text-green-500 font-bold">{stats.percentageSaved.toFixed(1)}%</span>
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
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-[#222] disabled:text-[#555] text-white rounded font-mono text-sm transition-colors disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <ImageIcon size={16} />
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
                            Descargar Todo ({completedCount})
                        </button>
                    )}

                    {images.length > 0 && (
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
                            ? 'border-green-500 bg-green-500/10'
                            : 'border-[#333] hover:border-[#444]'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            id="imageInput"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                        <label htmlFor="imageInput" className="cursor-pointer">
                            <div className="flex flex-col items-center gap-3">
                                <div className={`p-3 rounded-full ${isDragActive ? 'bg-green-500/20' : 'bg-[#1a1a1a]'}`}>
                                    <Upload size={32} className={isDragActive ? 'text-green-500' : 'text-[#444]'} />
                                </div>
                                <div>
                                    <p className="text-sm font-mono text-white mb-1">
                                        Arrastra imagenes o haz clic para seleccionar
                                    </p>
                                    <p className="text-xs text-[#555] font-mono">
                                        JPG, PNG, WEBP (No GIFs)
                                    </p>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Grid de Imagenes */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {images.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                            {images.map((img) => (
                                <div
                                    key={img.id}
                                    className="bg-[#111] border border-[#222] rounded-lg overflow-hidden group relative"
                                >
                                    {/* Preview */}
                                    <div className="aspect-square relative">
                                        <img
                                            src={img.preview}
                                            alt={img.originalName}
                                            className="w-full h-full object-cover"
                                        />

                                        {/* Status Overlay */}
                                        {img.status === 'processing' && (
                                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                                <Loader2 size={24} className="text-green-500 animate-spin" />
                                            </div>
                                        )}

                                        {img.status === 'completed' && (
                                            <div className="absolute top-2 right-2">
                                                <CheckCircle size={18} className="text-green-500" />
                                            </div>
                                        )}

                                        {img.status === 'error' && (
                                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                                <AlertCircle size={24} className="text-red-500" />
                                            </div>
                                        )}

                                        {/* Remove Button */}
                                        <button
                                            onClick={() => handleRemoveImage(img.id)}
                                            className="absolute top-2 left-2 p-1 bg-black/70 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Info */}
                                    <div className="p-2">
                                        <p className="text-[10px] text-[#666] font-mono truncate mb-1" title={img.originalName}>
                                            {img.originalName}
                                        </p>

                                        {/* Dimensiones originales */}
                                        {img.originalWidth && img.originalHeight && (
                                            <p className="text-[9px] text-[#444] font-mono mb-1">
                                                {img.originalWidth}x{img.originalHeight}
                                                {img.finalWidth && img.finalHeight && img.status === 'completed' && (
                                                    <span className="text-green-500/70"> → {img.finalWidth}x{img.finalHeight}</span>
                                                )}
                                            </p>
                                        )}

                                        <div className="flex justify-between text-[10px] font-mono">
                                            <span className="text-[#555]">{formatBytes(img.originalSize)}</span>
                                            {img.status === 'completed' && img.compressedSize && (
                                                <span className="text-green-500">
                                                    {formatBytes(img.compressedSize)}
                                                    <span className="ml-1 text-[#444]">
                                                        (-{Math.round((1 - img.compressedSize / img.originalSize) * 100)}%)
                                                    </span>
                                                </span>
                                            )}
                                        </div>

                                        {img.status === 'error' && (
                                            <p className="text-[9px] text-red-500 mt-1 truncate">{img.error}</p>
                                        )}

                                        {img.status === 'completed' && (
                                            <button
                                                onClick={() => handleDownloadSingle(img)}
                                                className="w-full mt-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded text-[10px] font-mono transition-colors"
                                            >
                                                <Download size={10} />
                                                Descargar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <ImageIcon size={56} className="text-[#222] mb-4" />
                            <p className="text-[#444] font-mono text-sm">
                                No hay imagenes cargadas
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
