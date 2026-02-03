export interface ImageFile {
    id: string;
    file: File;
    preview: string;
    originalSize: number;
    compressedSize?: number;
    compressedBlob?: Blob;
    status: 'pending' | 'processing' | 'completed' | 'error';
    error?: string;
}

export interface CompressionOptions {
    maxSizeMB: number;
    maxWidthOrHeight: number;
    quality: number;
    useWebWorker: boolean;
}

export interface CompressionStats {
    totalOriginalSize: number;
    totalCompressedSize: number;
    totalSaved: number;
    percentageSaved: number;
    processedCount: number;
    totalCount: number;
}
