import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
    CanvasDocument,
    TemplateElement,
    pxToMm,
    ElementType,
    ElementPreset,
    BlockPreset,
    PageSettings,
} from '../canvasTypes';
import { CanvasElement } from './CanvasElement';
import { useSnapGrid } from '../hooks/useSnapGrid';
import { resolveSmartGuideSnap, useSmartGuides } from '../hooks/useSmartGuides';
import { DragTooltip } from './DragTooltip';
import { Lock } from 'lucide-react';

interface CanvasAreaProps {
    document: CanvasDocument;
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
    zoom: number;
    onZoomChange: (z: number) => void;
    snapEnabled: boolean;
    gridSize: number;
    showGrid: boolean;
    dataPreview?: Record<string, unknown>;
}

interface InteractionState {
    mode: 'idle' | 'drag' | 'resize' | 'rotate' | 'marquee';
    elementId: string | null;
    startClientX: number;
    startClientY: number;
    initialPos: { x: number; y: number };
    dragIds: string[];
    dragInitialPositions: Record<string, { x: number; y: number }>;
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

interface DragPreviewState {
    id: string;
    x: number;
    y: number;
    cursorX: number;
    cursorY: number;
}

const MIN_SIZE_MM = 2;

export function CanvasArea({
    document: doc,
    pageSettings,
    onChange,
    selectedIds,
    onSelect,
    onAddElement,
    onAddBlock,
    zoom,
    onZoomChange,
    snapEnabled,
    gridSize,
    showGrid,
    dataPreview,
}: CanvasAreaProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<InteractionState>({ ...defaultInteraction });
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
    const [aspectLockIndicator, setAspectLockIndicator] = useState<{ x: number; y: number } | null>(null);
    const gridPatternIdRef = useRef(`canvas-grid-${Math.random().toString(36).slice(2, 9)}`);

    const docRef = useRef(doc);
    const scaleRef = useRef(zoom / 100);
    const pageSettingsRef = useRef(pageSettings);
    const selectedIdsRef = useRef(selectedIds);
    const dragRafRef = useRef<number | null>(null);
    const pendingDragPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
    const snapEnabledRef = useRef(snapEnabled);
    const gridSizeRef = useRef(gridSize);

    docRef.current = doc;
    scaleRef.current = zoom / 100;
    pageSettingsRef.current = pageSettings;
    selectedIdsRef.current = selectedIds;
    snapEnabledRef.current = snapEnabled;
    gridSizeRef.current = gridSize;

    const scale = zoom / 100;
    const MM_TO_PX = 96 / 25.4;
    const mmToCanvasPx = (mm: number) => mm * MM_TO_PX;
    const normalizedGridSize = Math.max(1, gridSize);
    const { snapToGrid } = useSnapGrid(normalizedGridSize, snapEnabled);

    const draggingPosition = useMemo(
        () => ({ x: dragPreview?.x ?? 0, y: dragPreview?.y ?? 0 }),
        [dragPreview?.x, dragPreview?.y],
    );
    const { guides } = useSmartGuides(
        doc.elements,
        snapEnabled && dragPreview ? dragPreview.id : null,
        draggingPosition,
        pageSettings,
    );

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

    const applyDragAt = useCallback(
        (clientX: number, clientY: number) => {
            const state = interactionRef.current;
            if (state.mode !== 'drag' || !state.elementId) return;

            const sc = scaleRef.current;
            const dxPx = clientX - state.startClientX;
            const dyPx = clientY - state.startClientY;
            const dxMm = pxToMm(dxPx / sc);
            const dyMm = pxToMm(dyPx / sc);

            const draggedIds = state.dragIds.length > 0 ? state.dragIds : [state.elementId];
            const anchorInitial = state.dragInitialPositions[state.elementId] ?? state.initialPos;

            const rawAnchorX = anchorInitial.x + dxMm;
            const rawAnchorY = anchorInitial.y + dyMm;

            let anchorX = rawAnchorX;
            let anchorY = rawAnchorY;

            if (snapEnabledRef.current) {
                const guideSnap = resolveSmartGuideSnap(
                    docRef.current.elements,
                    state.elementId,
                    { x: rawAnchorX, y: rawAnchorY },
                    pageSettingsRef.current,
                );

                anchorX = guideSnap.x ?? snapToGrid(rawAnchorX);
                anchorY = guideSnap.y ?? snapToGrid(rawAnchorY);
            }

            setDragPreview({
                id: state.elementId,
                x: anchorX,
                y: anchorY,
                cursorX: clientX,
                cursorY: clientY,
            });

            const deltaX = anchorX - anchorInitial.x;
            const deltaY = anchorY - anchorInitial.y;
            const updates = new Map<string, Partial<TemplateElement>>();
            const elementMap = new Map(docRef.current.elements.map((el) => [el.id, el]));

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
        [snapToGrid, updateElement, updateElements],
    );

    const handleGlobalMouseMove = useCallback(
        (e: MouseEvent) => {
            const state = interactionRef.current;
            const sc = scaleRef.current;

            if (state.mode === 'drag' && state.elementId) {
                pendingDragPointRef.current = { clientX: e.clientX, clientY: e.clientY };
                if (dragRafRef.current === null) {
                    dragRafRef.current = window.requestAnimationFrame(() => {
                        dragRafRef.current = null;
                        const point = pendingDragPointRef.current;
                        if (!point) return;
                        applyDragAt(point.clientX, point.clientY);
                    });
                }
                return;
            }

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

                if (snapEnabledRef.current) {
                    let left = x;
                    let top = y;
                    let right = x + w;
                    let bottom = y + h;

                    if (dir.includes('w')) left = snapToGrid(left);
                    if (dir.includes('e')) right = snapToGrid(right);
                    if (dir.includes('n')) top = snapToGrid(top);
                    if (dir.includes('s')) bottom = snapToGrid(bottom);

                    w = right - left;
                    h = bottom - top;

                    if (w < MIN_SIZE_MM) {
                        if (dir.includes('w')) left = right - MIN_SIZE_MM;
                        else right = left + MIN_SIZE_MM;
                        w = MIN_SIZE_MM;
                    }
                    if (h < MIN_SIZE_MM) {
                        if (dir.includes('n')) top = bottom - MIN_SIZE_MM;
                        else bottom = top + MIN_SIZE_MM;
                        h = MIN_SIZE_MM;
                    }

                    x = left;
                    y = top;
                } else {
                    if (w < MIN_SIZE_MM) w = MIN_SIZE_MM;
                    if (h < MIN_SIZE_MM) h = MIN_SIZE_MM;
                }

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
        [applyDragAt, onSelect, snapToGrid, updateElement],
    );

    const handleGlobalMouseUp = useCallback(
        (e: MouseEvent | PointerEvent) => {
            const state = interactionRef.current;

            if (state.mode === 'drag') {
                if (dragRafRef.current !== null) {
                    window.cancelAnimationFrame(dragRafRef.current);
                    dragRafRef.current = null;
                }
                applyDragAt(e.clientX, e.clientY);
                pendingDragPointRef.current = null;
                setDragPreview(null);
            }

            if (state.mode === 'marquee') {
                setMarquee(null);
            }

            setAspectLockIndicator(null);
            interactionRef.current = { ...defaultInteraction };
        },
        [applyDragAt],
    );

    useEffect(() => {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('pointerup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('pointerup', handleGlobalMouseUp);
            if (dragRafRef.current !== null) {
                window.cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }
        };
    }, [handleGlobalMouseMove, handleGlobalMouseUp]);

    const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
        const element = docRef.current.elements.find((el) => el.id === id);
        if (!element || element.locked) return;

        const selected = selectedIdsRef.current;
        const shouldDragSelection = selected.includes(id) && selected.length > 1 && !e.shiftKey;
        const candidateIds = shouldDragSelection ? selected : [id];
        const dragIds = candidateIds.filter((targetId) => {
            const target = docRef.current.elements.find((item) => item.id === targetId);
            return !!target && !target.locked;
        });

        if (dragIds.length === 0) return;

        const dragInitialPositions: Record<string, { x: number; y: number }> = {};
        dragIds.forEach((targetId) => {
            const target = docRef.current.elements.find((item) => item.id === targetId);
            if (!target) return;
            dragInitialPositions[targetId] = { ...target.position };
        });

        interactionRef.current = {
            ...defaultInteraction,
            mode: 'drag',
            elementId: id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            initialPos: { ...element.position },
            dragIds,
            dragInitialPositions,
        };

        setDragPreview({
            id,
            x: element.position.x,
            y: element.position.y,
            cursorX: e.clientX,
            cursorY: e.clientY,
        });
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent, element: TemplateElement, direction: string) => {
        const resizeGroupChildren =
            element.type === 'group'
                ? (element.groupChildren || []).map((child) => JSON.parse(JSON.stringify(child)) as TemplateElement)
                : [];

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
    }, []);

    const handleRotateStart = useCallback((e: React.MouseEvent, element: TemplateElement) => {
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
            const sc = scaleRef.current;
            const xPx = (e.clientX - pageRect.left) / sc;
            const yPx = (e.clientY - pageRect.top) / sc;
            const dropPos = {
                x: snapToGrid(pxToMm(xPx)),
                y: snapToGrid(pxToMm(yPx)),
            };

            const blockId = e.dataTransfer.getData('application/template-editor-block') as BlockPreset;
            if (blockId && onAddBlock) {
                onAddBlock(blockId, dropPos);
                return;
            }

            const type = e.dataTransfer.getData('application/react-dnd') as ElementType;
            if (!type) return;
            const presetRaw = e.dataTransfer.getData('application/template-editor-preset');
            const presetId: ElementPreset | undefined =
                presetRaw === 'photo-panel' || presetRaw === 'technical-table' ? presetRaw : undefined;

            const overridesRaw = e.dataTransfer.getData('application/template-editor-element-overrides');
            let overrides: Partial<TemplateElement> | undefined;
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

            onAddElement(type, dropPos, presetId, overrides);
        },
        [onAddElement, onAddBlock, snapToGrid],
    );

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -5 : 5;
                onZoomChange(Math.max(10, Math.min(300, zoom + delta)));
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [zoom, onZoomChange]);

    const pageWidthPx = mmToCanvasPx(pageSettings.width);
    const pageHeightPx = mmToCanvasPx(pageSettings.height);
    const gridSpacingPx = mmToCanvasPx(normalizedGridSize);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-auto flex items-start justify-center"
            style={{
                background: 'linear-gradient(135deg, #f0f0f3 0%, #e8e8ed 50%, #f0f0f3 100%)',
                backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(0,0,0,0.02) 1px, transparent 0)',
                backgroundSize: '40px 40px',
            }}
            onMouseDown={handleCanvasMouseDown}
        >
            <div
                className="relative my-8 shrink-0"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top center',
                }}
            >
                <div
                    ref={pageRef}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
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

                    {doc.elements
                        .filter((el) => el.visible !== false)
                        .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0))
                        .map((el) => (
                            <CanvasElement
                                key={el.id}
                                element={el}
                                scale={scale}
                                isSelected={selectedIds.includes(el.id)}
                                onSelect={handleSelect}
                                onUpdateElement={updateElement}
                                onDragStart={handleDragStart}
                                onResizeStart={handleResizeStart}
                                onRotateStart={handleRotateStart}
                                dataPreview={dataPreview}
                            />
                        ))}

                    {dragPreview && guides.length > 0 && (
                        <svg
                            className="absolute inset-0 pointer-events-none"
                            width={pageWidthPx}
                            height={pageHeightPx}
                            style={{ zIndex: 9999 }}
                        >
                            {guides.map((guide, index) => {
                                const stroke = guide.active ? '#ef4444' : 'transparent';
                                if (guide.axis === 'x') {
                                    const x = mmToCanvasPx(guide.position);
                                    return (
                                        <line
                                            key={`x-${guide.position}-${index}`}
                                            x1={x}
                                            x2={x}
                                            y1={0}
                                            y2={pageHeightPx}
                                            stroke={stroke}
                                            strokeWidth={1}
                                            strokeDasharray="4 4"
                                        />
                                    );
                                }

                                const y = mmToCanvasPx(guide.position);
                                return (
                                    <line
                                        key={`y-${guide.position}-${index}`}
                                        x1={0}
                                        x2={pageWidthPx}
                                        y1={y}
                                        y2={y}
                                        stroke={stroke}
                                        strokeWidth={1}
                                        strokeDasharray="4 4"
                                    />
                                );
                            })}
                        </svg>
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

            {dragPreview && (
                <DragTooltip
                    cursorX={dragPreview.cursorX}
                    cursorY={dragPreview.cursorY}
                    x={dragPreview.x}
                    y={dragPreview.y}
                />
            )}

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
