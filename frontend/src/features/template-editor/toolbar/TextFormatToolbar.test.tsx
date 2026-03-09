import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TextFormatToolbar } from './TextFormatToolbar';
import { createElement } from '../canvasTypes';
import type { TemplateElement } from '../canvasTypes';

// Helper to make a TemplateElement of a given type
function makeElement(type: TemplateElement['type']): TemplateElement {
  return createElement(type, { x: 10, y: 10 });
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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

function renderComponent(element: TemplateElement, onUpdate: (patch: Partial<TemplateElement>) => void) {
  act(() => {
    root.render(<TextFormatToolbar element={element} onUpdate={onUpdate} />);
  });
}

describe('TextFormatToolbar — null for non-text types', () => {
  it('renders nothing for rectangle', () => {
    renderComponent(makeElement('rectangle'), vi.fn());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for image', () => {
    renderComponent(makeElement('image'), vi.fn());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for circle', () => {
    renderComponent(makeElement('circle'), vi.fn());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for table', () => {
    renderComponent(makeElement('table'), vi.fn());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for line', () => {
    renderComponent(makeElement('line'), vi.fn());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for signature', () => {
    renderComponent(makeElement('signature'), vi.fn());
    expect(container.firstChild).toBeNull();
  });
});

describe('TextFormatToolbar — renders for text types', () => {
  it('renders for text type', () => {
    renderComponent(makeElement('text'), vi.fn());
    expect(container.firstChild).not.toBeNull();
    const boldBtn = container.querySelector('[title="Negrita"]');
    expect(boldBtn).not.toBeNull();
    const alignLeft = container.querySelector('[title="Alinear a la izquierda"]');
    expect(alignLeft).not.toBeNull();
    const alignCenter = container.querySelector('[title="Centrar texto"]');
    expect(alignCenter).not.toBeNull();
    const alignRight = container.querySelector('[title="Alinear a la derecha"]');
    expect(alignRight).not.toBeNull();
    const colorInput = container.querySelector('[title="Color de texto"]');
    expect(colorInput).not.toBeNull();
    const fontFamilySelect = container.querySelector('[title="Familia tipográfica"]');
    expect(fontFamilySelect).not.toBeNull();
  });

  it('renders for heading type', () => {
    renderComponent(makeElement('heading'), vi.fn());
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('[title="Negrita"]')).not.toBeNull();
  });

  it('renders for variable type', () => {
    renderComponent(makeElement('variable'), vi.fn());
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('[title="Negrita"]')).not.toBeNull();
  });
});

describe('TextFormatToolbar — interactions', () => {
  it('calls onUpdate with fontWeight bold when bold toggled on', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontWeight: 'normal' };
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const boldBtn = container.querySelector('[title="Negrita"]') as HTMLButtonElement;
    act(() => { boldBtn.click(); });

    expect(onUpdate).toHaveBeenCalledOnce();
    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.fontWeight).toBe('bold');
  });

  it('calls onUpdate with fontWeight normal when bold toggled off', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontWeight: 'bold' };
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const boldBtn = container.querySelector('[title="Negrita"]') as HTMLButtonElement;
    act(() => { boldBtn.click(); });

    expect(onUpdate).toHaveBeenCalledOnce();
    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.fontWeight).toBe('normal');
  });

  it('calls onUpdate with textAlign center when center align clicked', () => {
    const el = makeElement('text');
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const centerBtn = container.querySelector('[title="Centrar texto"]') as HTMLButtonElement;
    act(() => { centerBtn.click(); });

    expect(onUpdate).toHaveBeenCalledOnce();
    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.textAlign).toBe('center');
  });

  it('calls onUpdate with incremented fontSize when + clicked', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontSize: 12 };
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const increaseBtn = container.querySelector('[title="Aumentar tamaño de fuente"]') as HTMLButtonElement;
    act(() => { increaseBtn.click(); });

    expect(onUpdate).toHaveBeenCalledOnce();
    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.fontSize).toBe(13);
  });

  it('calls onUpdate with decremented fontSize when - clicked', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontSize: 12 };
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const decreaseBtn = container.querySelector('[title="Reducir tamaño de fuente"]') as HTMLButtonElement;
    act(() => { decreaseBtn.click(); });

    expect(onUpdate).toHaveBeenCalledOnce();
    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.fontSize).toBe(11);
  });

  it('does not go below fontSize 6', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontSize: 6 };
    const onUpdate = vi.fn();
    renderComponent(el, onUpdate);

    const decreaseBtn = container.querySelector('[title="Reducir tamaño de fuente"]') as HTMLButtonElement;
    act(() => { decreaseBtn.click(); });

    const patch = onUpdate.mock.calls[0][0] as Partial<TemplateElement>;
    expect(patch.style?.fontSize).toBe(6);
  });

  it('bold button has active styles when fontWeight is bold', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontWeight: 'bold' };
    renderComponent(el, vi.fn());

    const boldBtn = container.querySelector('[title="Negrita"]') as HTMLButtonElement;
    expect(boldBtn.className).toContain('bg-blue-100');
    expect(boldBtn.className).toContain('text-blue-700');
  });

  it('bold button does not have active styles when fontWeight is normal', () => {
    const el = makeElement('text');
    el.style = { ...el.style, fontWeight: 'normal' };
    renderComponent(el, vi.fn());

    const boldBtn = container.querySelector('[title="Negrita"]') as HTMLButtonElement;
    expect(boldBtn.className).not.toContain('bg-blue-100');
  });
});
