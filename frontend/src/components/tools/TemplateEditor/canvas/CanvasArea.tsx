import React, { useRef, useCallback, useEffect, useState } from 'react';
import { CanvasDocument, TemplateElement, mmToPx, pxToMm, ElementType } from '../canvasTypes';
import { CanvasElement } from './CanvasElement';
import { calculateSnap, SnapGuide } from '../utils/snapUtils';

interface CanvasAreaProps {
    document: CanvasDocument;
    onChange: (doc: CanvasDocument) => void;
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onAddElement: (type: ElementType, position: { x: number; y: number }) => void;
    zoom: number;
    onZoomChange: (z: number) => void;
}

// Shared interaction state (avoids stale closures)
interface InteractionState {
    mode: 'idle' | 'drag' | 'resize' | 'rotate' | 'marquee';
    elementId: string | null;
    startClientX: number;
    startClientY: number;
    // For drag
    initialPos: { x: number; y: number };
    // For resize
    direction: string;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    // For rotate
    centerX: number;
    centerY: number;
    startAngle: number;
    initialRotation: number;
    // For marquee
    marqueeStart: { x: number; y: number };
}

const defaultInteraction: InteractionState = {
    mode: 'idle',
    elementId: null,
    startClientX: 0,
    startClientY: 0,
    initialPos: { x: 0, y: 0 },
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
};

export function CanvasArea({
    document: doc,
    onChange,
    selectedIds,
    onSelect,
    onAddElement,
    zoom,
    onZoomChange,
}: CanvasAreaProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<InteractionState>({ ...defaultInteraction });
    const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    // Refs for latest state (needed in global mousemove/mouseup handlers)
    const docRef = useRef(doc);
    const scaleRef = useRef(zoom / 100);
    docRef.current = doc;
    scaleRef.current = zoom / 100;

    const scale = zoom / 100;

    // ─── Element Update ─────────────────────────────────────────
    const updateElement = useCallback((id: string, updates: Partial<TemplateElement>) => {
        const newElements = docRef.current.elements.map(el =>
            el.id === id ? { ...el, ...updates } : el
        );
        onChange({ ...docRef.current, elements: newElements });
    }, [onChange]);

    // ─── Global Mouse Handlers ──────────────────────────────────
    const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
        const state = interactionRef.current;
        const sc = scaleRef.current;

        if (state.mode === 'drag' && state.elementId) {
            const dxPx = e.clientX - state.startClientX;
            const dyPx = e.clientY - state.startClientY;
            const dxMm = pxToMm(dxPx / sc);
            const dyMm = pxToMm(dyPx / sc);

            let newX = state.initialPos.x + dxMm;
            let newY = state.initialPos.y + dyMm;

            // Snap
            const el = docRef.current.elements.find(el => el.id === state.elementId);
            if (el) {
                const snapRes = calculateSnap(
                    state.elementId!,
                    { x: newX, y: newY },
                    el.size,
                    docRef.current.elements,
                    docRef.current.pageSettings
                );
                if (snapRes.x !== undefined) newX = snapRes.x;
                if (snapRes.y !== undefined) newY = snapRes.y;
                setSnapGuides(snapRes.guides);
            }

            updateElement(state.elementId, { position: { x: newX, y: newY } });

        } else if (state.mode === 'resize' && state.elementId) {
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
            if (dir.includes('w')) { x += dx; w -= dx; }
            if (dir.includes('s')) h += dy;
            if (dir.includes('n')) { y += dy; h -= dy; }

            // Aspect ratio lock with Shift
            if (e.shiftKey && state.initialW > 0 && state.initialH > 0) {
                const ratio = state.initialW / state.initialH;
                if (dir === 'se' || dir === 'nw' || dir === 'ne' || dir === 'sw') {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        h = w / ratio;
                    } else {
                        w = h * ratio;
                    }
                }
            }

            if (w < 2) w = 2;
            if (h < 2) h = 2;

            updateElement(state.elementId, {
                position: { x, y },
                size: { width: w, height: h },
            });

        } else if (state.mode === 'rotate' && state.elementId) {
            const dx = e.clientX - state.centerX;
            const dy = e.clientY - state.centerY;
            const angle = Math.atan2(dy, dx);
            const delta = angle - state.startAngle;
            let deg = state.initialRotation + delta * (180 / Math.PI);

            // 15° snap with Shift
            if (e.shiftKey) {
                deg = Math.round(deg / 15) * 15;
            }

            deg = ((deg % 360) + 360) % 360; // Normalize to 0-360

            updateElement(state.elementId, { rotation: deg });

        } else if (state.mode === 'marquee') {
            if (!pageRef.current) return;
            const pageRect = pageRef.current.getBoundingClientRect();
            const currentX = pxToMm((e.clientX - pageRect.left) / sc);
            const currentY = pxToMm((e.clientY - pageRect.top) / sc);

            const mx = Math.min(state.marqueeStart.x, currentX);
            const my = Math.min(state.marqueeStart.y, currentY);
            const mw = Math.abs(currentX - state.marqueeStart.x);
            const mh = Math.abs(currentY - state.marqueeStart.y);

            setMarquee({ x: mx, y: my, w: mw, h: mh });

            // Select elements within marquee
            const selected = docRef.current.elements
                .filter(el => el.visible !== false && !el.locked)
                .filter(el => {
                    return (
                        el.position.x < mx + mw &&
                        el.position.x + el.size.width > mx &&
                        el.position.y < my + mh &&
                        el.position.y + el.size.height > my
                    );
                })
                .map(el => el.id);
            onSelect(selected);
        }
    }, [updateElement, onSelect]);

    const handleGlobalMouseUp = useCallback(() => {
        const state = interactionRef.current;

        if (state.mode === 'drag') {
            setSnapGuides([]);
        }

        if (state.mode === 'marquee') {
            setMarquee(null);
        }

        interactionRef.current = { ...defaultInteraction };
    }, []);

    // Attach/detach global listeners
    useEffect(() => {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [handleGlobalMouseMove, handleGlobalMouseUp]);

    // ─── Element Interaction Start Handlers ─────────────────────
    const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
        const el = docRef.current.elements.find(el => el.id === id);
        if (!el || el.locked) return;

        interactionRef.current = {
            ...defaultInteraction,
            mode: 'drag',
            elementId: id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            initialPos: { ...el.position },
        };
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent, element: TemplateElement, direction: string) => {
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
        };
    }, []);

    const handleRotateStart = useCallback((e: React.MouseEvent, element: TemplateElement) => {
        // Calculate element center in screen coords
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

    // ─── Selection ──────────────────────────────────────────────
    const handleSelect = useCallback((id: string, multi: boolean) => {
        if (multi) {
            onSelect(
                selectedIds.includes(id)
                    ? selectedIds.filter(i => i !== id)
                    : [...selectedIds, id]
            );
        } else {
            onSelect([id]);
        }
    }, [selectedIds, onSelect]);

    // Click on empty canvas — start marquee or deselect
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.canvas-element-wrapper')) return;

        if (!pageRef.current) {
            onSelect([]);
            return;
        }

        const sc = scaleRef.current;
        const pageRect = pageRef.current.getBoundingClientRect();
        const x = pxToMm((e.clientX - pageRect.left) / sc);
        const y = pxToMm((e.clientY - pageRect.top) / sc);

        // Check if click is within the page area
        if (
            e.clientX >= pageRect.left && e.clientX <= pageRect.right &&
            e.clientY >= pageRect.top && e.clientY <= pageRect.bottom
        ) {
            // Start marquee selection
            interactionRef.current = {
                ...defaultInteraction,
                mode: 'marquee',
                marqueeStart: { x, y },
            };
            onSelect([]);
        } else {
            onSelect([]);
        }
    }, [onSelect]);

    // ─── Drop from palette ──────────────────────────────────────
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('application/react-dnd') as ElementType;
        if (!type || !pageRef.current) return;

        const pageRect = pageRef.current.getBoundingClientRect();
        const sc = scaleRef.current;
        const xPx = (e.clientX - pageRect.left) / sc;
        const yPx = (e.clientY - pageRect.top) / sc;

        onAddElement(type, { x: pxToMm(xPx), y: pxToMm(yPx) });
    }, [onAddElement]);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    // ─── Wheel zoom ─────────────────────────────────────────────
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

    // ─── Render ─────────────────────────────────────────────────
    const pageWidthPx = mmToPx(doc.pageSettings.width);
    const pageHeightPx = mmToPx(doc.pageSettings.height);

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
                        backgroundColor: doc.pageSettings.backgroundColor,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.12)',
                        position: 'relative',
                        borderRadius: 2,
                    }}
                >
                    {/* Subtle dot grid */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            backgroundImage: 'radial-gradient(circle, #d4d4d8 0.6px, transparent 0.6px)',
                            backgroundSize: `${mmToPx(5)}px ${mmToPx(5)}px`,
                            opacity: 0.4,
                        }}
                    />

                    {/* Margin guides (subtle dashed lines) */}
                    <div
                        className="absolute pointer-events-none border border-dashed border-blue-200"
                        style={{
                            top: mmToPx(doc.pageSettings.marginTop),
                            left: mmToPx(doc.pageSettings.marginLeft),
                            right: mmToPx(doc.pageSettings.marginRight),
                            bottom: mmToPx(doc.pageSettings.marginBottom),
                            opacity: 0.5,
                        }}
                    />

                    {/* Elements */}
                    {doc.elements
                        .filter(el => el.visible !== false)
                        .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0))
                        .map(el => (
                            <CanvasElement
                                key={el.id}
                                element={el}
                                scale={scale}
                                isSelected={selectedIds.includes(el.id)}
                                onSelect={handleSelect}
                                onDragStart={handleDragStart}
                                onResizeStart={handleResizeStart}
                                onRotateStart={handleRotateStart}
                            />
                        ))}

                    {/* Snap Guides */}
                    {snapGuides.map((guide, i) => (
                        <div
                            key={i}
                            className="pointer-events-none"
                            style={{
                                position: 'absolute',
                                backgroundColor: '#e040fb',
                                zIndex: 9999,
                                ...(guide.orientation === 'vertical'
                                    ? {
                                        left: mmToPx(guide.position),
                                        top: 0,
                                        bottom: 0,
                                        width: '1px',
                                    }
                                    : {
                                        top: mmToPx(guide.position),
                                        left: 0,
                                        right: 0,
                                        height: '1px',
                                    }),
                            }}
                        />
                    ))}

                    {/* Marquee Selection Rectangle */}
                    {marquee && (
                        <div
                            className="pointer-events-none"
                            style={{
                                position: 'absolute',
                                left: mmToPx(marquee.x),
                                top: mmToPx(marquee.y),
                                width: mmToPx(marquee.w),
                                height: mmToPx(marquee.h),
                                border: '1px solid #3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                zIndex: 9998,
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
