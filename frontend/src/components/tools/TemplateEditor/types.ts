export type TemplateStatus = 'draft' | 'published' | 'archived';
export type ElementType = 'text' | 'image' | 'table' | 'variable' | 'protected';
export type ReportType = 'technical_report' | 'ficha_tecnica' | 'generic';
export type EditorCategory = 'design' | 'elements' | 'text' | 'brand' | 'uploads' | 'layers';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  style: { fontSize: number; fontFamily: string; color: string; fontWeight?: number; align?: 'left' | 'center' | 'right' };
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  opacity?: number;
}

export interface TableElement extends BaseElement {
  type: 'table';
  rows: number;
  cols: number;
  cells: string[][];
  style: { borderColor: string; headerBg?: string; fontSize: number };
}

export interface VariableElement extends BaseElement {
  type: 'variable';
  token: string;
  fallback?: string;
}

export interface ProtectedElement extends BaseElement {
  type: 'protected';
  name: string;
  content: string;
  allowedTokens: string[];
}

export type EditorElement = TextElement | ImageElement | TableElement | VariableElement | ProtectedElement;

export interface TemplateDocument {
  id: string;
  name: string;
  reportType: ReportType;
  page: { size: 'A4'; orientation: 'portrait' | 'landscape'; marginMm: number };
  elements: EditorElement[];
  version: number;
  status: TemplateStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface EditorState {
  templateId: string | null;
  role: 'admin' | 'editor';
  document: TemplateDocument;
  selection: string[];
  activeCategory: EditorCategory;
  zoom: number;
  pan: { x: number; y: number };
  guides: { enabled: boolean; snap: boolean; safeMarginMm: number };
  validationState: { valid: boolean; issues: ValidationIssue[]; lastValidatedAt: number | null };
  dirty: boolean;
  publishState: { status: TemplateStatus; currentVersion: number };
  lastSavedAt: number | null;
}
