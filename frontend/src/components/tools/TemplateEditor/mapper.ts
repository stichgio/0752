import { EditorElement, ProtectedElement, ReportType, TableElement, TemplateDocument } from './types';

type LegacyTemplateJson = {
  reportType: string;
  sections: Array<{
    id: string;
    type: string;
    title: string;
    blocks: Array<{ id: string; type: string; content: string; placeholders?: string[]; metadata?: Record<string, unknown>; locked?: boolean }>;
    metadata?: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
  variableBindings?: Record<string, unknown>;
  protectionRules?: { required_block_ids?: string[]; editable_placeholder_by_block?: Record<string, string[]> };
};

function reportToLegacy(reportType: ReportType) {
  if (reportType === 'technical_report') return 'technical-report';
  if (reportType === 'ficha_tecnica') return 'ficha-tecnica';
  return 'default';
}

function reportFromLegacy(reportType: string): ReportType {
  if (reportType === 'technical-report') return 'technical_report';
  if (reportType === 'ficha-tecnica') return 'ficha_tecnica';
  return 'generic';
}

function renderTable(table: TableElement) {
  const rows = table.cells
    .map((row, rowIndex) => {
      const cells = row
        .map((cell) => {
          const tag = rowIndex === 0 ? 'th' : 'td';
          return `<${tag}>${cell}</${tag}>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table>${rows}</table>`;
}

function elementToBlock(element: EditorElement) {
  const metadata = {
    layout: {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation ?? 0,
      zIndex: element.zIndex,
      visible: element.visible !== false,
    },
    editorType: element.type,
  } as Record<string, unknown>;

  if (element.type === 'text') {
    return { id: element.id, type: 'text', content: element.text, variables: [], placeholders: [], metadata, locked: !!element.locked };
  }
  if (element.type === 'image') {
    return { id: element.id, type: 'image', content: `<img src="${element.src}" />`, variables: [], placeholders: [], metadata: { ...metadata, fit: element.fit, opacity: element.opacity }, locked: !!element.locked };
  }
  if (element.type === 'table') {
    return { id: element.id, type: 'table', content: renderTable(element), variables: [], placeholders: [], metadata: { ...metadata, table: { rows: element.rows, cols: element.cols, cells: element.cells, style: element.style } }, locked: !!element.locked };
  }
  if (element.type === 'variable') {
    return { id: element.id, type: 'variables', content: element.token, variables: [element.token.replace(/[{}]/g, '')], placeholders: [], metadata: { ...metadata, fallback: element.fallback }, locked: !!element.locked };
  }
  const protectedElement = element as ProtectedElement;
  return {
    id: element.id,
    type: 'protected',
    content: protectedElement.content,
    variables: protectedElement.allowedTokens.map((token) => token.replace(/[{}]/g, '')),
    placeholders: protectedElement.allowedTokens,
    metadata: { ...metadata, name: protectedElement.name },
    locked: true,
  };
}

export function documentToLegacyTemplate(document: TemplateDocument): LegacyTemplateJson {
  const protectionRules: Record<string, string[]> = {};
  const requiredIds: string[] = [];
  document.elements.forEach((element) => {
    if (element.type === 'protected') {
      requiredIds.push(element.id);
      protectionRules[element.id] = element.allowedTokens;
    }
  });
  return {
    reportType: reportToLegacy(document.reportType),
    sections: [
      {
        id: 'page-1',
        type: 'body',
        title: 'Canvas',
        blocks: [...document.elements].sort((a, b) => a.zIndex - b.zIndex).map(elementToBlock),
        metadata: {
          page: document.page,
        },
      },
    ],
    metadata: { source: 'template-document-v2' },
    variableBindings: {},
    protectionRules: {
      required_block_ids: requiredIds,
      editable_placeholder_by_block: protectionRules,
    },
  };
}

export function legacyTemplateToDocument(templateJson: LegacyTemplateJson, templateId: string, name = 'Visual template'): TemplateDocument {
  const blocks = templateJson.sections.flatMap((section) => section.blocks);
  const elements = blocks.map((block, index) => {
    const layout = (block.metadata?.layout as Record<string, number>) || {};
    const base = {
      id: block.id,
      x: Number(layout.x ?? 20),
      y: Number(layout.y ?? 20 + index * 12),
      width: Number(layout.width ?? 260),
      height: Number(layout.height ?? 80),
      rotation: Number(layout.rotation ?? 0),
      zIndex: Number(layout.zIndex ?? index),
      locked: !!block.locked,
      visible: true,
    };
    if (block.type === 'image') return { ...base, type: 'image' as const, src: block.content, fit: 'contain' as const };
    if (block.type === 'table') {
      const table = (block.metadata?.table as Record<string, unknown>) || {};
      return {
        ...base,
        type: 'table' as const,
        rows: Number(table.rows ?? 2),
        cols: Number(table.cols ?? 2),
        cells: (table.cells as string[][]) || [['', ''], ['', '']],
        style: (table.style as { borderColor: string; fontSize: number }) || { borderColor: '#cbd5e1', fontSize: 11 },
      };
    }
    if (block.type === 'variables') return { ...base, type: 'variable' as const, token: block.content || '{{title}}' };
    if (block.type === 'protected') {
      return {
        ...base,
        type: 'protected' as const,
        name: String((block.metadata?.name as string) || 'Bloque protegido'),
        content: block.content,
        allowedTokens: block.placeholders || [],
        locked: true,
      };
    }
    return {
      ...base,
      type: 'text' as const,
      text: block.content,
      style: { fontSize: 12, fontFamily: 'Inter', color: '#0f172a' },
    };
  });

  return {
    id: templateId,
    name,
    reportType: reportFromLegacy(templateJson.reportType),
    page: { size: 'A4', orientation: 'portrait', marginMm: 10 },
    elements,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
