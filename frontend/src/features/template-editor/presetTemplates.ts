/**
 * Preset templates for the Canvas Editor.
 * Each template mirrors a backend block-editor template structure,
 * expressed as a CanvasDocument with pre-positioned elements.
 *
 * Variable naming convention:
 *   variableName must use the backend Jinja2 expression:
 *     report.data.get('FIELD', '-')
 *   This matches what the backend compiler emits.
 *
 * Templates are grouped by category so the sidebar can display them in sections.
 */
import type { CanvasDocument, TemplateElement } from './canvasTypes';
import { normalizeTableData } from './utils/elementDefaults';

function uid(prefix = 'el'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

const PAGE = {
  format: 'A4' as const,
  width: 210,
  height: 297,
  orientation: 'portrait' as const,
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  backgroundColor: '#ffffff',
};

// ─── Helper builders ───────────────────────────────────────────────────────────

function el(overrides: Omit<TemplateElement, 'id' | 'visible' | 'locked'>): TemplateElement {
  return { id: uid(), visible: true, locked: false, ...overrides };
}

/** Shortcut to build a report.data.get() Jinja2 expression */
function rvar(field: string): string {
  return `report.data.get('${field}', '-')`;
}

// ─── Template 1: Panel Fotográfico (matches backend photo-grid template) ───────

function makePhotoPanel(): CanvasDocument {
  const W = PAGE.width - 20; // usable width (margins)
  return {
    id: uid('doc'),
    name: 'Panel Fotográfico',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header row: logo left + title + logo right
      el({
        type: 'logo',
        name: 'Logo izquierdo',
        position: { x: 10, y: 5 },
        size: { width: 45, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        content: '',
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Título del reporte',
        position: { x: 62, y: 8 },
        size: { width: 86, height: 12 },
        style: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', color: '#333333', textTransform: 'uppercase', zIndex: 2 },
        content: 'PANEL FOTOGRÁFICO',
      }),
      el({
        type: 'logo',
        name: 'Logo derecho',
        position: { x: 155, y: 5 },
        size: { width: 45, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        content: '',
        variableName: 'logo_right',
      }),
      // Divider below header
      el({
        type: 'divider',
        name: 'Separador cabecera',
        position: { x: 10, y: 24 },
        size: { width: W, height: 1 },
        style: { zIndex: 3 },
        dividerConfig: { orientation: 'horizontal', color: '#dddddd', thickness: 1.5, style: 'solid' },
      }),
      // Info bar
      el({
        type: 'rectangle',
        name: 'Fondo info-bar',
        position: { x: 10, y: 26 },
        size: { width: W, height: 10 },
        style: { backgroundColor: '#f5f5f5', borderColor: '#dddddd', borderWidth: 1, borderStyle: 'solid', zIndex: 4 },
      }),
      el({
        type: 'variable',
        name: 'CS / Orden',
        position: { x: 12, y: 27.5 },
        size: { width: 55, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'CS: ',
        variableName: rvar('cs'),
      }),
      el({
        type: 'variable',
        name: 'Contratista',
        position: { x: 75, y: 27.5 },
        size: { width: 70, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Contratista: ',
        variableName: rvar('contratista'),
      }),
      el({
        type: 'variable',
        name: 'Fecha de corte',
        position: { x: 153, y: 27.5 },
        size: { width: 47, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Fecha: ',
        variableName: rvar('fecha_corte'),
      }),
      // Section title
      el({
        type: 'heading',
        name: 'Título sección',
        position: { x: 10, y: 38 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '1. REGISTRO FOTOGRÁFICO',
      }),
      // Photo grid (main area)
      el({
        type: 'photo-grid',
        name: 'Panel de fotos',
        position: { x: 10, y: 47 },
        size: { width: W, height: 215 },
        style: { backgroundColor: '#f7f6ff', borderColor: '#6d4cff', borderWidth: 1.2, borderStyle: 'solid', borderRadius: 3, zIndex: 7 },
        photoConfig: { count: 4, labels: ['ANTES', 'DURANTE', 'DESPUÉS', 'DETALLE'], showLabels: true },
      }),
      // Signatures
      el({
        type: 'signature',
        name: 'Firma supervisor',
        position: { x: 30, y: 268 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 8 },
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma contratista',
        position: { x: 125, y: 268 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 8 },
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      }),
      // Footer
      el({
        type: 'text',
        name: 'Pie de página',
        position: { x: 10, y: 290 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#666666', textAlign: 'center', borderTopWidth: 1, borderColor: '#dddddd', borderStyle: 'solid', zIndex: 9 },
        content: 'Documento generado automáticamente — Confidencial',
      }),
    ],
  };
}

// ─── Template 2: Ficha Técnica (matches backend ficha_tecnica) ──────────────

function makeFichaTecnica(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Ficha Técnica',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header
      el({
        type: 'logo',
        name: 'Logo',
        position: { x: 10, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Título ficha',
        position: { x: 58, y: 8 },
        size: { width: 94, height: 12 },
        style: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', color: '#333333', textTransform: 'uppercase', zIndex: 2 },
        content: 'FICHA TÉCNICA',
      }),
      el({
        type: 'logo',
        name: 'Logo derecho',
        position: { x: 155, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador',
        position: { x: 10, y: 24 },
        size: { width: W, height: 1 },
        style: { zIndex: 3 },
        dividerConfig: { orientation: 'horizontal', color: '#dddddd', thickness: 1.5, style: 'solid' },
      }),
      // Info bar
      el({
        type: 'rectangle',
        name: 'Fondo info-bar',
        position: { x: 10, y: 26 },
        size: { width: W, height: 10 },
        style: { backgroundColor: '#f5f5f5', borderColor: '#dddddd', borderWidth: 1, borderStyle: 'solid', zIndex: 4 },
      }),
      el({
        type: 'variable',
        name: 'ID Ficha',
        position: { x: 12, y: 27.5 },
        size: { width: 55, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'ID: ',
        variableName: rvar('id'),
      }),
      el({
        type: 'variable',
        name: 'Actividad',
        position: { x: 75, y: 27.5 },
        size: { width: 70, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Actividad: ',
        variableName: rvar('actividad'),
      }),
      el({
        type: 'variable',
        name: 'Fecha',
        position: { x: 153, y: 27.5 },
        size: { width: 47, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Fecha: ',
        variableName: rvar('fecha'),
      }),
      // Section: Datos generales
      el({
        type: 'heading',
        name: 'Sección datos generales',
        position: { x: 10, y: 40 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '1. DATOS GENERALES',
      }),
      // Data grid (6 cols) — uses Jinja2 expressions in cell values
      el({
        type: 'table',
        name: 'Grilla datos',
        position: { x: 10, y: 49 },
        size: { width: W, height: 40 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
        tableData: {
          rowCount: 3,
          colCount: 6,
          borderColor: '#cbd5e1',
          colWidths: [16.667, 16.667, 16.667, 16.667, 16.667, 16.665],
          rowHeights: [33.333, 33.333, 33.334],
          data: [
            ['Campo', 'Valor', 'Campo', 'Valor', 'Campo', 'Valor'],
            ['Codigo Infraestructura', "{{ report.data.get('codigo_infraestructura', '-') }}", 'Suministro', "{{ report.data.get('suministro', '-') }}", 'Contratista', "{{ report.data.get('contratista', '-') }}"],
            ['CS', "{{ report.data.get('cs', '-') }}", 'Fecha corte', "{{ report.data.get('fecha_corte', '-') }}", '', ''],
          ],
          headers: ['Campo', 'Valor', 'Campo', 'Valor', 'Campo', 'Valor'],
          rows: [
            ['Código Infraestructura', "{{ report.data.get('codigo_infraestructura', '-') }}", 'Suministro', "{{ report.data.get('suministro', '-') }}", 'Contratista', "{{ report.data.get('contratista', '-') }}"],
            ['CS', "{{ report.data.get('cs', '-') }}", 'Fecha corte', "{{ report.data.get('fecha_corte', '-') }}", '', ''],
          ],
        },
      }),
      // Section: Descripción
      el({
        type: 'heading',
        name: 'Sección descripción',
        position: { x: 10, y: 92 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '2. DESCRIPCIÓN DE ACTIVIDADES',
      }),
      el({
        type: 'rectangle',
        name: 'Área descripción',
        position: { x: 10, y: 101 },
        size: { width: W, height: 40 },
        style: { backgroundColor: '#fefefe', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'dotted', zIndex: 7 },
      }),
      // Section: Fotos
      el({
        type: 'heading',
        name: 'Sección fotos',
        position: { x: 10, y: 145 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '3. REGISTRO FOTOGRÁFICO',
      }),
      el({
        type: 'photo-grid',
        name: 'Fotos ficha',
        position: { x: 10, y: 154 },
        size: { width: W, height: 105 },
        style: { backgroundColor: '#f7f6ff', borderColor: '#6d4cff', borderWidth: 1.2, borderStyle: 'solid', borderRadius: 3, zIndex: 8 },
        photoConfig: { count: 4, labels: ['ANTES', 'DURANTE', 'DESPUÉS', 'DETALLE'], showLabels: true },
      }),
      // Signatures
      el({
        type: 'signature',
        name: 'Firma inspector',
        position: { x: 20, y: 267 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 9 },
        signatureConfig: [{ title: 'INSPECTOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma supervisor',
        position: { x: 85, y: 267 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 9 },
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma contratista',
        position: { x: 150, y: 267 },
        size: { width: 50, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 9 },
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      }),
      // Footer
      el({
        type: 'text',
        name: 'Pie de página',
        position: { x: 10, y: 290 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#666666', textAlign: 'center', borderTopWidth: 1, borderColor: '#dddddd', borderStyle: 'solid', zIndex: 10 },
        content: 'Ficha técnica — Documento confidencial',
      }),
    ],
  };
}

// ─── Template 3: Reporte Técnico (matches backend technical_report) ──────────

function makeReporteTecnico(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Reporte Técnico',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header
      el({
        type: 'logo',
        name: 'Logo empresa',
        position: { x: 10, y: 5 },
        size: { width: 45, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Título reporte',
        position: { x: 62, y: 8 },
        size: { width: 86, height: 12 },
        style: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', color: '#1a3a5c', textTransform: 'uppercase', zIndex: 2 },
        content: 'REPORTE TÉCNICO',
      }),
      el({
        type: 'logo',
        name: 'Logo entidad',
        position: { x: 155, y: 5 },
        size: { width: 45, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador',
        position: { x: 10, y: 24 },
        size: { width: W, height: 1 },
        style: { zIndex: 3 },
        dividerConfig: { orientation: 'horizontal', color: '#dddddd', thickness: 1.5, style: 'solid' },
      }),
      // Info bar completa
      el({
        type: 'rectangle',
        name: 'Fondo info-bar',
        position: { x: 10, y: 26 },
        size: { width: W, height: 10 },
        style: { backgroundColor: '#f5f5f5', borderColor: '#dddddd', borderWidth: 1, borderStyle: 'solid', zIndex: 4 },
      }),
      el({
        type: 'variable',
        name: 'CS',
        position: { x: 12, y: 27.5 },
        size: { width: 38, height: 7 },
        style: { fontSize: 8, color: '#222', fontWeight: 'bold', zIndex: 5 },
        content: 'CS: ',
        variableName: rvar('cs'),
      }),
      el({
        type: 'variable',
        name: 'Código infraestructura',
        position: { x: 55, y: 27.5 },
        size: { width: 55, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Cod: ',
        variableName: rvar('codigo_infraestructura'),
      }),
      el({
        type: 'variable',
        name: 'Contratista',
        position: { x: 115, y: 27.5 },
        size: { width: 50, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Contratista: ',
        variableName: rvar('contratista'),
      }),
      el({
        type: 'variable',
        name: 'Fecha corte',
        position: { x: 170, y: 27.5 },
        size: { width: 30, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Fecha: ',
        variableName: rvar('fecha_corte'),
      }),
      // Section 1: Datos técnicos
      el({
        type: 'heading',
        name: 'Sección 1',
        position: { x: 10, y: 40 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '1. DATOS TÉCNICOS',
      }),
      el({
        type: 'table',
        name: 'Datos técnicos',
        position: { x: 10, y: 49 },
        size: { width: W, height: 35 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
        tableData: normalizeTableData({
          style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
          tableData: {
            headers: ['Parámetro', 'Valor', 'Parámetro', 'Valor'],
            rows: [
              ['Código Infraestructura', "{{ report.data.get('codigo_infraestructura', '-') }}", 'Suministro', "{{ report.data.get('suministro', '-') }}"],
              ['Contratista', "{{ report.data.get('contratista', '-') }}", 'CS / Orden', "{{ report.data.get('cs', '-') }}"],
              ['Fecha de Corte', "{{ report.data.get('fecha_corte', '-') }}", '', ''],
            ],
          } as unknown as NonNullable<TemplateElement['tableData']>,
        }),
      }),
      // Section 2: Observaciones
      el({
        type: 'heading',
        name: 'Sección 2',
        position: { x: 10, y: 87 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '2. OBSERVACIONES',
      }),
      el({
        type: 'rectangle',
        name: 'Área observaciones',
        position: { x: 10, y: 96 },
        size: { width: W, height: 35 },
        style: { backgroundColor: '#fefefe', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'dotted', zIndex: 7 },
      }),
      el({
        type: 'text',
        name: 'Texto observaciones',
        position: { x: 13, y: 98 },
        size: { width: W - 6, height: 31 },
        style: { fontSize: 8, color: '#555', zIndex: 8 },
        content: 'Ingrese las observaciones técnicas del reporte...',
      }),
      // Section 3: Fotos
      el({
        type: 'heading',
        name: 'Sección 3',
        position: { x: 10, y: 134 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '3. EVIDENCIA FOTOGRÁFICA',
      }),
      el({
        type: 'photo-grid',
        name: 'Panel fotográfico',
        position: { x: 10, y: 143 },
        size: { width: W, height: 120 },
        style: { backgroundColor: '#f7f6ff', borderColor: '#6d4cff', borderWidth: 1.2, borderStyle: 'solid', borderRadius: 3, zIndex: 9 },
        photoConfig: { count: 4, labels: ['ANTES', 'DURANTE', 'DESPUÉS', 'DETALLE'], showLabels: true },
      }),
      // Signatures
      el({
        type: 'signature',
        name: 'Firma inspector',
        position: { x: 20, y: 268 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'INSPECTOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma supervisor',
        position: { x: 85, y: 268 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma contratista',
        position: { x: 150, y: 268 },
        size: { width: 50, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#333333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      }),
      // Footer
      el({
        type: 'text',
        name: 'Pie de página',
        position: { x: 10, y: 290 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#666666', textAlign: 'center', borderTopWidth: 1, borderColor: '#dddddd', borderStyle: 'solid', zIndex: 11 },
        content: 'Reporte técnico — Documento confidencial',
      }),
    ],
  };
}

// ─── Template 4: Hoja en Blanco estructurada (simple, A4) ──────────────────

function makeHojaBlanco(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Hoja en Blanco',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      el({
        type: 'heading',
        name: 'Título',
        position: { x: 10, y: 15 },
        size: { width: W, height: 14 },
        style: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#1f2937', zIndex: 1 },
        content: 'TÍTULO DEL DOCUMENTO',
      }),
      el({
        type: 'divider',
        name: 'Separador',
        position: { x: 10, y: 32 },
        size: { width: W, height: 1 },
        style: { zIndex: 2 },
        dividerConfig: { orientation: 'horizontal', color: '#374151', thickness: 2, style: 'solid' },
      }),
      el({
        type: 'text',
        name: 'Contenido',
        position: { x: 10, y: 40 },
        size: { width: W, height: 240 },
        style: { fontSize: 11, color: '#374151', lineHeight: 1.6, zIndex: 3 },
        content: 'Ingrese el contenido del documento aquí...',
      }),
      el({
        type: 'text',
        name: 'Pie de página',
        position: { x: 10, y: 289 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#9ca3af', textAlign: 'center', zIndex: 4 },
        content: 'Página 1',
      }),
    ],
  };
}

// ─── Template 5: Certificado / Constancia ──────────────────────────────────

function makeCertificado(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Certificado',
    pageSettings: { ...PAGE, backgroundColor: '#fafaf8' },
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Borde decorativo
      el({
        type: 'rectangle',
        name: 'Borde exterior',
        position: { x: 5, y: 5 },
        size: { width: 200, height: 287 },
        style: { backgroundColor: 'transparent', borderColor: '#b8962e', borderWidth: 3, borderStyle: 'solid', borderRadius: 2, zIndex: 1 },
      }),
      el({
        type: 'rectangle',
        name: 'Borde interior',
        position: { x: 9, y: 9 },
        size: { width: 192, height: 279 },
        style: { backgroundColor: 'transparent', borderColor: '#b8962e', borderWidth: 1, borderStyle: 'solid', borderRadius: 1, zIndex: 2 },
      }),
      // Logo
      el({
        type: 'logo',
        name: 'Logo',
        position: { x: 80, y: 18 },
        size: { width: 50, height: 22 },
        style: { backgroundColor: 'transparent', objectFit: 'contain', zIndex: 3 },
        variableName: 'logo_left',
      }),
      // Titulo
      el({
        type: 'heading',
        name: 'Certificado título',
        position: { x: 15, y: 52 },
        size: { width: 180, height: 12 },
        style: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#b8962e', textTransform: 'uppercase', letterSpacing: 3, zIndex: 4 },
        content: 'CERTIFICADO',
      }),
      el({
        type: 'text',
        name: 'Subtítulo',
        position: { x: 15, y: 66 },
        size: { width: 180, height: 8 },
        style: { fontSize: 10, textAlign: 'center', color: '#666', letterSpacing: 2, textTransform: 'uppercase', zIndex: 5 },
        content: 'DE CONFORMIDAD',
      }),
      el({
        type: 'divider',
        name: 'Separador',
        position: { x: 40, y: 77 },
        size: { width: 130, height: 1 },
        style: { zIndex: 6 },
        dividerConfig: { orientation: 'horizontal', color: '#b8962e', thickness: 1, style: 'solid' },
      }),
      // Cuerpo del texto
      el({
        type: 'text',
        name: 'Texto introductorio',
        position: { x: 20, y: 90 },
        size: { width: 170, height: 12 },
        style: { fontSize: 10, textAlign: 'center', color: '#555', lineHeight: 1.6, zIndex: 7 },
        content: 'Por medio de la presente se certifica que:',
      }),
      el({
        type: 'variable',
        name: 'Nombre del destinatario',
        position: { x: 20, y: 110 },
        size: { width: 170, height: 14 },
        style: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: '#1a3a5c', zIndex: 8 },
        variableName: rvar('nombre_destinatario'),
      }),
      el({
        type: 'text',
        name: 'Cuerpo certificado',
        position: { x: 20, y: 132 },
        size: { width: 170, height: 40 },
        style: { fontSize: 10, textAlign: 'center', color: '#444', lineHeight: 1.8, zIndex: 9 },
        content: 'Ha cumplido satisfactoriamente con todos los requisitos establecidos para la actividad correspondiente.',
      }),
      el({
        type: 'variable',
        name: 'Descripción actividad',
        position: { x: 30, y: 175 },
        size: { width: 150, height: 14 },
        style: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', color: '#333', zIndex: 9 },
        variableName: rvar('descripcion_actividad'),
      }),
      el({
        type: 'divider',
        name: 'Sep cuerpo',
        position: { x: 40, y: 200 },
        size: { width: 130, height: 1 },
        style: { zIndex: 10 },
        dividerConfig: { orientation: 'horizontal', color: '#b8962e', thickness: 1, style: 'solid' },
      }),
      el({
        type: 'variable',
        name: 'Ciudad y fecha',
        position: { x: 20, y: 210 },
        size: { width: 170, height: 8 },
        style: { fontSize: 9, textAlign: 'center', color: '#888', zIndex: 11 },
        variableName: rvar('fecha'),
      }),
      // Firmas
      el({
        type: 'signature',
        name: 'Firma autoridad',
        position: { x: 65, y: 240 },
        size: { width: 80, height: 22 },
        style: { borderTopWidth: 1, borderColor: '#333', borderStyle: 'solid', textAlign: 'center', fontSize: 9, zIndex: 12 },
        signatureConfig: [{ title: 'REPRESENTANTE LEGAL', name: '' }],
      }),
    ],
  };
}

// ─── Template 6: Volanteo / Visita de Campo ────────────────────────────────

function makeVolanteo(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Registro de Volanteo',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header
      el({
        type: 'logo',
        name: 'Logo',
        position: { x: 10, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Título',
        position: { x: 58, y: 8 },
        size: { width: 94, height: 12 },
        style: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', color: '#333', textTransform: 'uppercase', zIndex: 2 },
        content: 'REGISTRO DE VOLANTEO',
      }),
      el({
        type: 'logo',
        name: 'Logo derecho',
        position: { x: 160, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador',
        position: { x: 10, y: 24 },
        size: { width: W, height: 1 },
        style: { zIndex: 3 },
        dividerConfig: { orientation: 'horizontal', color: '#ddd', thickness: 1.5, style: 'solid' },
      }),
      // Info bar
      el({
        type: 'rectangle',
        name: 'Fondo info',
        position: { x: 10, y: 26 },
        size: { width: W, height: 10 },
        style: { backgroundColor: '#f5f5f5', borderColor: '#ddd', borderWidth: 1, borderStyle: 'solid', zIndex: 4 },
      }),
      el({
        type: 'variable',
        name: 'CS',
        position: { x: 12, y: 27.5 },
        size: { width: 40, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'CS: ',
        variableName: rvar('cs'),
      }),
      el({
        type: 'variable',
        name: 'Contratista',
        position: { x: 58, y: 27.5 },
        size: { width: 65, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Contratista: ',
        variableName: rvar('contratista'),
      }),
      el({
        type: 'variable',
        name: 'Fecha',
        position: { x: 130, y: 27.5 },
        size: { width: 70, height: 7 },
        style: { fontSize: 8, color: '#222', zIndex: 5 },
        content: 'Fecha: ',
        variableName: rvar('fecha_corte'),
      }),
      // Section tabla volanteo
      el({
        type: 'heading',
        name: 'Sección tabla',
        position: { x: 10, y: 40 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '1. DETALLE DE VISITA',
      }),
      el({
        type: 'table',
        name: 'Tabla visita',
        position: { x: 10, y: 49 },
        size: { width: W, height: 60 },
        style: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
        tableData: normalizeTableData({
          style: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
          tableData: {
            headers: ['N°', 'Dirección', 'Nombre Usuario', 'Estado', 'Observación'],
            rows: [
              ['1', '', '', 'Visitado', ''],
              ['2', '', '', 'Ausente', ''],
              ['3', '', '', 'Visitado', ''],
              ['4', '', '', '', ''],
              ['5', '', '', '', ''],
            ],
          } as unknown as NonNullable<TemplateElement['tableData']>,
        }),
      }),
      // Section fotos
      el({
        type: 'heading',
        name: 'Sección fotos',
        position: { x: 10, y: 112 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0056b3', borderBottomWidth: 1, borderColor: '#0056b3', borderStyle: 'solid', zIndex: 6 },
        content: '2. EVIDENCIAS FOTOGRÁFICAS',
      }),
      el({
        type: 'photo-grid',
        name: 'Fotos volanteo',
        position: { x: 10, y: 121 },
        size: { width: W, height: 145 },
        style: { backgroundColor: '#f7f6ff', borderColor: '#6d4cff', borderWidth: 1.2, borderStyle: 'solid', borderRadius: 3, zIndex: 8 },
        photoConfig: { count: 4, labels: ['FOTO 1', 'FOTO 2', 'FOTO 3', 'FOTO 4'], showLabels: false },
      }),
      // Firmas
      el({
        type: 'signature',
        name: 'Firma responsable',
        position: { x: 65, y: 270 },
        size: { width: 80, height: 18 },
        style: { borderTopWidth: 1, borderColor: '#333', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 9 },
        signatureConfig: [{ title: 'RESPONSABLE DE VISITA', name: '' }],
      }),
      // Footer
      el({
        type: 'text',
        name: 'Footer',
        position: { x: 10, y: 290 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#666', textAlign: 'center', borderTopWidth: 1, borderColor: '#ddd', borderStyle: 'solid', zIndex: 10 },
        content: 'Registro de volanteo — Documento interno',
      }),
    ],
  };
}

// --- Template 7: Informe de Limpieza Estandar (full page) --------------------

function makeInformeLimpiezaEstandar(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Informe de Limpieza Estandar',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header
      el({
        type: 'logo',
        name: 'Logo izquierdo',
        position: { x: 10, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Titulo',
        position: { x: 56, y: 8 },
        size: { width: 98, height: 12 },
        style: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', color: '#115e59', textTransform: 'uppercase', zIndex: 2 },
        content: 'INFORME DE LIMPIEZA ESTANDAR',
      }),
      el({
        type: 'logo',
        name: 'Logo derecho',
        position: { x: 160, y: 5 },
        size: { width: 40, height: 18 },
        style: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', borderWidth: 1, objectFit: 'contain', zIndex: 1 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador header',
        position: { x: 10, y: 24 },
        size: { width: W, height: 1 },
        style: { zIndex: 3 },
        dividerConfig: { orientation: 'horizontal', color: '#d1d5db', thickness: 1.4, style: 'solid' },
      }),

      // Info bar
      el({
        type: 'rectangle',
        name: 'Fondo info',
        position: { x: 10, y: 26 },
        size: { width: W, height: 12 },
        style: { backgroundColor: '#f0fdfa', borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid', zIndex: 4 },
      }),
      el({
        type: 'variable',
        name: 'Cliente',
        position: { x: 12, y: 28 },
        size: { width: 58, height: 7 },
        style: { fontSize: 8, color: '#134e4a', zIndex: 5 },
        content: 'Cliente: ',
        variableName: rvar('cliente'),
      }),
      el({
        type: 'variable',
        name: 'Ubicacion',
        position: { x: 73, y: 28 },
        size: { width: 60, height: 7 },
        style: { fontSize: 8, color: '#134e4a', zIndex: 5 },
        content: 'Ubicacion: ',
        variableName: rvar('ubicacion'),
      }),
      el({
        type: 'variable',
        name: 'Fecha',
        position: { x: 136, y: 28 },
        size: { width: 64, height: 7 },
        style: { fontSize: 8, color: '#134e4a', zIndex: 5 },
        content: 'Fecha: ',
        variableName: rvar('fecha'),
      }),
      el({
        type: 'variable',
        name: 'Orden servicio',
        position: { x: 12, y: 32 },
        size: { width: 58, height: 7 },
        style: { fontSize: 8, color: '#134e4a', zIndex: 5 },
        content: 'Orden: ',
        variableName: rvar('orden_servicio'),
      }),
      el({
        type: 'variable',
        name: 'Inspector',
        position: { x: 73, y: 32 },
        size: { width: 127, height: 7 },
        style: { fontSize: 8, color: '#134e4a', zIndex: 5 },
        content: 'Inspector: ',
        variableName: rvar('inspector'),
      }),

      // Section 1
      el({
        type: 'heading',
        name: 'Seccion resumen',
        position: { x: 10, y: 41 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f766e', borderBottomWidth: 1, borderColor: '#0f766e', borderStyle: 'solid', zIndex: 6 },
        content: '1. RESUMEN DEL SERVICIO',
      }),
      el({
        type: 'table',
        name: 'Tabla resumen',
        position: { x: 10, y: 49 },
        size: { width: W, height: 42 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 7 },
        tableData: {
          rowCount: 4,
          colCount: 4,
          borderColor: '#cbd5e1',
          colWidths: [25, 25, 25, 25],
          rowHeights: [25, 25, 25, 25],
          data: [
            ['Campo', 'Valor', 'Campo', 'Valor'],
            ['Tipo de servicio', "{{ report.data.get('tipo_servicio', '-') }}", 'Area intervenida', "{{ report.data.get('area_intervenida', '-') }}"],
            ['Responsable', "{{ report.data.get('responsable', '-') }}", 'Turno', "{{ report.data.get('turno', '-') }}"],
            ['Producto principal', "{{ report.data.get('producto_principal', '-') }}", 'Resultado', "{{ report.data.get('resultado', '-') }}"],
          ],
        },
      }),

      // Section 2
      el({
        type: 'heading',
        name: 'Seccion checklist',
        position: { x: 10, y: 94 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f766e', borderBottomWidth: 1, borderColor: '#0f766e', borderStyle: 'solid', zIndex: 8 },
        content: '2. CHECKLIST DE LIMPIEZA',
      }),
      el({
        type: 'table',
        name: 'Tabla checklist',
        position: { x: 10, y: 102 },
        size: { width: W, height: 66 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 7.6, zIndex: 9 },
        tableData: {
          rowCount: 6,
          colCount: 4,
          borderColor: '#cbd5e1',
          colWidths: [12, 48, 20, 20],
          rowHeights: [16.667, 16.667, 16.667, 16.667, 16.666, 16.666],
          data: [
            ['#', 'Actividad', 'Estado', 'Observacion'],
            ['1', 'Retiro de residuos visibles', 'OK', ''],
            ['2', 'Desinfeccion de superficies', 'OK', ''],
            ['3', 'Limpieza de puntos de contacto', 'OK', ''],
            ['4', 'Control de olores', 'OK', ''],
            ['5', 'Cierre y validacion', "{{ report.data.get('estado_validacion', '-') }}", "{{ report.data.get('observaciones', '-') }}"],
          ],
        },
      }),

      // Section 3
      el({
        type: 'heading',
        name: 'Seccion evidencia',
        position: { x: 10, y: 172 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f766e', borderBottomWidth: 1, borderColor: '#0f766e', borderStyle: 'solid', zIndex: 10 },
        content: '3. EVIDENCIA FOTOGRAFICA',
      }),
      el({
        type: 'photo-grid',
        name: 'Fotos limpieza',
        position: { x: 10, y: 180 },
        size: { width: W, height: 78 },
        style: { backgroundColor: '#f0fdfa', borderColor: '#14b8a6', borderWidth: 1.2, borderStyle: 'solid', borderRadius: 3, zIndex: 11 },
        photoConfig: { count: 4, labels: ['ANTES', 'PROCESO', 'DESPUES', 'DETALLE'], showLabels: true },
      }),

      // Signatures
      el({
        type: 'signature',
        name: 'Firma supervisor',
        position: { x: 20, y: 264 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 12 },
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma cliente',
        position: { x: 85, y: 264 },
        size: { width: 55, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 12 },
        signatureConfig: [{ title: 'CLIENTE', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma contratista',
        position: { x: 150, y: 264 },
        size: { width: 50, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 12 },
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      }),
      el({
        type: 'text',
        name: 'Footer',
        position: { x: 10, y: 289 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#64748b', textAlign: 'center', borderTopWidth: 1, borderColor: '#cbd5e1', borderStyle: 'solid', zIndex: 13 },
        content: 'Informe de limpieza estandar - Documento interno',
      }),
    ],
  };
}

// --- Template 8: Acta de Conformidad (full page) ------------------------------

function makeActaConformidad(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Acta de Conformidad',
    pageSettings: { ...PAGE, backgroundColor: '#fffdf8' },
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Decorative frame
      el({
        type: 'rectangle',
        name: 'Marco principal',
        position: { x: 6, y: 6 },
        size: { width: 198, height: 285 },
        style: { backgroundColor: 'transparent', borderColor: '#a16207', borderWidth: 2, borderStyle: 'solid', zIndex: 1 },
      }),

      // Header
      el({
        type: 'logo',
        name: 'Logo izquierda',
        position: { x: 12, y: 11 },
        size: { width: 35, height: 16 },
        style: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, objectFit: 'contain', zIndex: 2 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Titulo acta',
        position: { x: 48, y: 14 },
        size: { width: 114, height: 12 },
        style: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: '#7c2d12', textTransform: 'uppercase', zIndex: 3 },
        content: 'ACTA DE CONFORMIDAD',
      }),
      el({
        type: 'logo',
        name: 'Logo derecha',
        position: { x: 163, y: 11 },
        size: { width: 35, height: 16 },
        style: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, objectFit: 'contain', zIndex: 2 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador cabecera',
        position: { x: 10, y: 29 },
        size: { width: W, height: 1 },
        style: { zIndex: 4 },
        dividerConfig: { orientation: 'horizontal', color: '#f59e0b', thickness: 1.4, style: 'solid' },
      }),

      // Detail box
      el({
        type: 'rectangle',
        name: 'Fondo datos',
        position: { x: 10, y: 33 },
        size: { width: W, height: 26 },
        style: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 1, borderStyle: 'solid', zIndex: 5 },
      }),
      el({
        type: 'variable',
        name: 'Numero acta',
        position: { x: 13, y: 36 },
        size: { width: 85, height: 7 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 6 },
        content: 'No. Acta: ',
        variableName: rvar('acta_numero'),
      }),
      el({
        type: 'variable',
        name: 'Fecha acta',
        position: { x: 136, y: 36 },
        size: { width: 64, height: 7 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 6 },
        content: 'Fecha: ',
        variableName: rvar('fecha'),
      }),
      el({
        type: 'variable',
        name: 'Cliente',
        position: { x: 13, y: 43 },
        size: { width: 90, height: 7 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 6 },
        content: 'Cliente: ',
        variableName: rvar('cliente'),
      }),
      el({
        type: 'variable',
        name: 'Proyecto',
        position: { x: 106, y: 43 },
        size: { width: 94, height: 7 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 6 },
        content: 'Proyecto: ',
        variableName: rvar('proyecto'),
      }),
      el({
        type: 'variable',
        name: 'Ubicacion',
        position: { x: 13, y: 50 },
        size: { width: 187, height: 7 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 6 },
        content: 'Ubicacion: ',
        variableName: rvar('ubicacion'),
      }),

      // Section 1
      el({
        type: 'heading',
        name: 'Seccion detalle',
        position: { x: 10, y: 63 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#9a3412', borderBottomWidth: 1, borderColor: '#9a3412', borderStyle: 'solid', zIndex: 7 },
        content: '1. DETALLE DE CONFORMIDAD',
      }),
      el({
        type: 'table',
        name: 'Tabla conformidad',
        position: { x: 10, y: 71 },
        size: { width: W, height: 82 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 7.6, zIndex: 8 },
        tableData: {
          rowCount: 5,
          colCount: 4,
          borderColor: '#cbd5e1',
          colWidths: [12, 46, 16, 26],
          rowHeights: [20, 20, 20, 20, 20],
          data: [
            ['Item', 'Descripcion', 'Cumple', 'Observacion'],
            ['1', 'Entrega de servicio segun alcance', 'SI', ''],
            ['2', 'Calidad de ejecucion', "{{ report.data.get('calidad_ejecucion', '-') }}", ''],
            ['3', 'Plazo de entrega', "{{ report.data.get('cumplimiento_plazo', '-') }}", ''],
            ['4', 'Comentario final', "{{ report.data.get('estado_conformidad', '-') }}", "{{ report.data.get('observaciones', '-') }}"],
          ],
        },
      }),

      // Section 2
      el({
        type: 'heading',
        name: 'Seccion declaracion',
        position: { x: 10, y: 157 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#9a3412', borderBottomWidth: 1, borderColor: '#9a3412', borderStyle: 'solid', zIndex: 9 },
        content: '2. DECLARACION',
      }),
      el({
        type: 'rectangle',
        name: 'Area declaracion',
        position: { x: 10, y: 165 },
        size: { width: W, height: 50 },
        style: { backgroundColor: '#fffefb', borderColor: '#fed7aa', borderWidth: 1, borderStyle: 'dotted', zIndex: 10 },
      }),
      el({
        type: 'text',
        name: 'Texto declaracion',
        position: { x: 14, y: 170 },
        size: { width: W - 8, height: 16 },
        style: { fontSize: 8, color: '#7c2d12', lineHeight: 1.6, zIndex: 11 },
        content: 'Se deja constancia que el servicio ha sido recibido a satisfaccion y cumple los criterios definidos por las partes.',
      }),
      el({
        type: 'variable',
        name: 'Detalle conformidad',
        position: { x: 14, y: 190 },
        size: { width: W - 8, height: 8 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 11 },
        content: 'Detalle: ',
        variableName: rvar('detalle_conformidad'),
      }),
      el({
        type: 'variable',
        name: 'Representante cliente',
        position: { x: 14, y: 200 },
        size: { width: W - 8, height: 8 },
        style: { fontSize: 8, color: '#7c2d12', zIndex: 11 },
        content: 'Representante cliente: ',
        variableName: rvar('representante_cliente'),
      }),

      el({
        type: 'divider',
        name: 'Separador firmas',
        position: { x: 10, y: 220 },
        size: { width: W, height: 1 },
        style: { zIndex: 12 },
        dividerConfig: { orientation: 'horizontal', color: '#f59e0b', thickness: 1.2, style: 'solid' },
      }),

      // Signatures
      el({
        type: 'signature',
        name: 'Firma cliente',
        position: { x: 20, y: 237 },
        size: { width: 55, height: 22 },
        style: { borderTopWidth: 1, borderColor: '#7c2d12', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 13 },
        signatureConfig: [{ title: 'CLIENTE', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma supervisor',
        position: { x: 85, y: 237 },
        size: { width: 55, height: 22 },
        style: { borderTopWidth: 1, borderColor: '#7c2d12', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 13 },
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma contratista',
        position: { x: 150, y: 237 },
        size: { width: 50, height: 22 },
        style: { borderTopWidth: 1, borderColor: '#7c2d12', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 13 },
        signatureConfig: [{ title: 'CONTRATISTA', name: '' }],
      }),

      // Footer
      el({
        type: 'text',
        name: 'Footer acta',
        position: { x: 10, y: 289 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#78716c', textAlign: 'center', borderTopWidth: 1, borderColor: '#fdba74', borderStyle: 'solid', zIndex: 14 },
        content: 'Acta de conformidad - Documento formal',
      }),
    ],
  };
}

// --- Template 9: Hoja Membretada Base (full page) -----------------------------

function makeHojaMembretadaBase(): CanvasDocument {
  const W = PAGE.width - 20;
  return {
    id: uid('doc'),
    name: 'Hoja Membretada Base',
    pageSettings: PAGE,
    version: 1,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    elements: [
      // Header band
      el({
        type: 'rectangle',
        name: 'Banda superior',
        position: { x: 10, y: 6 },
        size: { width: W, height: 26 },
        style: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc', borderWidth: 1, borderStyle: 'solid', zIndex: 1 },
      }),
      el({
        type: 'logo',
        name: 'Logo izquierdo',
        position: { x: 14, y: 9 },
        size: { width: 34, height: 18 },
        style: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', borderWidth: 1, objectFit: 'contain', zIndex: 2 },
        variableName: 'logo_left',
      }),
      el({
        type: 'heading',
        name: 'Titulo membretado',
        position: { x: 52, y: 11 },
        size: { width: 106, height: 10 },
        style: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', color: '#0c4a6e', textTransform: 'uppercase', zIndex: 3 },
        content: 'HOJA MEMBRETADA BASE',
      }),
      el({
        type: 'text',
        name: 'Subtitulo entidad',
        position: { x: 52, y: 20 },
        size: { width: 106, height: 7 },
        style: { fontSize: 8, color: '#0369a1', textAlign: 'center', zIndex: 3 },
        content: 'Area administrativa - Control documental',
      }),
      el({
        type: 'logo',
        name: 'Logo derecho',
        position: { x: 162, y: 9 },
        size: { width: 34, height: 18 },
        style: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', borderWidth: 1, objectFit: 'contain', zIndex: 2 },
        variableName: 'logo_right',
      }),
      el({
        type: 'divider',
        name: 'Separador header',
        position: { x: 10, y: 34 },
        size: { width: W, height: 1 },
        style: { zIndex: 4 },
        dividerConfig: { orientation: 'horizontal', color: '#0284c7', thickness: 1.4, style: 'solid' },
      }),

      // Metadata table
      el({
        type: 'table',
        name: 'Tabla metadatos',
        position: { x: 10, y: 38 },
        size: { width: W, height: 24 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, fontSize: 8, zIndex: 5 },
        tableData: {
          rowCount: 2,
          colCount: 4,
          borderColor: '#cbd5e1',
          colWidths: [28, 24, 24, 24],
          rowHeights: [45, 55],
          data: [
            ['Cliente', 'Fecha', 'Codigo', 'Version'],
            ["{{ report.data.get('cliente', '-') }}", "{{ report.data.get('fecha', '-') }}", "{{ report.data.get('codigo_documento', '-') }}", "{{ report.data.get('version_documento', '-') }}"],
          ],
        },
      }),

      // Body area
      el({
        type: 'heading',
        name: 'Titulo cuerpo',
        position: { x: 10, y: 67 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0c4a6e', borderBottomWidth: 1, borderColor: '#0c4a6e', borderStyle: 'solid', zIndex: 6 },
        content: 'CUERPO DEL DOCUMENTO',
      }),
      el({
        type: 'rectangle',
        name: 'Area de contenido',
        position: { x: 10, y: 75 },
        size: { width: W, height: 186 },
        style: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'dotted', zIndex: 7 },
      }),
      el({
        type: 'text',
        name: 'Ayuda contenido',
        position: { x: 13, y: 79 },
        size: { width: W - 6, height: 10 },
        style: { fontSize: 8, color: '#64748b', zIndex: 8 },
        content: 'Escriba aqui el contenido principal del documento.',
      }),

      // Writing guide lines
      el({
        type: 'divider',
        name: 'Linea guia 1',
        position: { x: 13, y: 92 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),
      el({
        type: 'divider',
        name: 'Linea guia 2',
        position: { x: 13, y: 107 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),
      el({
        type: 'divider',
        name: 'Linea guia 3',
        position: { x: 13, y: 122 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),
      el({
        type: 'divider',
        name: 'Linea guia 4',
        position: { x: 13, y: 137 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),
      el({
        type: 'divider',
        name: 'Linea guia 5',
        position: { x: 13, y: 152 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),
      el({
        type: 'divider',
        name: 'Linea guia 6',
        position: { x: 13, y: 167 },
        size: { width: W - 6, height: 1 },
        style: { zIndex: 8 },
        dividerConfig: { orientation: 'horizontal', color: '#cbd5e1', thickness: 0.8, style: 'dashed' },
      }),

      // Approval section
      el({
        type: 'heading',
        name: 'Seccion firmas',
        position: { x: 10, y: 225 },
        size: { width: W, height: 7 },
        style: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#0c4a6e', borderBottomWidth: 1, borderColor: '#0c4a6e', borderStyle: 'solid', zIndex: 9 },
        content: 'FIRMAS DE APROBACION',
      }),
      el({
        type: 'signature',
        name: 'Firma elaboro',
        position: { x: 18, y: 242 },
        size: { width: 52, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'ELABORO', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma reviso',
        position: { x: 79, y: 242 },
        size: { width: 52, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'REVISO', name: '' }],
      }),
      el({
        type: 'signature',
        name: 'Firma aprobo',
        position: { x: 140, y: 242 },
        size: { width: 52, height: 20 },
        style: { borderTopWidth: 1, borderColor: '#0f172a', borderStyle: 'solid', textAlign: 'center', fontSize: 8, zIndex: 10 },
        signatureConfig: [{ title: 'APROBO', name: '' }],
      }),
      el({
        type: 'variable',
        name: 'Contacto',
        position: { x: 10, y: 282 },
        size: { width: W, height: 7 },
        style: { fontSize: 7.5, color: '#0369a1', textAlign: 'center', zIndex: 11 },
        content: 'Contacto: ',
        variableName: rvar('contacto_empresa'),
      }),
      el({
        type: 'text',
        name: 'Footer membretado',
        position: { x: 10, y: 289 },
        size: { width: W, height: 5 },
        style: { fontSize: 7, color: '#64748b', textAlign: 'center', borderTopWidth: 1, borderColor: '#bae6fd', borderStyle: 'solid', zIndex: 12 },
        content: 'Hoja membretada base - Uso interno',
      }),
    ],
  };
}

// ─── Catalog ───────────────────────────────────────────────────────────────────

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'reportes' | 'fichas' | 'certificados' | 'basico';
  thumbnail: string; // color hex for preview swatch
  tags: string[];
  build: () => CanvasDocument;
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'photo-panel',
    name: 'Panel Fotográfico',
    description: 'Header con logos, barra de info, grid de 4 fotos etiquetadas y firmas.',
    category: 'reportes',
    thumbnail: '#6d4cff',
    tags: ['fotos', 'technical_report', 'supervisión'],
    build: makePhotoPanel,
  },
  {
    id: 'reporte-tecnico',
    name: 'Reporte Técnico',
    description: 'Estructura completa: datos técnicos, observaciones, evidencias y firmas.',
    category: 'reportes',
    thumbnail: '#0056b3',
    tags: ['técnico', 'technical_report', 'grilla', 'fotos'],
    build: makeReporteTecnico,
  },
  {
    id: 'ficha-tecnica',
    name: 'Ficha Técnica',
    description: 'Ficha con datos generales, descripción de actividad, fotos y 3 firmas.',
    category: 'fichas',
    thumbnail: '#0ea5e9',
    tags: ['ficha_tecnica', 'actividad', 'tabla'],
    build: makeFichaTecnica,
  },
  {
    id: 'volanteo',
    name: 'Registro de Volanteo',
    description: 'Tabla de visitas de campo con columnas de estado y fotos de evidencia.',
    category: 'reportes',
    thumbnail: '#10b981',
    tags: ['volanteo', 'visita', 'tabla', 'fotos'],
    build: makeVolanteo,
  },
  {
    id: 'informe-limpieza-estandar',
    name: 'Informe de Limpieza Estandar',
    description: 'Formato integral con resumen, checklist tabular, evidencia fotografica y firmas.',
    category: 'reportes',
    thumbnail: '#14b8a6',
    tags: ['limpieza', 'checklist', 'tabla', 'nuevo'],
    build: makeInformeLimpiezaEstandar,
  },
  {
    id: 'acta-conformidad',
    name: 'Acta de Conformidad',
    description: 'Acta formal con marco, tabla de conformidad, declaracion y area de firmas.',
    category: 'certificados',
    thumbnail: '#f59e0b',
    tags: ['acta', 'conformidad', 'tabla', 'nuevo'],
    build: makeActaConformidad,
  },
  {
    id: 'hoja-membretada-base',
    name: 'Hoja Membretada Base',
    description: 'Membrete corporativo con metadatos, lineas guia de contenido y firmas de aprobacion.',
    category: 'basico',
    thumbnail: '#0284c7',
    tags: ['membretada', 'base', 'corporativo', 'nuevo'],
    build: makeHojaMembretadaBase,
  },
  {
    id: 'certificado',
    name: 'Certificado',
    description: 'Diseño con borde decorativo, sello y espacio para datos del destinatario.',
    category: 'certificados',
    thumbnail: '#b8962e',
    tags: ['certificado', 'constancia', 'formal'],
    build: makeCertificado,
  },
  {
    id: 'hoja-blanco',
    name: 'Hoja en Blanco',
    description: 'Documento A4 básico con título, contenido libre y número de página.',
    category: 'basico',
    thumbnail: '#6b7280',
    tags: ['básico', 'simple', 'libre'],
    build: makeHojaBlanco,
  },
];

export const PRESET_CATEGORIES: { id: PresetTemplate['category']; label: string }[] = [
  { id: 'reportes', label: 'Reportes' },
  { id: 'fichas', label: 'Fichas' },
  { id: 'certificados', label: 'Certificados' },
  { id: 'basico', label: 'Básico' },
];
