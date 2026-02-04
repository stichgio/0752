/**
 * Types for Compressor Tool
 */

export type FileStatus = 'pending' | 'processing' | 'completed' | 'error';

export type PDFQuality = 'screen' | 'ebook' | 'printer' | 'prepress';

export interface CompressedFile {
    id: string;
    file: File;
    preview?: string;
    originalSize: number;
    compressedSize?: number;
    compressedBlob?: Blob;
    status: FileStatus;
    originalName: string;
    error?: string;
    type: 'image' | 'pdf' | 'unknown';
}

export interface CompressionOptions {
    quality: number;           // 1-100
    maxDimension?: number;     // Optional max width/height for images
    compressPdfs: boolean;
    pdfQuality: PDFQuality;
}

export interface CompressionStats {
    totalOriginalSize: number;
    totalCompressedSize: number;
    totalSaved: number;
    percentageSaved: number;
    processedCount: number;
    totalCount: number;
}

export interface CompressionResult {
    filename: string;
    original_size: number;
    compressed_size: number;
    reduction_percent: number;
    success: boolean;
    error?: string;
}

export const PDF_QUALITY_OPTIONS: { value: PDFQuality; label: string; description: string }[] = [
    { value: 'screen', label: 'Pantalla', description: '~72 DPI - Menor tamaño' },
    { value: 'ebook', label: 'Equilibrado', description: '~150 DPI - Recomendado' },
    { value: 'printer', label: 'Impresion', description: '~300 DPI - Alta calidad' },
    { value: 'prepress', label: 'Preimpresion', description: '~300 DPI - Maxima calidad' },
];

export const DEFAULT_OPTIONS: CompressionOptions = {
    quality: 85,
    compressPdfs: true,
    pdfQuality: 'ebook',
};

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}
