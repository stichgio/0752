import { describe, expect, it } from 'vitest';
import { clampToPageBounds, isPointInsideRect, resolveDropPosition, shouldActivateDrag } from './dragDropUtils';

describe('dragDropUtils', () => {
  it('waits for a minimum pointer delta before activating drag', () => {
    expect(shouldActivateDrag(2, 2)).toBe(false);
    expect(shouldActivateDrag(4, 0)).toBe(true);
  });

  it('keeps dropped elements inside the page bounds', () => {
    const position = resolveDropPosition({
      point: { x: 205, y: 294 },
      pageSize: { width: 210, height: 297 },
      elementSize: { width: 50, height: 40 },
      snap: (value) => Math.round(value / 5) * 5,
    });

    expect(position).toEqual({ x: 160, y: 255 });
  });

  it('supports centered drop placement when requested', () => {
    const position = resolveDropPosition({
      point: { x: 100, y: 120 },
      pageSize: { width: 210, height: 297 },
      elementSize: { width: 40, height: 20 },
      anchor: 'center',
      snap: (value) => value,
    });

    expect(position).toEqual({ x: 80, y: 110 });
  });

  it('clamps raw positions inside page bounds before snap', () => {
    const position = clampToPageBounds(
      { x: 220, y: -10 },
      { width: 210, height: 297 },
      { width: 60, height: 20 },
      'top-left',
    );

    expect(position).toEqual({ x: 150, y: 0 });
  });

  it('detects whether pointer is inside page rect for drop validity', () => {
    const pageRect = { left: 10, top: 20, right: 110, bottom: 220 };
    expect(isPointInsideRect(60, 80, pageRect)).toBe(true);
    expect(isPointInsideRect(5, 80, pageRect)).toBe(false);
  });
});
