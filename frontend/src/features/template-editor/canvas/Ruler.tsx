import React, { useMemo } from 'react';

export const RULER_THICKNESS = 20;

/**
 * Computes the pixels-per-mm value at the given zoom level.
 * Uses 96 DPI: 96 px/inch, 25.4 mm/inch => 96/25.4 px/mm.
 */
export function computePxPerMm(zoom: number): number {
    const scale = zoom / 100;
    return scale * (96 / 25.4);
}

export interface TickInfo {
    /** mm value of this tick */
    mm: number;
    /** pixel position from ruler start */
    px: number;
    /** tick height/width in px */
    size: number;
    /** whether this tick carries a label */
    hasLabel: boolean;
}

/**
 * Pure function exported for testability.
 *
 * Computes the visible tick marks for a ruler.
 *
 * @param zoom        current zoom level (e.g. 100 = 100%)
 * @param pageOffsetPx distance in px from ruler start to page origin (0 mm)
 * @param lengthPx    total visible length of the ruler in px
 * @returns array of tick descriptors within the visible range
 */
export function computeRulerTicks(
    zoom: number,
    pageOffsetPx: number,
    lengthPx: number,
): TickInfo[] {
    const pxPerMm = computePxPerMm(zoom);
    if (pxPerMm <= 0 || lengthPx <= 0) return [];

    // Step between ticks in mm (always 5 mm grid)
    const STEP_MM = 5;

    // Determine the first mm value that is visible.
    // tickPx = pageOffsetPx + mm * pxPerMm >= 0 => mm >= -pageOffsetPx / pxPerMm
    const firstMm = Math.ceil(-pageOffsetPx / pxPerMm / STEP_MM) * STEP_MM;
    // Last mm value that fits within lengthPx
    const lastMm = Math.floor((lengthPx - pageOffsetPx) / pxPerMm / STEP_MM) * STEP_MM;

    const ticks: TickInfo[] = [];

    for (let mm = firstMm; mm <= lastMm; mm += STEP_MM) {
        const px = pageOffsetPx + mm * pxPerMm;
        if (px < -0.5 || px > lengthPx + 0.5) continue;

        let size: number;
        let hasLabel: boolean;

        if (mm % 50 === 0) {
            // Every 50 mm (5 cm): tall tick + label
            size = 14;
            hasLabel = true;
        } else if (mm % 10 === 0) {
            // Every 10 mm (1 cm): medium tick
            size = 10;
            hasLabel = false;
        } else {
            // Every 5 mm: small tick
            size = 6;
            hasLabel = false;
        }

        ticks.push({ mm, px, size, hasLabel });
    }

    return ticks;
}

export interface RulerProps {
    orientation: 'horizontal' | 'vertical';
    /** current zoom level (e.g. 100 = 100%) */
    zoom: number;
    /** distance in px from ruler start to page origin (0,0) */
    pageOffsetPx: number;
    /** total length of the ruler in px (canvas viewport width or height) */
    lengthPx: number;
    /** ruler thickness in px, default RULER_THICKNESS */
    thickness?: number;
}

export function Ruler({
    orientation,
    zoom,
    pageOffsetPx,
    lengthPx,
    thickness = RULER_THICKNESS,
}: RulerProps) {
    const ticks = useMemo(
        () => computeRulerTicks(zoom, pageOffsetPx, lengthPx),
        [zoom, pageOffsetPx, lengthPx],
    );

    const isHorizontal = orientation === 'horizontal';

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: isHorizontal ? '100%' : thickness,
        height: isHorizontal ? thickness : '100%',
        backgroundColor: '#f9fafb',
        borderBottom: isHorizontal ? '1px solid #e5e7eb' : undefined,
        borderRight: !isHorizontal ? '1px solid #e5e7eb' : undefined,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 20,
    };

    return (
        <div style={containerStyle}>
            {ticks.map((tick) => {
                if (isHorizontal) {
                    return (
                        <div
                            key={tick.mm}
                            style={{ position: 'absolute', left: tick.px, top: 0, width: 0, height: thickness }}
                        >
                            {/* Tick line anchored to bottom of ruler */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    bottom: 0,
                                    width: 1,
                                    height: tick.size,
                                    backgroundColor: '#9ca3af',
                                }}
                            />
                            {tick.hasLabel && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        left: 2,
                                        top: 1,
                                        fontSize: 9,
                                        color: '#6b7280',
                                        lineHeight: 1,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {tick.mm}
                                </span>
                            )}
                        </div>
                    );
                } else {
                    // Vertical ruler
                    return (
                        <div
                            key={tick.mm}
                            style={{ position: 'absolute', top: tick.px, left: 0, width: thickness, height: 0 }}
                        >
                            {/* Tick line anchored to right edge of ruler */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    height: 1,
                                    width: tick.size,
                                    backgroundColor: '#9ca3af',
                                }}
                            />
                            {tick.hasLabel && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: 2,
                                        left: 2,
                                        fontSize: 9,
                                        color: '#6b7280',
                                        lineHeight: 1,
                                        whiteSpace: 'nowrap',
                                        transform: 'rotate(-90deg)',
                                        transformOrigin: 'left top',
                                    }}
                                >
                                    {tick.mm}
                                </span>
                            )}
                        </div>
                    );
                }
            })}
        </div>
    );
}

/** Corner square at the intersection of the two rulers */
export function RulerCorner({ thickness = RULER_THICKNESS }: { thickness?: number }) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: thickness,
                height: thickness,
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                borderRight: '1px solid #e5e7eb',
                zIndex: 21,
                pointerEvents: 'none',
            }}
        />
    );
}
