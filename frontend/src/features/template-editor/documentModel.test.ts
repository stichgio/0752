import { describe, expect, it } from 'vitest';
import { createElement, createEmptyDocument } from './canvasTypes';
import {
  addElementToPage,
  createPage,
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
