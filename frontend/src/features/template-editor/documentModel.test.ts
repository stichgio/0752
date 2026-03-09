import { describe, expect, it } from 'vitest';
import { createElement, createEmptyDocument } from './canvasTypes';
import {
  addElementToPage,
  alignElements,
  createPage,
  distributeElements,
  duplicatePage,
  ensureCanvasDocument,
  saveSelectionAsComponent,
  validateCanvasDocument,
} from './documentModel';

describe('documentModel', () => {
  it('normalizes legacy documents with page membership', () => {
    const doc = createEmptyDocument();
    const legacyElement = createElement('text', { x: 10, y: 12 });
    const normalized = ensureCanvasDocument({ ...doc, elements: [legacyElement], pages: undefined, activePageId: undefined });

    expect(normalized.pages).toHaveLength(1);
    expect(normalized.activePageId).toBe(normalized.pages?.[0]?.id);
    expect(normalized.elements[0].pageId).toBe(normalized.pages?.[0]?.id);
  });

  it('duplicates a page with cloned elements', () => {
    let doc = createEmptyDocument();
    doc = addElementToPage(doc, createElement('text', { x: 10, y: 10 }), doc.pages?.[0]?.id || 'page-1');
    doc = createPage(doc, 'Segunda');

    const duplicated = duplicatePage(doc, doc.pages?.[0]?.id || 'page-1');
    expect(duplicated.pages).toHaveLength(3);
    expect(duplicated.elements).toHaveLength(2);
    expect(new Set(duplicated.elements.map((element) => element.id)).size).toBe(2);
  });

  it('creates a reusable component and validates missing assets', () => {
    let doc = createEmptyDocument();
    const element = { ...createElement('image', { x: 5, y: 5 }), assetRefId: 'missing-asset' };
    doc = addElementToPage(doc, element, doc.pages?.[0]?.id || 'page-1');

    const saved = saveSelectionAsComponent(doc, [element.id]);
    const issues = validateCanvasDocument(saved.doc);

    expect(saved.component?.elements).toHaveLength(1);
    expect(issues.some((issue) => issue.code === 'ASSET_REF_MISSING')).toBe(true);
  });
});

describe('alignElements', () => {
  function makeEl(id: string, x: number, y: number, w = 20, h = 10) {
    const el = createElement('rectangle', { x, y });
    el.id = id;
    el.size = { width: w, height: h };
    return el;
  }

  it('aligns all selected elements to the leftmost x (left)', () => {
    const a = makeEl('a', 10, 5);
    const b = makeEl('b', 40, 15);
    const c = makeEl('c', 25, 30);
    const result = alignElements([a, b, c], ['a', 'b', 'c'], 'left');
    const minX = 10;
    result.forEach((el) => {
      expect(el.position.x).toBe(minX);
    });
  });

  it('centers all selected elements horizontally (center-h)', () => {
    const a = makeEl('a', 0, 0, 20, 10);
    const b = makeEl('b', 80, 0, 20, 10);
    // minX=0, maxX=100, center=50 => each el gets x = 50 - width/2
    const result = alignElements([a, b], ['a', 'b'], 'center-h');
    const expectedX = 0 + (100 - 0) / 2 - 20 / 2; // 40
    result.forEach((el) => {
      expect(el.position.x).toBeCloseTo(expectedX);
    });
  });

  it('aligns all selected elements to the rightmost edge (right)', () => {
    const a = makeEl('a', 0, 0, 30, 10);
    const b = makeEl('b', 50, 0, 20, 10);
    // maxX = max(0+30, 50+20) = 70
    const result = alignElements([a, b], ['a', 'b'], 'right');
    const maxX = 70;
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(maxX - 30); // 40
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(maxX - 20); // 50
  });

  it('aligns all selected elements to the topmost y (top)', () => {
    const a = makeEl('a', 0, 20);
    const b = makeEl('b', 0, 5);
    const result = alignElements([a, b], ['a', 'b'], 'top');
    result.forEach((el) => {
      expect(el.position.y).toBe(5);
    });
  });

  it('centers all selected elements vertically (center-v)', () => {
    const a = makeEl('a', 0, 0, 20, 10);
    const b = makeEl('b', 0, 90, 20, 10);
    // minY=0, maxY=100, center=50, each el gets y = 50 - height/2
    const result = alignElements([a, b], ['a', 'b'], 'center-v');
    const expectedY = 50 - 10 / 2; // 45
    result.forEach((el) => {
      expect(el.position.y).toBeCloseTo(expectedY);
    });
  });

  it('aligns all selected elements to the bottommost edge (bottom)', () => {
    const a = makeEl('a', 0, 0, 20, 30);
    const b = makeEl('b', 0, 50, 20, 10);
    // maxY = max(0+30, 50+10) = 60
    const result = alignElements([a, b], ['a', 'b'], 'bottom');
    expect(result.find((el) => el.id === 'a')?.position.y).toBe(60 - 30); // 30
    expect(result.find((el) => el.id === 'b')?.position.y).toBe(60 - 10); // 50
  });

  it('is a no-op when only one element id is provided (single element)', () => {
    const a = makeEl('a', 15, 20);
    const b = makeEl('b', 40, 50);
    const result = alignElements([a, b], ['a'], 'left');
    // With a single target the bounding box = that element itself, so its position is unchanged
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(15);
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(40);
  });

  it('excludes locked elements from alignment', () => {
    const a = makeEl('a', 10, 5);
    const b = { ...makeEl('b', 80, 5), locked: true };
    const result = alignElements([a, b], ['a', 'b'], 'left');
    // Only 'a' is unlocked; bounding box of unlocked targets is just 'a' so x stays
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(10);
    // Locked element should not be moved
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(80);
  });

  it('is a no-op when all selected elements are locked', () => {
    const a = { ...makeEl('a', 10, 5), locked: true };
    const b = { ...makeEl('b', 80, 5), locked: true };
    const result = alignElements([a, b], ['a', 'b'], 'left');
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(10);
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(80);
  });
});

describe('distributeElements', () => {
  function makeEl(id: string, x: number, y: number, w = 10, h = 10) {
    const el = createElement('rectangle', { x, y });
    el.id = id;
    el.size = { width: w, height: h };
    return el;
  }

  it('distributes 3 elements evenly along the horizontal axis', () => {
    // a at x=0 (w=10), b at x=100 (w=10), c at x=25 (w=10)
    // sorted by x: a(0), c(25), b(100)
    // span = 100+10 - 0 = 110, totalSize = 30, gap = (110-30)/2 = 40
    // cursor starts at 0: a stays at 0, c moves to 0+10+40=50, b moves to 50+10+40=100
    const a = makeEl('a', 0, 0);
    const b = makeEl('b', 100, 0);
    const c = makeEl('c', 25, 0);
    const result = distributeElements([a, b, c], ['a', 'b', 'c'], 'horizontal');
    const sorted = [...result].sort((x1, x2) => x1.position.x - x2.position.x);
    expect(sorted[0].position.x).toBeCloseTo(0);
    expect(sorted[1].position.x).toBeCloseTo(50);
    expect(sorted[2].position.x).toBeCloseTo(100);
  });

  it('distributes 3 elements evenly along the vertical axis', () => {
    const a = makeEl('a', 0, 0);
    const b = makeEl('b', 0, 100);
    const c = makeEl('c', 0, 25);
    // sorted by y: a(0), c(25), b(100)
    // span = 100+10 - 0 = 110, totalSize = 30, gap = (110-30)/2 = 40
    // cursor: a at 0, c at 50, b at 100
    const result = distributeElements([a, b, c], ['a', 'b', 'c'], 'vertical');
    const sorted = [...result].sort((x1, x2) => x1.position.y - x2.position.y);
    expect(sorted[0].position.y).toBeCloseTo(0);
    expect(sorted[1].position.y).toBeCloseTo(50);
    expect(sorted[2].position.y).toBeCloseTo(100);
  });

  it('is a no-op when fewer than 3 elements are selected', () => {
    const a = makeEl('a', 0, 0);
    const b = makeEl('b', 50, 0);
    const result = distributeElements([a, b], ['a', 'b'], 'horizontal');
    // Positions must be unchanged
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(0);
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(50);
  });

  it('excludes locked elements from distribution', () => {
    const a = makeEl('a', 0, 0);
    const b = makeEl('b', 50, 0);
    const c = { ...makeEl('c', 100, 0), locked: true };
    // Only a and b are unlocked → fewer than 3 → no-op
    const result = distributeElements([a, b, c], ['a', 'b', 'c'], 'horizontal');
    expect(result.find((el) => el.id === 'a')?.position.x).toBe(0);
    expect(result.find((el) => el.id === 'b')?.position.x).toBe(50);
    expect(result.find((el) => el.id === 'c')?.position.x).toBe(100);
  });
});
