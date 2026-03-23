import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { CanvasArea } from './CanvasArea';
import { createDefaultPageSettings, createElement, createEmptyDocument, type CanvasDocument } from '../canvasTypes';

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

describe('CanvasArea drag activation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalPointerEvent: typeof window.PointerEvent | undefined;
  let originalSetPointerCapture: typeof HTMLElement.prototype.setPointerCapture | undefined;
  let originalReleasePointerCapture: typeof HTMLElement.prototype.releasePointerCapture | undefined;
  let originalHasPointerCapture: typeof HTMLElement.prototype.hasPointerCapture | undefined;
  let capturedPointerId: number | null;

  function renderCanvasArea(doc: CanvasDocument, selectedIds: string[], onChange = vi.fn()) {
    act(() => {
      root.render(
        <CanvasArea
          document={doc}
          activePageId="page-1"
          pageSettings={createDefaultPageSettings()}
          onChange={onChange}
          selectedIds={selectedIds}
          onSelect={vi.fn()}
          onAddElement={vi.fn()}
          onAddBlock={vi.fn()}
          viewport={{ zoom: 100, panX: 0, panY: 32 }}
          onZoomChange={vi.fn()}
          snapEnabled
          gridSize={5}
          showGrid={false}
        />,
      );
    });
    return onChange;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    originalPointerEvent = window.PointerEvent;
    (window as typeof window & { PointerEvent: typeof TestPointerEvent }).PointerEvent = TestPointerEvent as unknown as typeof window.PointerEvent;

    originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
    originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
    originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;

    capturedPointerId = null;
    HTMLElement.prototype.setPointerCapture = vi.fn((pointerId: number) => {
      capturedPointerId = pointerId;
    });
    HTMLElement.prototype.releasePointerCapture = vi.fn((pointerId: number) => {
      if (capturedPointerId === pointerId) {
        capturedPointerId = null;
      }
    });
    HTMLElement.prototype.hasPointerCapture = vi.fn((pointerId: number) => capturedPointerId === pointerId);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();

    if (originalPointerEvent) {
      (window as typeof window & { PointerEvent: typeof window.PointerEvent }).PointerEvent = originalPointerEvent;
    } else {
      delete (window as typeof window & { PointerEvent?: typeof window.PointerEvent }).PointerEvent;
    }

    if (originalSetPointerCapture) {
      HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    } else {
      delete HTMLElement.prototype.setPointerCapture;
    }

    if (originalReleasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    } else {
      delete HTMLElement.prototype.releasePointerCapture;
    }

    if (originalHasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    } else {
      delete HTMLElement.prototype.hasPointerCapture;
    }
  });

  it('defers pointer capture until drag activation passes the movement threshold', () => {
    const tableElement = createElement('table', { x: 10, y: 10 });
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [{ ...tableElement, pageId: 'page-1' }],
    };
    const onChange = vi.fn();

    renderCanvasArea(doc, [tableElement.id], onChange);

    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();

    act(() => {
      cell!.dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 7,
        clientX: 20,
        clientY: 20,
      }));
    });

    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 7,
        clientX: 28,
        clientY: 28,
      }));
    });

    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledOnce();
    expect((HTMLElement.prototype.setPointerCapture as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(7);

    act(() => {
      window.dispatchEvent(new TestPointerEvent('pointerup', {
        bubbles: true,
        pointerId: 7,
        clientX: 28,
        clientY: 28,
      }));
    });
    expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalledOnce();
  });

  it('commits drag exactly once on pointerup', () => {
    const tableElement = createElement('table', { x: 10, y: 10 });
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [{ ...tableElement, pageId: 'page-1' }],
    };
    const onChange = renderCanvasArea(doc, [tableElement.id]);
    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();

    act(() => {
      cell!.dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 10,
        clientX: 24,
        clientY: 24,
      }));
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 10,
        clientX: 48,
        clientY: 48,
      }));
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 10,
        clientX: 52,
        clientY: 52,
      }));
      window.dispatchEvent(new TestPointerEvent('pointerup', {
        bubbles: true,
        pointerId: 10,
        clientX: 52,
        clientY: 52,
      }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not commit when pointer never moves beyond pending state', () => {
    const tableElement = createElement('table', { x: 10, y: 10 });
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [{ ...tableElement, pageId: 'page-1' }],
    };
    const onChange = renderCanvasArea(doc, [tableElement.id]);
    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();

    act(() => {
      cell!.dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 11,
        clientX: 24,
        clientY: 24,
      }));
      window.dispatchEvent(new TestPointerEvent('pointerup', {
        bubbles: true,
        pointerId: 11,
        clientX: 24,
        clientY: 24,
      }));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels active drag on pointercancel without persisting position', () => {
    const tableElement = createElement('table', { x: 10, y: 10 });
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [{ ...tableElement, pageId: 'page-1' }],
    };
    const onChange = renderCanvasArea(doc, [tableElement.id]);
    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();

    act(() => {
      cell!.dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 12,
        clientX: 20,
        clientY: 20,
      }));
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 12,
        clientX: 45,
        clientY: 45,
      }));
      window.dispatchEvent(new TestPointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 12,
        clientX: 45,
        clientY: 45,
      }));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels active drag on blur without persisting position', () => {
    const tableElement = createElement('table', { x: 10, y: 10 });
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [{ ...tableElement, pageId: 'page-1' }],
    };
    const onChange = renderCanvasArea(doc, [tableElement.id]);
    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();

    act(() => {
      cell!.dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 13,
        clientX: 20,
        clientY: 20,
      }));
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 13,
        clientX: 42,
        clientY: 42,
      }));
      window.dispatchEvent(new Event('blur'));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('drags only the primary element when shift is held in a multi-selection', () => {
    const first = { ...createElement('table', { x: 10, y: 10 }), pageId: 'page-1' };
    const second = { ...createElement('table', { x: 40, y: 40 }), pageId: 'page-1' };
    const doc: CanvasDocument = {
      ...createEmptyDocument(),
      elements: [first, second],
    };
    const onChange = renderCanvasArea(doc, [first.id, second.id]);
    const wrappers = container.querySelectorAll('[data-element-id]');
    expect(wrappers.length).toBeGreaterThan(1);

    act(() => {
      wrappers[0].dispatchEvent(new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 14,
        clientX: 24,
        clientY: 24,
        shiftKey: true,
      }));
      window.dispatchEvent(new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 14,
        clientX: 44,
        clientY: 44,
        shiftKey: true,
      }));
      window.dispatchEvent(new TestPointerEvent('pointerup', {
        bubbles: true,
        pointerId: 14,
        clientX: 44,
        clientY: 44,
        shiftKey: true,
      }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextDoc = onChange.mock.calls[0]?.[0] as CanvasDocument;
    const movedFirst = nextDoc.elements.find((el) => el.id === first.id);
    const movedSecond = nextDoc.elements.find((el) => el.id === second.id);
    expect(movedFirst?.position).not.toEqual(first.position);
    expect(movedSecond?.position).toEqual(second.position);
  });
});

