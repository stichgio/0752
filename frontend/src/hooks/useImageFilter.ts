import { useMemo } from 'react';

/**
 * Hook para filtrar imágenes basándose en un ID de registro
 */
export function useImageFilter(
    images: File[],
    data: Record<string, unknown>[],
    selectedIndex: string | number,
    idColumn: string
): File[] {
    return useMemo(() => {
        if (selectedIndex === '' || selectedIndex === undefined) return [];

        const index = typeof selectedIndex === 'string' ? parseInt(selectedIndex, 10) : selectedIndex;
        const row = data[index];

        if (!row || !idColumn) return [];

        const recordId = String(row[idColumn]);
        return images.filter(img =>
            img.name.toLowerCase().includes(recordId.toLowerCase())
        );
    }, [images, data, selectedIndex, idColumn]);
}

export default useImageFilter;
