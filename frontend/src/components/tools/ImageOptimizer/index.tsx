import React, { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, Upload, Download, Trash2, Settings, Image as ImageIcon, FileDown, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ImageFile, CompressionOptions, CompressionStats } from './types';

const DEFAULT_OPTIONS: CompressionOptions = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    quality: 0.8,
    useWebWorker: true,
};

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function ImageOptimizer() {
    const [images, setImages] = useState<ImageFile[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(DEFAULT_OPTIONS);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            images.forEach(img => {
                URL.revokeObjectURL(img.preview);
            });
        };
    }, []);

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

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const processFiles = useCallback((files: FileList | File[]) => {
        const validFiles = Array.from(files).filter(file =>
            file.type.startsWith('image/') && !file.type.includes('gif')
        );

        const newImages: ImageFile[] = validFiles.map(file => ({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            preview: URL.createObjectURL(file),
            originalSize: file.size,
            status: 'pending',
        }));

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

    const compressImage = async (imageFile: ImageFile): Promise<ImageFile> => {
        try {
            const compressedBlob = await imageCompression(imageFile.file, {
                maxSizeMB: options.maxSizeMB,
                maxWidthOrHeight: options.maxWidthOrHeight,
                useWebWorker: options.useWebWorker,
                initialQuality: options.quality,
            });

            return {
                ...imageFile,
                compressedSize: compressedBlob.size,
                compressedBlob,
                status: 'completed',
            };
        } catch (error) {
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

        // Mark all pending as processing
        setImages(prev => prev.map(img =>
            img.status === 'pending' ? { ...img, status: 'processing' } : img
        ));

        // Process images sequentially to avoid memory issues
        const pendingImages = images.filter(img => img.status === 'pending' || img.status === 'processing');

        for (const img of pendingImages) {
            const result = await compressImage(img);
            setImages(prev => prev.map(i => i.id === img.id ? result : i));
        }

        setIsProcessing(false);
    };

    const handleDownloadSingle = (img: ImageFile) => {
        if (!img.compressedBlob) return;

        const url = URL.createObjectURL(img.compressedBlob);
        const link = document.createElement('a');
        link.href = url;
        const ext = img.file.name.split('.').pop() || 'jpg';
        const nameWithoutExt = img.file.name.replace(/\.[^/.]+$/, '');
        link.download = `${nameWithoutExt}_optimized.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleDownloadAll = async () => {
        const completedImages = images.filter(img => img.status === 'completed' && img.compressedBlob);
        if (completedImages.length === 0) return;

        // If only one image, download directly
        if (completedImages.length === 1) {
            handleDownloadSingle(completedImages[0]);
            return;
        }

        // For multiple images, download as ZIP using backend
        const formData = new FormData();
        completedImages.forEach((img, index) => {
            if (img.compressedBlob) {
                const ext = img.file.name.split('.').pop() || 'jpg';
                const nameWithoutExt = img.file.name.replace(/\.[^/.]+$/, '');
                formData.append('files', img.compressedBlob, `${nameWithoutExt}_optimized.${ext}`);
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
            link.download = `imagenes_optimizadas_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            // Fallback: download individually
            console.error('ZIP download failed, downloading individually:', error);
            completedImages.forEach(img => handleDownloadSingle(img));
        }
    };

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

    const completedCount = images.filter(img => img.status === 'completed').length;

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            {/* Header */}
            <div className="bg-[#0d0d0d] border-b border-[#333] px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a href="/" className="text-[#888] hover:text-[#eee] transition-colors">
                            <ChevronLeft size={24} />
                        </a>
                        <h1 className="text-2xl font-bold font-mono tracking-wide text-[#eee] uppercase">
                            Optimizador de Imagenes
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded border transition-colors ${showSettings
                                ? 'bg-[#333] border-[#555] text-white'
                                : 'border-[#333] text-[#888] hover:text-white hover:border-[#555]'
                                }`}
                            title="Configuracion"
                        >
                            <Settings size={20} />
                        </button>
                        {completedCount > 0 && (
                            <button
                                onClick={handleDownloadAll}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-mono text-sm transition-colors"
                            >
                                <FileDown size={18} />
                                Descargar Todo ({completedCount})
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6">
                {/* Settings Panel */}
                {showSettings && (
                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-mono font-bold text-[#888] uppercase mb-4">Configuracion de Compresion</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-[#666] mb-1 font-mono">Tamano Maximo (MB)</label>
                                <input
                                    type="number"
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    value={options.maxSizeMB}
                                    onChange={(e) => setOptions({ ...options, maxSizeMB: parseFloat(e.target.value) || 1 })}
                                    className="w-full bg-[#0d0d0d] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#666] mb-1 font-mono">Dimension Maxima (px)</label>
                                <input
                                    type="number"
                                    min="100"
                                    max="4096"
                                    step="100"
                                    value={options.maxWidthOrHeight}
                                    onChange={(e) => setOptions({ ...options, maxWidthOrHeight: parseInt(e.target.value) || 1920 })}
                                    className="w-full bg-[#0d0d0d] border border-[#333] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#555] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#666] mb-1 font-mono">Calidad ({Math.round(options.quality * 100)}%)</label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="1"
                                    step="0.05"
                                    value={options.quality}
                                    onChange={(e) => setOptions({ ...options, quality: parseFloat(e.target.value) })}
                                    className="w-full accent-green-500"
                                />
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={() => setOptions(DEFAULT_OPTIONS)}
                                    className="w-full px-3 py-2 border border-[#333] text-[#888] hover:text-white hover:border-[#555] rounded text-xs font-mono transition-colors"
                                >
                                    Restaurar Valores
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Bar */}
                {images.length > 0 && (
                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 mb-6">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                            <div>
                                <div className="text-xs text-[#666] font-mono uppercase">Total Imagenes</div>
                                <div className="text-xl font-bold text-white font-mono">{images.length}</div>
                            </div>
                            <div>
                                <div className="text-xs text-[#666] font-mono uppercase">Procesadas</div>
                                <div className="text-xl font-bold text-green-500 font-mono">{stats.processedCount}</div>
                            </div>
                            <div>
                                <div className="text-xs text-[#666] font-mono uppercase">Tamano Original</div>
                                <div className="text-xl font-bold text-white font-mono">{formatBytes(stats.totalOriginalSize)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-[#666] font-mono uppercase">Tamano Comprimido</div>
                                <div className="text-xl font-bold text-white font-mono">{formatBytes(stats.totalCompressedSize)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-[#666] font-mono uppercase">Ahorro Total</div>
                                <div className="text-xl font-bold text-green-500 font-mono">
                                    {stats.percentageSaved.toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Drop Zone */}
                <div
                    className={`border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-colors ${isDragActive
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-[#333] hover:border-[#555]'
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
                        <div className="flex flex-col items-center gap-4">
                            <div className={`p-4 rounded-full ${isDragActive ? 'bg-green-500/20' : 'bg-[#1a1a1a]'}`}>
                                <Upload size={48} className={isDragActive ? 'text-green-500' : 'text-[#555]'} />
                            </div>
                            <div>
                                <p className="text-lg font-mono text-white mb-1">
                                    Arrastra imagenes aqui o haz clic para seleccionar
                                </p>
                                <p className="text-sm text-[#666] font-mono">
                                    Soporta JPG, PNG, WEBP (No GIFs animados)
                                </p>
                            </div>
                        </div>
                    </label>
                </div>

                {/* Action Buttons */}
                {images.length > 0 && (
                    <div className="flex gap-3 mb-6">
                        <button
                            onClick={handleCompress}
                            disabled={isProcessing || images.every(img => img.status === 'completed')}
                            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-[#333] disabled:text-[#666] text-white rounded font-mono text-sm transition-colors disabled:cursor-not-allowed"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                <>
                                    <ImageIcon size={18} />
                                    Comprimir Imagenes ({images.filter(i => i.status === 'pending').length})
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleClearAll}
                            disabled={isProcessing}
                            className="flex items-center gap-2 px-6 py-3 border border-red-500/50 text-red-500 hover:bg-red-500/10 disabled:opacity-50 rounded font-mono text-sm transition-colors"
                        >
                            <Trash2 size={18} />
                            Limpiar Todo
                        </button>
                    </div>
                )}

                {/* Image Grid */}
                {images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {images.map((img) => (
                            <div
                                key={img.id}
                                className="bg-[#1a1a1a] border border-[#333] rounded-lg overflow-hidden group relative"
                            >
                                {/* Image Preview */}
                                <div className="aspect-square relative">
                                    <img
                                        src={img.preview}
                                        alt={img.file.name}
                                        className="w-full h-full object-cover"
                                    />

                                    {/* Status Overlay */}
                                    {img.status === 'processing' && (
                                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                            <Loader2 size={32} className="text-green-500 animate-spin" />
                                        </div>
                                    )}

                                    {img.status === 'completed' && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle size={24} className="text-green-500" />
                                        </div>
                                    )}

                                    {img.status === 'error' && (
                                        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                            <AlertCircle size={32} className="text-red-500" />
                                        </div>
                                    )}

                                    {/* Remove Button */}
                                    <button
                                        onClick={() => handleRemoveImage(img.id)}
                                        className="absolute top-2 left-2 p-1 bg-black/70 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Info */}
                                <div className="p-3">
                                    <p className="text-xs text-[#888] font-mono truncate mb-2" title={img.file.name}>
                                        {img.file.name}
                                    </p>

                                    <div className="flex justify-between text-xs font-mono">
                                        <span className="text-[#666]">{formatBytes(img.originalSize)}</span>
                                        {img.status === 'completed' && img.compressedSize && (
                                            <span className="text-green-500">
                                                → {formatBytes(img.compressedSize)}
                                                <span className="ml-1 text-[#888]">
                                                    (-{Math.round((1 - img.compressedSize / img.originalSize) * 100)}%)
                                                </span>
                                            </span>
                                        )}
                                    </div>

                                    {img.status === 'error' && (
                                        <p className="text-xs text-red-500 mt-1 truncate">{img.error}</p>
                                    )}

                                    {img.status === 'completed' && (
                                        <button
                                            onClick={() => handleDownloadSingle(img)}
                                            className="w-full mt-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-[#333] hover:bg-[#444] rounded text-xs font-mono transition-colors"
                                        >
                                            <Download size={14} />
                                            Descargar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {images.length === 0 && (
                    <div className="text-center py-16">
                        <ImageIcon size={64} className="mx-auto text-[#333] mb-4" />
                        <p className="text-[#666] font-mono">
                            No hay imagenes cargadas
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
