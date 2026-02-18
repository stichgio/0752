import { useState, useCallback } from 'react';
import { TemplateElement, CanvasDocument } from '../canvasTypes';
import { calculateSnap, SnapResult } from '../utils/snapUtils';
import { mmToPx, pxToMm } from '../canvasTypes';

interface DragState {
    isDragging: boolean;
    elementId: string | null;
    startX: number;
    startY: number;
    initialPos: { x: number; y: number };
}

export function useCanvasDrag(
    scale: number,
    snapEnabled: boolean,
    gridSize: number,
    elements: TemplateElement[],
    pageSettings: CanvasDocument['pageSettings'],
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void
) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        elementId: null,
        startX: 0,
        startY: 0,
        initialPos: { x: 0, y: 0 }
    });

    const [snapGuides, setSnapGuides] = useState<SnapResult['guides']>([]);

    const startDrag = useCallback((e: React.MouseEvent, elementId: string) => {
        e.stopPropagation();
        const element = elements.find(el => el.id === elementId);
        if (!element || element.locked) return;

        setDragState({
            isDragging: true,
            elementId,
            startX: e.clientX,
            startY: e.clientY,
            initialPos: { x: element.position.x, y: element.position.y }
        });
    }, [elements]);

    const updateDrag = useCallback((e: MouseEvent) => {
        if (!dragState.isDragging || !dragState.elementId) return;

        const dxPx = e.clientX - dragState.startX;
        const dyPx = e.clientY - dragState.startY;

        // Convert delta pixels to mm, adjusted for zoom scale
        const dxMm = pxToMm(dxPx / scale);
        const dyMm = pxToMm(dyPx / scale);

        let newX = dragState.initialPos.x + dxMm;
        let newY = dragState.initialPos.y + dyMm;

        let guides: SnapResult['guides'] = [];

        if (snapEnabled) {
            // 1. Grid Snap
            // (Simplified grid snap logic here, can be enhanced)
            const snapGrid = (val: number) => Math.round(val / gridSize) * gridSize;

            // Check if close to grid
            if (Math.abs(newX - snapGrid(newX)) < 1) newX = snapGrid(newX);
            if (Math.abs(newY - snapGrid(newY)) < 1) newY = snapGrid(newY);

            // 2. Element/Page Snap
            const element = elements.find(el => el.id === dragState.elementId);
            if (element) {
                const snapRes = calculateSnap(
                    dragState.elementId!,
                    { x: newX, y: newY },
                    element.size,
                    elements,
                    pageSettings
                );

                if (snapRes.x !== undefined) newX = snapRes.x;
                if (snapRes.y !== undefined) newY = snapRes.y;
                guides = snapRes.guides;
            }
        }

        setSnapGuides(guides);
        onUpdateElement(dragState.elementId, { position: { x: newX, y: newY } });

    }, [dragState, scale, snapEnabled, gridSize, elements, pageSettings, onUpdateElement]);

    const endDrag = useCallback(() => {
        setDragState(prev => ({ ...prev, isDragging: false, elementId: null }));
        setSnapGuides([]);
    }, []);

    return {
        isDragging: dragState.isDragging,
        dragStart: startDrag,
        dragUpdate: updateDrag,
        dragEnd: endDrag,
        snapGuides
    };
}
