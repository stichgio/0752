import type { Position, Size } from '../canvasTypes';

export const DRAG_ACTIVATION_THRESHOLD_PX = 4;

export type DropAnchor = 'top-left' | 'center';

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

export function resolveDropPosition({
  point,
  pageSize,
  snap,
  elementSize,
  anchor = 'top-left',
}: ResolveDropPositionOptions): Position {
  const width = Math.max(0, elementSize?.width ?? 0);
  const height = Math.max(0, elementSize?.height ?? 0);
  const rawX = anchor === 'center' ? point.x - width / 2 : point.x;
  const rawY = anchor === 'center' ? point.y - height / 2 : point.y;
  const maxX = Math.max(0, pageSize.width - width);
  const maxY = Math.max(0, pageSize.height - height);

  return {
    x: snap(Math.max(0, Math.min(maxX, rawX))),
    y: snap(Math.max(0, Math.min(maxY, rawY))),
  };
}
