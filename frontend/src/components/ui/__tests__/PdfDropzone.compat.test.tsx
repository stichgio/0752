import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import PdfDropzone from '../../../features/pdf-tools/shared/PdfDropzone';

describe('PdfDropzone (compat)', () => {
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

  it('renders with default props', () => {
    act(() => {
      root.render(<PdfDropzone onFiles={() => {}} />);
    });

    expect(container.textContent).toContain('Arrastra tus archivos PDF aqui');
    expect(container.textContent).toContain('o haz click para seleccionar');
  });

  it('renders custom label and sublabel', () => {
    act(() => {
      root.render(
        <PdfDropzone onFiles={() => {}} label="Drop PDFs" sublabel="click here" />,
      );
    });

    expect(container.textContent).toContain('Drop PDFs');
    expect(container.textContent).toContain('click here');
  });

  it('renders the accept attribute for PDFs', () => {
    act(() => {
      root.render(<PdfDropzone onFiles={() => {}} />);
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toContain('pdf');
  });
});
