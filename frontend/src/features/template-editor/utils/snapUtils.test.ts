import { describe, expect, it } from 'vitest';

import type { PageSettings, TemplateElement } from '../canvasTypes';
import { buildDocumentSnapLines, collectSnapLines, computeSnapPosition } from './snapUtils';

const pageSettings: PageSettings = {
  format: 'Custom',
  width: 200,
  height: 100,
  orientation: 'portrait',
  margins: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  },
};

function createElement(overrides: Partial<TemplateElement>): TemplateElement {
  return {
    id: overrides.id ?? 'element',
    type: overrides.type ?? 'rectangle',
    name: overrides.name ?? 'Element',
    position: overrides.position ?? { x: 0, y: 0 },
    size: overrides.size ?? { width: 10, height: 10 },
    style: overrides.style ?? {},
    ...overrides,
  };
}

describe('snapUtils', () => {
  it('snaps to the page center before falling back to the grid', () => {
    const lines = collectSnapLines(buildDocumentSnapLines([], pageSettings));
    const result = computeSnapPosition(
      { x: 97, y: 18, width: 10, height: 10 },
      lines,
      { threshold: 3, gridSize: 5 },
    );

    expect(result.x).toBe(95);
    expect(result.y).toBe(20);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(false);
    expect(result.guides).toContainEqual({ axis: 'x', position: 100 });
  });

  it('aligns with another visible element using its cached center line', () => {
    const lines = collectSnapLines(
      buildDocumentSnapLines(
        [
          createElement({
            id: 'moving',
            position: { x: 43, y: 12 },
            size: { width: 10, height: 10 },
          }),
          createElement({
            id: 'reference',
            position: { x: 40, y: 20 },
            size: { width: 20, height: 20 },
          }),
        ],
        pageSettings,
      ),
      'moving',
    );

    const result = computeSnapPosition(
      { x: 43, y: 12, width: 10, height: 10 },
      lines,
      { threshold: 3, enableGrid: false },
    );

    expect(result.x).toBe(45);
    expect(result.snappedX).toBe(true);
    expect(result.guides).toContainEqual({ axis: 'x', position: 50 });
  });
});
