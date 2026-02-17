import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle, Clock3, Eye, FileCode2, FileJson, FolderOpen, Grid3X3,
  Keyboard, Loader2, Plus, Redo2, Save, Search, Send, Undo2, X,
} from 'lucide-react';
import { templateEditorApi } from './api';
import type {
  BlockConfig, BlockTemplateDocument, BlockType,
  DataGridConfig, InfoBarConfig, TemplateBlock,
} from './blockTypes';
import BlockEditor from './BlockEditor';

/* ═══ Storage keys ═══ */
const SESSION_KEY = 'block-editor-session-v1';
const LEGACY_KEY = 'block-editor-doc-v1';

/* ═══ Helpers ═══ */
function uid() {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyDocument(): BlockTemplateDocument {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: 'Nueva Plantilla',
    blocks: [],
    pageSettings: { size: 'A4', orientation: 'portrait', marginMm: 5 },
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/** BlockTemplateDocument → API TemplateJson */
function documentToTemplateJson(doc: BlockTemplateDocument, reportType = 'generic') {
  return {
    reportType,
    sections: [
      {
        id: 'page-1',
        type: 'body',
        title: 'Canvas',
        blocks: doc.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          content: '',
          variables: [] as string[],
          placeholders: [] as string[],
          metadata: Object.fromEntries(Object.entries(block.config)),
          locked: block.locked ?? false,
        })),
        metadata: { page: doc.pageSettings },
      },
    ],
    metadata: { source: 'block-editor' },
    variableBindings: {},
    protectionRules: {
      required_block_ids: [] as string[],
      editable_placeholder_by_block: {} as Record<string, string[]>,
    },
  };
}

/** API TemplateJson → BlockTemplateDocument (reverso) */
function templateJsonToBlockDocument(json: any, id: string, name: string): BlockTemplateDocument {
  const section = json?.sections?.[0];
  const now = new Date().toISOString();
  if (!section?.blocks?.length) return { ...createEmptyDocument(), id, name };
  const blocks: TemplateBlock[] = section.blocks.map((b: any) => ({
    id: b.id,
    type: b.type as BlockType,
    config: (b.metadata && typeof b.metadata === 'object' && Object.keys(b.metadata).length > 0
      ? b.metadata
      : {}) as BlockConfig,
    locked: b.locked ?? false,
  }));
  return {
    id,
    name,
    blocks,
    pageSettings: (section.metadata?.page as BlockTemplateDocument['pageSettings'])
      || { size: 'A4', orientation: 'portrait', marginMm: 5 },
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/** Extrae datos de muestra automáticamente de los campos del documento */
function extractSampleData(doc: BlockTemplateDocument): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of doc.blocks) {
    if (block.type === 'info-bar') {
      for (const f of (block.config as InfoBarConfig).fields)
        if (f.variable) out[f.variable] = f.label || f.variable;
    }
    if (block.type === 'data-grid') {
      for (const f of (block.config as DataGridConfig).fields)
        if (f.variable) out[f.variable] = f.label || f.variable;
    }
  }
  return out;
}

/* ═══ Toast ═══ */
type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'info' };

function ToastStack({ items }: { items: Toast[] }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col-reverse gap-2 pointer-events-none select-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-5 py-2.5 text-[12px] font-semibold shadow-xl ${t.type === 'ok' ? 'bg-emerald-600 text-white' :
              t.type === 'err' ? 'bg-red-600 text-white' :
                'bg-neutral-900 text-white'
            }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ═══ Status Pill ═══ */
type PublishStatus = 'draft' | 'published' | 'archived';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', published: 'Publicada', archived: 'Archivada',
};

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    archived: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls[status] || cls.draft}`}>
      <Circle size={5} className="mr-1 fill-current" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* ═══ Toolbar primitives ═══ */
function ToolbarBtn({
  children, onClick, disabled, active, title,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        relative inline-flex items-center justify-center h-8 min-w-[32px] px-2 rounded-lg text-[13px] font-medium
        transition-all duration-150 ease-out select-none
        ${active
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}
        ${disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-5 bg-neutral-200 mx-0.5" />;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function formatDateLabel(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('es-PE', includeTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatShortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

/* ═══ Main ═══ */
export default function TemplateEditor() {
  const [doc, setDoc] = useState<BlockTemplateDocument>(createEmptyDocument);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [reportType, setReportType] = useState('generic');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('draft');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [history, setHistory] = useState<BlockTemplateDocument[]>([]);
  const [future, setFuture] = useState<BlockTemplateDocument[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [publishedTemplates, setPublishedTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Open-template panel
  const [showOpenPanel, setShowOpenPanel] = useState(false);
  const [allTemplates, setAllTemplates] = useState<Array<{ id: string; name: string; status: string; updatedAt: string }>>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [openPanelQuery, setOpenPanelQuery] = useState('');
  const [sessionSavedAt, setSessionSavedAt] = useState<string | null>(null);

  /* ── Toast helper ── */
  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  /* ── Session persistence: load ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.doc?.blocks) {
          setDoc(s.doc);
          if (s.templateId) setTemplateId(s.templateId);
          if (s.publishStatus) setPublishStatus(s.publishStatus);
          if (s.reportType) setReportType(s.reportType);
          if (s.sessionSavedAt) setSessionSavedAt(s.sessionSavedAt);
          return;
        }
      }
      // Migrate from legacy key
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const saved = JSON.parse(legacy);
        if (saved?.blocks) setDoc(saved);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  /* ── Session persistence: auto-save ── */
  useEffect(() => {
    const t = window.setTimeout(() => {
      const now = new Date().toISOString();
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        doc,
        templateId,
        publishStatus,
        reportType,
        sessionSavedAt: now,
      }));
      setSessionSavedAt(now);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [doc, templateId, publishStatus, reportType]);

  /* ── Load published templates ── */
  const loadPublishedTemplates = useCallback(async () => {
    try {
      const data = await templateEditorApi.listPublishedTemplates();
      setPublishedTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      setPublishedTemplates([]);
    }
  }, []);

  useEffect(() => { void loadPublishedTemplates(); }, [loadPublishedTemplates]);

  const visibleTemplates = useMemo(() => {
    const term = openPanelQuery.trim().toLowerCase();
    const ordered = [...allTemplates].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    if (!term) return ordered;
    return ordered.filter((tpl) =>
      `${tpl.name} ${tpl.status} ${tpl.id}`.toLowerCase().includes(term)
    );
  }, [allTemplates, openPanelQuery]);

  const autosaveLabel = useMemo(() => {
    if (saving) return 'Guardando cambios...';
    if (dirty) return 'Cambios pendientes';
    if (!sessionSavedAt) return 'Sin cambios pendientes';
    return `Autoguardado ${new Date(sessionSavedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  }, [dirty, saving, sessionSavedAt]);

  /* ── Warn on unsaved changes ── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ── Document change (records history) ── */
  const handleDocChange = useCallback((newDoc: BlockTemplateDocument) => {
    setHistory((h) => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc(newDoc);
    setDirty(true);
  }, [doc]);

  /* ── Undo / Redo ── */
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [doc, ...f.slice(0, 49)]);
    setDoc(prev);
  }, [history, doc]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h.slice(-49), doc]);
    setDoc(next);
  }, [future, doc]);

  /* ── Keyboard shortcuts (single persistent listener via refs) ── */
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const saveRef = useRef<() => void>(() => { });

  useEffect(() => { undoRef.current = undo; }, [undo]);
  useEffect(() => { redoRef.current = redo; }, [redo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmd = e.ctrlKey || e.metaKey;
      if (!isCmd) return;
      const key = e.key.toLowerCase();
      const editingField = isEditableTarget(e.target);
      if (key === 's') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (editingField) return;
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoRef.current(); else undoRef.current();
      }
      if (key === 'y') {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // adjuntar una sola vez

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showPreviewModal) setShowPreviewModal(false);
      if (showOpenPanel) setShowOpenPanel(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showOpenPanel, showPreviewModal]);

  /* ── Save ── */
  const save = useCallback(async () => {
    if (doc.blocks.length === 0) {
      toast('Agrega al menos un bloque antes de guardar', 'info');
      return;
    }
    setSaving(true);
    try {
      const templateJson = documentToTemplateJson(doc, reportType);
      if (!templateId) {
        const created = await templateEditorApi.createTemplate({
          name: doc.name,
          reportType,
          author: 'block-editor',
          featureFlag: true,
          templateJson,
        });
        setTemplateId(created.id);
        // Keep UI status aligned with backend after save.
        setPublishStatus((created?.status as PublishStatus) || 'draft');
        toast('Plantilla creada y guardada', 'ok');
      } else {
        const updated = await templateEditorApi.updateTemplate(templateId, {
          role: 'admin',
          author: 'block-editor',
          templateJson,
        });
        // Saving should keep template as draft until explicit publish action.
        setPublishStatus((updated?.template?.status as PublishStatus) || 'draft');
        toast('Cambios guardados', 'ok');
      }
      await loadPublishedTemplates();
      setDirty(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Error desconocido';
      toast(`No se pudo guardar: ${detail}`, 'err');
    } finally {
      setSaving(false);
    }
  }, [doc, reportType, templateId, toast, loadPublishedTemplates]);

  // Mantener saveRef actualizado
  useEffect(() => { saveRef.current = save; }, [save]);

  /* ── Preview ── */
  const preview = useCallback(async () => {
    if (doc.blocks.length === 0) {
      toast('No hay bloques para previsualizar', 'info');
      return;
    }
    if (!templateId) {
      toast('Guarda la plantilla primero para ver el preview', 'info');
      return;
    }
    setPreviewLoading(true);
    setShowPreviewModal(true);
    try {
      const sampleData = extractSampleData(doc);
      const res = await templateEditorApi.previewTemplate(templateId, sampleData);
      setPreviewHtml(res.previewHtml || '');
    } catch {
      toast('No se pudo generar el preview', 'err');
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [templateId, doc, toast]);

  /* ── Publish ── */
  const publish = useCallback(async () => {
    if (!templateId) {
      toast('Guarda la plantilla primero', 'info');
      return;
    }
    try {
      const data = await templateEditorApi.publishTemplate(templateId, 'block-editor');
      setPublishStatus((data.status as PublishStatus) || 'published');
      await loadPublishedTemplates();
      setDirty(false);
      toast('Plantilla publicada. Ya está disponible en el generador de reportes.', 'ok');
    } catch {
      toast('No se pudo publicar. Verifica que FEATURE_TEMPLATE_EDITOR=true en el backend.', 'err');
    }
  }, [templateId, loadPublishedTemplates, toast]);

  /* ── Delete published template ── */
  const deletePublishedTemplate = useCallback(async (pubId: string, pubName: string) => {
    if (!window.confirm(`¿Eliminar la plantilla publicada "${pubName}"?\nEsta acción no se puede deshacer.`)) return;
    setDeletingTemplateId(pubId);
    try {
      await templateEditorApi.deleteTemplate(pubId, 'block-editor');
      await loadPublishedTemplates();
      if (templateId === pubId) { setTemplateId(null); setPublishStatus('draft'); }
      toast(`Plantilla "${pubName}" eliminada`, 'ok');
    } catch {
      toast('No se pudo eliminar la plantilla', 'err');
    } finally {
      setDeletingTemplateId(null);
    }
  }, [templateId, loadPublishedTemplates, toast]);

  /* ── New template ── */
  const newTemplate = useCallback(() => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Crear nueva plantilla de todas formas?')) return;
    const fresh = createEmptyDocument();
    setDoc(fresh);
    setTemplateId(null);
    setPublishStatus('draft');
    setReportType('generic');
    setHistory([]);
    setFuture([]);
    setDirty(false);
    localStorage.removeItem(SESSION_KEY);
    toast('Nueva plantilla creada', 'info');
  }, [dirty, toast]);

  /* ── Open template panel ── */
  const openLoadPanel = useCallback(async () => {
    setShowOpenPanel(true);
    setOpenPanelQuery('');
    setLoadingTemplates(true);
    try {
      const data = await templateEditorApi.listTemplates();
      setAllTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      toast('No se pudo cargar la lista de plantillas', 'err');
    } finally {
      setLoadingTemplates(false);
    }
  }, [toast]);

  const loadTemplate = useCallback(async (tpl: { id: string; name: string; status: string }) => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Cargar esta plantilla de todas formas?')) return;
    setLoadingTemplateId(tpl.id);
    try {
      const raw = await templateEditorApi.getTemplateRaw(tpl.id);
      const versions = raw.versions || [];
      const latest = versions[versions.length - 1];
      if (!latest?.templateJson) {
        toast('Esta plantilla no tiene contenido guardado', 'err');
        return;
      }
      const loaded = templateJsonToBlockDocument(latest.templateJson, raw.id, raw.name);
      setDoc(loaded);
      setTemplateId(raw.id);
      setPublishStatus((raw.status as PublishStatus) || 'draft');
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setShowOpenPanel(false);
      toast(`Plantilla "${raw.name}" cargada`, 'ok');
    } catch {
      toast('Error al cargar la plantilla', 'err');
    } finally {
      setLoadingTemplateId(null);
    }
  }, [dirty, toast]);

  /* ── Export JSON ── */
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'template'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  /* ── Export HTML ── */
  const exportHtml = useCallback(async () => {
    if (!templateId) {
      toast('Guarda la plantilla primero para exportar HTML', 'info');
      return;
    }
    try {
      const res = await templateEditorApi.previewTemplate(templateId, extractSampleData(doc));
      const blob = new Blob([res.previewHtml || ''], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.name || 'template'}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('No se pudo exportar HTML', 'err');
    }
  }, [templateId, doc, toast]);

  /* ═══ Render ═══ */
  return (
    <div
      data-template-editor
      className="h-full w-full overflow-hidden text-neutral-900 flex flex-col bg-[radial-gradient(circle_at_top,#f8faff_0%,#edf1ff_42%,#eff2f7_100%)]"
      style={{ fontFamily: '"Manrope", "Segoe UI", sans-serif' }}
    >
      {/* ═══ TOP BAR ═══ */}
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.08)] z-50 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm">
                <Grid3X3 size={14} className="text-white" />
              </div>
              <span className="text-[13px] font-bold tracking-tight text-neutral-900 hidden xl:inline">Template Builder</span>
            </div>
            <ToolbarSeparator />
            <ToolbarBtn onClick={newTemplate} title="Nueva plantilla (limpia)">
              <Plus size={14} />
              <span className="ml-1 hidden lg:inline text-[12px]">Nuevo</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={openLoadPanel} title="Abrir plantilla guardada en el backend">
              <FolderOpen size={14} />
              <span className="ml-1 hidden lg:inline text-[12px]">Abrir</span>
            </ToolbarBtn>
            <ToolbarSeparator />
            <input
              className="h-8 w-48 sm:w-64 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-[13px] text-neutral-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 focus:bg-white transition-all placeholder:text-neutral-400"
              value={doc.name}
              onChange={(e) => handleDocChange({ ...doc, name: e.target.value })}
              placeholder="Nombre de la plantilla"
            />
            <StatusPill status={publishStatus} />
            {dirty && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Cambios sin guardar" />
            )}
          </div>

          {/* Center: undo/redo */}
          <div className="flex items-center gap-0.5 bg-neutral-100 rounded-xl p-1 border border-neutral-200/60">
            <ToolbarBtn onClick={undo} disabled={history.length === 0} title="Deshacer (Ctrl+Z)">
              <Undo2 size={15} />
            </ToolbarBtn>
            <ToolbarBtn onClick={redo} disabled={future.length === 0} title="Rehacer (Ctrl+Shift+Z / Ctrl+Y)">
              <Redo2 size={15} />
            </ToolbarBtn>
          </div>

          {/* Right: actions */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <select
              value={reportType}
              onChange={(e) => { setReportType(e.target.value); setDirty(true); }}
              className="h-8 rounded-lg bg-neutral-50 border border-neutral-200 px-2 text-[11px] text-neutral-600 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all cursor-pointer hidden xl:block"
              style={{ colorScheme: 'light' }}
              title="Tipo de reporte"
            >
              <option value="generic">Generico</option>
              <option value="technical_report">Informe Tecnico</option>
              <option value="ficha_tecnica">Ficha Tecnica</option>
            </select>
            <ToolbarSeparator />
            <ToolbarBtn onClick={save} disabled={saving} title="Guardar (Ctrl+S)">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span className="ml-1.5 hidden lg:inline text-[12px]">{saving ? 'Guardando...' : 'Guardar'}</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={preview} disabled={previewLoading || !templateId} title="Vista previa con datos de muestra">
              {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              <span className="ml-1.5 hidden lg:inline text-[12px]">Preview</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={exportHtml} disabled={!templateId} title="Exportar HTML compilado">
              <FileCode2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={exportJson} title="Exportar JSON de la plantilla">
              <FileJson size={14} />
            </ToolbarBtn>
            <ToolbarSeparator />
            <button
              onClick={publish}
              disabled={!templateId}
              className="
              inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12px] font-semibold
              bg-violet-600 text-white hover:bg-violet-700
              shadow-[0_2px_8px_rgba(124,58,237,0.35)]
              active:scale-[0.97] transition-all duration-150 ease-out
              disabled:opacity-40 disabled:pointer-events-none
            "
              title="Publicar plantilla (requiere FEATURE_TEMPLATE_EDITOR=true)"
            >
              <Send size={12} />
              Publicar
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1">
            <Clock3 size={11} />
            {autosaveLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1">
            Bloques: <b className="text-neutral-700">{doc.blocks.length}</b>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1">
            ID: {templateId ? formatShortId(templateId) : 'sin guardar'}
          </span>
          <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1">
            <Keyboard size={11} /> Ctrl+S guardar | Ctrl+Z deshacer
          </span>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <BlockEditor
          document={doc}
          onChange={handleDocChange}
          publishedTemplates={publishedTemplates}
          deletingTemplateId={deletingTemplateId}
          onDeletePublishedTemplate={deletePublishedTemplate}
          onLoadTemplate={loadTemplate}
          loadingTemplateId={loadingTemplateId}
        />
      </div>

      {/* ═══ Open Templates Panel ═══ */}
      {showOpenPanel && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-14 sm:pt-20 bg-black/30 backdrop-blur-sm"
          onClick={() => setShowOpenPanel(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[calc(100vw-24px)] max-h-[78vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
              <div>
                <span className="text-[13px] font-semibold text-neutral-800">Abrir plantilla</span>
                <p className="text-[10px] text-neutral-400 mt-0.5">Selecciona una plantilla del backend para cargarla en el editor</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-400">{visibleTemplates.length} resultados</span>
                <button
                  onClick={() => setShowOpenPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-neutral-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={openPanelQuery}
                  onChange={(e) => setOpenPanelQuery(e.target.value)}
                  placeholder="Buscar por nombre, estado o ID..."
                  className="w-full h-9 rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loadingTemplates ? (
                <div className="flex items-center justify-center h-32 text-neutral-400">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span className="text-[12px]">Cargando plantillas...</span>
                </div>
              ) : visibleTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-neutral-400 text-[12px] px-6 text-center">
                  <span>{allTemplates.length === 0 ? 'No hay plantillas guardadas en el backend.' : 'No hay coincidencias con ese criterio.'}</span>
                  {openPanelQuery.trim() && (
                    <span className="text-[11px] mt-1 text-neutral-500">Prueba con otro termino de busqueda.</span>
                  )}
                </div>
              ) : (
                visibleTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate(tpl)}
                    disabled={loadingTemplateId === tpl.id}
                    className={`w-full text-left rounded-xl px-4 py-3 border transition-all group disabled:opacity-50 ${templateId === tpl.id
                        ? 'border-violet-300 bg-violet-50/50'
                        : 'border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-neutral-800 truncate">{tpl.name}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          <StatusPill status={tpl.status} />
                          <span className="ml-1.5">
                            {formatDateLabel(tpl.updatedAt, true)}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono mt-1 truncate">{tpl.id}</div>
                      </div>
                      {loadingTemplateId === tpl.id
                        ? <Loader2 size={14} className="animate-spin text-neutral-400 shrink-0" />
                        : <span className="text-[11px] text-neutral-400 group-hover:text-blue-500 transition-colors shrink-0">Abrir -&gt;</span>
                      }
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Preview Modal ═══ */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl shadow-neutral-900/20 w-[90vw] max-w-[850px] h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-neutral-500" />
                <span className="text-[13px] font-semibold text-neutral-800">Vista Previa</span>
                <span className="text-[10px] text-neutral-400">Variables rellenadas con datos de muestra</span>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-neutral-50">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full text-neutral-400">
                  <Loader2 size={24} className="animate-spin mr-3" />
                  <span className="text-[13px]">Generando preview...</span>
                </div>
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  title="Vista Previa"
                  className="mx-auto bg-white rounded-sm shadow-lg block"
                  style={{ width: 'min(100%, 794px)', minHeight: 500, height: '100%', border: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toasts ═══ */}
      <ToastStack items={toasts} />
    </div>
  );
}
