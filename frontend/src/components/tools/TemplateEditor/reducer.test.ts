import { describe, expect, it } from 'vitest';

import { editorReducer, initialEditorState } from './reducer';

describe('template editor reducer', () => {
  it('adds and selects element', () => {
    const next = editorReducer(initialEditorState, {
      type: 'ADD_ELEMENT',
      payload: {
        id: 'e1',
        type: 'text',
        x: 10,
        y: 10,
        width: 180,
        height: 60,
        zIndex: 1,
        text: 'hola',
        style: { fontSize: 12, fontFamily: 'Inter', color: '#111827' },
      },
    });

    expect(next.document.elements).toHaveLength(1);
    expect(next.dirty).toBe(true);
  });

  it('prevents protected edits for editor role', () => {
    const state = {
      ...initialEditorState,
      role: 'editor' as const,
      document: {
        ...initialEditorState.document,
        elements: [
          {
            id: 'p1',
            type: 'protected' as const,
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            zIndex: 1,
            name: 'norma',
            content: 'A',
            allowedTokens: ['contratista'],
            locked: true,
          },
        ],
      },
    };

    const next = editorReducer(state, {
      type: 'UPDATE_ELEMENT',
      payload: { id: 'p1', patch: { content: 'B' } },
    });

    expect(next.document.elements[0].type).toBe('protected');
    expect((next.document.elements[0] as { content: string }).content).toBe('A');
  });

  it('duplicates selection', () => {
    const state = {
      ...initialEditorState,
      selection: ['e1'],
      document: {
        ...initialEditorState.document,
        elements: [
          {
            id: 'e1',
            type: 'text' as const,
            x: 10,
            y: 10,
            width: 100,
            height: 30,
            zIndex: 1,
            text: 'A',
            style: { fontSize: 12, fontFamily: 'Inter', color: '#111827' },
          },
        ],
      },
    };

    const next = editorReducer(state, { type: 'DUPLICATE_SELECTION' });
    expect(next.document.elements).toHaveLength(2);
  });
});
