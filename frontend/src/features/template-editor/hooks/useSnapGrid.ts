import { useCallback } from 'react';

export function useSnapGrid(gridSize: number, enabled: boolean) {
    const snapToGrid = useCallback(
        (value: number): number => {
            if (!enabled || gridSize <= 0) return value;
            return Math.round(value / gridSize) * gridSize;
        },
        [enabled, gridSize],
    );

    return { snapToGrid };
}
