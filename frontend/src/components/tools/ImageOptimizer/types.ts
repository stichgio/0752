export interface ImageFile {
    id: string;
    file: File;
    preview: string;
    originalSize: number;
    compressedSize?: number;
    compressedBlob?: Blob;
    status: 'pending' | 'processing' | 'completed' | 'error';
    error?: string;
    originalName: string;
    // Dimensiones originales
    originalWidth?: number;
    originalHeight?: number;
    // Dimensiones finales (despues de crop + resize)
    finalWidth?: number;
    finalHeight?: number;
}

export type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp';

export type AspectRatio = 'original' | '1:1' | '4:3' | '4:5' | '3:2' | '16:9' | '9:16' | '3:4' | '2:3';

export interface AspectRatioOption {
    value: AspectRatio;
    label: string;
    ratio: number | null; // null = original, number = width/height
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
    { value: 'original', label: 'Original', ratio: null },
    { value: '1:1', label: '1:1 (Cuadrado)', ratio: 1 },
    { value: '4:3', label: '4:3 (Foto)', ratio: 4 / 3 },
    { value: '4:5', label: '4:5 (Instagram)', ratio: 4 / 5 },
    { value: '3:2', label: '3:2 (DSLR)', ratio: 3 / 2 },
    { value: '16:9', label: '16:9 (Video)', ratio: 16 / 9 },
    { value: '9:16', label: '9:16 (Story)', ratio: 9 / 16 },
    { value: '3:4', label: '3:4 (Retrato)', ratio: 3 / 4 },
    { value: '2:3', label: '2:3 (Pinterest)', ratio: 2 / 3 },
];

export interface CompressionOptions {
    maxSizeMB: number;
    maxWidth: number;
    maxHeight: number;
    quality: number;
    outputFormat: OutputFormat;
    aspectRatio: AspectRatio;
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
