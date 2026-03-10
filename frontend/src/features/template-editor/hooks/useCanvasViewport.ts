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
