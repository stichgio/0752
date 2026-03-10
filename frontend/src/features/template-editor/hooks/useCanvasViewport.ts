import { useCallback, useRef, useState, useEffect, RefObject } from 'react';

export const ZOOM_MIN = 10;
export const ZOOM_MAX = 400;
export const ZOOM_STEP = 10;
export const INITIAL_PAN_Y = 32; // px — equivalente al my-8 del inner wrapper

export interface ViewportState {
    zoom: number;
    panX: number;
    panY: number;
}

/** Clamp zoom between ZOOM_MIN and ZOOM_MAX */
export function clampZoom(z: number): number {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/**
 * Calculates new panX/panY so that the point at (cx, cy) in container space
 * stays visually fixed as zoom changes from oldZoom to newZoom.
 */
export function calcZoomToward(
    cx: number,
    cy: number,
    oldZoom: number,
    newZoom: number,
    panX: number,
    panY: number,
): ViewportState {
    const ratio = newZoom / oldZoom;
    return {
        zoom: newZoom,
        panX: cx - (cx - panX) * ratio,
        panY: cy - (cy - panY) * ratio,
    };
}

/**
 * Calculates viewport state so the page fits centered inside the container
 * with a small margin.
 */
export function calcFitPage(
    containerW: number,
    containerH: number,
    pageWidthPx: number,
    pageHeightPx: number,
): ViewportState {
    const MARGIN = 48; // px on each side
    const scaleX = (containerW - MARGIN * 2) / pageWidthPx;
    const scaleY = (containerH - MARGIN * 2) / pageHeightPx;
    const scale = Math.min(scaleX, scaleY);
    const zoom = clampZoom(Math.round(scale * 100));
    const finalScale = zoom / 100;
    const panX = (containerW - pageWidthPx * finalScale) / 2;
    const panY = (containerH - pageHeightPx * finalScale) / 2;
    return { zoom, panX, panY };
}

export interface UseCanvasViewportOptions {
    initialZoom?: number;
    pageWidthPx: number;
    pageHeightPx: number;
}

export interface UseCanvasViewportReturn {
    viewport: ViewportState;
    isPanning: boolean;
    containerRef: RefObject<HTMLDivElement>;
    zoomTo: (newZoom: number) => void;
    zoomToward: (clientX: number, clientY: number, deltaZoom: number) => void;
    fitPage: () => void;
    startPan: (e: React.PointerEvent | PointerEvent) => void;
    handleContainerPointerDown: (e: React.PointerEvent) => void;
}

export function useCanvasViewport({
    initialZoom = 75,
    pageWidthPx,
    pageHeightPx,
}: UseCanvasViewportOptions): UseCanvasViewportReturn {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<ViewportState>(() => ({
        zoom: initialZoom,
        panX: 0,
        panY: INITIAL_PAN_Y,
    }));
    const [isPanning, setIsPanning] = useState(false);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;
    const isSpaceDownRef = useRef(false);

    // Center page on first mount when container dimensions are known
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        setViewport(calcFitPage(width, height, pageWidthPx, pageHeightPx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally only on mount

    const zoomTo = useCallback((newZoom: number) => {
        const clamped = clampZoom(newZoom);
        setViewport((prev) => {
            const el = containerRef.current;
            if (!el) return { ...prev, zoom: clamped };
            const { width, height } = el.getBoundingClientRect();
            const cx = width / 2;
            const cy = height / 2;
            return calcZoomToward(cx, cy, prev.zoom, clamped, prev.panX, prev.panY);
        });
    }, []);

    const zoomToward = useCallback((clientX: number, clientY: number, deltaZoom: number) => {
        setViewport((prev) => {
            const el = containerRef.current;
            if (!el) return prev;
            const rect = el.getBoundingClientRect();
            const cx = clientX - rect.left;
            const cy = clientY - rect.top;
            const newZoom = clampZoom(prev.zoom + deltaZoom);
            return calcZoomToward(cx, cy, prev.zoom, newZoom, prev.panX, prev.panY);
        });
    }, []);

    const fitPage = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        setViewport(calcFitPage(width, height, pageWidthPx, pageHeightPx));
    }, [pageWidthPx, pageHeightPx]);

    const startPan = useCallback((e: React.PointerEvent | PointerEvent) => {
        const nativeEvent = 'nativeEvent' in e ? e.nativeEvent : e;
        const target = nativeEvent.target as HTMLElement;
        target.setPointerCapture(nativeEvent.pointerId);
        setIsPanning(true);

        const onMove = (ev: PointerEvent) => {
            setViewport((prev) => ({
                ...prev,
                panX: prev.panX + ev.movementX,
                panY: prev.panY + ev.movementY,
            }));
        };
        const onUp = () => {
            target.releasePointerCapture(nativeEvent.pointerId);
            setIsPanning(false);
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
    }, []);

    // Space key → pan mode
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat && !isSpaceDownRef.current) {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
                isSpaceDownRef.current = true;
                setIsPanning(true);
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                isSpaceDownRef.current = false;
                setIsPanning(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
        if (isSpaceDownRef.current || e.button === 1) {
            e.preventDefault();
            startPan(e);
        }
    }, [startPan]);

    return {
        viewport,
        isPanning,
        containerRef,
        zoomTo,
        zoomToward,
        fitPage,
        startPan,
        handleContainerPointerDown,
    };
}
