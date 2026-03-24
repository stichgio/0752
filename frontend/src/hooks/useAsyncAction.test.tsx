import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useAsyncAction } from './useAsyncAction';

function waitForNextTick() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function AsyncActionHarness({ onError }: { onError?: (msg: string) => void }) {
  const { run } = useAsyncAction();

  return (
    <div>
      <button
        id="run-default"
        type="button"
        onClick={() => {
          void run(async () => {
            throw new Error('Boom');
          });
        }}
      >
        Run default
      </button>
      <button
        id="run-custom"
        type="button"
        onClick={() => {
          void run(async () => {
            throw new Error('Boom');
          }, { onError });
        }}
      >
        Run custom
      </button>
    </div>
  );
}

describe('useAsyncAction', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(toast.error).mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    consoleErrorSpy.mockRestore();
    container.remove();
  });

  it('uses toast.error when no custom onError is provided', async () => {
    await act(async () => {
      root.render(<AsyncActionHarness />);
    });

    const button = container.querySelector('#run-default') as HTMLButtonElement;
    await act(async () => {
      button.click();
      await waitForNextTick();
    });

    expect(toast.error).toHaveBeenCalledWith('Boom');
  });

  it('delegates to the provided onError callback instead of using the fallback toast', async () => {
    const onError = vi.fn();

    await act(async () => {
      root.render(<AsyncActionHarness onError={onError} />);
    });

    const button = container.querySelector('#run-custom') as HTMLButtonElement;
    await act(async () => {
      button.click();
      await waitForNextTick();
    });

    expect(onError).toHaveBeenCalledWith('Boom');
    expect(toast.error).not.toHaveBeenCalled();
  });
});