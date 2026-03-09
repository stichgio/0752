import { describe, it, expect } from 'vitest';
import { computePxPerMm, computeRulerTicks, RULER_THICKNESS } from './Ruler';

// 96 DPI: 96 px/inch, 25.4 mm/inch => 96/25.4 ≈ 3.7795 px/mm at zoom=100
const BASE_PX_PER_MM = 96 / 25.4;

describe('computePxPerMm', () => {
    it('returns ~3.78 px/mm at zoom=100', () => {
        const result = computePxPerMm(100);
        expect(result).toBeCloseTo(BASE_PX_PER_MM, 3);
    });

    it('doubles at zoom=200', () => {
        const at100 = computePxPerMm(100);
        const at200 = computePxPerMm(200);
        expect(at200).toBeCloseTo(at100 * 2, 5);
    });

    it('halves at zoom=50', () => {
        const at100 = computePxPerMm(100);
        const at50 = computePxPerMm(50);
        expect(at50).toBeCloseTo(at100 / 2, 5);
    });

    it('returns 0 at zoom=0', () => {
        expect(computePxPerMm(0)).toBe(0);
    });
});

describe('computeRulerTicks', () => {
    it('returns empty array when lengthPx is 0', () => {
        expect(computeRulerTicks(100, 0, 0)).toHaveLength(0);
    });

    it('returns empty array when pxPerMm is 0 (zoom=0)', () => {
        expect(computeRulerTicks(0, 0, 800)).toHaveLength(0);
    });

    it('places tick at 0mm at px = pageOffsetPx when offset=0', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        const tick0 = ticks.find((t) => t.mm === 0);
        expect(tick0).toBeDefined();
        expect(tick0!.px).toBeCloseTo(0, 5);
    });

    it('places tick at 50mm at ~189px with pageOffset=0 at zoom=100', () => {
        // 50mm * (96/25.4) ≈ 188.976px
        const ticks = computeRulerTicks(100, 0, 800);
        const tick50 = ticks.find((t) => t.mm === 50);
        expect(tick50).toBeDefined();
        expect(tick50!.px).toBeCloseTo(50 * BASE_PX_PER_MM, 2);
        // Should be approximately 189
        expect(tick50!.px).toBeGreaterThan(188);
        expect(tick50!.px).toBeLessThan(190);
    });

    it('places tick at 50mm at ~378px at zoom=200', () => {
        // At zoom=200, pxPerMm doubles so 50mm * (2 * 96/25.4) ≈ 377.95px
        const ticks = computeRulerTicks(200, 0, 800);
        const tick50 = ticks.find((t) => t.mm === 50);
        expect(tick50).toBeDefined();
        expect(tick50!.px).toBeCloseTo(50 * BASE_PX_PER_MM * 2, 2);
    });

    it('respects pageOffsetPx in tick position', () => {
        const offset = 32;
        const ticks = computeRulerTicks(100, offset, 800);
        const tick0 = ticks.find((t) => t.mm === 0);
        expect(tick0).toBeDefined();
        expect(tick0!.px).toBeCloseTo(offset, 5);

        const tick50 = ticks.find((t) => t.mm === 50);
        expect(tick50).toBeDefined();
        expect(tick50!.px).toBeCloseTo(offset + 50 * BASE_PX_PER_MM, 2);
    });

    it('only produces ticks within visible range', () => {
        const ticks = computeRulerTicks(100, 0, 300);
        ticks.forEach((t) => {
            expect(t.px).toBeGreaterThanOrEqual(-0.5);
            expect(t.px).toBeLessThanOrEqual(300.5);
        });
    });

    it('marks every 50mm tick as hasLabel=true', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        const labeledTicks = ticks.filter((t) => t.hasLabel);
        labeledTicks.forEach((t) => {
            // Use == 0 to handle both +0 and -0
            expect(t.mm % 50 == 0).toBe(true);
        });
    });

    it('marks 10mm ticks as medium size (10px) without label', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        const tick10 = ticks.find((t) => t.mm === 10);
        expect(tick10).toBeDefined();
        expect(tick10!.size).toBe(10);
        expect(tick10!.hasLabel).toBe(false);
    });

    it('marks 5mm ticks as small size (6px) without label', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        const tick5 = ticks.find((t) => t.mm === 5);
        expect(tick5).toBeDefined();
        expect(tick5!.size).toBe(6);
        expect(tick5!.hasLabel).toBe(false);
    });

    it('marks 50mm ticks as tall size (14px) with label', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        const tick50 = ticks.find((t) => t.mm === 50);
        expect(tick50).toBeDefined();
        expect(tick50!.size).toBe(14);
        expect(tick50!.hasLabel).toBe(true);
    });

    it('all ticks are at multiples of 5mm', () => {
        const ticks = computeRulerTicks(100, 0, 800);
        ticks.forEach((t) => {
            // Use == 0 to handle both +0 and -0
            expect(t.mm % 5 == 0).toBe(true);
        });
    });

    it('handles negative pageOffsetPx (ruler starts before page)', () => {
        // With a negative offset, some negative-mm ticks may appear
        const ticks = computeRulerTicks(100, -50, 800);
        ticks.forEach((t) => {
            expect(t.px).toBeGreaterThanOrEqual(-0.5);
            expect(t.px).toBeLessThanOrEqual(800.5);
        });
    });
});

describe('RULER_THICKNESS', () => {
    it('is 20px', () => {
        expect(RULER_THICKNESS).toBe(20);
    });
});
