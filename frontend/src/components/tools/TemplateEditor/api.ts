import { apiClient } from '@/utils/apiClient';
import { documentToLegacyTemplate, legacyTemplateToDocument } from './mapper';
import { TemplateDocument } from './types';

export const templateEditorApi = {
  createTemplate: async (payload: {
    name: string;
    reportType: string;
    document?: TemplateDocument;
    author: string;
    featureFlag: boolean;
    templateJson?: any;
  }) => {
    const body: any = {
      name: payload.name,
      reportType: payload.reportType,
      author: payload.author,
      featureFlag: payload.featureFlag,
      templateJson: payload.templateJson ?? (payload.document ? documentToLegacyTemplate(payload.document) : undefined),
    };
    const { data } = await apiClient.post('/api/template-editor/templates', body);
    return data;
  },

  validateTemplate: async (templateId: string, payload: { role: 'admin' | 'editor'; document?: TemplateDocument; templateJson?: any }) => {
    const { data } = await apiClient.post(`/api/template-editor/templates/${templateId}/validate`, {
      role: payload.role,
      templateJson: payload.templateJson ?? (payload.document ? documentToLegacyTemplate(payload.document) : undefined),
    });
    return data;
  },

  previewTemplate: async (templateId: string, sampleData: Record<string, unknown>) => {
    const { data } = await apiClient.post(`/api/template-editor/templates/${templateId}/preview`, { sampleData });
    return data;
  },

  publishTemplate: async (templateId: string, author: string) => {
    const { data } = await apiClient.post(`/api/template-editor/templates/${templateId}/publish`, { author });
    return data;
  },

  rollbackTemplate: async (templateId: string, payload: { author: string; targetVersion?: number }) => {
    const { data } = await apiClient.post(`/api/template-editor/templates/${templateId}/rollback`, payload);
    return data;
  },

  deleteTemplate: async (templateId: string, author = 'system') => {
    const { data } = await apiClient.delete(`/api/template-editor/templates/${templateId}`, {
      params: { author },
    });
    return data;
  },

  updateTemplate: async (templateId: string, payload: { role: 'admin' | 'editor'; author: string; document?: TemplateDocument; templateJson?: any }) => {
    const { data } = await apiClient.put(`/api/template-editor/templates/${templateId}`, {
      role: payload.role,
      author: payload.author,
      templateJson: payload.templateJson ?? (payload.document ? documentToLegacyTemplate(payload.document) : undefined),
    });
    return data;
  },

  getTemplateDocument: async (templateId: string) => {
    const { data } = await apiClient.get(`/api/template-editor/templates/${templateId}`);
    const versions = data.versions || [];
    const latest = versions[versions.length - 1];
    if (!latest?.templateJson) return null;
    return legacyTemplateToDocument(latest.templateJson, data.id, data.name);
  },

  getVariableCatalog: async (reportType: string) => {
    const { data } = await apiClient.get('/api/template-editor/variables/catalog', { params: { report_type: reportType } });
    return data as { reportType: string; variables: Record<string, { optional: boolean }> };
  },

  /** List all templates from the editor (all statuses) */
  listTemplates: async () => {
    const { data } = await apiClient.get('/api/template-editor/templates');
    return data as { templates: Array<{ id: string; name: string; status: string; updatedAt: string }> };
  },

  /** List published templates from the editor */
  listPublishedTemplates: async () => {
    const { data } = await apiClient.get('/api/template-editor/published');
    return data as { templates: Array<{ id: string; name: string }> };
  },

  /** Get compiled Jinja HTML for a published template */
  getCompiledHtml: async (templateId: string) => {
    const { data } = await apiClient.get(`/api/template-editor/templates/${templateId}`);
    const versions = data.versions || [];
    const latest = versions[versions.length - 1];
    return latest?.compiledJinja || '';
  },

  /** Get the raw TemplateEditorRecord for a template (includes versions + templateJson) */
  getTemplateRaw: async (templateId: string) => {
    const { data } = await apiClient.get(`/api/template-editor/templates/${templateId}`);
    return data as {
      id: string;
      name: string;
      status: string;
      currentVersion: number;
      versions: Array<{ version: number; status: string; templateJson: any; compiledJinja: string }>;
      createdAt: string;
      updatedAt: string;
    };
  },
};
