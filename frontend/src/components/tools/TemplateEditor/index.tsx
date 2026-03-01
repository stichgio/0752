import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  FileCode2, FileJson, Plus, Printer,
  Redo2, Save, Send, Undo2, X, Eye, Download, Upload, History, ShieldAlert,
} from 'lucide-react';
import type { CanvasDocument, PageSettings } from './canvasTypes';
import {
  createDefaultPageSettings,
  createEmptyDocument,
  normalizePageSettings,
  normalizeVariableRegistry,
} from './canvasTypes';
import CanvasEditor from './CanvasEditor';
import { exportToJinja2, exportToJSON, importFromJSON, generatePreviewHtml } from './exportUtils';
import { useUndoableState } from './hooks/useUndoableState';
import type { CanvasChangeOptions } from './historyTypes';
import { templateEditorApi, canvasDocumentToTemplateJson } from './api';
import { downloadBlob } from '@/utils/downloadBlob';
import ReportGenerator from './ReportGenerator';

const SESSION_KEY = 'canvas-editor-session-v1';

const NESTED_REPORT_KEYS = new Set([
  'metadata',
  'header',
  'inspeccion',
  'medidas',
  'valvulas',
  'canastillas',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assignPrimitive(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target[key] = value;
  }
}

function buildDataPreviewFromReport(report: unknown): Record<string, unknown> {
  const preview: Record<string, unknown> = {};
  const reportObject = asRecord(report);
  if (!reportObject) return preview;

  const metadata = asRecord(reportObject.metadata);
  if (metadata) {
    ['informe_id', 'dia', 'mes', 'anio', 'pagina'].forEach((key) => {
      assignPrimitive(preview, key, metadata[key]);
    });
  }

  const header = asRecord(reportObject.header);
  if (header) {
    ['cs', 'contratista', 'codigo_infraestructura', 'ubicacion', 'suministro', 'tipo', 'volumen'].forEach((key) => {
      assignPrimitive(preview, key, header[key]);
    });
  }

  const inspeccion = asRecord(reportObject.inspeccion);
  if (inspeccion) {
    Object.entries(inspeccion).forEach(([key, value]) => {
      assignPrimitive(preview, key, value);
      if (key.startsWith('observaciones_')) {
        assignPrimitive(preview, `obs_${key.slice('observaciones_'.length)}`, value);
      } else if (key.startsWith('sugerencias_')) {
        assignPrimitive(preview, `sug_${key.slice('sugerencias_'.length)}`, value);
      }
    });
  }

  const medidas = asRecord(reportObject.medidas);
  if (medidas) {
    Object.entries(medidas).forEach(([key, value]) => {
      assignPrimitive(preview, `medidas_${key}`, value);
    });
  }

  const valvulas = asRecord(reportObject.valvulas);
  if (valvulas) {
    const valvulaSections: Array<[string, string]> = [
      ['diametros', 'conduccion'],
      ['impulsion', 'impulsion'],
      ['aduccion', 'aduccion'],
      ['bypass', 'bypass'],
      ['desague', 'desague'],
    ];

    valvulaSections.forEach(([sectionKey, variableSection]) => {
      const sectionData = asRecord(valvulas[sectionKey]);
      if (!sectionData) return;
      Object.entries(sectionData).forEach(([diameter, value]) => {
        assignPrimitive(preview, `valvulas_${variableSection}_${diameter}`, value);
      });
    });

    assignPrimitive(preview, 'valvulas_operativas', valvulas.operativas);
    assignPrimitive(preview, 'valvulas_no_operativas', valvulas.no_operativas);

    Object.entries(valvulas).forEach(([key, value]) => {
      if (key.startsWith('observaciones_')) {
        assignPrimitive(preview, `obs_valvulas_${key.slice('observaciones_'.length)}`, value);
      } else if (key.startsWith('sugerencias_')) {
        assignPrimitive(preview, `sug_valvulas_${key.slice('sugerencias_'.length)}`, value);
      }
    });
  }

  const canastillas = asRecord(reportObject.canastillas);
  if (canastillas) {
    const canastillaSections: Array<[string, string]> = [
      ['diametros', 'aduccion'],
      ['aduccion', 'aduccion'],
      ['succion', 'succion'],
      ['desague', 'desague'],
    ];

    canastillaSections.forEach(([sectionKey, variableSection]) => {
      const sectionData = asRecord(canastillas[sectionKey]);
      if (!sectionData) return;
      Object.entries(sectionData).forEach(([diameter, value]) => {
        assignPrimitive(preview, `canastillas_${variableSection}_${diameter}`, value);
      });
    });

    assignPrimitive(preview, 'canastillas_operativas', canastillas.operativas);
    assignPrimitive(preview, 'canastillas_no_operativas', canastillas.no_operativas);

    Object.entries(canastillas).forEach(([key, value]) => {
      if (key.startsWith('observaciones_')) {
        assignPrimitive(preview, `obs_canastillas_${key.slice('observaciones_'.length)}`, value);
      } else if (key.startsWith('sugerencias_')) {
        assignPrimitive(preview, `sug_canastillas_${key.slice('sugerencias_'.length)}`, value);
      }
    });
  }

  assignPrimitive(preview, 'observaciones', reportObject.observaciones);
  assignPrimitive(preview, 'sugerencias', reportObject.sugerencias);

  Object.entries(reportObject).forEach(([key, value]) => {
    if (NESTED_REPORT_KEYS.has(key)) return;
    assignPrimitive(preview, key, value);
  });

  return preview;
}

function isSamePageSettings(a: PageSettings, b: PageSettings): boolean {
  return (
    a.format === b.format &&
    a.orientation === b.orientation &&
    a.width === b.width &&
    a.height === b.height &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    (a.backgroundColor || '#ffffff') === (b.backgroundColor || '#ffffff')
  );
}

function normalizeDocument(doc: CanvasDocument): CanvasDocument {
  const elements = Array.isArray(doc.elements) ? doc.elements : [];
  const pages = Array.isArray(doc.pages) && doc.pages.length > 0
    ? doc.pages
    : [{ id: 'page-1', name: 'Página 1', elementIds: elements.map((element) => element.id) }];

  return {
    ...doc,
    reportType: doc.reportType || 'technical-report',
    pages,
    theme: doc.theme || { textStyles: [], colorTokens: [] },
    assetLibrary: doc.assetLibrary || [],
    dataSourceDefinition: doc.dataSourceDefinition || { schemaVersion: '1.0', fields: [] },
    pageSettings: normalizePageSettings(doc.pageSettings),
    variables: normalizeVariableRegistry(doc.variables),
  };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'info' };

const ToastStack = memo(function ToastStack({ items }: { items: Toast[] }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col-reverse gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${t.type === 'ok' ? 'bg-emerald-600 text-white' :
            t.type === 'err' ? 'bg-red-600 text-white' :
              'bg-neutral-900 text-white'
            }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
});

// ─── Status pill ──────────────────────────────────────────────────────────────

type PublishStatus = 'draft' | 'published' | 'archived';

const STATUS_LABEL: Record<PublishStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
};

const StatusPill = memo(function StatusPill({ status }: { status: PublishStatus }) {
  const cls: Record<PublishStatus, string> = {
    draft: 'bg-amber-100 text-amber-700',
    published: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-neutral-100 text-neutral-500',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {STATUS_LABEL[status]}
    </span>
  );
});

// ─── Toolbar button ───────────────────────────────────────────────────────────

const ToolbarBtn = memo(function ToolbarBtn({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const {
    present: doc,
    canUndo,
    canRedo,
    setPresent: setDocHistory,
    commitPending: commitPendingHistory,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetDocHistory,
  } = useUndoableState<CanvasDocument>(createEmptyDocument, { limit: 50 });
  const [pageSettings, setPageSettings] = useState<PageSettings>(createDefaultPageSettings);
  const [status, setStatus] = useState<PublishStatus>('draft');
  const [serverTemplateId, setServerTemplateId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [dataPreview, setDataPreview] = useState<Record<string, unknown> | undefined>(undefined);
  const [reportType, setReportType] = useState<string>('technical-report');
  const [availableReports, setAvailableReports] = useState<unknown[]>([]);
  const [activeScenario, setActiveScenario] = useState<'first' | 'recent' | 'custom'>('first');
  const [validationIssues, setValidationIssues] = useState<Array<{ level: 'error' | 'warning'; code: string; message: string; path?: string }>>([]);
  const [versionHistory, setVersionHistory] = useState<Array<{ version: number; status: string; author: string; createdAt: string }>>([]);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(320);
  const [publishedTemplatesRefreshKey, setPublishedTemplatesRefreshKey] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  // ── Load session ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.doc?.elements) {
          const normalizedDoc = normalizeDocument(s.doc as CanvasDocument);
          resetDocHistory(normalizedDoc);
          setPageSettings(normalizedDoc.pageSettings);
          setStatus((s.status as PublishStatus) || 'draft');
          const storedTemplateId = typeof s.serverTemplateId === 'string'
            ? s.serverTemplateId
            : (typeof s.templateId === 'string' ? s.templateId : '');
          setServerTemplateId(storedTemplateId || null);
          setReportType((s?.doc?.reportType as string) || 'technical-report');
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [resetDocHistory]);

  useEffect(() => {
    const normalized = normalizePageSettings(doc.pageSettings);
    setPageSettings((prev) => (isSamePageSettings(prev, normalized) ? prev : normalized));
  }, [doc.pageSettings]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadDataPreview = async () => {
      try {
        const response = await fetch('/api/technical-reports/reports', {
          method: 'GET',
          signal: controller.signal,
        });
        if (!response.ok) return;

        const payload = (await response.json()) as { reports?: unknown[] };
        const reports = Array.isArray(payload.reports) ? payload.reports : [];
        if (!isActive) return;

        setAvailableReports(reports.slice(0, 10));
        const firstReport = reports[0] || null;
        if (!firstReport) {
          setDataPreview(undefined);
          return;
        }

        const preview = buildDataPreviewFromReport(firstReport);
        setDataPreview(Object.keys(preview).length ? preview : undefined);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        if (isActive) {
          setDataPreview(undefined);
          setAvailableReports([]);
        }
      }
    };

    void loadDataPreview();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (activeScenario === 'first' || availableReports.length === 0) return;
    const report = activeScenario === 'recent' ? availableReports[1] || availableReports[0] : null;
    if (!report) return;
    const preview = buildDataPreviewFromReport(report);
    setDataPreview(Object.keys(preview).length ? preview : undefined);
  }, [activeScenario, availableReports]);

  // ── Auto-save ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ doc: { ...doc, reportType }, status, serverTemplateId }));
    }, 1000);
    return () => clearTimeout(t);
  }, [doc, reportType, status, serverTemplateId]);

  // ── Warn on close ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ── History management ────────────────────────────────────────────────────

  const handleDocChange = useCallback((newDoc: CanvasDocument, options?: CanvasChangeOptions) => {
    if (options?.finalizeOnly) {
      commitPendingHistory();
      return;
    }

    const normalizedDoc = normalizeDocument(newDoc);

    setDocHistory(normalizedDoc, {
      commitToHistory: options?.commitToHistory !== false,
    });
    setPageSettings((prev) => (
      isSamePageSettings(prev, normalizedDoc.pageSettings)
        ? prev
        : normalizedDoc.pageSettings
    ));
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [commitPendingHistory, setDocHistory, status]);

  const handlePageSettingsChange = useCallback((nextPageSettings: PageSettings) => {
    const normalized = normalizePageSettings(nextPageSettings);
    setPageSettings(normalized);
    handleDocChange({
      ...doc,
      pageSettings: normalized,
      updatedAt: new Date().toISOString(),
    });
  }, [doc, handleDocChange]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    undoHistory();
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [canUndo, undoHistory, status]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    redoHistory();
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [canRedo, redoHistory, status]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const newTemplate = useCallback(() => {
    if (dirty && !window.confirm('¿Descartar cambios sin guardar?')) return;
    const d = createEmptyDocument();
    resetDocHistory(d);
    setPageSettings(normalizePageSettings(d.pageSettings));
    setDirty(false);
    setStatus('draft');
    setServerTemplateId(null);
    localStorage.removeItem(SESSION_KEY);
    toast('Nueva plantilla creada', 'ok');
  }, [dirty, resetDocHistory, toast]);

  /** Load a preset or imported doc into the editor */
  const loadDocument = useCallback((newDoc: CanvasDocument) => {
    const normalizedDoc = normalizeDocument(newDoc);
    setDocHistory({
      ...normalizedDoc,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
    setPageSettings(normalizedDoc.pageSettings);
    setStatus('draft');
    setServerTemplateId(null);
    setDirty(true);
    toast(`Plantilla "${normalizedDoc.name}" cargada`, 'ok');
  }, [setDocHistory, toast]);

  const exportHtml = useCallback(() => {
    const html = exportToJinja2(doc);
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `${doc.name || 'template'}.html`);
    toast('HTML exportado', 'ok');
  }, [doc, toast]);

  const exportJson = useCallback(() => {
    const json = exportToJSON(doc);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `${doc.name || 'template'}.json`);
    toast('JSON exportado', 'ok');
  }, [doc, toast]);

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const imported = importFromJSON(text);
      if (!imported) {
        toast('JSON inválido o formato incorrecto', 'err');
      } else {
        loadDocument(imported);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  }, [loadDocument, toast]);

  const preview = useCallback(() => {
    setPreviewHtml(generatePreviewHtml(doc));
    setShowPreview(true);
  }, [doc]);

  const saveTemplate = useCallback(async () => {
    if (!doc.elements.length) {
      toast('Agrega al menos un elemento antes de guardar', 'err');
      return;
    }
    try {
      const resolvedTemplateId = await templateEditorApi.upsertDraftFromCanvas({
        templateId: serverTemplateId,
        name: doc.name,
        doc,
        author: 'editor',
        role: 'editor',
        reportType,
        featureFlag: true,
      });

      const updated = {
        ...doc,
        id: resolvedTemplateId,
        updatedAt: new Date().toISOString(),
      };
      setDocHistory(updated);
      setServerTemplateId(resolvedTemplateId);
      setDirty(false);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: updated, status, serverTemplateId: resolvedTemplateId }),
      );
      toast('Plantilla guardada en la nube', 'ok');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al guardar en la nube';
      toast(msg, 'err');
    }
  }, [doc, reportType, serverTemplateId, status, setDocHistory, toast]);

  const publish = useCallback(async () => {
    if (!doc.elements.length) {
      toast('Agrega al menos un elemento antes de publicar', 'err');
      return;
    }

    try {
      const resolvedTemplateId = await templateEditorApi.upsertDraftFromCanvas({
        templateId: serverTemplateId,
        name: doc.name,
        doc,
        author: 'editor',
        role: 'editor',
        reportType,
        featureFlag: true,
      });

      const validationTemplateJson = canvasDocumentToTemplateJson(doc, reportType);
      if (validationTemplateJson) {
        const validation = await templateEditorApi.validateTemplate(resolvedTemplateId, validationTemplateJson, 'editor');
        const issues = Array.isArray(validation.issues) ? validation.issues : [];
        setValidationIssues(issues);
        const hasErrors = issues.some((issue) => issue.level === 'error');
        if (hasErrors) {
          toast('No se pudo publicar: hay errores críticos de validación', 'err');
          return;
        }
      }

      await templateEditorApi.updateStatus(resolvedTemplateId, 'published', 'editor');

      const nowIso = new Date().toISOString();
      const updated = {
        ...doc,
        id: resolvedTemplateId,
        status: 'published' as const,
        updatedAt: nowIso,
      };
      setDocHistory(updated);
      setStatus('published');
      setServerTemplateId(resolvedTemplateId);
      setDirty(false);
      setPublishedTemplatesRefreshKey((prev) => prev + 1);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: updated, status: 'published', serverTemplateId: resolvedTemplateId }),
      );
      toast('Plantilla publicada correctamente', 'ok');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo publicar la plantilla';
      toast(msg, 'err');
    }
  }, [doc, reportType, serverTemplateId, setDocHistory, toast]);

  const handleUnpublishTemplate = useCallback(async (templateId: string) => {
    await templateEditorApi.updateStatus(templateId, 'draft', 'editor');
    if (serverTemplateId && serverTemplateId === templateId) {
      setStatus('draft');
    }
    setPublishedTemplatesRefreshKey((prev) => prev + 1);
    toast('Plantilla despublicada correctamente', 'ok');
  }, [serverTemplateId, toast]);

  const handleEditPublishedTemplate = useCallback(async (templateId: string) => {
    if (dirty && !window.confirm('¿Descartar cambios sin guardar y cargar la plantilla publicada?')) return;

    try {
      const { doc: loadedDoc } = await templateEditorApi.loadPublishedForEditing(templateId);
      const normalizedDoc = normalizeDocument(loadedDoc);
      resetDocHistory(normalizedDoc);
      setPageSettings(normalizedDoc.pageSettings);
      setServerTemplateId(templateId);
      setStatus('published');
      setDirty(false);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: normalizedDoc, status: 'published', serverTemplateId: templateId }),
      );
      toast(`Plantilla "${normalizedDoc.name}" cargada para editar`, 'ok');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar la plantilla';
      toast(msg, 'err');
    }
  }, [dirty, resetDocHistory, toast]);

  const loadVersionHistory = useCallback(async () => {
    if (!serverTemplateId) return;
    try {
      const raw = await templateEditorApi.getTemplateRaw(serverTemplateId) as { versions?: Array<{ version: number; status: string; author: string; createdAt: string }> };
      setVersionHistory((raw.versions || []).map((v) => ({ version: v.version, status: v.status, author: v.author, createdAt: v.createdAt })));
    } catch {
      setVersionHistory([]);
    }
  }, [serverTemplateId]);

  const runValidation = useCallback(async () => {
    if (!serverTemplateId) return [];
    const templateJson = canvasDocumentToTemplateJson(doc, reportType);
    const payload = templateJson || undefined;
    if (!payload) return [];
    const result = await templateEditorApi.validateTemplate(serverTemplateId, payload, 'editor');
    const issues = Array.isArray(result.issues) ? result.issues : [];
    setValidationIssues(issues);
    return issues;
  }, [doc, reportType, serverTemplateId]);

  const handleDeletePublishedTemplate = useCallback(async (templateId: string) => {
    try {
      await templateEditorApi.delete(templateId);
      if (serverTemplateId && serverTemplateId === templateId) {
        setServerTemplateId(null);
        setStatus('draft');
      }
      setPublishedTemplatesRefreshKey((prev) => prev + 1);
      toast('Plantilla eliminada correctamente', 'ok');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo eliminar la plantilla';
      toast(msg, 'err');
    }
  }, [serverTemplateId, toast]);

  return (
    <div className="template-editor-root h-full w-full flex flex-col bg-neutral-50">
      {/* Header */}
      <header className="h-14 bg-white border-b border-neutral-200 px-4 flex items-center justify-between shadow-sm z-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Logo */}
          <img
            src="https://res.cloudinary.com/dzhp64paw/image/upload/v1771449784/logo_xipfod.png"
            alt="Logo"
            className="h-10 w-auto object-contain flex-shrink-0"
          />


          <div className="h-6 w-px bg-neutral-200 mx-1 flex-shrink-0" />

          <button
            onClick={newTemplate}
            title="Nueva plantilla en blanco"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors flex-shrink-0"
          >
            <Plus size={16} />
            Nuevo
          </button>

          <input
            className="h-8 w-44 px-3 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-0"
            value={doc.name}
            onChange={(e) => handleDocChange({ ...doc, name: e.target.value })}
            placeholder="Nombre de plantilla"
          />
          <select
            className="h-8 rounded-lg border border-neutral-200 px-2 text-xs"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            title="Tipo de reporte"
          >
            <option value="technical-report">technical-report</option>
            <option value="generic">generic</option>
          </select>
          <select
            className="h-8 rounded-lg border border-neutral-200 px-2 text-xs"
            value={activeScenario}
            onChange={(e) => setActiveScenario(e.target.value as 'first' | 'recent' | 'custom')}
            title="Escenario de datos"
          >
            <option value="first">Escenario: 1er reporte</option>
            <option value="recent">Escenario: reciente</option>
            <option value="custom">Escenario: JSON custom</option>
          </select>

          <StatusPill status={status} />
          {dirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Cambios sin guardar" />
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
            <ToolbarBtn onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
              <Undo2 size={16} />
            </ToolbarBtn>
            <ToolbarBtn onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)">
              <Redo2 size={16} />
            </ToolbarBtn>
          </div>

          <div className="h-6 w-px bg-neutral-200 mx-1" />

          {/* View / Export */}
          <ToolbarBtn onClick={preview} title="Vista previa">
            <Eye size={16} />
            Preview
          </ToolbarBtn>
          <ToolbarBtn onClick={exportHtml} title="Exportar como HTML / Jinja2">
            <FileCode2 size={16} />
            HTML
          </ToolbarBtn>
          <ToolbarBtn onClick={exportJson} title="Exportar como JSON">
            <FileJson size={16} />
            JSON
          </ToolbarBtn>

          {/* Import JSON */}
          {/* Report Generator */}
          <ToolbarBtn onClick={() => setShowGenerator(true)} title="Generar reportes con plantillas publicadas">
            <Printer size={16} />
            Generar
          </ToolbarBtn>

          <label
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
            title="Importar plantilla JSON"
          >
            <Upload size={16} />
            Importar
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJson}
            />
          </label>

          <div className="h-6 w-px bg-neutral-200 mx-1" />

          <ToolbarBtn onClick={loadVersionHistory} title="Cargar historial">
            <History size={16} />
            Historial
          </ToolbarBtn>
          <ToolbarBtn onClick={() => { void runValidation(); }} title="Validar plantilla">
            <ShieldAlert size={16} />
            Validar
          </ToolbarBtn>

          {/* Save (cloud) */}
          <ToolbarBtn onClick={saveTemplate} disabled={!dirty} title="Guardar en la nube">
            <Save size={16} />
            Guardar
          </ToolbarBtn>

          {/* Publish */}
          <button
            onClick={publish}
            disabled={status === 'published' && !dirty}
            title={status === 'published' && !dirty ? 'Ya publicada' : 'Publicar plantilla'}
            className="ml-1 h-8 px-4 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-40 disabled:pointer-events-none transition-colors inline-flex items-center gap-1.5"
          >
            <Send size={14} />
            {status === 'published' && !dirty ? 'Publicada' : 'Publicar'}
          </button>
        </div>
      </header>

      {/* Editor body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CanvasEditor
          document={doc}
          pageSettings={pageSettings}
          onChange={handleDocChange}
          onPageSettingsChange={handlePageSettingsChange}
          dataPreview={dataPreview}
          isDirty={dirty}
          onLoadTemplate={loadDocument}
          leftSidebarWidth={leftWidth}
          rightSidebarWidth={rightWidth}
          onLeftSidebarWidthChange={setLeftWidth}
          onRightSidebarWidthChange={setRightWidth}
          activePublishedTemplateId={serverTemplateId}
          publishedTemplatesRefreshKey={publishedTemplatesRefreshKey}
          onUnpublishTemplate={handleUnpublishTemplate}
          onEditPublishedTemplate={handleEditPublishedTemplate}
          onDeletePublishedTemplate={handleDeletePublishedTemplate}
        />
      </div>

      {(validationIssues.length > 0 || versionHistory.length > 0) && (
        <section className="border-t border-neutral-200 bg-white px-4 py-2 text-xs grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-neutral-700">Validación</h4>
            <ul className="max-h-24 overflow-auto mt-1">
              {validationIssues.map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className={issue.level === 'error' ? 'text-red-600' : 'text-amber-600'}>
                  [{issue.level}] {issue.message} {issue.path ? `(${issue.path})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-neutral-700">Historial</h4>
            <ul className="max-h-24 overflow-auto mt-1">
              {versionHistory.map((v) => (
                <li key={v.version} className="text-neutral-600">v{v.version} · {v.status} · {v.author}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[min(960px,95vw)] h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-neutral-500" />
                <span className="font-semibold text-neutral-800">Vista Previa — {doc.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-400 select-none">ESC para cerrar</span>
                <button
                  onClick={exportHtml}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100 border border-neutral-200 transition-colors"
                  title="Descargar HTML"
                >
                  <Download size={13} />
                  Descargar HTML
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400"
                  title="Cerrar (ESC)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable preview area */}
            <div className="flex-1 overflow-auto bg-neutral-300">
              <iframe
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                title="Preview"
                onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement;
                  try {
                    const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iDoc?.body) {
                      setTimeout(() => {
                        const h = iDoc.documentElement.scrollHeight || iDoc.body.scrollHeight;
                        iframe.style.height = Math.max(h, 1122) + 'px';
                      }, 100);
                    }
                  } catch { /* cross-origin fallback */ }
                }}
                style={{
                  border: 'none',
                  width: '100%',
                  display: 'block',
                  minHeight: `calc(${pageSettings.height || 297}mm + 80px)`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <ToastStack items={toasts} />

      {/* Report Generator */}
      <ReportGenerator
        isVisible={showGenerator}
        onClose={() => setShowGenerator(false)}
      />
    </div>
  );
}
