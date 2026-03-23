import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentPanel } from './DocumentPanel';
import { normalizeKey } from './document/DataSection';
import type { CanvasDocument, TemplateValidationIssue, VariableDefinition } from '../canvasTypes';

// ---- helpers ----------------------------------------------------------------

function makeDoc(overrides: Partial<CanvasDocument> = {}): CanvasDocument {
  return {
    id: 'doc_test',
    name: 'Documento de prueba',
    elements: [],
    pages: [{ id: 'page_1', name: 'Página 1', elementIds: [] }],
    variables: [],
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pageSettings: {
      format: 'A4',
      width: 210,
      height: 297,
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    ...overrides,
  };
}

function makeProps(overrides: Partial<React.ComponentProps<typeof DocumentPanel>> = {}): React.ComponentProps<typeof DocumentPanel> {
  return {
    document: makeDoc(),
    activePageId: 'page_1',
    pageElements: [],
    selectedIds: [],
    variables: [],
    onVariablesChange: vi.fn(),
    onThemeChange: vi.fn(),
    onDataSourceDefinitionChange: vi.fn(),
    onSetActivePage: vi.fn(),
    onCreatePage: vi.fn(),
    onRenamePage: vi.fn(),
    onDuplicatePage: vi.fn(),
    onDeletePage: vi.fn(),
    onMovePage: vi.fn(),
    onCreateComponentFromSelection: vi.fn(),
    onInsertComponent: vi.fn(),
    onSyncComponent: vi.fn(),
    onUpdateComponentFromSelection: vi.fn(),
    onUpdateComponent: vi.fn(),
    onDeleteComponent: vi.fn(),
    onCreateBrandKit: vi.fn(),
    onApplyBrandKit: vi.fn(),
    onUpdateBrandKit: vi.fn(),
    onDeleteBrandKit: vi.fn(),
    onCreateVariant: vi.fn(),
    onApplyVariant: vi.fn(),
    onUpdateVariant: vi.fn(),
    onDeleteVariant: vi.fn(),
    validationIssues: [],
    ...overrides,
  };
}

// ---- normalizeKey unit tests ------------------------------------------------

describe('normalizeKey', () => {
  it('lowercases the input', () => {
    expect(normalizeKey('CAMPO')).toBe('campo');
  });

  it('replaces spaces and special chars with underscores', () => {
    expect(normalizeKey('Mi Campo')).toBe('mi_campo');
    expect(normalizeKey('campo-uno')).toBe('campo_uno');
  });

  it('strips leading and trailing underscores', () => {
    expect(normalizeKey('_campo_')).toBe('campo');
  });

  it('collapses consecutive special chars into one underscore', () => {
    expect(normalizeKey('campo  dos')).toBe('campo_dos');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeKey('')).toBe('');
  });
});

// ---- DocumentPanel render tests --------------------------------------------

describe('DocumentPanel render', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the overview header with doc name', () => {
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps()));
    });
    const overview = container.querySelector('[data-testid="doc-overview"]');
    expect(overview).not.toBeNull();
    expect(overview?.textContent).toContain('Documento de prueba');
  });

  it('renders 4 accordion sections', () => {
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps()));
    });
    const panel = container.querySelector('[data-testid="document-panel"]');
    expect(panel?.textContent).toContain('Estructura');
    expect(panel?.textContent).toContain('Datos');
    expect(panel?.textContent).toContain('Recursos');
    expect(panel?.textContent).toContain('Apariencia');
  });

  it('shows OK health badge when no issues', () => {
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ validationIssues: [] })));
    });
    expect(container.textContent).toContain('OK');
  });

  it('shows error health badge when there are errors', () => {
    const issues: TemplateValidationIssue[] = [
      { level: 'error', code: 'PAGE_ORPHAN_ELEMENT', message: 'Error de prueba' },
    ];
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ validationIssues: issues })));
    });
    const badge = container.querySelector('[data-testid="health-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('1');
  });

  it('shows warning health badge when there are only warnings', () => {
    const issues: TemplateValidationIssue[] = [
      { level: 'warning', code: 'PAGE_EMPTY', message: 'Advertencia de prueba' },
    ];
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ validationIssues: issues })));
    });
    const badge = container.querySelector('[data-testid="health-badge"]');
    expect(badge).not.toBeNull();
  });

  it('reflects correct counter values in overview', () => {
    const doc = makeDoc({
      pages: [
        { id: 'p1', name: 'P1', elementIds: [] },
        { id: 'p2', name: 'P2', elementIds: [] },
      ],
    });
    const variables: VariableDefinition[] = [
      { key: 'var_a', label: 'Var A', type: 'string' },
    ];
    const dataSourceDefinition = {
      schemaVersion: '1.0',
      fields: [
        { key: 'campo_1', label: 'Campo 1', type: 'string', required: false },
        { key: 'campo_2', label: 'Campo 2', type: 'number', required: true },
      ],
    };
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ document: doc, variables, dataSourceDefinition })));
    });
    const overview = container.querySelector('[data-testid="doc-overview"]')?.textContent || '';
    expect(overview).toContain('2'); // pages
    expect(overview).toContain('2'); // fields
    expect(overview).toContain('1'); // variables
  });

  it('opens only one accordion at a time', () => {
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps()));
    });
    // Estructura is open by default; click Datos
    const buttons = container.querySelectorAll('button');
    const datosBtn = Array.from(buttons).find((b) => b.textContent?.includes('Datos'));
    act(() => { datosBtn?.click(); });

    // "Agregar campo" should now be visible (from DataSection)
    expect(container.querySelector('[data-testid="add-item-btn"]')).not.toBeNull();
  });

  it('calls onCreatePage when "Nueva página" CTA is clicked', () => {
    const onCreatePage = vi.fn();
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ onCreatePage })));
    });
    // Estructura is open by default
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Nueva página')
    );
    act(() => { btn?.click(); });
    expect(onCreatePage).toHaveBeenCalled();
  });

  it('calls onSetActivePage when a page card is clicked', () => {
    const onSetActivePage = vi.fn();
    const doc = makeDoc({
      pages: [
        { id: 'p1', name: 'Alfa', elementIds: [] },
        { id: 'p2', name: 'Beta', elementIds: [] },
      ],
    });
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ document: doc, activePageId: 'p1', onSetActivePage })));
    });
    const betaBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Beta')
    );
    act(() => { betaBtn?.click(); });
    expect(onSetActivePage).toHaveBeenCalledWith('p2');
  });

  it('adds a field when add button is clicked in Datos section', () => {
    const onDataSourceDefinitionChange = vi.fn();
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ onDataSourceDefinitionChange })));
    });
    // Open Datos
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    const addBtn = container.querySelector('[data-testid="add-item-btn"]');
    act(() => { (addBtn as HTMLButtonElement)?.click(); });
    expect(onDataSourceDefinitionChange).toHaveBeenCalledOnce();
    const call = onDataSourceDefinitionChange.mock.calls[0][0];
    expect(call.fields).toHaveLength(1);
  });

  it('adds a variable when add button is clicked in Variables mode', () => {
    const onVariablesChange = vi.fn();
    act(() => {
      root.render(React.createElement(DocumentPanel, makeProps({ onVariablesChange })));
    });
    // Open Datos
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    // Switch to Variables mode
    const varTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Variables')
    );
    act(() => { varTab?.click(); });

    const addBtn = container.querySelector('[data-testid="add-item-btn"]');
    act(() => { (addBtn as HTMLButtonElement)?.click(); });
    expect(onVariablesChange).toHaveBeenCalledOnce();
    const newVars = onVariablesChange.mock.calls[0][0];
    expect(newVars).toHaveLength(1);
  });

  it('shows duplicate key badge when two fields share the same key', () => {
    const fields = [
      { key: 'campo_dup', label: 'A', type: 'string', required: false },
      { key: 'campo_dup', label: 'B', type: 'string', required: false },
    ];
    act(() => {
      root.render(
        React.createElement(DocumentPanel, makeProps({
          dataSourceDefinition: { schemaVersion: '1.0', fields },
        }))
      );
    });
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    const badges = container.querySelectorAll('[data-testid="duplicate-badge"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('calls onInsertBoundField when Insertar button is clicked on a field', () => {
    const onInsertBoundField = vi.fn();
    const fields = [{ key: 'mi_campo', label: 'Mi campo', type: 'string', required: false }];
    act(() => {
      root.render(
        React.createElement(DocumentPanel, makeProps({
          dataSourceDefinition: { schemaVersion: '1.0', fields },
          onInsertBoundField,
        }))
      );
    });
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    const insertBtn = container.querySelector('[data-testid="insert-btn"]');
    act(() => { (insertBtn as HTMLButtonElement)?.click(); });
    expect(onInsertBoundField).toHaveBeenCalledWith('mi_campo', 'Mi campo');
  });

  it('shows preview value chip when dataPreview provides a value for a field', () => {
    const fields = [{ key: 'ciudad', label: 'Ciudad', type: 'string', required: false }];
    act(() => {
      root.render(
        React.createElement(DocumentPanel, makeProps({
          dataSourceDefinition: { schemaVersion: '1.0', fields },
          dataPreview: { ciudad: 'Bogotá' },
        }))
      );
    });
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    const chip = container.querySelector('[data-testid="preview-chip"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe('Bogotá');
  });

  it('deletes a field when remove button is clicked', () => {
    const onDataSourceDefinitionChange = vi.fn();
    const fields = [{ key: 'campo_x', label: 'X', type: 'string', required: false }];
    act(() => {
      root.render(
        React.createElement(DocumentPanel, makeProps({
          dataSourceDefinition: { schemaVersion: '1.0', fields },
          onDataSourceDefinitionChange,
        }))
      );
    });
    const datosBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Datos')
    );
    act(() => { datosBtn?.click(); });

    const removeBtn = container.querySelector('[data-testid="remove-btn"]');
    act(() => { (removeBtn as HTMLButtonElement)?.click(); });
    expect(onDataSourceDefinitionChange).toHaveBeenCalledOnce();
    const updated = onDataSourceDefinitionChange.mock.calls[0][0];
    expect(updated.fields).toHaveLength(0);
  });
});
