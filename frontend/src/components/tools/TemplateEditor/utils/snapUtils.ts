import { TemplateElement, Position, CanvasDocument } from '../canvasTypes';
import { getBoundingBox, Rect } from './geometry';

export interface SnapResult {
    x?: number;
    y?: number;
    guides: SnapGuide[];
}

export interface SnapGuide {
    orientation: 'vertical' | 'horizontal';
    position: number;
    label?: string;
}

const SNAP_THRESHOLD = 2; // mm

/**
 * Calculates snap positions and guides for an element being dragged.
 */
export function calculateSnap(
    elementId: string,
    newPos: Position,
    size: { width: number, height: number },
    elements: TemplateElement[],
    pageSettings: CanvasDocument['pageSettings']
): SnapResult {
    const guides: SnapGuide[] = [];
    let snappedX: number | undefined;
    let snappedY: number | undefined;

    const myLeft = newPos.x;
    const myRight = newPos.x + size.width;
    const myCenterX = newPos.x + size.width / 2;

    const myTop = newPos.y;
    const myBottom = newPos.y + size.height;
    const myCenterY = newPos.y + size.height / 2;

    const pageWidth = pageSettings.width;
    const pageHeight = pageSettings.height;
    const pageCenterX = pageWidth / 2;
    const pageCenterY = pageHeight / 2;

    // Snap to Page Center X
    if (Math.abs(myCenterX - pageCenterX) < SNAP_THRESHOLD) {
        snappedX = pageCenterX - size.width / 2;
        guides.push({ orientation: 'vertical', position: pageCenterX });
    }

    // Snap to Page Center Y
    if (Math.abs(myCenterY - pageCenterY) < SNAP_THRESHOLD) {
        snappedY = pageCenterY - size.height / 2;
        guides.push({ orientation: 'horizontal', position: pageCenterY });
    }

    // Snap to other elements
    elements.forEach(other => {
        if (other.id === elementId || !other.visible) return;

        const otherBox = getBoundingBox(other);
        const otherLeft = otherBox.x;
        const otherRight = otherBox.x + otherBox.width;
        const otherCenterX = otherBox.x + otherBox.width / 2;
        const otherTop = otherBox.y;
        const otherBottom = otherBox.y + otherBox.height;
        const otherCenterY = otherBox.y + otherBox.height / 2;

        // Horizontal Snapping (Vertical guides)
        // Left to Left
        if (Math.abs(myLeft - otherLeft) < SNAP_THRESHOLD) {
            if (snappedX === undefined) {
                snappedX = otherLeft;
                guides.push({ orientation: 'vertical', position: otherLeft });
            }
        }
        // Right to Right
        if (Math.abs(myRight - otherRight) < SNAP_THRESHOLD) {
            if (snappedX === undefined) {
                snappedX = otherRight - size.width;
                guides.push({ orientation: 'vertical', position: otherRight });
            }
        }
        // Center to Center
        if (Math.abs(myCenterX - otherCenterX) < SNAP_THRESHOLD) {
            if (snappedX === undefined) {
                snappedX = otherCenterX - size.width / 2;
                guides.push({ orientation: 'vertical', position: otherCenterX });
            }
        }
        // Left to Right
        if (Math.abs(myLeft - otherRight) < SNAP_THRESHOLD) {
            if (snappedX === undefined) {
                snappedX = otherRight;
                guides.push({ orientation: 'vertical', position: otherRight });
            }
        }
        // Right to Left
        if (Math.abs(myRight - otherLeft) < SNAP_THRESHOLD) {
            if (snappedX === undefined) {
                snappedX = otherLeft - size.width;
                guides.push({ orientation: 'vertical', position: otherLeft });
            }
        }

        // Vertical Snapping (Horizontal guides)
        // Top to Top
        if (Math.abs(myTop - otherTop) < SNAP_THRESHOLD) {
            if (snappedY === undefined) {
                snappedY = otherTop;
                guides.push({ orientation: 'horizontal', position: otherTop });
            }
        }
        // Bottom to Bottom
        if (Math.abs(myBottom - otherBottom) < SNAP_THRESHOLD) {
            if (snappedY === undefined) {
                snappedY = otherBottom - size.height;
                guides.push({ orientation: 'horizontal', position: otherBottom });
            }
        }
        // Center to Center
        if (Math.abs(myCenterY - otherCenterY) < SNAP_THRESHOLD) {
            if (snappedY === undefined) {
                snappedY = otherCenterY - size.height / 2;
                guides.push({ orientation: 'horizontal', position: otherCenterY });
            }
        }
        // Top to Bottom
        if (Math.abs(myTop - otherBottom) < SNAP_THRESHOLD) {
            if (snappedY === undefined) {
                snappedY = otherBottom;
                guides.push({ orientation: 'horizontal', position: otherBottom });
            }
        }
        // Bottom to Top
        if (Math.abs(myBottom - otherTop) < SNAP_THRESHOLD) {
            if (snappedY === undefined) {
                snappedY = otherTop - size.height;
                guides.push({ orientation: 'horizontal', position: otherTop });
            }
        }
    });

    return { x: snappedX, y: snappedY, guides };
}
