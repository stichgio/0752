import type { ElementType, Position, Size, ElementStyle, BlockPreset } from '../canvasTypes';
import type { TemplateElement } from '../canvasTypes';

export interface BlockElementDef {
  type: ElementType;
  name: string;
  relativePosition: Position;
  size: Size;
  style: ElementStyle;
  content?: string;
  variableName?: string;
  tableData?: TemplateElement['tableData'];
  signatureConfig?: TemplateElement['signatureConfig'];
  dividerConfig?: TemplateElement['dividerConfig'];
  title?: string;
  signatureName?: string;
}

export interface PresetBlock {
  id: BlockPreset;
  label: string;
  description: string;
  icon: string;
  elements: BlockElementDef[];
}

export const PRESET_BLOCKS: PresetBlock[] = [
  // ─── Bloque 1: Cabecera con Logos ─────────────────────────────
  {
    id: 'header-logos',
    label: 'Cabecera con Logos',
    description: 'Logo izq. + título + logo der. + separador',
    icon: 'FileText',
    elements: [
      {
        type: 'logo',
        name: 'Logo izquierdo',
        relativePosition: { x: 0, y: 0 },
        size: { width: 45, height: 18 },
        style: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: '#d1d5db',
          borderStyle: 'dashed',
          objectFit: 'contain',
          zIndex: 1,
        },
        variableName: 'logo_left',
      },
      {
        type: 'heading',
        name: 'Título cabecera',
        relativePosition: { x: 52, y: 2 },
        size: { width: 86, height: 14 },
        style: {
          fontSize: 13,
          fontWeight: 'bold',
          fontFamily: 'Arial',
          textAlign: 'center',
          textTransform: 'uppercase',
          color: '#1f2937',
          backgroundColor: 'transparent',
          zIndex: 1,
        },
        content: 'TÍTULO DEL DOCUMENTO',
      },
      {
        type: 'logo',
        name: 'Logo derecho',
        relativePosition: { x: 145, y: 0 },
        size: { width: 45, height: 18 },
        style: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: '#d1d5db',
          borderStyle: 'dashed',
          objectFit: 'contain',
          zIndex: 1,
        },
        variableName: 'logo_right',
      },
      {
        type: 'divider',
        name: 'Separador cabecera',
        relativePosition: { x: 0, y: 20 },
        size: { width: 190, height: 1 },
        style: {
          backgroundColor: 'transparent',
          zIndex: 1,
        },
        dividerConfig: {
          orientation: 'horizontal',
          color: '#374151',
          thickness: 2,
          style: 'solid',
        },
      },
    ],
  },

  // ─── Bloque 2: Datos Generales ────────────────────────────────
  {
    id: 'datos-generales',
    label: 'Datos Generales',
    description: 'Título de sección + tabla clave-valor',
    icon: 'ClipboardList',
    elements: [
      {
        type: 'heading',
        name: 'Título sección',
        relativePosition: { x: 0, y: 0 },
        size: { width: 190, height: 8 },
        style: {
          fontSize: 9,
          fontWeight: 'bold',
          fontFamily: 'Arial',
          textTransform: 'uppercase',
          color: '#0056b3',
          backgroundColor: 'transparent',
          borderBottomWidth: 1,
          borderColor: '#0056b3',
          borderStyle: 'solid',
          padding: 1,
          zIndex: 1,
        },
        content: '1.0 DATOS GENERALES',
      },
      {
        type: 'table',
        name: 'Grilla datos generales',
        relativePosition: { x: 0, y: 10 },
        size: { width: 190, height: 24 },
        style: {
          backgroundColor: '#ffffff',
          borderColor: '#9ca3af',
          borderWidth: 1,
          borderStyle: 'solid',
          fontSize: 8,
          zIndex: 1,
        },
        tableData: {
          rowCount: 3,
          colCount: 4,
          data: [
            ['DIRECCIÓN', '', 'DISTRITO', ''],
            ['LOCALIDAD', '', 'SECTOR', ''],
            ['NIS', '', 'Nro OT', ''],
          ],
          borderColor: '#d1d5db',
          colWidths: [20, 30, 20, 30],
          rowHeights: [33.33, 33.33, 33.34],
        },
      },
    ],
  },

  // ─── Bloque 3: Firmas Dobles ──────────────────────────────────
  {
    id: 'firmas-dual',
    label: 'Bloque de Firmas',
    description: 'Dos firmas lado a lado',
    icon: 'Users',
    elements: [
      {
        type: 'signature',
        name: 'Firma - Supervisor',
        relativePosition: { x: 10, y: 0 },
        size: { width: 70, height: 22 },
        style: {
          backgroundColor: 'transparent',
          borderColor: '#374151',
          borderWidth: 0,
          borderTopWidth: 1,
          borderStyle: 'solid',
          textAlign: 'center',
          fontSize: 9,
          zIndex: 1,
        },
        title: 'SUPERVISOR',
        signatureName: '',
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      },
      {
        type: 'signature',
        name: 'Firma - Contratista',
        relativePosition: { x: 110, y: 0 },
        size: { width: 70, height: 22 },
        style: {
          backgroundColor: 'transparent',
          borderColor: '#374151',
          borderWidth: 0,
          borderTopWidth: 1,
          borderStyle: 'solid',
          textAlign: 'center',
          fontSize: 9,
          zIndex: 1,
        },
        title: 'CONTRATISTA',
        signatureName: '',
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      },
    ],
  },
];
