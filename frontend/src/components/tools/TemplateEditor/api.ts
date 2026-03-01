import type { CanvasDocument, TemplateElement, PageSettings, CanvasPage } from './canvasTypes';
import { createDefaultPageSettings } from './canvasTypes';

type TemplateStatus = 'draft' | 'published' | 'archived';

interface TemplateSummary {
  id: string;
  name: string;
  status: TemplateStatus;
  updatedAt?: string;
  publishedAt?: string;
}

interface EditorBlockPayload {
  id: string;
  type: string;
  content: string;
  variables: string[];
  placeholders: string[];
  metadata: Record<string, unknown>;
  locked: boolean;
}

interface TemplateJsonPayload {
  reportType: string;
  sections: Array<{
    id: string;
    type: 'body';
    title: string;
    blocks: EditorBlockPayload[];
    metadata: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
  variableBindings: Record<string, unknown>;
  protectionRules: {
    required_block_ids: string[];
    editable_placeholder_by_block: Record<string, string[]>;
  };
  dataSourceDefinition?: Record<string, unknown>;
  assetLibrary?: Array<Record<string, unknown>>;
}

interface UpsertDraftInput {
  templateId?: string | null;
  name: string;
  doc: CanvasDocument;
  author?: string;
  role?: 'admin' | 'editor';
  reportType?: string;
  featureFlag?: boolean;
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const VARIABLE_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)(?:\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*\}\}/g;

function normalizeStatus(raw: unknown): TemplateStatus {
  const status = String(raw || 'draft').toLowerCase();
  return status === 'published' || status === 'archived' ? status : 'draft';
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const detail =
      payload?.detail ||
      payload?.message ||
      (typeof payload === 'string' ? payload : '') ||
      response.statusText;
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return (await response.json()) as T;
}

function extractVariablesFromContent(content: string | undefined): string[] {
  if (!content) return [];
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_TOKEN_REGEX)) {
    const variableName = String(match[1] || '').trim();
    if (variableName) found.add(variableName);
  }
  return [...found];
}

function mapElementType(type: TemplateElement['type']): string {
  if (type === 'photo-grid') return 'photo-grid';
  return type;
}

function elementToBlock(element: TemplateElement): EditorBlockPayload {
  const variablesFromContent = extractVariablesFromContent(element.content);
  const variableName =
    element.type === 'variable' && typeof element.variableName === 'string'
      ? element.variableName.trim()
      : '';

  const variables = variableName
    ? Array.from(new Set([...variablesFromContent, variableName]))
    : variablesFromContent;

  const metadata: Record<string, unknown> = {
    layout: {
      x: element.position.x,
      y: element.position.y,
      width: element.size.width,
      height: element.size.height,
      rotation: element.rotation || 0,
      zIndex: element.style?.zIndex || 0,
    },
    style: element.style || {},
  };

  if (element.type === 'variable' && variableName) {
    metadata.variableName = variableName;
  }
  if (element.tableData) metadata.tableData = element.tableData;
  if (element.photoConfig) metadata.photoConfig = element.photoConfig;
  if (element.shapeConfig) metadata.shapeConfig = element.shapeConfig;
  if (element.dividerConfig) metadata.dividerConfig = element.dividerConfig;
  if (element.signatureConfig) metadata.signatureConfig = element.signatureConfig;
  if (element.signatureName) metadata.signatureName = element.signatureName;
  if (element.title) metadata.title = element.title;
  if (element.imageUrl) metadata.imageUrl = element.imageUrl;
  if (typeof element.visible === 'boolean') metadata.visible = element.visible;

  return {
    id: element.id,
    type: mapElementType(element.type),
    content: String(element.content || ''),
    variables,
    placeholders: [],
    metadata,
    locked: !!element.locked,
  };
}

function blockToElement(block: EditorBlockPayload): TemplateElement {
  const layout = (block.metadata?.layout ?? {}) as Record<string, unknown>;
  const style = (block.metadata?.style ?? {}) as Record<string, unknown>;

  const element: TemplateElement = {
    id: block.id,
    type: block.type as TemplateElement['type'],
    name: String((block.metadata as Record<string, unknown>)?.title || block.type || ''),
    content: block.content,
    position: {
      x: Number(layout.x) || 0,
      y: Number(layout.y) || 0,
    },
    size: {
      width: Number(layout.width) || 100,
      height: Number(layout.height) || 50,
    },
    rotation: Number(layout.rotation) || 0,
    style: { ...style, zIndex: Number(layout.zIndex) || 0 } as TemplateElement['style'],
    locked: !!block.locked,
    visible: (block.metadata as Record<string, unknown>)?.visible !== false,
  };

  const meta = block.metadata as Record<string, unknown>;
  if (meta?.variableName) element.variableName = String(meta.variableName);
  if (meta?.tableData) element.tableData = meta.tableData as TemplateElement['tableData'];
  if (meta?.photoConfig) element.photoConfig = meta.photoConfig as TemplateElement['photoConfig'];
  if (meta?.shapeConfig) element.shapeConfig = meta.shapeConfig as TemplateElement['shapeConfig'];
  if (meta?.dividerConfig) element.dividerConfig = meta.dividerConfig as TemplateElement['dividerConfig'];
  if (meta?.signatureConfig) element.signatureConfig = meta.signatureConfig as TemplateElement['signatureConfig'];
  if (meta?.signatureName) element.signatureName = String(meta.signatureName);
  if (meta?.title) element.title = String(meta.title);
  if (meta?.imageUrl) element.imageUrl = String(meta.imageUrl);
  if (meta?.qrConfig) element.qrConfig = meta.qrConfig as TemplateElement['qrConfig'];

  return element;
}

export function canvasDocumentToTemplateJson(
  doc: CanvasDocument,
  reportType = 'technical-report',
): TemplateJsonPayload {
  const variableBindings = (doc.variables || []).reduce<Record<string, unknown>>((acc, item) => {
    if (item?.key) acc[item.key] = item.key;
    return acc;
  }, {});

  return {
    reportType,
    sections: [
      {
        id: 'canvas-body',
        type: 'body',
        title: 'Canvas',
        blocks: doc.elements.map(elementToBlock),
        metadata: { pages: doc.pages || [] },
      },
    ],
    metadata: {
      source: 'canvas-editor-v3',
      version: doc.version,
      pageSettings: doc.pageSettings,
      pages: doc.pages || [],
      theme: doc.theme || {},
      assetLibrary: doc.assetLibrary || [],
      canvasDocumentId: doc.id,
      canvasStatus: doc.status,
      updatedAt: doc.updatedAt,
    },
    variableBindings,
    dataSourceDefinition: doc.dataSourceDefinition || {},
    assetLibrary: (doc.assetLibrary || []) as Array<Record<string, unknown>>,
    protectionRules: {
      required_block_ids: [],
      editable_placeholder_by_block: {},
    },
  };
}

function normalizeTemplateSummary(item: any, fallbackStatus: TemplateStatus = 'draft'): TemplateSummary {
  return {
    id: String(item?.id || ''),
    name: String(item?.name || ''),
    status: normalizeStatus(item?.status || fallbackStatus),
    updatedAt: item?.updatedAt || item?.updated_at || undefined,
    publishedAt: item?.publishedAt || item?.published_at || item?.updatedAt || item?.updated_at || undefined,
  };
}

async function findTemplateByName(name: string): Promise<TemplateSummary | null> {
  const payload = await requestJson<{ templates?: any[] }>('/template-editor/templates');
  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  const normalized = templates
    .map((item) => normalizeTemplateSummary(item, 'draft'))
    .find((item) => item.name.trim().toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es'));
  return normalized || null;
}

async function createDraft(input: UpsertDraftInput): Promise<string> {
  const payload = {
    name: input.name,
    reportType: input.reportType || 'technical-report',
    author: input.author || 'editor',
    featureFlag: input.featureFlag ?? true,
    templateJson: canvasDocumentToTemplateJson(input.doc, input.reportType || 'technical-report'),
  };
  const created = await requestJson<{ id: string }>('/template-editor/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return String(created.id || '');
}

async function updateDraft(templateId: string, input: UpsertDraftInput): Promise<void> {
  const payload = {
    name: input.name.trim() || 'Plantilla sin nombre',
    role: input.role || 'editor',
    author: input.author || 'editor',
    reportType: input.reportType || 'technical-report',
    templateJson: canvasDocumentToTemplateJson(input.doc, input.reportType || 'technical-report'),
  };
  await requestJson('/template-editor/templates/' + encodeURIComponent(templateId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export const templateEditorApi = {
  create: async (data: any) => requestJson('/template-editor/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  update: async (id: string, data: any) => requestJson('/template-editor/templates/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  publish: async (id: string, author = 'editor') => requestJson('/templates/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'published', author }),
  }),

  unpublish: async (id: string, author = 'editor') => requestJson('/templates/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'draft', author }),
  }),

  preview: async (id: string, sampleData: Record<string, unknown> = {}, logos?: { logo_left?: string; logo_right?: string }) => requestJson('/template-editor/templates/' + encodeURIComponent(id) + '/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleData, logo_left: logos?.logo_left || null, logo_right: logos?.logo_right || null }),
  }),

  render: async (id: string, sampleData: Record<string, unknown> = {}, logos?: { logo_left?: string; logo_right?: string }) => requestJson<{ templateId: string; previewHtml: string }>('/template-editor/templates/' + encodeURIComponent(id) + '/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleData, logo_left: logos?.logo_left || null, logo_right: logos?.logo_right || null }),
  }),

  delete: async (id: string, author = 'editor') => requestJson('/template-editor/templates/' + encodeURIComponent(id) + '?author=' + encodeURIComponent(author), {
    method: 'DELETE',
  }),

  list: async (): Promise<TemplateSummary[]> => {
    const payload = await requestJson<{ templates?: any[] }>('/template-editor/templates');
    const templates = Array.isArray(payload.templates) ? payload.templates : [];
    return templates.map((item) => normalizeTemplateSummary(item, item?.status || 'draft'));
  },

  getTemplateRaw: async (id: string) =>
    requestJson('/template-editor/templates/' + encodeURIComponent(id)),

  getPublished: async (): Promise<TemplateSummary[]> => {
    try {
      const payload = await requestJson<{ templates?: any[] }>('/templates/published');
      const templates = Array.isArray(payload.templates) ? payload.templates : [];
      return templates.map((item) => normalizeTemplateSummary(item, 'published'));
    } catch (primaryErr) {
      try {
        const fallback = await requestJson<{ templates?: any[] }>('/template-editor/published');
        const templates = Array.isArray(fallback.templates) ? fallback.templates : [];
        return templates.map((item) => normalizeTemplateSummary(item, 'published'));
      } catch (fallbackErr) {
        throw new Error(
          toErrorMessage(fallbackErr, toErrorMessage(primaryErr, 'No se pudo cargar la lista de plantillas publicadas')),
        );
      }
    }
  },

  getVariables: async (reportType = 'technical-report') => {
    const encoded = encodeURIComponent(reportType);
    return requestJson<{ variables?: any[] }>('/template-editor/variables/catalog?report_type=' + encoded);
  },

  updateStatus: async (id: string, status: TemplateStatus, author = 'editor') => {
    const payload = JSON.stringify({ status, author });
    try {
      return await requestJson('/templates/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    } catch {
      return requestJson('/templates/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    }
  },

  upsertDraftFromCanvas: async (input: UpsertDraftInput): Promise<string> => {
    const templateName = input.name.trim();
    const baseInput = {
      ...input,
      name: templateName || 'Plantilla sin nombre',
      author: input.author || 'editor',
      role: input.role || 'editor',
      reportType: input.reportType || 'technical-report',
      featureFlag: input.featureFlag ?? true,
    };

    const tryUpdate = async (id: string): Promise<string | null> => {
      if (!id) return null;
      try {
        await updateDraft(id, baseInput);
        return id;
      } catch (err) {
        const msg = toErrorMessage(err, '');
        if (msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no encontrad')) return null;
        throw err;
      }
    };

    const fromGivenId = await tryUpdate(baseInput.templateId || '');
    if (fromGivenId) return fromGivenId;

    const byName = templateName ? await findTemplateByName(templateName) : null;
    // Solo usar el match por nombre si NO tenemos un templateId dado
    // (evita sobreescribir otra plantilla con el mismo nombre)
    if (byName?.id && !baseInput.templateId) {
      const updatedByName = await tryUpdate(byName.id);
      if (updatedByName) return updatedByName;
    }

    return createDraft(baseInput);
  },

  getRenderedPublishedTemplate: async (id: string): Promise<{
    id: string;
    name: string;
    status: TemplateStatus;
    content: string;
    templateJson?: Record<string, unknown>;
    publishedAt?: string;
  }> => requestJson('/templates/' + encodeURIComponent(id) + '/render'),


  validateTemplate: async (templateId: string, templateJson: TemplateJsonPayload, role: 'admin' | 'editor' = 'editor') =>
    requestJson<{ valid: boolean; issues: Array<{ level: 'error' | 'warning'; code: string; message: string; path?: string }> }>(`/template-editor/templates/${encodeURIComponent(templateId)}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, templateJson }),
    }),

  loadPublishedForEditing: async (id: string): Promise<{ doc: CanvasDocument; name: string }> => {
    const raw = await requestJson<{
      id: string;
      name: string;
      status: string;
      reportType?: string;
      updatedAt?: string;
      versions?: Array<{
        version: number;
        templateJson?: {
          sections?: Array<{ blocks?: EditorBlockPayload[] }>;
          metadata?: Record<string, unknown>;
          variableBindings?: Record<string, unknown>;
          dataSourceDefinition?: Record<string, unknown>;
          assetLibrary?: Array<Record<string, unknown>>;
        };
      }>;
    }>('/template-editor/templates/' + encodeURIComponent(id));

    const versions = raw.versions || [];
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion?.templateJson) {
      throw new Error('No se encontraron datos de la plantilla');
    }

    const templateJson = latestVersion.templateJson;
    const metadata = templateJson.metadata || {};
    const blocks = templateJson.sections?.[0]?.blocks || [];
    const elements = blocks.map(blockToElement);
    const pageSettings: PageSettings = (metadata.pageSettings as PageSettings) || createDefaultPageSettings();
    const pagesRaw = (metadata.pages as CanvasPage[] | undefined) || [];
    const pages = Array.isArray(pagesRaw) && pagesRaw.length > 0 ? pagesRaw : [{ id: 'page-1', name: 'Página 1', elementIds: elements.map((el) => el.id) }];

    const now = new Date().toISOString();
    return {
      name: raw.name,
      doc: {
        id: raw.id,
        name: raw.name,
        elements,
        pages,
        variables: [],
        theme: (metadata.theme as CanvasDocument['theme']) || { textStyles: [], colorTokens: [] },
        assetLibrary: (templateJson.assetLibrary as CanvasDocument['assetLibrary']) || (metadata.assetLibrary as CanvasDocument['assetLibrary']) || [],
        reportType: raw.reportType || 'technical-report',
        dataSourceDefinition: (templateJson.dataSourceDefinition as CanvasDocument['dataSourceDefinition']) || { schemaVersion: '1.0', fields: [] },
        pageSettings,
        version: Number(metadata.version) || 1,
        status: (raw.status as CanvasDocument['status']) || 'draft',
        createdAt: now,
        updatedAt: raw.updatedAt || now,
      },
    };
  },
};
