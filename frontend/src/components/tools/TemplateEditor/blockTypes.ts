/* ── Block-based Template Builder Types ── */

export type BlockType =
  | 'header'
  | 'info-bar'
  | 'section-title'
  | 'data-grid'
  | 'photo-grid'
  | 'text'
  | 'table'
  | 'signatures'
  | 'footer'
  | 'spacer';

export interface FieldDef {
  label: string;
  variable: string;
}

export interface SignatureDef {
  title: string;
  name: string;
}

/* ── Block Config by Type ── */

export interface HeaderConfig {
  title: string;
  showLogos: boolean;
}

export interface InfoBarConfig {
  fields: FieldDef[];
}

export interface SectionTitleConfig {
  number: string;
  text: string;
  color: string;
}

export interface DataGridConfig {
  columns: 4 | 6;
  fields: FieldDef[];
  /** Fields that span extra columns (span3 in grid-4) */
  spanFields?: string[];
}

export interface PhotoGridConfig {
  maxPhotos: 2 | 3 | 4 | 'auto';
  showLabels: boolean;
  /** Named labels per position (ANTES, DURANTE, etc.) */
  labels?: string[];
  /** Visual badge text shown over the photo panel */
  panelTitle?: string;
}

export interface TextConfig {
  content: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
}

export interface TableConfig {
  headers: string[];
  rows: string[][];
  borderColor?: string;
  headerBg?: string;
}

export interface SignaturesConfig {
  signatures: SignatureDef[];
  gap?: number;
}

export interface FooterConfig {
  content: string;
  fontFamily?: string;
  color?: string;
  fontSize?: number;
}

export interface SpacerConfig {
  height: number; // mm
}

export type BlockConfig =
  | HeaderConfig
  | InfoBarConfig
  | SectionTitleConfig
  | DataGridConfig
  | PhotoGridConfig
  | TextConfig
  | TableConfig
  | SignaturesConfig
  | FooterConfig
  | SpacerConfig;

/* ── Template Block ── */

export interface TemplateBlock {
  id: string;
  type: BlockType;
  config: BlockConfig;
  locked?: boolean;
}

/* ── Typed block helpers ── */

export interface HeaderBlock extends TemplateBlock { type: 'header'; config: HeaderConfig; }
export interface InfoBarBlock extends TemplateBlock { type: 'info-bar'; config: InfoBarConfig; }
export interface SectionTitleBlock extends TemplateBlock { type: 'section-title'; config: SectionTitleConfig; }
export interface DataGridBlock extends TemplateBlock { type: 'data-grid'; config: DataGridConfig; }
export interface PhotoGridBlock extends TemplateBlock { type: 'photo-grid'; config: PhotoGridConfig; }
export interface TextBlock extends TemplateBlock { type: 'text'; config: TextConfig; }
export interface TableBlock extends TemplateBlock { type: 'table'; config: TableConfig; }
export interface SignaturesBlock extends TemplateBlock { type: 'signatures'; config: SignaturesConfig; }
export interface FooterBlock extends TemplateBlock { type: 'footer'; config: FooterConfig; }
export interface SpacerBlock extends TemplateBlock { type: 'spacer'; config: SpacerConfig; }

export type TypedBlock =
  | HeaderBlock
  | InfoBarBlock
  | SectionTitleBlock
  | DataGridBlock
  | PhotoGridBlock
  | TextBlock
  | TableBlock
  | SignaturesBlock
  | FooterBlock
  | SpacerBlock;

/* ── Block Template Document ── */

export interface BlockTemplateDocument {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  pageSettings: {
    size: 'A4';
    orientation: 'portrait' | 'landscape';
    marginMm: number;
  };
  version: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

/* ── Block Palette Category ── */

export interface BlockPaletteItem {
  type: BlockType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  category: 'structure' | 'data' | 'media' | 'other';
  defaultConfig: BlockConfig;
}
