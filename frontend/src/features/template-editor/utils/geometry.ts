import type { TemplateElement } from '../canvasTypes';
import { mmToPx } from '../canvasTypes';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Get the bounding box of an element in mm. */
export function getBoundingBox(el: TemplateElement): Rect {
  return {
    x: el.position.x,
    y: el.position.y,
    width: el.size.width,
    height: el.size.height,
  };
}

/** Check if two rectangles intersect (both in the same unit system). */
export function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
