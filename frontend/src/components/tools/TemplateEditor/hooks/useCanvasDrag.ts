import { useState, useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { TemplateElement, CanvasDocument, pxToMm } from '../canvasTypes';
import { calculateSnap, SnapResult } from '../utils/snapUtils';

interface DragState {
    isDragging: boolean;
    elementId: string | null;
    dragIds: string[];
    startX: number;
    startY: number;
    initialPositions: Record<string, { x: number; y: number }>;
    pointerOffset: { x: number; y: number };
}

interface UseCanvasDragOptions {
    canvasRef?: RefObject<HTMLElement>;
    selectedIds?: string[];
    onUpdateElements?: (updates: Map<string, Partial<TemplateElement>>) => void;
}

const EMPTY_DRAG_STATE: DragState = {
    isDragging: false,
    elementId: null,
    dragIds: [],
    startX: 0,
    startY: 0,
    initialPositions: {},
    pointerOffset: { x: 0, y: 0 },
};

export function useCanvasDrag(
    scale: number,
    snapEnabled: boolean,
    gridSize: number,
    elements: TemplateElement[],
    pageSettings: CanvasDocument['pageSettings'],
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void,
    options?: UseCanvasDragOptions,
) {
    const [dragState, setDragState] = useState<DragState>(EMPTY_DRAG_STATE);
    const [snapGuides, setSnapGuides] = useState<SnapResult['guides']>([]);
    const dragStateRef = useRef(dragState);
    dragStateRef.current = dragState;

    const resolveCanvasPoint = useCallback(
        (clientX: number, clientY: number) => {
            const canvasNode = options?.canvasRef?.current;
            if (!canvasNode || scale <= 0) return null;
            const canvasRect = canvasNode.getBoundingClientRect();
            return {
                x: pxToMm((clientX - canvasRect.left) / scale),
                y: pxToMm((clientY - canvasRect.top) / scale),
            };
        },
        [options?.canvasRef, scale],
    );

    const applyDragAt = useCallback(
        (clientX: number, clientY: number) => {
            const state = dragStateRef.current;
            if (!state.isDragging || !state.elementId) return;

            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            const primaryId = state.elementId;
            const primaryInitial = state.initialPositions[primaryId];
            const primaryElement = elements.find((element) => element.id === primaryId);
            if (!primaryInitial || !primaryElement) return;

            const pointInCanvas = resolveCanvasPoint(clientX, clientY);
            let anchorX: number;
            let anchorY: number;

            if (pointInCanvas) {
                anchorX = pointInCanvas.x - state.pointerOffset.x;
                anchorY = pointInCanvas.y - state.pointerOffset.y;
            } else {
                const dxMm = pxToMm((clientX - state.startX) / Math.max(scale, 0.001));
                const dyMm = pxToMm((clientY - state.startY) / Math.max(scale, 0.001));
                anchorX = primaryInitial.x + dxMm;
                anchorY = primaryInitial.y + dyMm;
            }

            let guides: SnapResult['guides'] = [];
            if (snapEnabled) {
                const snapGrid = (value: number) => Math.round(value / gridSize) * gridSize;
                anchorX = snapGrid(anchorX);
                anchorY = snapGrid(anchorY);

                const snapRes = calculateSnap(
                    primaryId,
                    { x: anchorX, y: anchorY },
                    primaryElement.size,
                    elements,
                    pageSettings,
                );

                if (snapRes.x !== undefined) anchorX = snapRes.x;
                if (snapRes.y !== undefined) anchorY = snapRes.y;
                guides = snapRes.guides;
            }

            anchorX = Math.max(0, Math.min(anchorX, pageSettings.width - primaryElement.size.width));
            anchorY = Math.max(0, Math.min(anchorY, pageSettings.height - primaryElement.size.height));

            const deltaX = anchorX - primaryInitial.x;
            const deltaY = anchorY - primaryInitial.y;
            const updateMap = new Map<string, Partial<TemplateElement>>();

            draggedIds.forEach((dragId) => {
                const initial = state.initialPositions[dragId];
                const element = elements.find((item) => item.id === dragId);
                if (!initial || !element) return;

                const nextX = Math.max(0, Math.min(initial.x + deltaX, pageSettings.width - element.size.width));
                const nextY = Math.max(0, Math.min(initial.y + deltaY, pageSettings.height - element.size.height));
                updateMap.set(dragId, { position: { x: nextX, y: nextY } });
            });

            if (updateMap.size === 0) {
                setSnapGuides([]);
                return;
            }

            if (updateMap.size > 1 && options?.onUpdateElements) {
                options.onUpdateElements(updateMap);
            } else {
                updateMap.forEach((updates, id) => {
                    onUpdateElement(id, updates);
                });
            }

            setSnapGuides(guides);
        },
        [
            elements,
            gridSize,
            onUpdateElement,
            options,
            pageSettings,
            resolveCanvasPoint,
            scale,
            snapEnabled,
        ],
    );

    const endDrag = useCallback(() => {
        setDragState(EMPTY_DRAG_STATE);
        setSnapGuides([]);
    }, []);

    const startDrag = useCallback(
        (e: ReactMouseEvent, elementId: string) => {
            e.stopPropagation();
            const element = elements.find((candidate) => candidate.id === elementId);
            if (!element || element.locked) return;

            const selected = options?.selectedIds || [];
            const shouldDragSelection = selected.includes(elementId) && selected.length > 1 && !e.shiftKey;
            const dragIds = (shouldDragSelection ? selected : [elementId]).filter((id) => {
                const target = elements.find((candidate) => candidate.id === id);
                return !!target && !target.locked;
            });
            if (dragIds.length === 0) return;

            const initialPositions: Record<string, { x: number; y: number }> = {};
            dragIds.forEach((id) => {
                const target = elements.find((candidate) => candidate.id === id);
                if (!target) return;
                initialPositions[id] = { ...target.position };
            });

            const primaryInitial = initialPositions[elementId] ?? element.position;
            const pointInCanvas = resolveCanvasPoint(e.clientX, e.clientY);
            const pointerOffset = pointInCanvas
                ? {
                    x: pointInCanvas.x - primaryInitial.x,
                    y: pointInCanvas.y - primaryInitial.y,
                }
                : { x: 0, y: 0 };

            setDragState({
                isDragging: true,
                elementId,
                dragIds,
                startX: e.clientX,
                startY: e.clientY,
                initialPositions,
                pointerOffset,
            });
        },
        [elements, options?.selectedIds, resolveCanvasPoint],
    );

    const updateDrag = useCallback(
        (e: MouseEvent) => {
            applyDragAt(e.clientX, e.clientY);
        },
        [applyDragAt],
    );

    useEffect(() => {
        if (!dragState.isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            applyDragAt(e.clientX, e.clientY);
        };

        const handleMouseUp = () => {
            endDrag();
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [applyDragAt, dragState.isDragging, endDrag]);

    return {
        isDragging: dragState.isDragging,
        dragStart: startDrag,
        dragUpdate: updateDrag,
        dragEnd: endDrag,
        snapGuides,
    };
}
