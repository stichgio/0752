import React from 'react';
import { Copy, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react';
import type { CanvasDocument } from '../canvasTypes';

interface PagesPanelProps {
  document: CanvasDocument;
  activePageId: string;
  onSetActivePage: (pageId: string) => void;
  onCreatePage: (name?: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (sourceIndex: number, targetIndex: number) => void;
}

export function PagesPanel({
  document,
  activePageId,
  onSetActivePage,
  onCreatePage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
}: PagesPanelProps) {
  const pages = document.pages || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Paginas</h3>
        <button
          type="button"
          onClick={() => onCreatePage()}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Plus size={12} />
          Pagina
        </button>
      </div>

      {pages.map((page, index) => {
        const count = document.elements.filter((element) => element.pageId === page.id).length;
        const isActive = page.id === activePageId;
        return (
          <div
            key={page.id}
            className={`rounded-xl border p-2 ${isActive ? 'border-violet-200 bg-violet-50/60' : 'border-neutral-200 bg-white'}`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onSetActivePage(page.id)}
                className={`flex w-16 shrink-0 flex-col gap-1 rounded-lg border p-1 text-left ${isActive ? 'border-violet-200 bg-white' : 'border-neutral-200 bg-neutral-50'}`}
              >
                <div className="relative h-16 overflow-hidden rounded bg-neutral-900/5">
                  {Array.from({ length: Math.min(6, count) }).map((_, boxIndex) => (
                    <span
                      key={boxIndex}
                      className="absolute rounded bg-violet-200/80"
                      style={{
                        left: `${8 + ((boxIndex * 13) % 36)}px`,
                        top: `${8 + ((boxIndex * 11) % 36)}px`,
                        width: `${18 + (boxIndex % 2) * 8}px`,
                        height: `${8 + (boxIndex % 3) * 5}px`,
                      }}
                    />
                  ))}
                </div>
                <span className="truncate text-[10px] font-semibold text-neutral-700">{page.name}</span>
                <span className="text-[9px] text-neutral-400">{count} elementos</span>
              </button>

              <div className="min-w-0 flex-1 space-y-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Nombre</span>
                  <input
                    value={page.name}
                    onChange={(event) => onRenamePage(page.id, event.target.value)}
                    placeholder={`Pagina ${index + 1}`}
                    className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onDuplicatePage(page.id)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
                  >
                    <Copy size={12} />
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePage(page.id)}
                    disabled={pages.length <= 1}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMovePage(index, index - 1)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    <MoveUp size={12} />
                    Subir
                  </button>
                  <button
                    type="button"
                    disabled={index === pages.length - 1}
                    onClick={() => onMovePage(index, index + 1)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    <MoveDown size={12} />
                    Bajar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
