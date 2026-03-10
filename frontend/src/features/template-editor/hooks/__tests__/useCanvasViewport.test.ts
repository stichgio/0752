import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
    clampZoom,
    calcZoomToward,
    calcFitPage,
    ZOOM_MIN,
    ZOOM_MAX,
    useCanvasViewport,
    type UseCanvasViewportReturn,
} from '../useCanvasViewport';

describe('clampZoom', () => {
    it('returns value unchanged when within range', () => {
        expect(clampZoom(100)).toBe(100);
    });
    it('clamps below minimum', () => {
        expect(clampZoom(5)).toBe(ZOOM_MIN);
    });
    it('clamps above maximum', () => {
        expect(clampZoom(9999)).toBe(ZOOM_MAX);
    });
});

describe('calcZoomToward', () => {
    it('keeps the focal point visually fixed', () => {
        // cursor at (300, 200), zoom 100->200, pan (0,0)
        const result = calcZoomToward(300, 200, 100, 200, 0, 0);
        expect(result.zoom).toBe(200);
        // focal point check: cx - (cx - panX) * ratio = 300 - 300*2 = -300
        expect(result.panX).toBeCloseTo(-300);
        expect(result.panY).toBeCloseTo(-200);
    });

    it('maintains pan when cursor is at origin', () => {
        const result = calcZoomToward(0, 0, 100, 150, 50, 80);
        expect(result.panX).toBeCloseTo(50 * 1.5);
        expect(result.panY).toBeCloseTo(80 * 1.5);
    });
});

describe('calcFitPage', () => {
    it('fits the page with margin', () => {
        // Container 1000x800, page 500x700
        const result = calcFitPage(1000, 800, 500, 700);
        expect(result.zoom).toBeGreaterThan(0);
        expect(result.zoom).toBeLessThanOrEqual(ZOOM_MAX);
        // Page should be centered: panX > 0
        expect(result.panX).toBeGreaterThan(0);
        expect(result.panY).toBeGreaterThan(0);
    });

    it('uses the more constrained dimension', () => {
        // Wide container: height is the binding constraint, zoom ~138
        // Narrow container: width is the binding constraint, zoom ~101
        const wide = calcFitPage(2000, 1200, 400, 800);
        const narrow = calcFitPage(500, 1200, 400, 800);
        expect(narrow.zoom).toBeLessThan(wide.zoom);
    });
});

// ---------------------------------------------------------------------------
// renderHook integration tests — manual implementation via react-dom/client
// (avoids @testing-library/react which is not installed in this project)
// ---------------------------------------------------------------------------

/**
 * Minimal renderHook helper: mounts a wrapper component that calls the hook
 * and stores its return value, then returns { result, unmount }.
 */
function renderHook<T>(useHookFn: () => T): { result: { current: T }; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const result: { current: T } = { current: undefined as unknown as T };

    function HookWrapper() {
        result.current = useHookFn();
        return null;
    }

    act(() => {
        root.render(React.createElement(HookWrapper));
    });

    return {
        result,
        unmount: () => {
            act(() => { root.unmount(); });
            container.remove();
        },
    };
}

describe('useCanvasViewport hook', () => {
    let cleanup: (() => void) | undefined;

    afterEach(() => {
        cleanup?.();
        cleanup = undefined;
    });

    it('initializes with provided zoom', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ initialZoom: 75, pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        expect(result.current.viewport.zoom).toBe(75);
    });

    it('zoomTo updates viewport zoom', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        act(() => result.current.zoomTo(150));
        expect(result.current.viewport.zoom).toBe(150);
    });

    it('zoomTo clamps at ZOOM_MAX', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        act(() => result.current.zoomTo(9999));
        expect(result.current.viewport.zoom).toBe(400);
    });

    it('zoomTo clamps at ZOOM_MIN', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        act(() => result.current.zoomTo(1));
        expect(result.current.viewport.zoom).toBe(10);
    });

    it('fitPage updates viewport without throwing', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        expect(() => act(() => result.current.fitPage())).not.toThrow();
    });

    it('isPanning starts as false', () => {
        const { result, unmount } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        cleanup = unmount;
        expect(result.current.isPanning).toBe(false);
    });
});
