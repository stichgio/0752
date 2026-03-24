import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import Dialog from '../Dialog';

describe('Dialog', () => {
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

  it('renders when open is true', () => {
    act(() => {
      root.render(
        <Dialog open={true} onClose={() => {}} title="Test Dialog">
          <p>Content</p>
        </Dialog>,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.body.textContent).toContain('Test Dialog');
    expect(document.body.textContent).toContain('Content');
  });

  it('does not render when open is false', () => {
    act(() => {
      root.render(
        <Dialog open={false} onClose={() => {}} title="Hidden Dialog">
          <p>Hidden</p>
        </Dialog>,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} title="Backdrop Test">
          <p>Body</p>
        </Dialog>,
      );
    });

    const backdrop = document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement;
    act(() => { backdrop.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} closeOnBackdrop={false} title="No Close">
          <p>Body</p>
        </Dialog>,
      );
    });

    const backdrop = document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement;
    act(() => { backdrop.click(); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} title="Escape Test">
          <p>Body</p>
        </Dialog>,
      );
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} closeOnEscape={false} title="No Escape">
          <p>Body</p>
        </Dialog>,
      );
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders title, description, and footer', () => {
    act(() => {
      root.render(
        <Dialog
          open={true}
          onClose={() => {}}
          title="My Title"
          description="My Description"
          footer={<button>Action</button>}
        >
          <p>Body</p>
        </Dialog>,
      );
    });

    expect(document.body.textContent).toContain('My Title');
    expect(document.body.textContent).toContain('My Description');
    expect(document.body.textContent).toContain('Action');
  });
});
