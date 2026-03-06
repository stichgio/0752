import React from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import type { BrandKit, CanvasDocument } from '../canvasTypes';

interface BrandKitsPanelProps {
  document: CanvasDocument;
  onCreateBrandKit: (name?: string) => void;
  onApplyBrandKit: (brandKitId: string) => void;
  onUpdateBrandKit: (brandKitId: string, updates: Partial<BrandKit>) => void;
  onDeleteBrandKit: (brandKitId: string) => void;
}

export function BrandKitsPanel({
  document,
  onCreateBrandKit,
  onApplyBrandKit,
  onUpdateBrandKit,
  onDeleteBrandKit,
}: BrandKitsPanelProps) {
  const brandKits = document.brandKits || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Brand kits</h3>
        <button
          type="button"
          onClick={() => onCreateBrandKit()}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Plus size={12} />
          Brand kit
        </button>
      </div>

      {brandKits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-5 text-center text-[11px] text-neutral-400">
          No hay brand kits guardados aun.
        </div>
      ) : brandKits.map((brandKit) => (
        <div key={brandKit.id} className={`space-y-2 rounded-xl border p-2 ${document.brandKitId === brandKit.id ? 'border-violet-200 bg-violet-50/60' : 'border-neutral-200 bg-white'}`}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Nombre</span>
              <input
                value={brandKit.name}
                onChange={(event) => onUpdateBrandKit(brandKit.id, { name: event.target.value })}
                placeholder="Brand kit"
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => onDeleteBrandKit(brandKit.id)}
              className="inline-flex h-8 w-8 items-center justify-center self-end rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              title="Eliminar brand kit"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Logo left</span>
              <input
                value={brandKit.logos?.left || ''}
                onChange={(event) => onUpdateBrandKit(brandKit.id, { logos: { ...(brandKit.logos || {}), left: event.target.value } })}
                placeholder="https://..."
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Logo right</span>
              <input
                value={brandKit.logos?.right || ''}
                onChange={(event) => onUpdateBrandKit(brandKit.id, { logos: { ...(brandKit.logos || {}), right: event.target.value } })}
                placeholder="https://..."
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Fondo</span>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2">
                <Palette size={12} className="text-neutral-400" />
                <input
                  value={brandKit.backgroundColor || '#ffffff'}
                  onChange={(event) => onUpdateBrandKit(brandKit.id, { backgroundColor: event.target.value })}
                  placeholder="#ffffff"
                  className="h-8 w-full bg-transparent text-[11px] text-neutral-700 outline-none"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => onApplyBrandKit(brandKit.id)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
            >
              Aplicar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
