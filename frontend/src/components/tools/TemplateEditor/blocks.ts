import type {
  BlockPaletteItem,
  BlockType,
  DataGridConfig,
  FooterConfig,
  HeaderConfig,
  InfoBarConfig,
  PhotoGridConfig,
  SectionTitleConfig,
  SignaturesConfig,
  SpacerConfig,
  TableConfig,
  TemplateBlock,
  TextConfig,
} from './blockTypes';

/* ── Unique ID generator ── */

export function blockId(prefix: BlockType = 'text'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Palette Definitions ── */

export const BLOCK_PALETTE: BlockPaletteItem[] = [
  // Structure
  {
    type: 'header',
    label: 'Encabezado',
    description: 'Logos + título principal',
    icon: 'LayoutTemplate',
    category: 'structure',
    defaultConfig: { title: 'PANEL FOTOGRÁFICO', showLogos: true } satisfies HeaderConfig,
  },
  {
    type: 'info-bar',
    label: 'Barra de Info',
    description: 'Campos clave-valor horizontales',
    icon: 'BarChart3',
    category: 'structure',
    defaultConfig: {
      fields: [
        { label: 'CENTRO DE SERVICIOS', variable: 'CENTRO' },
        { label: 'NIS', variable: 'NIS' },
        { label: 'Nro OT', variable: 'Nro OT' },
      ],
    } satisfies InfoBarConfig,
  },
  {
    type: 'section-title',
    label: 'Título de Sección',
    description: 'Encabezado de sección numerado',
    icon: 'Heading',
    category: 'structure',
    defaultConfig: { number: '1.0', text: 'LOCALIZACIÓN', color: '#0056b3' } satisfies SectionTitleConfig,
  },
  {
    type: 'spacer',
    label: 'Espaciador',
    description: 'Espacio vertical configurable',
    icon: 'Minus',
    category: 'structure',
    defaultConfig: { height: 5 } satisfies SpacerConfig,
  },

  // Data
  {
    type: 'data-grid',
    label: 'Grilla de Datos (6 col)',
    description: '3 pares label-valor por fila',
    icon: 'Grid3X3',
    category: 'data',
    defaultConfig: {
      columns: 6,
      fields: [
        { label: 'DIRECCION', variable: 'DIRECCION' },
        { label: 'LOCALIDAD', variable: 'LOCALIDAD' },
        { label: 'DISTRITO', variable: 'DISTRITO' },
        { label: 'ESTADO', variable: 'ESTADO' },
        { label: 'TIPO RED', variable: 'TIPO RED' },
        { label: 'SECTOR', variable: 'SECTOR' },
      ],
    } satisfies DataGridConfig,
  },
  {
    type: 'data-grid',
    label: 'Grilla de Datos (4 col)',
    description: '2 pares label-valor por fila',
    icon: 'Table2',
    category: 'data',
    defaultConfig: {
      columns: 4,
      fields: [
        { label: 'ACTIVIDAD', variable: 'ACTIVIDAD' },
        { label: 'CONTRATA', variable: 'CONTRATA' },
        { label: 'SUBACTIVIDAD', variable: 'SUBACTIVIDAD' },
        { label: 'CUADRILLA', variable: 'CUADRILLA' },
      ],
      spanFields: [],
    } satisfies DataGridConfig,
  },
  {
    type: 'table',
    label: 'Tabla',
    description: 'Tabla con encabezados y filas de datos',
    icon: 'Table',
    category: 'data',
    defaultConfig: {
      headers: ['Campo', 'Valor'],
      rows: [["{{ report.data.get('CAMPO1', '-') }}", "{{ report.data.get('VALOR1', '-') }}"]],
      borderColor: '#cbd5e1',
      headerBg: '#f5f5f5',
    } satisfies TableConfig,
  },
  {
    type: 'text',
    label: 'Texto Libre',
    description: 'Párrafo con variables opcionales',
    icon: 'Type',
    category: 'data',
    defaultConfig: { content: 'Texto descriptivo aquí...', fontSize: 9, align: 'left' } satisfies TextConfig,
  },

  // Media
  {
    type: 'photo-grid',
    label: 'Panel Fotográfico',
    description: 'Grid de fotos (2, 3 o 4 imágenes)',
    icon: 'Image',
    category: 'media',
    defaultConfig: { maxPhotos: 'auto', showLabels: false, panelTitle: 'Panel Fotos' } satisfies PhotoGridConfig,
  },
  {
    type: 'photo-grid',
    label: 'Fotos con Etiquetas',
    description: 'Fotos etiquetadas (ANTES, DURANTE...)',
    icon: 'Images',
    category: 'media',
    defaultConfig: {
      maxPhotos: 4,
      showLabels: true,
      labels: ['ANTES', 'DURANTE', 'DESPUÉS', 'RESIDUOS'],
      panelTitle: 'Panel Fotos',
    } satisfies PhotoGridConfig,
  },

  // Other
  {
    type: 'signatures',
    label: 'Firmas',
    description: 'Bloques de firma con línea y nombre',
    icon: 'PenTool',
    category: 'other',
    defaultConfig: {
      signatures: [
        { title: 'EJECUTOR', name: '' },
        { title: 'SUPERVISOR', name: '' },
      ],
      gap: 15,
    } satisfies SignaturesConfig,
  },
  {
    type: 'footer',
    label: 'Pie de Página',
    description: 'Texto de pie con estilo personalizado',
    icon: 'AlignEndVertical',
    category: 'other',
    defaultConfig: { content: 'Empresa S.A.C.', fontFamily: 'Arial', color: '#555555', fontSize: 8 } satisfies FooterConfig,
  },
];

/* ── Factory: create a new block from palette item ── */

export function createBlock(paletteItem: BlockPaletteItem): TemplateBlock {
  return {
    id: blockId(paletteItem.type),
    type: paletteItem.type,
    config: JSON.parse(JSON.stringify(paletteItem.defaultConfig)),
    locked: false,
  };
}

/* ── Preset Templates ── */

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  blocks: TemplateBlock[];
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'preset_panel_fotografico',
    name: 'Panel Fotográfico Estándar',
    description: 'Plantilla estándar con header, info, localización, detalles y fotos',
    blocks: [
      {
        id: 'h1', type: 'header',
        config: { title: 'PANEL FOTOGRÁFICO', showLogos: true } satisfies HeaderConfig,
      },
      {
        id: 'ib1', type: 'info-bar',
        config: {
          fields: [
            { label: 'CENTRO DE SERVICIOS', variable: 'CENTRO' },
            { label: 'NIS', variable: 'NIS' },
            { label: 'Nro OT', variable: 'Nro OT' },
          ],
        } satisfies InfoBarConfig,
      },
      {
        id: 'st1', type: 'section-title',
        config: { number: '1.0', text: 'LOCALIZACIÓN', color: '#0056b3' } satisfies SectionTitleConfig,
      },
      {
        id: 'dg1', type: 'data-grid',
        config: {
          columns: 6,
          fields: [
            { label: 'DIRECCION', variable: 'DIRECCION' },
            { label: 'LOCALIDAD', variable: 'LOCALIDAD' },
            { label: 'DISTRITO', variable: 'DISTRITO' },
            { label: 'ESTADO', variable: 'ESTADO' },
            { label: 'TIPO RED', variable: 'TIPO RED' },
            { label: 'SECTOR', variable: 'SECTOR' },
          ],
        } satisfies DataGridConfig,
      },
      {
        id: 'st2', type: 'section-title',
        config: { number: '2.0', text: 'DETALLES DE ORDEN DE TRABAJO', color: '#0056b3' } satisfies SectionTitleConfig,
      },
      {
        id: 'dg2', type: 'data-grid',
        config: {
          columns: 4,
          fields: [
            { label: 'ACTIVIDAD', variable: 'ACTIVIDAD' },
            { label: 'CONTRATA', variable: 'CONTRATA' },
            { label: 'SUBACTIVIDAD', variable: 'SUBACTIVIDAD' },
            { label: 'CUADRILLA', variable: 'CUADRILLA' },
            { label: 'OBS. SEDAPAL', variable: 'OBSERVACION SEDAPAL' },
            { label: 'OBS. CONTRATA', variable: 'OBSERVACION CONTRATA' },
          ],
          spanFields: ['OBSERVACION SEDAPAL', 'OBSERVACION CONTRATA'],
        } satisfies DataGridConfig,
      },
      {
        id: 'st3', type: 'section-title',
        config: { number: '3.0', text: 'PANEL FOTOGRÁFICO', color: '#0056b3' } satisfies SectionTitleConfig,
      },
      {
        id: 'pg1', type: 'photo-grid',
        config: { maxPhotos: 'auto', showLabels: false, panelTitle: 'Panel Fotos' } satisfies PhotoGridConfig,
      },
    ],
  },
  {
    id: 'preset_etapas',
    name: 'Panel por Etapas',
    description: 'Fotos etiquetadas: Antes, Durante, Después, Residuos',
    blocks: [
      {
        id: 'h1', type: 'header',
        config: { title: 'PANEL FOTOGRÁFICO', showLogos: true } satisfies HeaderConfig,
      },
      {
        id: 'st1', type: 'section-title',
        config: { number: '', text: 'INFORMACIÓN DE LA ACTIVIDAD', color: '#0056b3' } satisfies SectionTitleConfig,
      },
      {
        id: 'dg1', type: 'data-grid',
        config: {
          columns: 4,
          fields: [
            { label: 'ZONAL', variable: 'ZONAL' },
            { label: 'ACTIVIDAD', variable: 'NAME ACTIVITY' },
            { label: 'CÓDIGO', variable: 'CODIGO BUZON' },
            { label: 'CONTRATISTA', variable: 'CONTRATISTA' },
          ],
        } satisfies DataGridConfig,
      },
      {
        id: 'pg1', type: 'photo-grid',
        config: {
          maxPhotos: 4,
          showLabels: true,
          labels: ['ANTES', 'DURANTE', 'DESPUÉS', 'RESIDUOS'],
          panelTitle: 'Panel Fotos',
        } satisfies PhotoGridConfig,
      },
      {
        id: 'f1', type: 'footer',
        config: { content: 'Contratista: {{ report.data.get("CONTRATA", "-") }}', fontFamily: 'Arial', color: '#1800ad', fontSize: 9 } satisfies FooterConfig,
      },
    ],
  },
  {
    id: 'preset_certificado',
    name: 'Certificado / Formato',
    description: 'Plantilla tipo certificado con texto, campos y firmas',
    blocks: [
      {
        id: 'h1', type: 'header',
        config: { title: 'CERTIFICADO', showLogos: true } satisfies HeaderConfig,
      },
      {
        id: 't1', type: 'text',
        config: { content: 'Por medio del presente se certifica que los trabajos han sido realizados satisfactoriamente.', fontSize: 10, align: 'justify' } satisfies TextConfig,
      },
      {
        id: 'dg1', type: 'data-grid',
        config: {
          columns: 4,
          fields: [
            { label: 'NOMBRE', variable: 'NOMBRE' },
            { label: 'RUC', variable: 'RUC' },
            { label: 'DIRECCIÓN', variable: 'DIRECCION' },
            { label: 'FECHA', variable: 'FECHA' },
          ],
        } satisfies DataGridConfig,
      },
      {
        id: 'sp1', type: 'spacer', config: { height: 20 } satisfies SpacerConfig,
      },
      {
        id: 'sig1', type: 'signatures',
        config: {
          signatures: [
            { title: 'RESPONSABLE TÉCNICO', name: '' },
            { title: 'REPRESENTANTE LEGAL', name: '' },
          ],
          gap: 15,
        } satisfies SignaturesConfig,
      },
    ],
  },
];
