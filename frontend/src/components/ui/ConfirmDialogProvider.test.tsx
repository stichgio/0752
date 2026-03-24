import React, { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ConfirmDialogProvider, useConfirmDialog, type ConfirmTone } from './ConfirmDialogProvider';

function waitForNextTick() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function TestHarness({ tone = 'default' }: { tone?: ConfirmTone }) {
  const confirmDialog = useConfirmDialog();
  const [result, setResult] = useState('idle');

  return (
    <div>
      <button
        id="open-confirm"
        type="button"
        onClick={async () => {
          const confirmed = await confirmDialog({
            title: 'Confirmar acción',
            description: 'Descripción de prueba.',
            confirmLabel: tone === 'danger' ? 'Eliminar' : 'Aceptar',
            cancelLabel: 'Cancelar',
            tone,
          });
          setResult(String(confirmed));
        }}
      >
        Abrir
      </button>
      <span data-testid="confirm-result">{result}</span>
    </div>
  );
}

describe('ConfirmDialogProvider', () => {
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

  it('resolves true when the user confirms', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialogProvider>
          <TestHarness />
        </ConfirmDialogProvider>,
      );
    });

    const openButton = container.querySelector('#open-confirm') as HTMLButtonElement;
    await act(async () => {
      openButton.click();
      await waitForNextTick();
    });

    const dialog = document.querySelector('[role="dialog"]');
    const confirmButton = document.querySelector('[data-testid="confirm-dialog-confirm"]') as HTMLButtonElement;

    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(confirmButton);

    await act(async () => {
      confirmButton.click();
      await waitForNextTick();
    });

    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe('true');
  });

  it('resolves false when the backdrop is clicked', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialogProvider>
          <TestHarness />
        </ConfirmDialogProvider>,
      );
    });

    const openButton = container.querySelector('#open-confirm') as HTMLButtonElement;
    await act(async () => {
      openButton.click();
      await waitForNextTick();
    });

    const backdrop = document.querySelector('[data-testid="confirm-dialog-backdrop"]') as HTMLDivElement;

    await act(async () => {
      backdrop.click();
      await waitForNextTick();
    });

    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe('false');
  });

  it('focuses cancel first for danger dialogs, closes on Escape, and restores focus', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialogProvider>
          <TestHarness tone="danger" />
        </ConfirmDialogProvider>,
      );
    });

    const openButton = container.querySelector('#open-confirm') as HTMLButtonElement;
    openButton.focus();

    await act(async () => {
      openButton.click();
      await waitForNextTick();
    });

    const cancelButton = document.querySelector('[data-testid="confirm-dialog-cancel"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(cancelButton);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitForNextTick();
      await waitForNextTick();
    });

    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe('false');
    expect(document.activeElement).toBe(openButton);
  });
});