// Export to Jinja2/HTML
import type { TemplateElement, CanvasDocument } from './canvasTypes';
import { normalizeTableData } from './utils/elementDefaults';
import { normalizePageSettings, normalizeVariableRegistry } from './canvasTypes';
import { ensureCanvasDocument, getPageElements } from './documentModel';

// ─── SVG placeholder for preview ──────────────────────────────────────────────

function makeSvgPlaceholder(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
    <rect fill="#e5e7eb" width="200" height="150"/>
    <text fill="#9ca3af" font-family="Arial" font-size="28" text-anchor="middle" x="100" y="75">&#128247;</text>
    <text fill="#9ca3af" font-family="Arial" font-size="11" text-anchor="middle" x="100" y="105">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ─── HTML escape that preserves Jinja2 {{ }} expressions ──────────────────────

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Smart escape: preserves Jinja2 `{{ ... }}` expressions while escaping
 * everything else (< > & " ').  This is needed for table cells that mix
 * static text with `{{ report.data.get('field', '-') }}`.
 */
function escapeHtmlPreserveJinja(text: string): string {
  // Split on {{ ... }} blocks, escape only the non-Jinja parts
  return text.replace(
    /(\{\{[^}]*\}\})|([^{]+|{)/g,
    (_match, jinjaBlock, plain) => {
      if (jinjaBlock) return jinjaBlock; // keep as-is
      if (plain) return escapeHtml(plain);
      return '';
    }
  );
}

function flattenElementsForExport(elements: TemplateElement[]): TemplateElement[] {
  const flattened: TemplateElement[] = [];

  elements.forEach((element) => {
    if (element.visible === false) return;

    if (element.type !== 'group') {
      flattened.push(element);
      return;
    }

    const groupChildren = (element.groupChildren || [])
      .filter((child) => child.visible !== false && child.type !== 'group')
      .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0));
    const groupZ = element.style.zIndex || 1;

    groupChildren.forEach((child, index) => {
      const absoluteChild: TemplateElement = JSON.parse(JSON.stringify(child));
      absoluteChild.position = {
        x: element.position.x + child.position.x,
        y: element.position.y + child.position.y,
      };
      absoluteChild.style = {
        ...absoluteChild.style,
        zIndex: (groupZ * 1000) + (child.style.zIndex || index + 1),
      };
      flattened.push(absoluteChild);
    });
  });

  return flattened;
}

function getExportPages(doc: CanvasDocument): Array<{ id: string; name: string; elements: TemplateElement[] }> {
  const normalized = ensureCanvasDocument(doc);
  return (normalized.pages || []).map((page) => ({
    id: page.id,
    name: page.name,
    elements: flattenElementsForExport(getPageElements(normalized, page.id)).sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)),
  }));
}

// ─── Jinja2 / HTML export ──────────────────────────────────────────────────────

export function exportToJinja2(doc: CanvasDocument): string {
  const normalizedDoc = ensureCanvasDocument(doc);
  const pageSettings = normalizePageSettings(normalizedDoc.pageSettings);
  const pages = getExportPages(normalizedDoc);

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ report.title | default('${normalizedDoc.name}') }}</title>
  <style>
    @page {
      size: ${pageSettings.width}mm ${pageSettings.height}mm;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, 'Segoe UI', Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .template-container {
      position: relative;
      width: ${pageSettings.width}mm;
      height: ${pageSettings.height}mm;
      background: ${pageSettings.backgroundColor || '#ffffff'};
      overflow: hidden;
      page-break-after: always;
    }

    .template-container:last-of-type {
      page-break-after: auto;
    }

    .element {
      position: absolute;
      overflow: hidden;
    }

    /* WeasyPrint-compatible photo grid */
    .photo-grid { display: grid; gap: 2mm; width: 100%; height: 100%; box-sizing: border-box; }
    .photo-cell { overflow: hidden; min-height: 0; min-width: 0; box-sizing: border-box; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 1mm; }
    .photo-cell-wrap { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; width: 100%; height: 100%; min-height: 0; padding: 1mm; box-sizing: border-box; overflow: hidden; }
    .photo-media { flex: 1 1 auto; min-height: 0; width: 100%; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .photo-media > img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
    .photo-label { flex-shrink: 0; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; margin-top: 1mm; text-align: center; }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border: 1px solid #d1d5db;
      padding: 1.5mm 2mm;
      font-size: 7.5pt;
    }

    th {
      background: #f3f4f6;
      font-weight: 700;
      color: #555;
    }

    .signature-line {
      border-top: 1px solid #374151;
      width: 100%;
      padding-top: 2mm;
      text-align: center;
    }

    .signature-title {
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      color: #333;
    }

    .signature-name {
      font-size: 7.5pt;
      color: #555;
    }
  </style>
</head>
<body>
  {% for report in reports %}
`;

  for (const page of pages) {
    html += `  <div class="template-container" data-page-id="${page.id}" data-page-name="${escapeHtml(page.name)}">\n`;
    for (const el of page.elements) {
      const style = generateElementStyle(el);
      const content = generateElementContent(el);
      if (content === null) continue;
      html += `    <div class="element" data-type="${el.type}" style="${style}">${content}</div>\n`;
    }
    html += '  </div>\n';
  }

  html += `  {% endfor %}
</body>
</html>`;

  return html;
}

function generateElementStyle(el: TemplateElement): string {
  const styles: string[] = [
    `left: ${el.position.x}mm`,
    `top: ${el.position.y}mm`,
    `width: ${el.size.width}mm`,
    `height: ${el.size.height}mm`,
    `z-index: ${el.style.zIndex || 1}`,
  ];

  // Logo/image elements should have transparent background by default
  // to avoid ugly outlines on PNG images
  const isMediaElement = el.type === 'logo' || el.type === 'image';
  const normalizedMediaBg = (el.style.backgroundColor || '').trim().toLowerCase();
  const isDefaultMediaBackground = [
    '',
    'transparent',
    '#fff',
    '#ffffff',
    '#f3f4f6',
    '#e5e7eb',
  ].includes(normalizedMediaBg);

  if (el.style.backgroundColor && el.style.backgroundColor !== 'transparent') {
    if (!isMediaElement || !isDefaultMediaBackground) {
      styles.push(`background-color: ${el.style.backgroundColor}`);
    }
  }

  if (el.style.color) {
    styles.push(`color: ${el.style.color}`);
  }

  if (el.style.fontSize) {
    styles.push(`font-size: ${el.style.fontSize}pt`);
  }

  if (el.style.fontFamily) {
    styles.push(`font-family: '${el.style.fontFamily}', sans-serif`);
  }

  if (el.style.fontWeight) {
    styles.push(`font-weight: ${el.style.fontWeight}`);
  }

  if (el.style.textAlign) {
    styles.push(`text-align: ${el.style.textAlign}`);
  }

  if (el.style.textTransform) {
    styles.push(`text-transform: ${el.style.textTransform}`);
  }

  if (el.style.lineHeight) {
    styles.push(`line-height: ${el.style.lineHeight}`);
  }

  if (el.style.letterSpacing) {
    styles.push(`letter-spacing: ${el.style.letterSpacing}px`);
  }

  if (el.style.padding) {
    styles.push(`padding: ${el.style.padding}px`);
  }

  // Full border shorthand — skip default borders on media elements (logo, image)
  // to avoid ugly outlines around transparent PNG images
  if (el.style.borderWidth && el.style.borderStyle !== 'none' && !isMediaElement) {
    styles.push(`border: ${el.style.borderWidth}px ${el.style.borderStyle || 'solid'} ${el.style.borderColor || '#000'}`);
  }

  // Individual border sides (e.g. borderTopWidth, borderBottomWidth)
  if (el.style.borderTopWidth && !el.style.borderWidth) {
    styles.push(`border-top: ${el.style.borderTopWidth}px ${el.style.borderStyle || 'solid'} ${el.style.borderColor || '#000'}`);
  }
  if (el.style.borderBottomWidth && !el.style.borderWidth) {
    styles.push(`border-bottom: ${el.style.borderBottomWidth}px ${el.style.borderStyle || 'solid'} ${el.style.borderColor || '#000'}`);
  }

  if (el.style.borderRadius) {
    styles.push(`border-radius: ${el.style.borderRadius}${el.type === 'circle' ? '%' : 'mm'}`);
  }

  if (el.style.opacity !== undefined && el.style.opacity !== 1) {
    styles.push(`opacity: ${el.style.opacity}`);
  }

  // box-shadow is NOT supported by WeasyPrint — omit for PDF fidelity
  // if (el.style.boxShadow) { styles.push(`box-shadow: ${el.style.boxShadow}`); }

  // Rotation: WeasyPrint supports CSS transforms
  if (el.rotation) {
    styles.push(`transform: rotate(${el.rotation}deg)`);
    styles.push(`transform-origin: center center`);
  }

  return styles.join('; ');
}

/**
 * Generate element HTML content.  Returns `null` for types that should
 * be rendered purely via CSS (rectangle, container) — the caller skips
 * emitting a DOM node for those.
 */

/**
 * Build a photo grid using CSS Grid for perfect scaling.
 */
function buildPhotoGrid(
  count: number,
  oddPosition: 'left' | 'center' | 'right',
  labels: string[],
  showLabels: boolean,
): string {
  const cols = count <= 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);

  const rowPct = (100 / rows).toFixed(4);
  const colPct = (100 / cols).toFixed(4);
  let html = `<div class="photo-grid" style="grid-template-columns: repeat(${cols}, ${colPct}%); grid-template-rows: repeat(${rows}, ${rowPct}%); width: 100%; height: 100%; box-sizing: border-box;">`;

  for (let i = 0; i < count; i++) {
    const label = labels[i] || `Foto ${i + 1}`;
    const labelHtml = showLabels ? `<div class="photo-label">${escapeHtml(label)}</div>` : '';

    let cellGridStyle = '';
    if (i === count - 1 && count % 2 === 1 && cols === 2) {
      if (oddPosition === 'center') {
        cellGridStyle = 'grid-column: 1 / span 2; justify-self: center; width: 50%; ';
      } else if (oddPosition === 'right') {
        cellGridStyle = 'grid-column: 2 / span 1; ';
      }
    }

    const cellStyle = `${cellGridStyle}width: 100%; height: 100%; overflow: hidden; box-sizing: border-box; min-height: 0; min-width: 0;`;

    html += `<div class="photo-cell" style="${cellStyle}">`;
    html += `<div class="photo-cell-wrap">`;
    html += `<div class="photo-media" style="flex: 1 1 auto; min-height: 0; width: 100%; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">`;
    html += `{% if report.images|length > ${i} %}`;
    html += `<img src="{{ report.images[${i}].path }}" alt="{{ report.images[${i}].name | default('${escapeHtml(label)}') }}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; display: block;" />`;
    html += `{% else %}<span style="color:#999; font-size:10px;">Sin foto</span>{% endif %}`;
    html += `</div>`;
    html += labelHtml;
    html += `</div></div>`;
  }

  html += '</div>';
  return html;
}

/* fix: imagen-cortada — Generate WeasyPrint-compatible image CSS with objectFit fallback */
function generateImageCss(objectFit: string, widthMm: number, heightMm: number): string {
  const base = 'display: block';
  switch (objectFit) {
    case 'fill':
      return `${base}; width: 100%; height: 100%; object-fit: fill`;
    case 'none':
      return `${base}; object-fit: none`;
    case 'cover':
      return `${base}; width: 100%; height: 100%; object-fit: cover`;
    case 'contain':
    default:
      /* fix: imagen-cortada — max-width/max-height as WeasyPrint fallback for object-fit:contain */
      return `${base}; width: 100%; height: 100%; object-fit: contain; max-width: ${widthMm}mm; max-height: ${heightMm}mm`;
  }
}

function generateElementContent(el: TemplateElement): string | null {
  switch (el.type) {
    case 'group':
      return null;

    case 'text':
    case 'heading':
      return escapeHtml(el.content || '');

    case 'variable':
      // variableName holds a full Jinja2 expression, e.g. report.data.get('CENTRO', '-')
      return `{{ ${el.variableName || 'variable'} }}`;

    case 'logo': {
      /* fix: imagen-cortada */
      const logoCss = generateImageCss('contain', el.size.width, el.size.height);
      if (el.imageUrl) {
        return `<img src="${escapeHtml(el.imageUrl)}" style="${logoCss}" />`;
      }
      // Use variableName as Jinja2 var (defaults to logo_left)
      const logoVar = el.variableName || 'logo_left';
      return `{% if ${logoVar} %}<img src="{{ ${logoVar} }}" style="${logoCss}" />{% endif %}`;
    }

    case 'image': {
      if (el.imageUrl) {
        /* fix: imagen-cortada — default to contain instead of cover */
        const imgCss = generateImageCss(el.style.objectFit || 'contain', el.size.width, el.size.height);
        return `<img src="${escapeHtml(el.imageUrl)}" style="${imgCss}" />`;
      }
      return '';
    }

    case 'photo-grid': {
      const count = el.photoConfig?.count || 2;
      const oddPosition = el.photoConfig?.oddPosition || 'center';
      const showLabels = el.photoConfig?.showLabels || false;
      const labels = el.photoConfig?.labels || [];
      let gridHtml = '';
      if (el.content) {
        gridHtml += `<div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 1mm; text-transform: uppercase;">${escapeHtml(el.content)}</div>`;
      }
      gridHtml += buildPhotoGrid(count, oddPosition, labels, showLabels);
      return gridHtml;
    }

    case 'table': {
      if (!el.tableData) return '';
      const table = normalizeTableData(el);

      let tableHtml = '<table style="width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed;">';
      tableHtml += '<colgroup>';
      for (const width of table.colWidths) {
        tableHtml += `<col style="width: ${width}%;">`;
      }
      tableHtml += '</colgroup><tbody>';
      for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex++) {
        const row = table.data[rowIndex] || [];
        const rowHeight = table.rowHeights[rowIndex] ?? 0;
        tableHtml += `<tr style="height: ${rowHeight}%;">`;
        for (let colIndex = 0; colIndex < table.colCount; colIndex++) {
          const cell = row[colIndex] || '';
          // Use smart escape to preserve {{ jinja }} expressions in cells
          // Convert newlines to <br> for inline multi-line text
          const cellHtml = escapeHtmlPreserveJinja(cell).replace(/\n/g, '<br>');
          tableHtml += `<td style="border: 1px solid ${table.borderColor}; padding: 1.5mm 2mm; vertical-align: middle;">${cellHtml}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';

      return tableHtml;
    }

    case 'signature': {
      const title = el.title ?? el.signatureConfig?.[0]?.title ?? 'SUPERVISOR';
      const signatureName = el.signatureName ?? el.signatureConfig?.[0]?.name ?? '';
      return `
        <div class="signature-line">
          <div class="signature-title">${escapeHtml(title)}</div>
          ${signatureName ? `<div class="signature-name">${escapeHtml(signatureName)}</div>` : ''}
        </div>
      `;
    }

    case 'divider': {
      const div = el.dividerConfig;
      if (!div) return '';
      const isVertical = div.orientation === 'vertical';
      const thickness = div.thickness || 1;
      const color = div.color || '#374151';
      const lineStyle = div.style || 'solid';
      if (isVertical) {
        return `<div style="width: 0; height: 100%; border-left: ${thickness}px ${lineStyle} ${color};"></div>`;
      }
      return `<div style="width: 100%; height: 0; border-top: ${thickness}px ${lineStyle} ${color};"></div>`;
    }

    case 'rectangle':
      // Rendered purely via element style (border, background, etc.)
      return '';

    case 'circle':
      return '';

    case 'shape': {
      const shape = el.shapeConfig;
      if (!shape) return '';
      if (shape.kind === 'line') {
        return `<div style="width: 100%; height: 0; border-top: ${shape.strokeWidth || 1}px solid ${shape.stroke || '#000'};"></div>`;
      }
      if (shape.kind === 'arrow') {
        return `<svg viewBox="0 0 100 50" preserveAspectRatio="none" style="width: 100%; height: 100%;">
          <defs><marker id="ah" orient="auto" markerWidth="4" markerHeight="4" refX="3" refY="2"><path d="M0,0 V4 L4,2 Z" fill="${shape.stroke || '#000'}"/></marker></defs>
          <line x1="2" y1="25" x2="94" y2="25" stroke="${shape.stroke || '#000'}" stroke-width="${shape.strokeWidth || 2}" marker-end="url(#ah)"/>
        </svg>`;
      }
      // Rectangle/circle shapes rendered via CSS
      return '';
    }

    case 'container':
      return '';

    case 'qr':
      // QR codes need JS or server-side rendering — emit placeholder
      return `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border: 1px dashed #ccc; color: #999; font-size: 8pt;">[QR: ${escapeHtml(el.qrConfig?.content || '')}]</div>`;

    default:
      return '';
  }
}

// ─── JSON export / import ──────────────────────────────────────────────────────

export function exportToJSON(doc: CanvasDocument): string {
  const normalizedDoc = ensureCanvasDocument(doc);
  return JSON.stringify(
    {
      ...normalizedDoc,
      pageSettings: normalizePageSettings(normalizedDoc.pageSettings),
      variables: normalizeVariableRegistry(normalizedDoc.variables),
    },
    null,
    2
  );
}

export function importFromJSON(json: string): CanvasDocument | null {
  try {
    const doc = JSON.parse(json);
    if (!doc.id || !Array.isArray(doc.elements)) {
      return null;
    }
    return ensureCanvasDocument({
      ...doc,
      pageSettings: normalizePageSettings(doc.pageSettings),
      variables: normalizeVariableRegistry(doc.variables),
    } as CanvasDocument);
  } catch {
    return null;
  }
}

// ─── Preview HTML ──────────────────────────────────────────────────────────────

export function generatePreviewHtml(doc: CanvasDocument, sampleData: Record<string, string> = {}): string {
  let html = exportToJinja2(doc);

  // 1. Evaluate Jinja2 conditionals before stripping tags.
  //    In preview mode we have no real data, so image-count guards
  //    resolve to 0 images → show the "else" (placeholder) branch.

  // Handle {% if report.images|length > N %}...{% else %}...{% endif %}
  html = html.replace(
    /\{%\s*if\s+report\.images\|length\s*>\s*\d+\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_match, _ifContent, elseContent) => elseContent
  );

  // Handle {% if report.images|length > N %}...{% endif %} (no else)
  html = html.replace(
    /\{%\s*if\s+report\.images\|length\s*>\s*\d+\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    ''
  );

  // Handle {% if logo_var %}...{% endif %} — show the content (assume logos present)
  html = html.replace(
    /\{%\s*if\s+(logo_left|logo_right)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_match, _v, content) => content
  );

  // Remove remaining Jinja2 block tags ({% for %}, {% endfor %}, etc.)
  html = html.replace(/{%[^%]*%}/g, '');

  // 2. Replace report.data.get('FIELD', default) → [FIELD]
  html = html.replace(
    /{{\s*report\.data\.get\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*[^)]+)?\s*\)\s*}}/g,
    (_match, field) => `<span style="color: #6d4cff; font-weight: 600;">[${field}]</span>`
  );

  // 3. Replace report.images[i].path → SVG placeholder
  html = html.replace(
    /{{\s*report\.images\[(\d+)\]\.path[^}]*}}/g,
    (_match, i) => makeSvgPlaceholder(`Foto ${parseInt(i) + 1}`)
  );

  // 4. Replace report.images[i].name / .date / .coords → label
  html = html.replace(
    /{{\s*report\.images\[(\d+)\]\.(\w+)[^}]*}}/g,
    (_match, i, prop) => `[img${parseInt(i) + 1}.${prop}]`
  );

  // 5. Replace logo_left / logo_right → SVG placeholder
  html = html.replace(
    /{{\s*(logo_left|logo_right)\s*(?:\|[^}]*)?\s*}}/g,
    (_match, v) => makeSvgPlaceholder(v === 'logo_left' ? 'Logo Izq.' : 'Logo Der.')
  );

  // 6. Apply user-provided sample data
  for (const [key, value] of Object.entries(sampleData)) {
    html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
  }

  // 7. Replace any remaining {{ expr }} with styled [expr]
  html = html.replace(
    /{{\s*([^}]+?)\s*}}/g,
    (_match, expr) => `<span style="color: #6d4cff; font-weight: 600;">[${expr.trim()}]</span>`
  );

  // 8. Inject preview-specific styles: center the A4 page on a gray background
  const previewStyles = `
  <style>
    html { height: 100%; }
    body {
      margin: 0 !important;
      padding: 40px 0 !important;
      background: #d1d5db !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 24px !important;
      min-height: 100% !important;
      box-sizing: border-box !important;
    }
    .template-container {
      flex-shrink: 0 !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.22) !important;
    }
  </style>`;
  html = html.replace('</head>', `${previewStyles}\n</head>`);

  return html;
}
