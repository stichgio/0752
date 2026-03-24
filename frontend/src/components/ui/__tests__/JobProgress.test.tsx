import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import JobProgress from '../JobProgress';

describe('JobProgress', () => {
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

  it('renders determinate progress with percentage', () => {
    act(() => {
      root.render(<JobProgress value={3} total={10} label="Rendering" state="running" />);
    });

    const progressEl = container.querySelector('[data-testid="job-progress"]');
    expect(progressEl).not.toBeNull();

    const percentEl = container.querySelector('[data-testid="job-progress-percent"]');
    expect(percentEl?.textContent).toBe('30%');
    expect(container.textContent).toContain('Rendering');
    expect(container.textContent).toContain('3 / 10');
  });

  it('renders indeterminate indicator when running without counts', () => {
    act(() => {
      root.render(<JobProgress state="running" label="Processing..." />);
    });

    expect(container.querySelector('[data-testid="job-progress"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="job-progress-indeterminate"]')).not.toBeNull();
    expect(container.textContent).toContain('Processing...');
    expect(container.querySelector('[data-testid="job-progress-percent"]')).toBeNull();
  });

  it('renders detail text', () => {
    act(() => {
      root.render(<JobProgress value={5} total={20} detail="file.pdf" state="running" />);
    });

    expect(container.textContent).toContain('file.pdf');
  });

  it('caps percentage at 100', () => {
    act(() => {
      root.render(<JobProgress value={15} total={10} state="running" />);
    });

    const percentEl = container.querySelector('[data-testid="job-progress-percent"]');
    expect(percentEl?.textContent).toBe('100%');
  });

  it('renders nothing in track when idle without counts', () => {
    act(() => {
      root.render(<JobProgress state="idle" />);
    });

    expect(container.querySelector('[data-testid="job-progress"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="job-progress-indeterminate"]')).toBeNull();
    expect(container.querySelector('[data-testid="job-progress-percent"]')).toBeNull();
  });
});
