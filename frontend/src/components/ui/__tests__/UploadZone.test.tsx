import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import UploadZone from '../UploadZone';

describe('UploadZone', () => {
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

  it('renders with default text', () => {
    act(() => {
      root.render(<UploadZone onFiles={() => {}} />);
    });

    expect(container.textContent).toContain('Arrastra archivos aqui');
    expect(container.textContent).toContain('o haz click para seleccionar');
  });

  it('renders custom title and description', () => {
    act(() => {
      root.render(
        <UploadZone onFiles={() => {}} title="Custom Title" description="Custom Desc" />,
      );
    });

    expect(container.textContent).toContain('Custom Title');
    expect(container.textContent).toContain('Custom Desc');
  });

  it('opens file picker on click', () => {
    act(() => {
      root.render(<UploadZone onFiles={() => {}} />);
    });

    const input = container.querySelector('[data-testid="upload-zone-input"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const zone = container.querySelector('[data-testid="upload-zone"]') as HTMLElement;
    act(() => { zone.click(); });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('opens file picker on Enter key', () => {
    act(() => {
      root.render(<UploadZone onFiles={() => {}} />);
    });

    const input = container.querySelector('[data-testid="upload-zone-input"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const zone = container.querySelector('[data-testid="upload-zone"]') as HTMLElement;
    act(() => {
      zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('sets drag-active data attribute on drag over', () => {
    act(() => {
      root.render(<UploadZone onFiles={() => {}} />);
    });

    const zone = container.querySelector('[data-testid="upload-zone"]') as HTMLElement;

    act(() => {
      zone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(zone.dataset.dragActive).toBe('true');

    act(() => {
      zone.dispatchEvent(new Event('dragleave', { bubbles: true }));
    });
    expect(zone.dataset.dragActive).toBe('false');
  });

  it('does not interact when disabled', () => {
    act(() => {
      root.render(<UploadZone onFiles={() => {}} disabled />);
    });

    const zone = container.querySelector('[data-testid="upload-zone"]') as HTMLElement;
    expect(zone.getAttribute('aria-disabled')).toBe('true');
  });
});
