import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  it('supports undo and redo', () => {
    const { result } = renderHook(() => useUndoRedo<number>(0, 50));

    act(() => result.current.set(1));
    act(() => result.current.set(2));

    expect(result.current.state).toBe(2);

    act(() => result.current.undo());
    expect(result.current.state).toBe(1);

    act(() => result.current.redo());
    expect(result.current.state).toBe(2);
  });
});
