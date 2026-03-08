import { useCallback, useReducer, useRef } from 'react';

export interface UndoableHistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UndoableSetOptions {
  commitToHistory?: boolean;
}

interface UseUndoableStateOptions {
  limit?: number;
}

type InitialValue<T> = T | (() => T);

type UndoableAction<T> =
  | { type: 'COMMIT'; nextPresent: T; limit: number }
  | { type: 'REPLACE'; nextPresent: T }
  | { type: 'COMMIT_BASELINE'; baseline: T; limit: number }
  | { type: 'UNDO' }
  | { type: 'REDO'; limit: number }
  | { type: 'RESET'; nextPresent: T };

const DEFAULT_HISTORY_LIMIT = 50;

function toInitialPresent<T>(value: InitialValue<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

function appendPast<T>(past: T[], value: T, limit: number): T[] {
  if (limit <= 0) return [...past, value];
  return [...past, value].slice(-limit);
}

function undoableReducer<T>(
  state: UndoableHistoryState<T>,
  action: UndoableAction<T>
): UndoableHistoryState<T> {
  switch (action.type) {
    case 'COMMIT': {
      if (Object.is(action.nextPresent, state.present)) return state;
      return {
        past: appendPast(state.past, state.present, action.limit),
        present: action.nextPresent,
        future: [],
      };
    }

    case 'REPLACE': {
      if (Object.is(action.nextPresent, state.present)) return state;
      return {
        ...state,
        present: action.nextPresent,
      };
    }

    case 'COMMIT_BASELINE': {
      if (Object.is(action.baseline, state.present)) return state;
      return {
        past: appendPast(state.past, action.baseline, action.limit),
        present: state.present,
        future: [],
      };
    }

    case 'UNDO': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        past: appendPast(state.past, state.present, action.limit),
        present: next,
        future: state.future.slice(1),
      };
    }

    case 'RESET':
      return {
        past: [],
        present: action.nextPresent,
        future: [],
      };

    default:
      return state;
  }
}

export function useUndoableState<T>(
  initialValue: InitialValue<T>,
  options?: UseUndoableStateOptions
) {
  const limit = options?.limit ?? DEFAULT_HISTORY_LIMIT;
  const [history, dispatch] = useReducer(undoableReducer<T>, initialValue, (value) => ({
    past: [],
    present: toInitialPresent(value),
    future: [],
  }));

  const historyRef = useRef(history);
  historyRef.current = history;

  const pendingBaselineRef = useRef<T | null>(null);

  const setPresent = useCallback((nextPresent: T, setOptions?: UndoableSetOptions) => {
    const commitToHistory = setOptions?.commitToHistory !== false;

    if (!commitToHistory) {
      if (pendingBaselineRef.current === null) {
        pendingBaselineRef.current = historyRef.current.present;
      }
      dispatch({ type: 'REPLACE', nextPresent });
      return;
    }

    const pendingBaseline = pendingBaselineRef.current;
    pendingBaselineRef.current = null;

    if (pendingBaseline !== null) {
      dispatch({ type: 'REPLACE', nextPresent });
      dispatch({ type: 'COMMIT_BASELINE', baseline: pendingBaseline, limit });
      return;
    }

    dispatch({ type: 'COMMIT', nextPresent, limit });
  }, [limit]);

  const commitPending = useCallback(() => {
    const pendingBaseline = pendingBaselineRef.current;
    if (pendingBaseline === null) return;
    pendingBaselineRef.current = null;
    dispatch({ type: 'COMMIT_BASELINE', baseline: pendingBaseline, limit });
  }, [limit]);

  const undo = useCallback(() => {
    pendingBaselineRef.current = null;
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    pendingBaselineRef.current = null;
    dispatch({ type: 'REDO', limit });
  }, [limit]);

  const reset = useCallback((nextPresent: T) => {
    pendingBaselineRef.current = null;
    dispatch({ type: 'RESET', nextPresent });
  }, []);

  return {
    history,
    present: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    setPresent,
    commitPending,
    undo,
    redo,
    reset,
  };
}
