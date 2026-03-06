import React from 'react';
import { Plus, RefreshCcw, Trash2, Wand2 } from 'lucide-react';
import type { CanvasComponent, CanvasDocument } from '../canvasTypes';

interface ComponentsPanelProps {
  document: CanvasDocument;
  selectedIds: string[];
  onCreateComponentFromSelection: (name?: string) => void;
  onInsertComponent: (componentId: string) => void;
  onSyncComponent: (componentId: string) => void;
  onUpdateComponentFromSelection: (componentId: string, groupId: string) => void;
  onUpdateComponent: (componentId: string, updates: Partial<CanvasComponent>) => void;
  onDeleteComponent: (componentId: string) => void;
}

export function ComponentsPanel({
  document,
  selectedIds,
  onCreateComponentFromSelection,
  onInsertComponent,
  onSyncComponent,
  onUpdateComponentFromSelection,
  onUpdateComponent,
  onDeleteComponent,
}: ComponentsPanelProps) {
  const components = document.components || [];
  const selectedGroup = document.elements.find((element) => selectedIds.includes(element.id) && element.type === 'group');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Componentes</h3>
        <button
          type="button"
          onClick={() => onCreateComponentFromSelection()}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Plus size={12} />
          Guardar
        </button>
      </div>

      {components.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-5 text-center text-[11px] text-neutral-400">
          No hay componentes guardados aun.
        </div>
      ) : components.map((component) => {
        const selectedGroupId = selectedGroup?.componentId === component.id ? selectedGroup.id : null;
        return (
          <div key={component.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Nombre</span>
              <input
                value={component.name}
                onChange={(event) => onUpdateComponent(component.id, { name: event.target.value })}
                placeholder="Componente"
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-500">
              <span>{component.elements.length} elementos base</span>
              <span className="text-right">v{component.version}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onInsertComponent(component.id)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
              >
                <Plus size={12} />
                Insertar
              </button>
              <button
                type="button"
                onClick={() => onSyncComponent(component.id)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                <RefreshCcw size={12} />
                Sincronizar
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                disabled={!selectedGroupId}
                onClick={() => selectedGroupId && onUpdateComponentFromSelection(component.id, selectedGroupId)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <Wand2 size={12} />
                Actualizar desde seleccion
              </button>
              <button
                type="button"
                onClick={() => onDeleteComponent(component.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                title="Eliminar componente"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
