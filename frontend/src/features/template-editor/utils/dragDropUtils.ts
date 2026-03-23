import type { Position, Size } from '../canvasTypes';

export const DRAG_ACTIVATION_THRESHOLD_PX = 4;

export type DropAnchor = 'top-left' | 'center';
export interface ClientRectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ResolveDropPositionOptions {
  point: Position;
  pageSize: Size;
  snap: (value: number) => number;
  elementSize?: Size | null;
  anchor?: DropAnchor;
}

export function shouldActivateDrag(
  deltaX: number,
  deltaY: number,
  threshold = DRAG_ACTIVATION_THRESHOLD_PX,
): boolean {
  return Math.hypot(deltaX, deltaY) >= threshold;
}

export function isPointInsideRect(
  clientX: number,
  clientY: number,
  rect: ClientRectBounds,
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function clampToPageBounds(
  point: Position,
  pageSize: Size,
  elementSize?: Size | null,
  anchor: DropAnchor = 'top-left',
): Position {
  const width = Math.max(0, elementSize?.width ?? 0);
  const height = Math.max(0, elementSize?.height ?? 0);
  const rawX = anchor === 'center' ? point.x - width / 2 : point.x;
  const rawY = anchor === 'center' ? point.y - height / 2 : point.y;
  const maxX = Math.max(0, pageSize.width - width);
  const maxY = Math.max(0, pageSize.height - height);

  return {
    x: Math.max(0, Math.min(maxX, rawX)),
    y: Math.max(0, Math.min(maxY, rawY)),
  };
}

export function resolveDropPosition({
  point,
  pageSize,
  snap,
  elementSize,
  anchor = 'top-left',
}: ResolveDropPositionOptions): Position {
  const clamped = clampToPageBounds(point, pageSize, elementSize, anchor);

  return {
    x: snap(clamped.x),
    y: snap(clamped.y),
  };
}
