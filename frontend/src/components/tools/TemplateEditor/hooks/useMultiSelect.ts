import { useState, useCallback, useRef } from 'react';
import { TemplateElement } from '../canvasTypes';
import { getBoundingBox, rectIntersects, Rect } from '../utils/geometry';

export function useMultiSelect(
    scale: number,
    elements: TemplateElement[],
    onSelect: (ids: string[]) => void
) {
    const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
    const startPos = useRef<{ x: number, y: number } | null>(null);

    const startSelection = useCallback((e: React.MouseEvent) => {
        // Only start if clicking on background (should be handled by caller usually)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale; // Screen px relative to canvas
        const y = (e.clientY - rect.top) / scale;

        startPos.current = { x, y };
        setSelectionRect({ x, y, width: 0, height: 0 });
        // Note: We don't clear selection immediately here to allow Shift+Click logic, 
        // but usually marquee starts fresh unless Shift is held.
        // For now assuming marquee clears previous selection.
        onSelect([]);
    }, [scale, onSelect]);

    const updateSelection = useCallback((e: React.MouseEvent) => {
        if (!startPos.current) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const currentX = (e.clientX - rect.left) / scale;
        const currentY = (e.clientY - rect.top) / scale;

        const x = Math.min(startPos.current.x, currentX);
        const y = Math.min(startPos.current.y, currentY);
        const width = Math.abs(currentX - startPos.current.x);
        const height = Math.abs(currentY - startPos.current.y);

        const newRect = { x, y, width, height };
        setSelectionRect(newRect);

        // Find intersecting elements
        const selected = elements.filter(el => {
            if (!el.visible || el.locked) return false;
            const elBox = getBoundingBox(el);
            // Coordinate space mismatch? 
            // Elements are in mm, selectionRect is in px/scale (which is ... px relative to canvas?)
            // Wait. scale is zoom. standard mmToPx = (mm * 96) / 25.4
            // 
            // If our canvas container is sized in px (pageWidthPx), and we click on it...
            // The event coordinates are relative to the container.
            // So newRect is in "CSS Pixels" of the *unscaled* canvas if we divide by scale?
            // Yes. 
            // But elements store position in mm.
            // We need to convert element box to CSS Pixels or rect to mm.
            // Converting element to px is safer.

            // Let's assume mmToPx works.
            const elRectPx = {
                x: el.position.x * (96 / 25.4),
                y: el.position.y * (96 / 25.4),
                width: el.size.width * (96 / 25.4),
                height: el.size.height * (96 / 25.4)
            };

            return rectIntersects(newRect, elRectPx);
        }).map(el => el.id);

        onSelect(selected);

    }, [scale, elements, onSelect]);

    const endSelection = useCallback(() => {
        startPos.current = null;
        setSelectionRect(null);
    }, []);

    return {
        selectionRect,
        startSelection,
        updateSelection,
        endSelection
    };
}
