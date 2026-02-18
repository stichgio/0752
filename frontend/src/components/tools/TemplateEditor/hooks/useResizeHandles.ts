import { useState, useCallback } from 'react';
import { TemplateElement } from '../canvasTypes';
import { pxToMm } from '../canvasTypes';

type HandleDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface ResizeState {
    isResizing: boolean;
    elementId: string | null;
    direction: HandleDirection | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
}

export function useResizeHandles(
    scale: number,
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void
) {
    const [resizeState, setResizeState] = useState<ResizeState>({
        isResizing: false,
        elementId: null,
        direction: null,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        initialW: 0,
        initialH: 0
    });

    const startResize = useCallback((
        e: React.MouseEvent,
        element: TemplateElement,
        direction: HandleDirection
    ) => {
        e.stopPropagation();
        setResizeState({
            isResizing: true,
            elementId: element.id,
            direction,
            startX: e.clientX,
            startY: e.clientY,
            initialX: element.position.x,
            initialY: element.position.y,
            initialW: element.size.width,
            initialH: element.size.height
        });
    }, []);

    const updateResize = useCallback((e: MouseEvent) => {
        if (!resizeState.isResizing || !resizeState.direction) return;

        const dxPx = e.clientX - resizeState.startX;
        const dyPx = e.clientY - resizeState.startY;

        const dx = pxToMm(dxPx / scale);
        const dy = pxToMm(dyPx / scale);

        let { initialX: x, initialY: y, initialW: w, initialH: h } = resizeState;
        const { direction } = resizeState;

        if (direction.includes('e')) w += dx;
        if (direction.includes('w')) {
            x += dx;
            w -= dx;
        }
        if (direction.includes('s')) h += dy;
        if (direction.includes('n')) {
            y += dy;
            h -= dy;
        }

        // Constraint min size
        if (w < 1) w = 1;
        if (h < 1) h = 1;

        onUpdateElement(resizeState.elementId!, {
            position: { x, y },
            size: { width: w, height: h }
        });

    }, [resizeState, scale, onUpdateElement]);

    const endResize = useCallback(() => {
        setResizeState(prev => ({ ...prev, isResizing: false, elementId: null, direction: null }));
    }, []);

    return {
        isResizing: resizeState.isResizing,
        resizeStart: startResize,
        resizeUpdate: updateResize,
        resizeEnd: endResize
    };
}
