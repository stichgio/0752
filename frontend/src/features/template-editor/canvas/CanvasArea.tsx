import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
    CanvasDocument,
    TemplateElement,
    pxToMm,
    mmToPx,
    ElementType,
    ElementPreset,
    BlockPreset,
    PageSettings,
} from '../canvasTypes';
import { CanvasElement } from './CanvasElement';
import { useSnapGrid } from '../hooks/useSnapGrid';
import {
    buildDocumentSnapLines,
    collectSnapLines,
    computeSnapPosition,
    DEFAULT_SMART_SNAP_THRESHOLD_MM,
    findNearestSnapValue,
    type CollectedSnapLines,
    type DocumentSnapLines,
    type SnapGuide,
} from '../utils/snapUtils';
import { Lock } from 'lucide-react';
import { resolveDropPosition, shouldActivateDrag, type DropAnchor } from '../utils/dragDropUtils';
import { getPageElements } from '../documentModel';

interface CanvasAreaProps {
    document: CanvasDocument;
    activePageId: string;
    pageSettings: PageSettings;
    onChange: (doc: CanvasDocument) => void;
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onAddElement: (
        type: ElementType,
        position?: { x: number; y: number },
        presetId?: ElementPreset,
        overrides?: Partial<TemplateElement>,
    ) => void;
    onAddBlock?: (blockId: BlockPreset, position: { x: number; y: number }) => void;
    viewport: { zoom: number; panX: number; panY: number };
    onZoomChange: (z: number) => void;
    isPanning?: boolean;
    onContainerPointerDown?: (e: React.PointerEvent) => void;
    snapEnabled: boolean;
    gridSize: number;
    showGrid: boolean;
    dataPreview?: Record<string, unknown>;
    viewportRef?: React.Ref<HTMLDivElement>;
}

interface InteractionState {
    mode: 'idle' | 'drag-pending' | 'drag' | 'resize' | 'rotate' | 'marquee';
    elementId: string | null;
    startClientX: number;
    startClientY: number;
    initialPos: { x: number; y: number };
    dragIds: string[];
    dragInitialPositions: Record<string, { x: number; y: number }>;
    dragBounds: { x: number; y: number; width: number; height: number };
    direction: string;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    initialRotation: number;
    marqueeStart: { x: number; y: number };
    resizeGroupChildren: TemplateElement[];
}

const defaultInteraction: InteractionState = {
    mode: 'idle',
    elementId: null,
    startClientX: 0,
    startClientY: 0,
    initialPos: { x: 0, y: 0 },
    dragIds: [],
    dragInitialPositions: {},
    dragBounds: { x: 0, y: 0, width: 0, height: 0 },
    direction: '',
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0,
    centerX: 0,
    centerY: 0,
    startAngle: 0,
    initialRotation: 0,
    marqueeStart: { x: 0, y: 0 },
    resizeGroupChildren: [],
};

interface DragSessionState {
    active: boolean;
    primaryId: string | null;
    dragIds: string[];
}

interface PaletteDragPayload {
    type?: ElementType;
    presetId?: ElementPreset;
    overrides?: Partial<TemplateElement>;
    dropSize?: TemplateElement['size'];
    dropAnchor?: DropAnchor;
}

interface PaletteBlockPayload {
    dropSize?: TemplateElement['size'];
    dropAnchor?: DropAnchor;
}

interface DragResolution {
    anchorX: number;
    anchorY: number;
    deltaX: number;
    deltaY: number;
    guides: SnapGuide[];
}

interface PendingDragPoint {
    clientX: number;
    clientY: number;
    bypassSnap: boolean;
}

const MIN_SIZE_MM = 2;

function isSnapTemporarilyDisabled(event: { altKey?: boolean; metaKey?: boolean }) {
    return !!event.altKey || !!event.metaKey;
}

export function CanvasArea({
    document: doc,
    activePageId,
    pageSettings,
    onChange,
    selectedIds,
    onSelect,
    onAddElement,
    onAddBlock,
    viewport,
    onZoomChange,
    isPanning,
    onContainerPointerDown,
    snapEnabled,
    gridSize,
    showGrid,
    dataPreview,
    viewportRef,
}: CanvasAreaProps) {
    const { zoom, panX, panY } = viewport;
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<InteractionState>({ ...defaultInteraction });
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [dragSession, setDragSession] = useState<DragSessionState>({
        active: false,
        primaryId: null,
        dragIds: [],
    });
    const [aspectLockIndicator, setAspectLockIndicator] = useState<{ x: number; y: number } | null>(null);
    const gridPatternIdRef = useRef(`canvas-grid-${Math.random().toString(36).slice(2, 9)}`);
    const pageElements = useMemo(() => getPageElements(doc, activePageId), [doc, activePageId]);
    const elementMap = useMemo(() => {
        const next = new Map<string, TemplateElement>();
        pageElements.forEach((element) => {
            next.set(element.id, element);
        });
        return next;
    }, [pageElements]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const sortedVisibleElements = useMemo(
        () =>
            [...pageElements]
                .filter((element) => element.visible !== false)
                .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)),
        [pageElements],
    );

    const docRef = useRef(doc);
    const scaleRef = useRef(zoom / 100);
    const pageSettingsRef = useRef(pageSettings);
    const selectedIdsRef = useRef(selectedIds);
    // Keep the full document cache updated outside pointer-move handlers.
    const documentSnapLinesRef = useRef<DocumentSnapLines>(buildDocumentSnapLines(pageElements, pageSettings));
    // Each drag/resize interaction gets a filtered copy so move handlers only read arrays.
    const activeSnapLinesRef = useRef<CollectedSnapLines | null>(null);
    const dragRafRef = useRef<number | null>(null);
    const pendingDragPointRef = useRef<PendingDragPoint | null>(null);
    const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const dragPointerOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastResolvedDragRef = useRef<DragResolution | null>(null);
    const activeDragPointerIdRef = useRef<number | null>(null);
    const activeDragPointerTargetRef = useRef<HTMLElement | null>(null);
    const elementNodeMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const elementMapRef = useRef(elementMap);
    const verticalGuideRef = useRef<HTMLDivElement>(null);
    const horizontalGuideRef = useRef<HTMLDivElement>(null);
    const snapEnabledRef = useRef(snapEnabled);

    docRef.current = doc;
    scaleRef.current = zoom / 100;
    pageSettingsRef.current = pageSettings;
    selectedIdsRef.current = selectedIds;
    snapEnabledRef.current = snapEnabled;
    elementMapRef.current = elementMap;

    const scale = zoom / 100;
    const mmToCanvasPx = (mm: number) => mmToPx(mm);
    const normalizedGridSize = Math.max(1, gridSize);
    const { snapToGrid } = useSnapGrid(normalizedGridSize, snapEnabled);

    const updateElement = useCallback(
        (id: string, updates: Partial<TemplateElement>) => {
            const newElements = docRef.current.elements.map((el) => (el.id === id ? { ...el, ...updates } : el));
            onChange({ ...docRef.current, elements: newElements });
        },
        [onChange],
    );

    const updateElements = useCallback(
        (updates: Map<string, Partial<TemplateElement>>) => {
            if (updates.size === 0) return;

            let changed = false;
            const newElements = docRef.current.elements.map((el) => {
                const next = updates.get(el.id);
                if (!next) return el;
                changed = true;
                return { ...el, ...next };
            });

            if (!changed) return;
            onChange({ ...docRef.current, elements: newElements });
        },
        [onChange],
    );

    const setElementNodeRef = useCallback((id: string, node: HTMLDivElement | null) => {
        if (node) {
            elementNodeMapRef.current.set(id, node);
            return;
        }
        elementNodeMapRef.current.delete(id);
    }, []);

    const clearDragVisual = useCallback((dragIds: string[]) => {
        dragOffsetRef.current = { x: 0, y: 0 };
        dragIds.forEach((dragId) => {
            const node = elementNodeMapRef.current.get(dragId);
            if (!node) return;
            node.style.removeProperty('--drag-tx');
            node.style.removeProperty('--drag-ty');
        });
    }, []);

    const clearAlignmentGuideVisual = useCallback(() => {
        if (verticalGuideRef.current) {
            verticalGuideRef.current.style.display = 'none';
        }
        if (horizontalGuideRef.current) {
            horizontalGuideRef.current.style.display = 'none';
        }
    }, []);

    const applyAlignmentGuideVisual = useCallback(
        (guides: SnapGuide[]) => {
            const xGuide = guides.find((guide) => guide.axis === 'x');
            const yGuide = guides.find((guide) => guide.axis === 'y');

            if (verticalGuideRef.current) {
                if (xGuide) {
                    verticalGuideRef.current.style.display = 'block';
                    verticalGuideRef.current.style.left = `${mmToCanvasPx(xGuide.position)}px`;
                } else {
                    verticalGuideRef.current.style.display = 'none';
                }
            }

            if (horizontalGuideRef.current) {
                if (yGuide) {
                    horizontalGuideRef.current.style.display = 'block';
                    horizontalGuideRef.current.style.top = `${mmToCanvasPx(yGuide.position)}px`;
                } else {
                    horizontalGuideRef.current.style.display = 'none';
                }
            }
        },
        [mmToCanvasPx],
    );

    const refreshDocumentSnapLines = useCallback(() => {
        documentSnapLinesRef.current = buildDocumentSnapLines(getPageElements(docRef.current, activePageId), pageSettingsRef.current);
    }, []);

    const getSmartSnapThresholdMm = useCallback(() => {
        const scaleValue = Math.max(scaleRef.current, 0.001);
        return Math.max(DEFAULT_SMART_SNAP_THRESHOLD_MM, pxToMm(6 / scaleValue));
    }, []);

    const getCanvasPointFromClient = useCallback((clientX: number, clientY: number) => {
        if (!pageRef.current) return null;

        const sc = scaleRef.current;
        if (sc <= 0) return null;

        const pageRect = pageRef.current.getBoundingClientRect();
        return {
            x: pxToMm((clientX - pageRect.left) / sc),
            y: pxToMm((clientY - pageRect.top) / sc),
        };
    }, []);

    const clampDragDelta = useCallback(
        (
            deltaX: number,
            deltaY: number,
            dragIds: string[],
            dragInitialPositions: Record<string, { x: number; y: number }>,
            elementMap: Map<string, TemplateElement>,
        ) => {
            const page = pageSettingsRef.current;
            let minDeltaX = Number.NEGATIVE_INFINITY;
            let maxDeltaX = Number.POSITIVE_INFINITY;
            let minDeltaY = Number.NEGATIVE_INFINITY;
            let maxDeltaY = Number.POSITIVE_INFINITY;

            dragIds.forEach((dragId) => {
                const initial = dragInitialPositions[dragId];
                const element = elementMap.get(dragId);
                if (!initial || !element) return;

                minDeltaX = Math.max(minDeltaX, -initial.x);
                maxDeltaX = Math.min(maxDeltaX, page.width - element.size.width - initial.x);
                minDeltaY = Math.max(minDeltaY, -initial.y);
                maxDeltaY = Math.min(maxDeltaY, page.height - element.size.height - initial.y);
            });

            if (!Number.isFinite(minDeltaX) || !Number.isFinite(maxDeltaX)) {
                return { x: deltaX, y: deltaY };
            }

            if (minDeltaX > maxDeltaX) {
                const clamped = Math.min(minDeltaX, maxDeltaX);
                minDeltaX = clamped;
                maxDeltaX = clamped;
            }

            if (minDeltaY > maxDeltaY) {
                const clamped = Math.min(minDeltaY, maxDeltaY);
                minDeltaY = clamped;
                maxDeltaY = clamped;
            }

            return {
                x: Math.max(minDeltaX, Math.min(maxDeltaX, deltaX)),
                y: Math.max(minDeltaY, Math.min(maxDeltaY, deltaY)),
            };
        },
        [],
    );

    const resolveDragAt = useCallback(
        (point: PendingDragPoint): DragResolution | null => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' || !state.elementId) return null;

            const pointer = getCanvasPointFromClient(point.clientX, point.clientY);
            if (!pointer) return null;

            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            const elementMap = elementMapRef.current;
            const anchorInitial = state.dragInitialPositions[state.elementId] ?? state.initialPos;

            let deltaX = pointer.x - dragPointerOffsetRef.current.x - anchorInitial.x;
            let deltaY = pointer.y - dragPointerOffsetRef.current.y - anchorInitial.y;

            const initialClamp = clampDragDelta(deltaX, deltaY, draggedIds, state.dragInitialPositions, elementMap);
            deltaX = initialClamp.x;
            deltaY = initialClamp.y;

            let guides: SnapGuide[] = [];
            const shouldSnap = snapEnabledRef.current && !point.bypassSnap;

            if (shouldSnap) {
                // Smart snap wins when a page/element line is within threshold; grid is the fallback.
                const snapLines = activeSnapLinesRef.current ?? collectSnapLines(documentSnapLinesRef.current, draggedIds);
                const snappedBounds = computeSnapPosition(
                    {
                        x: state.dragBounds.x + deltaX,
                        y: state.dragBounds.y + deltaY,
                        width: state.dragBounds.width,
                        height: state.dragBounds.height,
                    },
                    snapLines,
                    {
                        threshold: getSmartSnapThresholdMm(),
                        gridSize: normalizedGridSize,
                        enableGrid: true,
                        enableSmartSnap: true,
                    },
                );

                const snappedClamp = clampDragDelta(
                    snappedBounds.x - state.dragBounds.x,
                    snappedBounds.y - state.dragBounds.y,
                    draggedIds,
                    state.dragInitialPositions,
                    elementMap,
                );

                const wasXClamped = Math.abs(snappedClamp.x - (snappedBounds.x - state.dragBounds.x)) > 0.001;
                const wasYClamped = Math.abs(snappedClamp.y - (snappedBounds.y - state.dragBounds.y)) > 0.001;

                deltaX = snappedClamp.x;
                deltaY = snappedClamp.y;
                guides = snappedBounds.guides;
                if (wasXClamped || wasYClamped) {
                    guides = guides.filter((guide) => {
                        if (guide.axis === 'x' && wasXClamped) return false;
                        if (guide.axis === 'y' && wasYClamped) return false;
                        return true;
                    });
                }
            }

            const anchorX = anchorInitial.x + deltaX;
            const anchorY = anchorInitial.y + deltaY;

            return {
                anchorX,
                anchorY,
                deltaX,
                deltaY,
                guides,
            };
        },
        [clampDragDelta, getCanvasPointFromClient, getSmartSnapThresholdMm, normalizedGridSize],
    );

    const applyDragVisualAt = useCallback(
        (point: PendingDragPoint) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' || !state.elementId) return;

            const resolved = resolveDragAt(point);
            if (!resolved) return;

            lastResolvedDragRef.current = resolved;
            dragOffsetRef.current = { x: resolved.deltaX, y: resolved.deltaY };
            applyAlignmentGuideVisual(resolved.guides);

            const translateXPx = mmToCanvasPx(dragOffsetRef.current.x);
            const translateYPx = mmToCanvasPx(dragOffsetRef.current.y);
            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];

            draggedIds.forEach((dragId) => {
                const node = elementNodeMapRef.current.get(dragId);
                if (!node) return;
                node.style.setProperty('--drag-tx', `${translateXPx}px`);
                node.style.setProperty('--drag-ty', `${translateYPx}px`);
            });
        },
        [applyAlignmentGuideVisual, mmToCanvasPx, resolveDragAt],
    );

    const flushPendingDragFrame = useCallback(() => {
        dragRafRef.current = null;
        const point = pendingDragPointRef.current;
        if (!point) return;
        applyDragVisualAt(point);
    }, [applyDragVisualAt]);

    const scheduleDragFrame = useCallback(() => {
        if (dragRafRef.current !== null) return;
        dragRafRef.current = window.requestAnimationFrame(flushPendingDragFrame);
    }, [flushPendingDragFrame]);

    const activatePendingDrag = useCallback(
        (point: PendingDragPoint) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag-pending' || !state.elementId) return;

            const dragIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            const pointerId = activeDragPointerIdRef.current;
            const pointerTarget = activeDragPointerTargetRef.current;
            if (
                pointerId !== null &&
                pointerTarget &&
                !pointerTarget.hasPointerCapture(pointerId)
            ) {
                pointerTarget.setPointerCapture(pointerId);
            }
            refreshDocumentSnapLines();
            activeSnapLinesRef.current = collectSnapLines(documentSnapLinesRef.current, dragIds);
            pendingDragPointRef.current = point;
            interactionRef.current = { ...state, mode: 'drag' };
            setDragSession({
                active: true,
                primaryId: state.elementId,
                dragIds,
            });
        },
        [refreshDocumentSnapLines],
    );

    const cancelPendingDrag = useCallback(() => {
        const state = interactionRef.current;
        if (state.mode !== 'drag-pending') return;

        if (dragRafRef.current !== null) {
            window.cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
        }

        const draggedIds = state.dragIds.length > 0
            ? state.dragIds
            : (state.elementId ? [state.elementId] : []);
        if (draggedIds.length > 0) {
            clearDragVisual(draggedIds);
        }
        clearAlignmentGuideVisual();
        dragPointerOffsetRef.current = { x: 0, y: 0 };

        const pointerId = activeDragPointerIdRef.current;
        const pointerTarget = activeDragPointerTargetRef.current;
        if (
            pointerId !== null &&
            pointerTarget &&
            pointerTarget.hasPointerCapture(pointerId)
        ) {
            pointerTarget.releasePointerCapture(pointerId);
        }

        activeDragPointerIdRef.current = null;
        activeDragPointerTargetRef.current = null;
        pendingDragPointRef.current = null;
        lastResolvedDragRef.current = null;
        activeSnapLinesRef.current = null;
        setDragSession({ active: false, primaryId: null, dragIds: [] });
        interactionRef.current = { ...defaultInteraction };
    }, [clearAlignmentGuideVisual, clearDragVisual]);

    const commitDrag = useCallback(
        () => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' || !state.elementId) return;

            const resolved = lastResolvedDragRef.current;
            if (!resolved) return;

            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            const deltaX = resolved.deltaX;
            const deltaY = resolved.deltaY;
            const updates = new Map<string, Partial<TemplateElement>>();
            const elementMap = elementMapRef.current;

            draggedIds.forEach((dragId) => {
                const initial = state.dragInitialPositions[dragId];
                const current = elementMap.get(dragId);
                if (!initial || !current) return;

                const nextX = initial.x + deltaX;
                const nextY = initial.y + deltaY;

                if (
                    Math.abs(current.position.x - nextX) < 0.001 &&
                    Math.abs(current.position.y - nextY) < 0.001
                ) {
                    return;
                }

                updates.set(dragId, { position: { x: nextX, y: nextY } });
            });

            if (updates.size === 0) return;
            if (updates.size === 1) {
                const [id, next] = updates.entries().next().value as [string, Partial<TemplateElement>];
                updateElement(id, next);
                return;
            }
            updateElements(updates);
        },
        [updateElement, updateElements],
    );

    const finishDrag = useCallback(
        (fallbackPoint?: PendingDragPoint) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' || !state.elementId) return;

            if (dragRafRef.current !== null) {
                window.cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }

            const finalPoint = pendingDragPointRef.current ?? fallbackPoint ?? {
                clientX: state.startClientX,
                clientY: state.startClientY,
                bypassSnap: false,
            };
            applyDragVisualAt(finalPoint);
            commitDrag();

            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            clearDragVisual(draggedIds);
            clearAlignmentGuideVisual();
            dragPointerOffsetRef.current = { x: 0, y: 0 };

            const pointerId = activeDragPointerIdRef.current;
            const pointerTarget = activeDragPointerTargetRef.current;
            if (
                pointerId !== null &&
                pointerTarget &&
                pointerTarget.hasPointerCapture(pointerId)
            ) {
                pointerTarget.releasePointerCapture(pointerId);
            }

            activeDragPointerIdRef.current = null;
            activeDragPointerTargetRef.current = null;
            pendingDragPointRef.current = null;
            lastResolvedDragRef.current = null;
            activeSnapLinesRef.current = null;
            setDragSession({ active: false, primaryId: null, dragIds: [] });
            interactionRef.current = { ...defaultInteraction };
            refreshDocumentSnapLines();
        },
        [applyDragVisualAt, clearAlignmentGuideVisual, clearDragVisual, commitDrag, refreshDocumentSnapLines],
    );

    const handleGlobalMouseMove = useCallback(
        (e: MouseEvent) => {
            const state = interactionRef.current;
            const sc = scaleRef.current;

            if (state.mode === 'resize' && state.elementId) {
                const dxPx = e.clientX - state.startClientX;
                const dyPx = e.clientY - state.startClientY;
                const dx = pxToMm(dxPx / sc);
                const dy = pxToMm(dyPx / sc);
                const dir = state.direction;

                let x = state.initialX;
                let y = state.initialY;
                let w = state.initialW;
                let h = state.initialH;

                if (dir.includes('e')) w += dx;
                if (dir.includes('w')) {
                    x += dx;
                    w -= dx;
                }
                if (dir.includes('s')) h += dy;
                if (dir.includes('n')) {
                    y += dy;
                    h -= dy;
                }

                const isCorner = dir === 'se' || dir === 'nw' || dir === 'ne' || dir === 'sw';
                if (e.shiftKey && isCorner && state.initialW > 0 && state.initialH > 0) {
                    const ratio = state.initialW / state.initialH;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        const newH = w / ratio;
                        if (dir.includes('n')) y = state.initialY + state.initialH - newH;
                        h = newH;
                    } else {
                        const newW = h * ratio;
                        if (dir.includes('w')) x = state.initialX + state.initialW - newW;
                        w = newW;
                    }
                    setAspectLockIndicator({ x: e.clientX, y: e.clientY });
                } else {
                    setAspectLockIndicator(null);
                }

                let left = x;
                let top = y;
                let right = x + w;
                let bottom = y + h;
                const shouldSnap = snapEnabledRef.current && !isSnapTemporarilyDisabled(e);
                let guides: SnapGuide[] = [];

                if (shouldSnap) {
                    const thresholdMm = getSmartSnapThresholdMm();
                    const snapLines = activeSnapLinesRef.current ?? collectSnapLines(documentSnapLinesRef.current, state.elementId);

                    if (dir.includes('w')) {
                        const match = findNearestSnapValue(left, snapLines.x, thresholdMm);
                        if (match) {
                            left = match.value;
                            guides.push({ axis: 'x', position: match.value });
                        } else {
                            left = snapToGrid(left);
                        }
                    }

                    if (dir.includes('e')) {
                        const match = findNearestSnapValue(right, snapLines.x, thresholdMm);
                        if (match) {
                            right = match.value;
                            guides.push({ axis: 'x', position: match.value });
                        } else {
                            right = snapToGrid(right);
                        }
                    }

                    if (dir.includes('n')) {
                        const match = findNearestSnapValue(top, snapLines.y, thresholdMm);
                        if (match) {
                            top = match.value;
                            guides.push({ axis: 'y', position: match.value });
                        } else {
                            top = snapToGrid(top);
                        }
                    }

                    if (dir.includes('s')) {
                        const match = findNearestSnapValue(bottom, snapLines.y, thresholdMm);
                        if (match) {
                            bottom = match.value;
                            guides.push({ axis: 'y', position: match.value });
                        } else {
                            bottom = snapToGrid(bottom);
                        }
                    }
                }

                w = right - left;
                h = bottom - top;

                let xGuideInvalid = false;
                let yGuideInvalid = false;

                if (w < MIN_SIZE_MM) {
                    if (dir.includes('w')) left = right - MIN_SIZE_MM;
                    else right = left + MIN_SIZE_MM;
                    w = MIN_SIZE_MM;
                    xGuideInvalid = true;
                }
                if (h < MIN_SIZE_MM) {
                    if (dir.includes('n')) top = bottom - MIN_SIZE_MM;
                    else bottom = top + MIN_SIZE_MM;
                    h = MIN_SIZE_MM;
                    yGuideInvalid = true;
                }

                if (xGuideInvalid || yGuideInvalid) {
                    guides = guides.filter((guide) => {
                        if (guide.axis === 'x' && xGuideInvalid) return false;
                        if (guide.axis === 'y' && yGuideInvalid) return false;
                        return true;
                    });
                }

                if (shouldSnap) {
                    applyAlignmentGuideVisual(guides);
                } else {
                    clearAlignmentGuideVisual();
                }

                x = left;
                y = top;

                const activeElement = docRef.current.elements.find((element) => element.id === state.elementId);

                if (activeElement?.type === 'group') {
                    const sourceChildren =
                        state.resizeGroupChildren.length > 0
                            ? state.resizeGroupChildren
                            : (activeElement.groupChildren || []);
                    const scaleX = state.initialW > 0 ? w / state.initialW : 1;
                    const scaleY = state.initialH > 0 ? h / state.initialH : 1;
                    const resizedChildren = sourceChildren.map((child) => ({
                        ...child,
                        position: {
                            x: child.position.x * scaleX,
                            y: child.position.y * scaleY,
                        },
                        size: {
                            width: Math.max(MIN_SIZE_MM, child.size.width * scaleX),
                            height: Math.max(MIN_SIZE_MM, child.size.height * scaleY),
                        },
                    }));

                    updateElement(state.elementId, {
                        position: { x, y },
                        size: { width: w, height: h },
                        children: resizedChildren.map((child) => child.id),
                        groupChildren: resizedChildren,
                    });
                    return;
                }

                updateElement(state.elementId, {
                    position: { x, y },
                    size: { width: w, height: h },
                });
                return;
            }

            if (state.mode === 'rotate' && state.elementId) {
                const dx = e.clientX - state.centerX;
                const dy = e.clientY - state.centerY;
                const angle = Math.atan2(dy, dx);
                const delta = angle - state.startAngle;
                let deg = state.initialRotation + (delta * 180) / Math.PI;

                if (e.shiftKey) {
                    deg = Math.round(deg / 15) * 15;
                }

                deg = ((deg % 360) + 360) % 360;
                updateElement(state.elementId, { rotation: deg });
                return;
            }

            if (state.mode === 'marquee') {
                if (!pageRef.current) return;
                const pageRect = pageRef.current.getBoundingClientRect();
                const currentX = pxToMm((e.clientX - pageRect.left) / sc);
                const currentY = pxToMm((e.clientY - pageRect.top) / sc);

                const mx = Math.min(state.marqueeStart.x, currentX);
                const my = Math.min(state.marqueeStart.y, currentY);
                const mw = Math.abs(currentX - state.marqueeStart.x);
                const mh = Math.abs(currentY - state.marqueeStart.y);

                setMarquee({ x: mx, y: my, w: mw, h: mh });

                const selected = docRef.current.elements
                    .filter((el) => el.visible !== false && !el.locked)
                    .filter((el) => {
                        return (
                            el.position.x < mx + mw &&
                            el.position.x + el.size.width > mx &&
                            el.position.y < my + mh &&
                            el.position.y + el.size.height > my
                        );
                    })
                    .map((el) => el.id);
                onSelect(selected);
            }
        },
        [
            applyAlignmentGuideVisual,
            clearAlignmentGuideVisual,
            getSmartSnapThresholdMm,
            onSelect,
            snapToGrid,
            updateElement,
        ],
    );

    const handleGlobalMouseUp = useCallback(() => {
        const state = interactionRef.current;

        if (state.mode === 'drag-pending') {
            cancelPendingDrag();
            return;
        }

        if (state.mode === 'drag') {
            const point = pendingDragPointRef.current ?? {
                clientX: state.startClientX,
                clientY: state.startClientY,
                bypassSnap: false,
            };
            finishDrag(point);
            return;
        }

        if (state.mode === 'marquee') {
            setMarquee(null);
        }

        if (state.mode === 'resize') {
            refreshDocumentSnapLines();
        }

        activeSnapLinesRef.current = null;
        clearAlignmentGuideVisual();
        setAspectLockIndicator(null);
        interactionRef.current = { ...defaultInteraction };
    }, [cancelPendingDrag, clearAlignmentGuideVisual, finishDrag, refreshDocumentSnapLines]);

    useEffect(() => {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            if (dragRafRef.current !== null) {
                window.cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }
            const state = interactionRef.current;
            if (state.mode === 'drag' && state.elementId) {
                const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
                clearDragVisual(draggedIds);
            }
            clearAlignmentGuideVisual();
        };
    }, [clearAlignmentGuideVisual, clearDragVisual, handleGlobalMouseMove, handleGlobalMouseUp]);

    useEffect(() => {
        const handleWindowPointerMove = (e: PointerEvent) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' && state.mode !== 'drag-pending') return;
            if (!state.elementId) return;

            const activePointerId = activeDragPointerIdRef.current;
            if (activePointerId === null || e.pointerId !== activePointerId) return;

            const point = {
                clientX: e.clientX,
                clientY: e.clientY,
                bypassSnap: isSnapTemporarilyDisabled(e),
            };
            pendingDragPointRef.current = point;

            if (state.mode === 'drag-pending') {
                const deltaX = e.clientX - state.startClientX;
                const deltaY = e.clientY - state.startClientY;
                if (!shouldActivateDrag(deltaX, deltaY)) return;
                activatePendingDrag(point);
            }

            if (interactionRef.current.mode === 'drag') {
                scheduleDragFrame();
            }
        };

        const handleWindowPointerUp = (e: PointerEvent) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' && state.mode !== 'drag-pending') return;
            if (!state.elementId) return;

            const activePointerId = activeDragPointerIdRef.current;
            if (activePointerId === null || e.pointerId !== activePointerId) return;

            if (state.mode === 'drag-pending') {
                cancelPendingDrag();
                return;
            }

            pendingDragPointRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                bypassSnap: isSnapTemporarilyDisabled(e),
            };
            finishDrag({
                clientX: e.clientX,
                clientY: e.clientY,
                bypassSnap: isSnapTemporarilyDisabled(e),
            });
        };

        const handleWindowPointerCancel = (e: PointerEvent) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' && state.mode !== 'drag-pending') return;
            if (!state.elementId) return;

            const activePointerId = activeDragPointerIdRef.current;
            if (activePointerId === null || e.pointerId !== activePointerId) return;

            if (state.mode === 'drag-pending') {
                cancelPendingDrag();
                return;
            }

            finishDrag({
                clientX: e.clientX,
                clientY: e.clientY,
                bypassSnap: isSnapTemporarilyDisabled(e),
            });
        };

        const handleWindowBlur = () => {
            const state = interactionRef.current;
            if (state.mode === 'drag-pending') {
                cancelPendingDrag();
                return;
            }
            if (state.mode !== 'drag' || !state.elementId) return;
            const point = pendingDragPointRef.current ?? {
                clientX: state.startClientX,
                clientY: state.startClientY,
                bypassSnap: false,
            };
            finishDrag(point);
        };

        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('pointercancel', handleWindowPointerCancel);
        window.addEventListener('blur', handleWindowBlur);
        return () => {
            window.removeEventListener('pointermove', handleWindowPointerMove);
            window.removeEventListener('pointerup', handleWindowPointerUp);
            window.removeEventListener('pointercancel', handleWindowPointerCancel);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [activatePendingDrag, cancelPendingDrag, finishDrag, scheduleDragFrame]);

    useEffect(() => {
        if (!dragSession.active) return;

        const previousUserSelect = document.body.style.userSelect;
        const previousCursor = document.body.style.cursor;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';

        return () => {
            document.body.style.userSelect = previousUserSelect;
            document.body.style.cursor = previousCursor;
        };
    }, [dragSession.active]);

    useEffect(() => {
        const mode = interactionRef.current.mode;
        if (mode === 'drag' || mode === 'drag-pending' || mode === 'resize') return;
        refreshDocumentSnapLines();
    }, [activePageId, pageElements, pageSettings, refreshDocumentSnapLines]);

    useEffect(() => {
        if (!snapEnabled) {
            clearAlignmentGuideVisual();
        }
    }, [clearAlignmentGuideVisual, snapEnabled]);

    const handleDragStart = useCallback(
        (e: React.PointerEvent, id: string) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (
                e.target instanceof HTMLElement &&
                e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')
            ) {
                return;
            }

            const elementMap = elementMapRef.current;
            const element = elementMap.get(id);
            if (!element || element.locked) return;

            const selected = selectedIdsRef.current;
            const shouldDragSelection = selected.includes(id) && selected.length > 1 && !e.shiftKey;
            const candidateIds = shouldDragSelection ? selected : [id];
            const dragIds = candidateIds.filter((targetId) => {
                const target = elementMap.get(targetId);
                return !!target && !target.locked;
            });

            if (dragIds.length === 0) return;

            const dragInitialPositions: Record<string, { x: number; y: number }> = {};
            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;

            dragIds.forEach((targetId) => {
                const target = elementMap.get(targetId);
                if (!target) return;
                dragInitialPositions[targetId] = { ...target.position };
                minX = Math.min(minX, target.position.x);
                minY = Math.min(minY, target.position.y);
                maxX = Math.max(maxX, target.position.x + target.size.width);
                maxY = Math.max(maxY, target.position.y + target.size.height);
            });

            const pointerInCanvas = getCanvasPointFromClient(e.clientX, e.clientY);
            if (!pointerInCanvas) return;
            if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
                return;
            }

            const primaryInitialPos = dragInitialPositions[id] ?? element.position;
            const dragBounds = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
            };

            const pointerTarget = e.currentTarget as HTMLElement;
            activeDragPointerIdRef.current = e.pointerId;
            activeDragPointerTargetRef.current = pointerTarget;

            if (dragRafRef.current !== null) {
                window.cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }

            clearDragVisual(dragIds);
            clearAlignmentGuideVisual();
            activeSnapLinesRef.current = null;
            dragOffsetRef.current = { x: 0, y: 0 };
            dragPointerOffsetRef.current = {
                x: pointerInCanvas.x - primaryInitialPos.x,
                y: pointerInCanvas.y - primaryInitialPos.y,
            };
            pendingDragPointRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                bypassSnap: isSnapTemporarilyDisabled(e),
            };
            lastResolvedDragRef.current = {
                anchorX: primaryInitialPos.x,
                anchorY: primaryInitialPos.y,
                deltaX: 0,
                deltaY: 0,
                guides: [],
            };

            interactionRef.current = {
                ...defaultInteraction,
                mode: 'drag-pending',
                elementId: id,
                startClientX: e.clientX,
                startClientY: e.clientY,
                initialPos: { ...element.position },
                dragIds,
                dragInitialPositions,
                dragBounds,
            };
            setDragSession({ active: false, primaryId: null, dragIds: [] });
        },
        [clearAlignmentGuideVisual, clearDragVisual, getCanvasPointFromClient],
    );

    const handleResizeStart = useCallback((e: React.PointerEvent, element: TemplateElement, direction: string) => {
        const resizeGroupChildren =
            element.type === 'group'
                ? (element.groupChildren || []).map((child) => JSON.parse(JSON.stringify(child)) as TemplateElement)
                : [];

        clearAlignmentGuideVisual();
        refreshDocumentSnapLines();
        activeSnapLinesRef.current = collectSnapLines(documentSnapLinesRef.current, element.id);

        interactionRef.current = {
            ...defaultInteraction,
            mode: 'resize',
            elementId: element.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            direction,
            initialX: element.position.x,
            initialY: element.position.y,
            initialW: element.size.width,
            initialH: element.size.height,
            resizeGroupChildren,
        };
    }, [clearAlignmentGuideVisual, refreshDocumentSnapLines]);

    const handleRotateStart = useCallback((e: React.PointerEvent, element: TemplateElement) => {
        if (element.type === 'group') return;
        const elWrapper = (e.target as HTMLElement).closest('.canvas-element-wrapper');
        let cx = e.clientX;
        let cy = e.clientY;
        if (elWrapper) {
            const box = elWrapper.getBoundingClientRect();
            cx = box.left + box.width / 2;
            cy = box.top + box.height / 2;
        }

        const dx = e.clientX - cx;
        const dy = e.clientY - cy;

        interactionRef.current = {
            ...defaultInteraction,
            mode: 'rotate',
            elementId: element.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            centerX: cx,
            centerY: cy,
            startAngle: Math.atan2(dy, dx),
            initialRotation: element.rotation || 0,
        };
    }, []);

    const handleSelect = useCallback(
        (id: string, multi: boolean) => {
            if (multi) {
                onSelect(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
                return;
            }
            if (selectedIds.includes(id) && selectedIds.length > 1) {
                onSelect(selectedIds);
                return;
            }
            onSelect([id]);
        },
        [selectedIds, onSelect],
    );

    const handleCanvasMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest('.canvas-element-wrapper')) return;

            if (!pageRef.current) {
                onSelect([]);
                return;
            }

            const sc = scaleRef.current;
            const pageRect = pageRef.current.getBoundingClientRect();
            const x = pxToMm((e.clientX - pageRect.left) / sc);
            const y = pxToMm((e.clientY - pageRect.top) / sc);

            if (
                e.clientX >= pageRect.left &&
                e.clientX <= pageRect.right &&
                e.clientY >= pageRect.top &&
                e.clientY <= pageRect.bottom
            ) {
                interactionRef.current = {
                    ...defaultInteraction,
                    mode: 'marquee',
                    marqueeStart: { x, y },
                };
                onSelect([]);
            } else {
                onSelect([]);
            }
        },
        [onSelect],
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            if (!pageRef.current) return;

            const pageRect = pageRef.current.getBoundingClientRect();
            const isInsidePage =
                e.clientX >= pageRect.left &&
                e.clientX <= pageRect.right &&
                e.clientY >= pageRect.top &&
                e.clientY <= pageRect.bottom;
            if (!isInsidePage) return;

            const currentScale = scaleRef.current;
            if (currentScale <= 0) return;

            const xMm = pxToMm((e.clientX - pageRect.left) / currentScale);
            const yMm = pxToMm((e.clientY - pageRect.top) / currentScale);
            const pageWidth = pageSettingsRef.current.width;
            const pageHeight = pageSettingsRef.current.height;
            const dropSnap = isSnapTemporarilyDisabled(e) ? (value: number) => value : snapToGrid;
            const modifierAnchor: DropAnchor | undefined = e.shiftKey ? 'center' : undefined;

            let blockPayload: PaletteBlockPayload | null = null;
            const blockPayloadRaw = e.dataTransfer.getData('application/template-editor-block-meta');
            if (blockPayloadRaw) {
                try {
                    const parsed = JSON.parse(blockPayloadRaw) as PaletteBlockPayload;
                    if (parsed && typeof parsed === 'object') blockPayload = parsed;
                } catch {
                    blockPayload = null;
                }
            }

            const blockId = (
                e.dataTransfer.getData('application/template-editor-block') ||
                e.dataTransfer.getData('blockType')
            ) as BlockPreset;
            if (blockId && onAddBlock) {
                const blockDropPos = resolveDropPosition({
                    point: { x: xMm, y: yMm },
                    pageSize: { width: pageWidth, height: pageHeight },
                    elementSize: blockPayload?.dropSize,
                    anchor: modifierAnchor || blockPayload?.dropAnchor || 'top-left',
                    snap: dropSnap,
                });
                onAddBlock(blockId, blockDropPos);
                return;
            }

            let payload: PaletteDragPayload | null = null;
            const payloadRaw = e.dataTransfer.getData('application/template-editor-element');
            if (payloadRaw) {
                try {
                    const parsed = JSON.parse(payloadRaw) as PaletteDragPayload;
                    if (parsed && typeof parsed === 'object') payload = parsed;
                } catch {
                    payload = null;
                }
            }

            const fallbackType = e.dataTransfer.getData('application/react-dnd');
            const type = (payload?.type || e.dataTransfer.getData('elementType') || fallbackType) as ElementType;
            if (!type) return;

            const presetRaw = payload?.presetId || e.dataTransfer.getData('application/template-editor-preset');
            const presetId: ElementPreset | undefined =
                presetRaw === 'photo-panel' || presetRaw === 'technical-table' ? presetRaw : undefined;

            let overrides = payload?.overrides;
            if (!overrides) {
                const overridesRaw = e.dataTransfer.getData('application/template-editor-element-overrides');
                if (overridesRaw) {
                    try {
                        const parsed = JSON.parse(overridesRaw) as Partial<TemplateElement>;
                        if (parsed && typeof parsed === 'object') {
                            overrides = parsed;
                        }
                    } catch {
                        overrides = undefined;
                    }
                }
            }

            const dropPos = resolveDropPosition({
                point: { x: xMm, y: yMm },
                pageSize: { width: pageWidth, height: pageHeight },
                elementSize: payload?.dropSize || overrides?.size,
                anchor: modifierAnchor || payload?.dropAnchor || 'top-left',
                snap: dropSnap,
            });

            onAddElement(type, dropPos, presetId, overrides);
        },
        [onAddElement, onAddBlock, snapToGrid],
    );

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const pageWidthPx = mmToCanvasPx(pageSettings.width);
    const pageHeightPx = mmToCanvasPx(pageSettings.height);
    const gridSpacingPx = mmToCanvasPx(normalizedGridSize);

    return (
        <div
            ref={(el) => {
                (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                if (viewportRef) {
                    if (typeof viewportRef === 'function') viewportRef(el);
                    else (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                }
            }}
            className="relative w-full h-full overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, #f0f0f3 0%, #e8e8ed 50%, #f0f0f3 100%)',
                backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(0,0,0,0.02) 1px, transparent 0)',
                backgroundSize: '40px 40px',
                cursor: isPanning ? 'grab' : dragSession.active ? 'grabbing' : undefined,
            }}
            onMouseDown={handleCanvasMouseDown}
            onPointerDown={onContainerPointerDown}
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            <div
                className="relative shrink-0"
                style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                <div
                    ref={pageRef}
                    style={{
                        width: pageWidthPx,
                        height: pageHeightPx,
                        backgroundColor: pageSettings.backgroundColor || '#ffffff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.12)',
                        position: 'relative',
                        borderRadius: 2,
                    }}
                >
                    {showGrid && (
                        <svg
                            className="absolute inset-0 pointer-events-none"
                            width={pageWidthPx}
                            height={pageHeightPx}
                            style={{ zIndex: 0, opacity: 0.6 }}
                        >
                            <defs>
                                <pattern
                                    id={gridPatternIdRef.current}
                                    width={gridSpacingPx}
                                    height={gridSpacingPx}
                                    patternUnits="userSpaceOnUse"
                                >
                                    <path
                                        d={`M ${gridSpacingPx} 0 L 0 0 0 ${gridSpacingPx}`}
                                        fill="none"
                                        stroke="#9ca3af"
                                        strokeWidth={1}
                                        strokeDasharray="2 3"
                                    />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill={`url(#${gridPatternIdRef.current})`} />
                        </svg>
                    )}

                    <div
                        className="absolute pointer-events-none border border-dashed border-blue-200"
                        style={{
                            top: mmToCanvasPx(pageSettings.margins.top),
                            left: mmToCanvasPx(pageSettings.margins.left),
                            right: mmToCanvasPx(pageSettings.margins.right),
                            bottom: mmToCanvasPx(pageSettings.margins.bottom),
                            opacity: 0.5,
                            zIndex: 2,
                        }}
                    />

                    <div
                        ref={verticalGuideRef}
                        className="absolute pointer-events-none"
                        style={{
                            display: 'none',
                            top: 0,
                            bottom: 0,
                            width: 1,
                            backgroundColor: '#4F46E5',
                            zIndex: 9999,
                            transform: 'translateX(-0.5px)',
                        }}
                    />

                    <div
                        ref={horizontalGuideRef}
                        className="absolute pointer-events-none"
                        style={{
                            display: 'none',
                            left: 0,
                            right: 0,
                            height: 1,
                            backgroundColor: '#4F46E5',
                            zIndex: 9999,
                            transform: 'translateY(-0.5px)',
                        }}
                    />

                    {sortedVisibleElements.map((el) => (
                        <CanvasElement
                            key={el.id}
                            element={el}
                            scale={scale}
                            isSelected={selectedIdSet.has(el.id)}
                            onSelect={handleSelect}
                            onUpdateElement={updateElement}
                            onDragStart={handleDragStart}
                            onResizeStart={handleResizeStart}
                            onRotateStart={handleRotateStart}
                            dataPreview={dataPreview}
                            isDragging={dragSession.active && dragSession.dragIds.includes(el.id)}
                            suppressPointerEvents={dragSession.active}
                            onSetNodeRef={setElementNodeRef}
                        />
                    ))}

                    {sortedVisibleElements.length === 0 && !dragSession.active && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                            <div className="text-center">
                                <div className="text-5xl mb-3">📄</div>
                                <p className="text-gray-400 text-sm font-medium">Esta página está vacía</p>
                                <p className="text-gray-300 text-xs mt-1">Arrastra un elemento desde el panel izquierdo</p>
                            </div>
                        </div>
                    )}

                    {marquee && (
                        <div
                            className="pointer-events-none"
                            style={{
                                position: 'absolute',
                                left: mmToCanvasPx(marquee.x),
                                top: mmToCanvasPx(marquee.y),
                                width: mmToCanvasPx(marquee.w),
                                height: mmToCanvasPx(marquee.h),
                                border: '1px solid #3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                zIndex: 9998,
                            }}
                        />
                    )}
                </div>
            </div>

            {aspectLockIndicator && (
                <div
                    className="pointer-events-none"
                    style={{
                        position: 'fixed',
                        left: aspectLockIndicator.x + 16,
                        top: aspectLockIndicator.y - 28,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'rgba(124, 58, 237, 0.9)',
                        color: 'white',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}
                >
                    <Lock size={12} />
                    <span>Aspecto fijo</span>
                </div>
            )}
        </div>
    );
}
