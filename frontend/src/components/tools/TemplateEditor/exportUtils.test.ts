import { describe, expect, it } from 'vitest';
import { createElement, createEmptyDocument } from './canvasTypes';
import { addElementToPage, createPage } from './documentModel';
import { exportToJinja2 } from './exportUtils';

describe('exportUtils multipage', () => {
  it('exports one container per page', () => {
    let doc = createEmptyDocument();
    const firstPageId = doc.pages?.[0]?.id || 'page-1';
    doc = addElementToPage(doc, createElement('text', { x: 10, y: 10 }, { content: 'Pagina 1' }), firstPageId);
    doc = createPage(doc, 'Pagina 2');
    const secondPageId = doc.pages?.[1]?.id || 'page-2';
    doc = addElementToPage(doc, createElement('text', { x: 20, y: 20 }, { content: 'Pagina 2' }), secondPageId);

    const html = exportToJinja2(doc);

    expect((html.match(/<div class="template-container"/g) || []).length).toBe(2);
    expect(html).toContain(`data-page-id="${firstPageId}"`);
    expect(html).toContain(`data-page-id="${secondPageId}"`);
    expect(html).toContain('Pagina 1');
    expect(html).toContain('Pagina 2');
  });
});
