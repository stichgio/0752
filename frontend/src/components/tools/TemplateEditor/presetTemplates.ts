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

function uid(prefix = 'el'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

const PAGE = { width: 210, height: 297, marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10, backgroundColor: '#ffffff' };

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
        tableData: {
          headers: ['Parámetro', 'Valor', 'Parámetro', 'Valor'],
          rows: [
            ['Código Infraestructura', "{{ report.data.get('codigo_infraestructura', '-') }}", 'Suministro', "{{ report.data.get('suministro', '-') }}"],
            ['Contratista', "{{ report.data.get('contratista', '-') }}", 'CS / Orden', "{{ report.data.get('cs', '-') }}"],
            ['Fecha de Corte', "{{ report.data.get('fecha_corte', '-') }}", '', ''],
          ],
        },
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
        tableData: {
          headers: ['N°', 'Dirección', 'Nombre Usuario', 'Estado', 'Observación'],
          rows: [
            ['1', '', '', 'Visitado', ''],
            ['2', '', '', 'Ausente', ''],
            ['3', '', '', 'Visitado', ''],
            ['4', '', '', '', ''],
            ['5', '', '', '', ''],
          ],
        },
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
