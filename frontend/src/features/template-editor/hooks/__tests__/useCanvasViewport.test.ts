import { describe, it, expect } from 'vitest';
import {
    clampZoom,
    calcZoomToward,
    calcFitPage,
    ZOOM_MIN,
    ZOOM_MAX,
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
