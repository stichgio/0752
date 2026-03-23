import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { CanvasElement } from './CanvasElement';
import { createElement, type TemplateElement } from '../canvasTypes';

function makeElement(type: TemplateElement['type']): TemplateElement {
  return createElement(type, { x: 10, y: 10 });
}

describe('CanvasElement table interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('starts drag when a selected table receives pointer down', () => {
    const element = makeElement('table');
    const onDragStart = vi.fn();
    const PointerEventCtor = window.PointerEvent ?? MouseEvent;

    act(() => {
      root.render(
        <CanvasElement
          element={element}
          scale={1}
          isSelected
          onSelect={vi.fn()}
          onUpdateElement={vi.fn()}
          onDragStart={onDragStart}
          onResizeStart={vi.fn()}
          onRotateStart={vi.fn()}
        />,
      );
    });

    const wrapper = container.querySelector('[data-element-id]') as HTMLDivElement;
    act(() => {
      wrapper.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true, button: 0 }));
    });

    expect(onDragStart).toHaveBeenCalledOnce();
  });

  it('does not start drag on first click for unselected editable text', () => {
    const element = makeElement('text');
    const onDragStart = vi.fn();
    const onSelect = vi.fn();
    const PointerEventCtor = window.PointerEvent ?? MouseEvent;

    act(() => {
      root.render(
        <CanvasElement
          element={element}
          scale={1}
          isSelected={false}
          onSelect={onSelect}
          onUpdateElement={vi.fn()}
          onDragStart={onDragStart}
          onResizeStart={vi.fn()}
          onRotateStart={vi.fn()}
        />,
      );
    });

    const wrapper = container.querySelector('[data-element-id]') as HTMLDivElement;
    act(() => {
      wrapper.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true, button: 0 }));
    });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('starts drag for editable text when already selected', () => {
    const element = makeElement('heading');
    const onDragStart = vi.fn();
    const PointerEventCtor = window.PointerEvent ?? MouseEvent;

    act(() => {
      root.render(
        <CanvasElement
          element={element}
          scale={1}
          isSelected
          onSelect={vi.fn()}
          onUpdateElement={vi.fn()}
          onDragStart={onDragStart}
          onResizeStart={vi.fn()}
          onRotateStart={vi.fn()}
        />,
      );
    });

    const wrapper = container.querySelector('[data-element-id]') as HTMLDivElement;
    act(() => {
      wrapper.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true, button: 0 }));
    });

    expect(onDragStart).toHaveBeenCalledOnce();
  });
});
