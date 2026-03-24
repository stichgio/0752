import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import LoadingModal from '../LoadingModal';

describe('LoadingModal (compat)', () => {
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

  it('renders with default message', () => {
    act(() => {
      root.render(<LoadingModal />);
    });

    // Dialog portals to document.body
    expect(document.body.textContent).toContain('Procesando...');
    expect(document.body.textContent).toContain('Por favor espere...');
  });

  it('renders custom message', () => {
    act(() => {
      root.render(<LoadingModal message="Generando PDF..." />);
    });

    expect(document.body.textContent).toContain('Generando PDF...');
  });

  it('renders progress bar when progress is provided', () => {
    act(() => {
      root.render(
        <LoadingModal
          message="Procesando..."
          progress={{
            percent: 50,
            phaseLabel: 'Renderizando',
            phase: 'rendering',
            current: 5,
            total: 10,
          }}
        />,
      );
    });

    expect(document.body.textContent).toContain('Procesando...');
    expect(document.body.textContent).toContain('Renderizando');
    expect(document.body.textContent).toContain('50%');
  });

  it('renders generation counter when totalReports is provided', () => {
    act(() => {
      root.render(
        <LoadingModal
          message="Generando..."
          progress={{
            percent: 30,
            phaseLabel: 'Preparando',
            totalReports: 10,
            generatedCount: 3,
          }}
        />,
      );
    });

    expect(document.body.textContent).toContain('Generaciones listas');
    expect(document.body.textContent).toContain('3 / 10');
  });
});
