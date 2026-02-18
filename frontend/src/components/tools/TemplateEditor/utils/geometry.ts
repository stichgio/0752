import { Position, Size, TemplateElement } from '../canvasTypes';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
}

export interface Point {
    x: number;
    y: number;
}

/**
 * Calculates the bounding box of an element, accounting for rotation if needed.
 * For now, returns the axis-aligned bounding box defined by x,y,w,h.
 * Future: Implement rotated bounding box calculation.
 */
export function getBoundingBox(element: TemplateElement): Rect {
    return {
        x: element.position.x,
        y: element.position.y,
        width: element.size.width,
        height: element.size.height,
        rotation: element.rotation || 0,
    };
}

/**
 * Checks if two rectangles intersect.
 * Currently uses axis-aligned intersection logic.
 */
export function rectIntersects(r1: Rect, r2: Rect): boolean {
    return !(
        r2.x > r1.x + r1.width ||
        r2.x + r2.width < r1.x ||
        r2.y > r1.height + r1.y ||
        r2.y + r2.height < r1.y
    );
}

/**
 * Calculates distance between two points.
 */
export function distanceBetween(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Rotates a point around a center by a given angle (in degrees).
 */
export function rotatePoint(point: Point, center: Point, angleDegrees: number): Point {
    const angleRadians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);

    const dx = point.x - center.x;
    const dy = point.y - center.y;

    return {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos),
    };
}

/**
 * Snaps a value to the nearest grid step.
 */
export function snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Gets the center point of a rectangle
 */
export function getCenter(rect: Rect): Point {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
    };
}
