import React from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { CanvasDocument, CanvasVariant } from '../canvasTypes';

interface VariantsPanelProps {
  document: CanvasDocument;
  onCreateVariant: (name?: string) => void;
  onApplyVariant: (variantId?: string | null) => void;
  onUpdateVariant: (variantId: string, updates: Partial<CanvasVariant>) => void;
  onDeleteVariant: (variantId: string) => void;
}

function parseSampleData(value: string): Record<string, string | number | boolean> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, string | number | boolean>;
  } catch {
    return undefined;
  }
}

export function VariantsPanel({ document, onCreateVariant, onApplyVariant, onUpdateVariant, onDeleteVariant }: VariantsPanelProps) {
  const variants = document.variants || [];
  const brandKits = document.brandKits || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Variantes</h3>
        <button
          type="button"
          onClick={() => onCreateVariant()}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Plus size={12} />
          Variante
        </button>
      </div>

      <button
        type="button"
        onClick={() => onApplyVariant(null)}
        className={`inline-flex h-8 w-full items-center justify-center rounded-lg border px-3 text-[11px] font-semibold ${document.activeVariantId ? 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50' : 'border-violet-200 bg-violet-50 text-violet-700'}`}
      >
        Usar base sin variante
      </button>

      {variants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-5 text-center text-[11px] text-neutral-400">
          No hay variantes guardadas aun.
        </div>
      ) : variants.map((variant) => (
        <div key={variant.id} className={`space-y-2 rounded-xl border p-2 ${document.activeVariantId === variant.id ? 'border-violet-200 bg-violet-50/60' : 'border-neutral-200 bg-white'}`}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Nombre</span>
              <input
                value={variant.name}
                onChange={(event) => onUpdateVariant(variant.id, { name: event.target.value })}
                placeholder="Variante"
                className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => onDeleteVariant(variant.id)}
              className="inline-flex h-8 w-8 items-center justify-center self-end rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              title="Eliminar variante"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Brand kit</span>
            <select
              value={variant.brandKitId || ''}
              onChange={(event) => onUpdateVariant(variant.id, { brandKitId: event.target.value || undefined })}
              className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
            >
              <option value="">Sin brand kit</option>
              {brandKits.map((brandKit) => (
                <option key={brandKit.id} value={brandKit.id}>{brandKit.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Fondo</span>
            <input
              value={variant.pageSettings?.backgroundColor || ''}
              onChange={(event) => onUpdateVariant(variant.id, { pageSettings: { ...(variant.pageSettings || {}), backgroundColor: event.target.value } })}
              placeholder="#ffffff"
              className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Sample data JSON</span>
            <textarea
              value={variant.sampleData ? JSON.stringify(variant.sampleData, null, 2) : ''}
              onChange={(event) => onUpdateVariant(variant.id, { sampleData: parseSampleData(event.target.value) })}
              rows={4}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-700 outline-none"
              placeholder='{"cliente":"Demo"}'
            />
          </label>
          <button
            type="button"
            onClick={() => onApplyVariant(variant.id)}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
          >
            <Package size={12} />
            Aplicar variante
          </button>
        </div>
      ))}
    </div>
  );
}
