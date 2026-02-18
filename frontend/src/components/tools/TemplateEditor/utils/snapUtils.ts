import type { TemplateElement, PageSettings, Position, Size } from '../canvasTypes';

const SNAP_THRESHOLD = 3; // mm

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number; // mm
}

export interface SnapResult {
  x?: number;
  y?: number;
  guides: SnapGuide[];
}

/**
 * Calculate snap positions for a dragging element against other elements
 * and page boundaries (margins & edges).
 */
export function calculateSnap(
  elementId: string,
  pos: Position,
  size: Size,
  elements: TemplateElement[],
  pageSettings: PageSettings,
): SnapResult {
  const guides: SnapGuide[] = [];
  let snappedX: number | undefined;
  let snappedY: number | undefined;

  const elLeft = pos.x;
  const elRight = pos.x + size.width;
  const elCenterX = pos.x + size.width / 2;
  const elTop = pos.y;
  const elBottom = pos.y + size.height;
  const elCenterY = pos.y + size.height / 2;

  // Margins
  const margins = pageSettings.margins ?? { top: 10, right: 10, bottom: 10, left: 10 };
  const marginLeft = (margins as any).left ?? (pageSettings as any).marginLeft ?? 10;
  const marginRight = (margins as any).right ?? (pageSettings as any).marginRight ?? 10;
  const marginTop = (margins as any).top ?? (pageSettings as any).marginTop ?? 10;
  const marginBottom = (margins as any).bottom ?? (pageSettings as any).marginBottom ?? 10;

  // Reference lines: page edges + margins + page center
  const vLines: number[] = [
    0, pageSettings.width, marginLeft, pageSettings.width - marginRight, pageSettings.width / 2,
  ];
  const hLines: number[] = [
    0, pageSettings.height, marginTop, pageSettings.height - marginBottom, pageSettings.height / 2,
  ];

  // Add other elements' edges and centers
  for (const el of elements) {
    if (el.id === elementId || el.visible === false) continue;
    vLines.push(el.position.x, el.position.x + el.size.width, el.position.x + el.size.width / 2);
    hLines.push(el.position.y, el.position.y + el.size.height, el.position.y + el.size.height / 2);
  }

  // Snap X
  for (const line of vLines) {
    if (snappedX !== undefined) break;
    if (Math.abs(elLeft - line) < SNAP_THRESHOLD) {
      snappedX = line;
      guides.push({ orientation: 'vertical', position: line });
    } else if (Math.abs(elRight - line) < SNAP_THRESHOLD) {
      snappedX = line - size.width;
      guides.push({ orientation: 'vertical', position: line });
    } else if (Math.abs(elCenterX - line) < SNAP_THRESHOLD) {
      snappedX = line - size.width / 2;
      guides.push({ orientation: 'vertical', position: line });
    }
  }

  // Snap Y
  for (const line of hLines) {
    if (snappedY !== undefined) break;
    if (Math.abs(elTop - line) < SNAP_THRESHOLD) {
      snappedY = line;
      guides.push({ orientation: 'horizontal', position: line });
    } else if (Math.abs(elBottom - line) < SNAP_THRESHOLD) {
      snappedY = line - size.height;
      guides.push({ orientation: 'horizontal', position: line });
    } else if (Math.abs(elCenterY - line) < SNAP_THRESHOLD) {
      snappedY = line - size.height / 2;
      guides.push({ orientation: 'horizontal', position: line });
    }
  }

  return { x: snappedX, y: snappedY, guides };
}
