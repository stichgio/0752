import React, { useMemo, useState } from 'react';
import { ImagePlus, Plus, Search, Trash2 } from 'lucide-react';
import { generateId, type AssetLibraryItem } from '../canvasTypes';

interface AssetsPanelProps {
  assets: AssetLibraryItem[];
  onChange: (assets: AssetLibraryItem[]) => void;
  onInsertAsset: (asset: AssetLibraryItem) => void;
}

export function AssetsPanel({ assets, onChange, onInsertAsset }: AssetsPanelProps) {
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<AssetLibraryItem['type']>('image');
  const [tags, setTags] = useState('');

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return assets;
    return assets.filter((asset) => {
      const haystack = [
        asset.name,
        asset.url,
        ...(asset.tags || []),
      ].join(' ').toLocaleLowerCase('es');
      return haystack.includes(term);
    });
  }, [assets, search]);

  const addAsset = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;

    onChange([
      ...assets,
      {
        id: `asset_${generateId()}`,
        name: trimmedName,
        type,
        url: trimmedUrl,
        tags: tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
    ]);

    setName('');
    setUrl('');
    setTags('');
    setType('image');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-neutral-100 px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
          <Search size={12} className="text-neutral-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar asset..."
            className="w-full bg-transparent text-xs text-neutral-700 outline-none placeholder-neutral-400"
          />
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-2 space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <InlineInput value={name} onChange={setName} placeholder="Nombre del asset" />
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AssetLibraryItem['type'])}
              className="h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
            >
              <option value="image">Imagen</option>
              <option value="logo">Logo</option>
            </select>
          </div>
          <InlineInput value={url} onChange={setUrl} placeholder="https://..." />
          <InlineInput value={tags} onChange={setTags} placeholder="tags, separados, por, coma" />
          <button
            type="button"
            onClick={addAsset}
            disabled={!name.trim() || !url.trim()}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus size={12} />
            Guardar asset
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filteredAssets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-5 text-center">
            <ImagePlus size={18} className="mx-auto text-neutral-300" />
            <p className="mt-2 text-[11px] text-neutral-400">
              {assets.length === 0 ? 'Aun no hay assets guardados.' : 'No hay coincidencias para esa busqueda.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="rounded-xl border border-neutral-200 bg-white p-2">
                <div className="flex items-start gap-2">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-neutral-700" title={asset.name}>
                      {asset.name}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                      {asset.type}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-neutral-400" title={asset.url}>
                      {asset.url}
                    </div>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {asset.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => onInsertAsset(asset)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    Insertar en canvas
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(assets.filter((item) => item.id !== asset.id))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    title="Eliminar asset"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
    />
  );
}

