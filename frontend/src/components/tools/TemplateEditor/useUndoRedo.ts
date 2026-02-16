import { useMemo, useState } from 'react';

export function useUndoRedo<T>(initialState: T, maxSteps = 50) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialState);
  const [future, setFuture] = useState<T[]>([]);

  const set = (next: T) => {
    setPast((prev) => [...prev.slice(-(maxSteps - 1)), present]);
    setPresent(next);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [present, ...f]);
    setPresent(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, present].slice(-maxSteps));
    setPresent(next);
  };

  return useMemo(() => ({ state: present, set, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }), [present, past.length, future.length]);
}
