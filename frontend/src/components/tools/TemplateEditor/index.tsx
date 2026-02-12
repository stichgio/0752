import React, { useCallback, useEffect, useState } from 'react';
import {
  Circle, Eye, FileCode2, FileJson, Grid3X3, Redo2, Save,
  Send, Undo2, X,
} from 'lucide-react';
import { templateEditorApi } from './api';
import type { BlockConfig, BlockTemplateDocument } from './blockTypes';
import BlockEditor from './BlockEditor';

const DRAFT_KEY = 'block-editor-doc-v1';

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

function blockConfigToMetadata(config: BlockConfig): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config));
}

/* Convert BlockTemplateDocument to the legacy TemplateJson for API */
function documentToTemplateJson(doc: BlockTemplateDocument) {
  const blocks = doc.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: '',
    variables: [] as string[],
    placeholders: [] as string[],
    metadata: blockConfigToMetadata(block.config),
    locked: block.locked ?? false,
  }));

  return {
    reportType: 'default',
    sections: [
      {
        id: 'page-1',
        type: 'body',
        title: 'Canvas',
        blocks,
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

type PublishStatus = 'draft' | 'published' | 'archived';

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    archived: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] || map.draft}`}>
      <Circle size={5} className="mr-1 fill-current" />
      {status}
    </span>
  );
}

function ToolbarBtn({ children, onClick, disabled, active, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        relative inline-flex items-center justify-center h-8 min-w-[32px] px-2 rounded-lg text-[13px] font-medium
        transition-all duration-150 ease-out select-none
        ${active ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}
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

/* ═══ Main ═══ */

export default function TemplateEditor() {
  const [doc, setDoc] = useState<BlockTemplateDocument>(createEmptyDocument);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('draft');
  const [publishVersion, setPublishVersion] = useState(1);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [history, setHistory] = useState<BlockTemplateDocument[]>([]);
  const [future, setFuture] = useState<BlockTemplateDocument[]>([]);

  // Load draft from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved && saved.blocks) {
        setDoc(saved);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    const t = window.setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)), 2200);
    return () => window.clearTimeout(t);
  }, [doc]);

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Undo/Redo keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmd = e.ctrlKey || e.metaKey;
      if (isCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [history, future, doc]);

  const handleDocChange = useCallback((newDoc: BlockTemplateDocument) => {
    setHistory((h) => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc(newDoc);
    setDirty(true);
  }, [doc]);

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDoc(prev);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, doc]);
    setDoc(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const templateJson = documentToTemplateJson(doc);
      if (!templateId) {
        const created = await templateEditorApi.createTemplate({
          name: doc.name,
          reportType: 'default',
          document: {} as any, // Not used when templateJson is provided
          author: 'block-editor',
          featureFlag: true,
          templateJson,
        });
        setTemplateId(created.id);
      } else {
        await templateEditorApi.updateTemplate(templateId, {
          role: 'admin',
          author: 'block-editor',
          document: {} as any,
          templateJson,
        });
      }
      setDirty(false);
    } catch (err) {
      console.error('Save failed:', err);
      alert('No se pudo guardar la plantilla. Verifique la conexión al backend.');
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!templateId) {
      alert('Guarda la plantilla primero para ver el preview.');
      return;
    }
    try {
      const res = await templateEditorApi.previewTemplate(templateId, {
        CENTRO: 'ATE',
        NIS: '12345',
        'Nro OT': 'OT-001',
        DIRECCION: 'Av. Principal 123',
        LOCALIDAD: 'San Borja',
        DISTRITO: 'Lima',
        ESTADO: 'Activo',
        'TIPO RED': 'Agua',
        SECTOR: 'S-01',
        ACTIVIDAD: 'Reparación',
        CONTRATA: 'Empresa SAC',
      });
      setPreviewHtml(res.previewHtml || '');
      setShowPreviewModal(true);
    } catch {
      alert('No se pudo generar preview. Verifique que el template esté guardado.');
    }
  };

  const publish = async () => {
    if (!templateId) {
      alert('Guarda la plantilla primero.');
      return;
    }
    try {
      const data = await templateEditorApi.publishTemplate(templateId, 'block-editor');
      setPublishStatus((data.status as PublishStatus) || 'published');
      setPublishVersion(data.currentVersion || publishVersion + 1);
      setDirty(false);
      alert('Plantilla publicada. Ahora estará disponible en el generador de reportes.');
    } catch {
      alert('No se pudo publicar. Verifique que FEATURE_TEMPLATE_EDITOR=true en el backend.');
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'template'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHtml = async () => {
    if (!templateId) {
      alert('Guarda la plantilla primero para exportar HTML.');
      return;
    }
    try {
      const res = await templateEditorApi.previewTemplate(templateId, {});
      const html = res.previewHtml || '';
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.name || 'template'}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo exportar HTML.');
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f5f5f7] text-neutral-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>

      {/* ═══ TOP BAR ═══ */}
      <header className="h-12 bg-white/80 backdrop-blur-xl border-b border-neutral-200/60 px-4 flex items-center justify-between z-50 relative">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-neutral-900 flex items-center justify-center">
              <Grid3X3 size={13} className="text-white" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-neutral-900">Template Builder</span>
          </div>
          <ToolbarSeparator />
          <input
            className="h-7 w-52 rounded-md bg-neutral-100 border-0 px-2.5 text-[12px] text-neutral-700 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-300 focus:bg-white transition-all placeholder:text-neutral-400"
            value={doc.name}
            onChange={(e) => {
              handleDocChange({ ...doc, name: e.target.value });
            }}
            placeholder="Nombre de la plantilla"
          />
          <StatusPill status={publishStatus} />
          {dirty && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Cambios sin guardar" />}
        </div>

        {/* Center: undo/redo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
          <ToolbarBtn onClick={undo} disabled={history.length === 0} title="Deshacer (Ctrl+Z)"><Undo2 size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={redo} disabled={future.length === 0} title="Rehacer (Ctrl+Shift+Z)"><Redo2 size={15} /></ToolbarBtn>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <ToolbarBtn onClick={save} disabled={saving} title="Guardar">
            <Save size={14} />
            <span className="ml-1.5 hidden lg:inline">{saving ? 'Guardando...' : 'Guardar'}</span>
          </ToolbarBtn>
          <ToolbarBtn onClick={preview} title="Preview con datos de ejemplo">
            <Eye size={14} />
            <span className="ml-1.5 hidden lg:inline">Preview</span>
          </ToolbarBtn>
          <ToolbarBtn onClick={exportHtml} title="Exportar HTML">
            <FileCode2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={exportJson} title="Exportar JSON">
            <FileJson size={14} />
          </ToolbarBtn>
          <ToolbarSeparator />
          <button
            onClick={publish}
            className="
              inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12px] font-semibold
              bg-neutral-900 text-white hover:bg-neutral-800
              shadow-[0_1px_2px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]
              active:scale-[0.97] transition-all duration-150 ease-out
            "
          >
            <Send size={12} />
            Publicar
          </button>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="h-[calc(100vh-48px)]">
        <BlockEditor document={doc} onChange={handleDocChange} />
      </div>

      {/* ═══ Preview Modal ═══ */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl shadow-neutral-900/20 w-[90vw] max-w-[850px] h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-neutral-500" />
                <span className="text-[13px] font-semibold text-neutral-800">Vista Previa</span>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-neutral-50">
              <div className="mx-auto bg-white rounded-sm shadow-lg max-w-[794px]" style={{ minHeight: 500 }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
