import { useState, useCallback } from 'react';

/**
 * Generic undo/redo history stack.
 * @param {*} initialState - The initial state snapshot
 * @param {number} maxHistory - Max history entries (default 30)
 */
export function useUndoRedo(initialState, maxHistory = 30) {
    const [history, setHistory] = useState([initialState]);
    const [index, setIndex] = useState(0);

    const current = history[index];

    const push = useCallback((newState) => {
        setHistory((prev) => {
            const trimmed = prev.slice(0, index + 1);
            const next = [...trimmed, newState];
            if (next.length > maxHistory) next.shift();
            return next;
        });
        setIndex((prev) => Math.min(prev + 1, maxHistory - 1));
    }, [index, maxHistory]);

    const undo = useCallback(() => {
        setIndex((prev) => Math.max(0, prev - 1));
    }, []);

    const redo = useCallback(() => {
        setIndex((prev) => Math.min(history.length - 1, prev + 1));
    }, [history.length]);

    const canUndo = index > 0;
    const canRedo = index < history.length - 1;

    const reset = useCallback((state) => {
        setHistory([state]);
        setIndex(0);
    }, []);

    return { current, push, undo, redo, canUndo, canRedo, reset };
}
