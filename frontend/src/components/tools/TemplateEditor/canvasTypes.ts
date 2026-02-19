// Canva-style Template Editor - Element Types
export type ElementType =
  | 'text'
  | 'heading'
  | 'image'
  | 'logo'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'table'
  | 'variable'
  | 'photo-grid'
  | 'signature'
  | 'container'
  | 'shape'
  | 'divider'
  | 'qr';

export type ElementPreset = 'photo-panel' | 'technical-table';
export type PhotoGridCount = 2 | 3 | 4 | 5 | 6;
export type PhotoGridOddPosition = 'left' | 'center' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type PageFormat = 'A4' | 'Letter' | 'Custom';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSettings {
  format: PageFormat;
  width: number; // mm
  height: number; // mm
  orientation: PageOrientation;
  margins: PageMargins; // mm
  backgroundColor?: string;
}

export interface ElementStyle {
  // Colors
  backgroundColor?: string;
  color?: string;
  borderColor?: string;

  // Border
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: number;

  // Typography
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';

  // Layout
  padding?: number;
  opacity?: number;
  zIndex?: number;

  // Effects
  boxShadow?: string;
  transform?: string;

  // Image specific
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  objectPosition?: string;
}

export interface TableData {
  rowCount: number;
  colCount: number;
  data: string[][];
  borderColor: string;
  // Legacy shape kept for backward compatibility with existing templates.
  headers?: string[];
  rows?: string[][];
}

export interface TemplateElement {
  id: string;
  type: ElementType;
  name: string;
  position: Position;
  size: Size;
  style: ElementStyle;
  content?: string;
  locked?: boolean;
  visible?: boolean;

  rotation?: number;

  // Element-specific properties
  variableName?: string; // For variable elements
  imageUrl?: string; // For image elements
  placeholder?: string; // Placeholder text

  // Table specific
  tableData?: TableData;

  // Photo grid specific
  photoConfig?: {
    count: PhotoGridCount;
    labels: string[];
    showLabels: boolean;
    oddPosition?: PhotoGridOddPosition;
  };

  // Signature specific
  title?: string;
  signatureName?: string;
  signatureConfig?: {
    title: string;
    name: string;
  }[];

  // Shape specific
  shapeConfig?: {
    kind: 'rectangle' | 'circle' | 'line' | 'arrow';
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: number;
  };

  // Divider specific
  dividerConfig?: {
    orientation: 'horizontal' | 'vertical';
    color: string;
    thickness: number;
    style: 'solid' | 'dashed' | 'dotted';
  };

  // QR specific
  qrConfig?: {
    content: string;
    errorLevel: 'L' | 'M' | 'Q' | 'H';
    foreground: string;
    background: string;
  };
}

export interface CanvasDocument {
  id: string;
  name: string;
  elements: TemplateElement[];
  pageSettings: PageSettings;
  version: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ToolItem {
  type: ElementType;
  icon: string;
  label: string;
  category: 'basic' | 'text' | 'shapes' | 'media' | 'data';
  defaultSize: Size;
  defaultStyle: ElementStyle;
}

export const TOOL_CATEGORIES = {
  basic: { label: 'Básico', color: '#3b82f6' },
  text: { label: 'Texto', color: '#8b5cf6' },
  shapes: { label: 'Formas', color: '#10b981' },
  media: { label: 'Media', color: '#f59e0b' },
  data: { label: 'Datos', color: '#ec4899' },
};

export const DEFAULT_TOOLS: ToolItem[] = [
  {
    type: 'text',
    icon: 'Type',
    label: 'Texto',
    category: 'text',
    defaultSize: { width: 150, height: 40 },
    defaultStyle: {
      fontSize: 12,
      fontFamily: 'Arial',
      color: '#1f2937',
      backgroundColor: 'transparent',
    },
  },
  {
    type: 'heading',
    icon: 'Heading',
    label: 'Título',
    category: 'text',
    defaultSize: { width: 200, height: 50 },
    defaultStyle: {
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      color: '#1f2937',
      backgroundColor: 'transparent',
    },
  },
  {
    type: 'variable',
    icon: 'Braces',
    label: 'Variable',
    category: 'data',
    defaultSize: { width: 120, height: 30 },
    defaultStyle: {
      fontSize: 11,
      fontFamily: 'monospace',
      color: '#2563eb',
      backgroundColor: '#dbeafe',
      borderColor: '#3b82f6',
      borderWidth: 1,
      borderStyle: 'dashed',
      padding: 4,
    },
  },
  {
    type: 'rectangle',
    icon: 'Square',
    label: 'Rectángulo',
    category: 'shapes',
    defaultSize: { width: 100, height: 100 },
    defaultStyle: {
      backgroundColor: '#e5e7eb',
      borderColor: '#9ca3af',
      borderWidth: 1,
      borderStyle: 'solid',
    },
  },
  {
    type: 'circle',
    icon: 'Circle',
    label: 'Círculo',
    category: 'shapes',
    defaultSize: { width: 100, height: 100 },
    defaultStyle: {
      backgroundColor: '#e5e7eb',
      borderColor: '#9ca3af',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 50,
    },
  },
  {
    type: 'line',
    icon: 'Minus',
    label: 'Línea',
    category: 'shapes',
    defaultSize: { width: 200, height: 2 },
    defaultStyle: {
      backgroundColor: '#374151',
      borderWidth: 0,
    },
  },
  {
    type: 'image',
    icon: 'Image',
    label: 'Imagen',
    category: 'media',
    defaultSize: { width: 150, height: 150 },
    defaultStyle: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      objectFit: 'cover',
    },
  },
  {
    type: 'logo',
    icon: 'Image',
    label: 'Logo',
    category: 'media',
    defaultSize: { width: 60, height: 60 },
    defaultStyle: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      objectFit: 'contain',
    },
  },
  {
    type: 'photo-grid',
    icon: 'LayoutGrid',
    label: 'Grid Fotos',
    category: 'media',
    defaultSize: { width: 300, height: 200 },
    defaultStyle: {
      backgroundColor: '#fef3c7',
      borderColor: '#f59e0b',
      borderWidth: 1,
      borderStyle: 'solid',
    },
  },
  {
    type: 'table',
    icon: 'Table',
    label: 'Tabla',
    category: 'data',
    defaultSize: { width: 300, height: 150 },
    defaultStyle: {
      backgroundColor: '#ffffff',
      borderColor: '#d1d5db',
      borderWidth: 1,
      fontSize: 10,
    },
  },
  {
    type: 'signature',
    icon: 'PenTool',
    label: 'Firma',
    category: 'data',
    defaultSize: { width: 150, height: 80 },
    defaultStyle: {
      backgroundColor: 'transparent',
      borderColor: '#374151',
      borderWidth: 0,
      borderTopWidth: 1,
      borderStyle: 'solid',
      textAlign: 'center',
    },
  },
  {
    type: 'container',
    icon: 'Box',
    label: 'Contenedor',
    category: 'basic',
    defaultSize: { width: 200, height: 150 },
    defaultStyle: {
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      borderStyle: 'dashed',
      padding: 10,
    },
  },
];

// Helper to create new document
export function createEmptyDocument(): CanvasDocument {
  const now = new Date().toISOString();
  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: 'Nueva Plantilla',
    elements: [],
    pageSettings: createDefaultPageSettings(),
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultPageSettings(): PageSettings {
  return {
    format: 'A4',
    width: 210,
    height: 297,
    orientation: 'portrait',
    margins: {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    },
    backgroundColor: '#ffffff',
  };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isKnownFormat(value: unknown): value is PageFormat {
  return value === 'A4' || value === 'Letter' || value === 'Custom';
}

function inferFormat(width: number, height: number): PageFormat {
  const min = Math.min(width, height);
  const max = Math.max(width, height);
  const epsilon = 1;
  const nearly = (a: number, b: number) => Math.abs(a - b) <= epsilon;
  if (nearly(min, 210) && nearly(max, 297)) return 'A4';
  if (nearly(min, 216) && nearly(max, 279)) return 'Letter';
  return 'Custom';
}

function inferOrientation(width: number, height: number): PageOrientation {
  return width > height ? 'landscape' : 'portrait';
}

export function normalizePageSettings(raw: unknown): PageSettings {
  const defaults = createDefaultPageSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const maybe = raw as Record<string, unknown>;
  const width = toFiniteNumber(maybe.width, defaults.width);
  const height = toFiniteNumber(maybe.height, defaults.height);

  const legacyTop = toFiniteNumber(maybe.marginTop, defaults.margins.top);
  const legacyRight = toFiniteNumber(maybe.marginRight, defaults.margins.right);
  const legacyBottom = toFiniteNumber(maybe.marginBottom, defaults.margins.bottom);
  const legacyLeft = toFiniteNumber(maybe.marginLeft, defaults.margins.left);

  const marginsRaw = maybe.margins as Partial<PageMargins> | undefined;
  const margins: PageMargins = {
    top: toFiniteNumber(marginsRaw?.top, legacyTop),
    right: toFiniteNumber(marginsRaw?.right, legacyRight),
    bottom: toFiniteNumber(marginsRaw?.bottom, legacyBottom),
    left: toFiniteNumber(marginsRaw?.left, legacyLeft),
  };

  const format = isKnownFormat(maybe.format) ? maybe.format : inferFormat(width, height);
  const orientation =
    maybe.orientation === 'portrait' || maybe.orientation === 'landscape'
      ? maybe.orientation
      : inferOrientation(width, height);

  return {
    format,
    width,
    height,
    orientation,
    margins,
    backgroundColor:
      typeof maybe.backgroundColor === 'string'
        ? maybe.backgroundColor
        : defaults.backgroundColor,
  };
}

// Helper to create new element
export function createElement(
  type: ElementType,
  position: Position,
  overrides: Partial<TemplateElement> = {}
): TemplateElement {
  const tool = DEFAULT_TOOLS.find((t) => t.type === type) || DEFAULT_TOOLS[0];

  return {
    id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type,
    name: `${tool.label} ${Math.floor(Math.random() * 1000)}`,
    position: { ...position },
    size: { ...tool.defaultSize },
    style: { ...tool.defaultStyle, zIndex: 1 },
    visible: true,
    locked: false,
    content: type === 'text' || type === 'heading' ? tool.label : '',
    ...(type === 'table' ? {
      tableData: {
        rowCount: 2,
        colCount: 2,
        data: [['', ''], ['', '']],
        borderColor: '#d1d5db',
      },
    } : {}),
    ...(type === 'signature' ? {
      title: 'SUPERVISOR',
      signatureName: '',
      signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
    } : {}),
    ...overrides,
  };
}

// Convert mm to pixels (assuming 96 DPI)
export function mmToPx(mm: number): number {
  return (mm * 96) / 25.4;
}

// Convert pixels to mm
export function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

// Generate unique ID
export function generateId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
