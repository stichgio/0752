import { EditorElement, EditorState, ReportType, TemplateDocument, ValidationIssue } from './types';

type Action =
  | { type: 'LOAD'; payload: EditorState }
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'SELECT'; payload: { ids: string[]; multi?: boolean } }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; patch: Partial<EditorElement> } }
  | { type: 'MOVE_SELECTION'; payload: { dx: number; dy: number } }
  | { type: 'DELETE_SELECTION' }
  | { type: 'DUPLICATE_SELECTION' }
  | { type: 'TOGGLE_LOCK'; payload: { id: string } }
  | { type: 'REORDER_LAYER'; payload: { id: string; direction: 'up' | 'down' } }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_CATEGORY'; payload: EditorState['activeCategory'] }
  | { type: 'SET_VALIDATION'; payload: { valid: boolean; issues: ValidationIssue[] } }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_TEMPLATE_ID'; payload: string }
  | { type: 'SET_PUBLISH_STATE'; payload: { status: EditorState['publishState']['status']; currentVersion: number } };

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

function createEmptyDocument(reportType: ReportType): TemplateDocument {
  const now = new Date().toISOString();
  return {
    id: `doc_${Date.now()}`,
    name: 'Visual template',
    reportType,
    page: { size: 'A4', orientation: 'portrait', marginMm: 10 },
    elements: [],
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function clampElement(element: EditorElement): EditorElement {
  const width = Math.max(20, Math.min(element.width, A4_WIDTH));
  const height = Math.max(12, Math.min(element.height, A4_HEIGHT));
  const x = Math.max(0, Math.min(element.x, A4_WIDTH - width));
  const y = Math.max(0, Math.min(element.y, A4_HEIGHT - height));
  return { ...element, width, height, x, y };
}

function isProtectedImmutable(element: EditorElement, role: EditorState['role']) {
  return element.type === 'protected' && role !== 'admin';
}

function markDirty(state: EditorState, elements: EditorElement[]) {
  return {
    ...state,
    document: {
      ...state.document,
      elements,
      updatedAt: new Date().toISOString(),
      status: 'draft',
    },
    dirty: true,
  } as EditorState;
}

export const initialEditorState: EditorState = {
  templateId: null,
  role: 'editor',
  document: createEmptyDocument('technical_report'),
  selection: [],
  activeCategory: 'design',
  zoom: 1,
  pan: { x: 0, y: 0 },
  guides: { enabled: true, snap: true, safeMarginMm: 10 },
  validationState: { valid: true, issues: [], lastValidatedAt: null },
  dirty: false,
  publishState: { status: 'draft', currentVersion: 1 },
  lastSavedAt: null,
};

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'LOAD':
      return action.payload;
    case 'SET_TEMPLATE_ID':
      return { ...state, templateId: action.payload };
    case 'ADD_ELEMENT':
      return markDirty(state, [...state.document.elements, clampElement(action.payload)]);
    case 'SELECT': {
      const ids = action.payload.multi ? [...new Set([...state.selection, ...action.payload.ids])] : action.payload.ids;
      return { ...state, selection: ids };
    }
    case 'UPDATE_ELEMENT': {
      const next = state.document.elements.map((element) => {
        if (element.id !== action.payload.id) return element;
        if (isProtectedImmutable(element, state.role)) return element;
        return clampElement({ ...element, ...(action.payload.patch as EditorElement) });
      });
      return markDirty(state, next);
    }
    case 'MOVE_SELECTION': {
      // Use a set for O(1) membership checks while preserving behavior.
      const selectionIds = new Set(state.selection);
      const next = state.document.elements.map((element) => {
        if (!selectionIds.has(element.id) || element.locked) return element;
        const x = element.x + action.payload.dx;
        const y = element.y + action.payload.dy;
        return clampElement({ ...element, x, y });
      });
      return markDirty(state, next);
    }
    case 'DELETE_SELECTION': {
      // Use a set for O(1) membership checks while preserving behavior.
      const selectionIds = new Set(state.selection);
      const next = state.document.elements.filter((element) => {
        // Keep any element that is not selected.
        if (!selectionIds.has(element.id)) return true;
        // Protected elements are never deletable.
        if (element.type === 'protected') return true;
        // Locked elements are not deletable; only unlocked selected elements are removed.
        if (element.locked) return true;
        return false;
      });
      return { ...markDirty(state, next), selection: [] };
    }
    case 'DUPLICATE_SELECTION': {
      // Use a set for O(1) membership checks while preserving order from elements array.
      const selectionIds = new Set(state.selection);
      const selected = state.document.elements.filter((element) => selectionIds.has(element.id));
      const clones = selected.map((element, index) => ({
        ...element,
        id: `${element.id}_copy_${Date.now()}_${index}`,
        x: element.x + 16,
        y: element.y + 16,
        zIndex: element.zIndex + 1,
        locked: false,
      }));
      return markDirty(state, [...state.document.elements, ...clones]);
    }
    case 'TOGGLE_LOCK': {
      const next = state.document.elements.map((element) => {
        if (element.id !== action.payload.id) return element;
        if (element.type === 'protected' && state.role !== 'admin') return element;
        return { ...element, locked: !element.locked };
      });
      return markDirty(state, next);
    }
    case 'REORDER_LAYER': {
      const next = state.document.elements.map((element) => {
        if (element.id !== action.payload.id) return element;
        return { ...element, zIndex: Math.max(0, element.zIndex + (action.payload.direction === 'up' ? 1 : -1)) };
      });
      return markDirty(state, next);
    }
    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.3, Math.min(action.payload, 3)) };
    case 'SET_CATEGORY':
      return { ...state, activeCategory: action.payload };
    case 'SET_VALIDATION':
      return { ...state, validationState: { ...action.payload, lastValidatedAt: Date.now() } };
    case 'SET_PUBLISH_STATE':
      return { ...state, publishState: action.payload };
    case 'MARK_SAVED':
      return { ...state, dirty: false, lastSavedAt: Date.now() };
    default:
      return state;
  }
}
