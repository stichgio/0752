import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  FileCode2, FileJson, Grid3X3, Plus,
  Redo2, Save, Send, Undo2, X, Eye, Download, Upload,
} from 'lucide-react';
import type { CanvasDocument } from './canvasTypes';
import { createEmptyDocument } from './canvasTypes';
import CanvasEditor from './CanvasEditor';
import { exportToJinja2, exportToJSON, importFromJSON, generatePreviewHtml } from './exportUtils';

const SESSION_KEY = 'canvas-editor-session-v1';

// ─── Toast ────────────────────────────────────────────────────────────────────

type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'info' };

const ToastStack = memo(function ToastStack({ items }: { items: Toast[] }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col-reverse gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
            t.type === 'ok' ? 'bg-emerald-600 text-white' :
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
  const [doc, setDoc] = useState<CanvasDocument>(createEmptyDocument);
  const [status, setStatus] = useState<PublishStatus>('draft');
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<CanvasDocument[]>([]);
  const [future, setFuture] = useState<CanvasDocument[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
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
          setDoc(s.doc);
          setStatus((s.status as PublishStatus) || 'draft');
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  // ── Auto-save ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ doc, status }));
    }, 1000);
    return () => clearTimeout(t);
  }, [doc, status]);

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

  const handleDocChange = useCallback((newDoc: CanvasDocument) => {
    setHistory(h => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc(newDoc);
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [doc, status]);

  const undo = useCallback(() => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setFuture(f => [doc, ...f.slice(0, 49)]);
    setDoc(prev);
  }, [history, doc]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setHistory(h => [...h.slice(-49), doc]);
    setDoc(next);
  }, [future, doc]);

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
    setDoc(d);
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setStatus('draft');
    localStorage.removeItem(SESSION_KEY);
    toast('Nueva plantilla creada', 'ok');
  }, [dirty, toast]);

  /** Load a preset or imported doc into the editor */
  const loadDocument = useCallback((newDoc: CanvasDocument) => {
    setHistory(h => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc({ ...newDoc, status: 'draft', updatedAt: new Date().toISOString() });
    setStatus('draft');
    setDirty(true);
    toast(`Plantilla "${newDoc.name}" cargada`, 'ok');
  }, [doc, toast]);

  const exportHtml = useCallback(() => {
    const html = exportToJinja2(doc);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'template'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast('HTML exportado', 'ok');
  }, [doc, toast]);

  const exportJson = useCallback(() => {
    const json = exportToJSON(doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const saveLocally = useCallback(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ doc, status }));
    setDirty(false);
    toast('Guardado localmente', 'ok');
  }, [doc, status, toast]);

  const publish = useCallback(() => {
    if (!doc.elements.length) {
      toast('Agrega al menos un elemento antes de publicar', 'err');
      return;
    }
    const updated = { ...doc, status: 'published' as const, updatedAt: new Date().toISOString() };
    setDoc(updated);
    setStatus('published');
    setDirty(false);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ doc: updated, status: 'published' }));
    toast('Plantilla publicada', 'ok');
  }, [doc, toast]);

  return (
    <div className="template-editor-root h-full w-full flex flex-col bg-neutral-50">
      {/* Header */}
      <header className="h-14 bg-white border-b border-neutral-200 px-4 flex items-center justify-between shadow-sm z-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Logo */}
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <Grid3X3 size={16} />
          </div>
          <span className="font-bold text-neutral-900 flex-shrink-0">Canvas Editor</span>

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

          <StatusPill status={status} />
          {dirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Cambios sin guardar" />
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
            <ToolbarBtn onClick={undo} disabled={!history.length} title="Deshacer (Ctrl+Z)">
              <Undo2 size={16} />
            </ToolbarBtn>
            <ToolbarBtn onClick={redo} disabled={!future.length} title="Rehacer (Ctrl+Y)">
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

          {/* Save (local) */}
          <ToolbarBtn onClick={saveLocally} disabled={!dirty} title="Guardar sesión localmente">
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
          onChange={handleDocChange}
          isDirty={dirty}
          onLoadTemplate={loadDocument}
        />
      </div>

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
                style={{
                  border: 'none',
                  width: '100%',
                  display: 'block',
                  minHeight: `calc(${doc.pageSettings?.height ?? 297}mm + 80px)`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <ToastStack items={toasts} />
    </div>
  );
}
