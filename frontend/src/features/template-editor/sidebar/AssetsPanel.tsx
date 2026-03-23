import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  ImagePlus,
  Link2,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { generateId, type AssetLibraryItem } from '../canvasTypes';
import { PexelsTab } from './PexelsTab';

type AssetSource = 'biblioteca' | 'pexels';

interface AssetsPanelProps {
  assets: AssetLibraryItem[];
  onChange: (assets: AssetLibraryItem[]) => void;
  onInsertAsset: (asset: AssetLibraryItem) => void;
}

type SortKey = 'reciente' | 'nombre';
type FilterType = 'all' | 'image' | 'logo';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export function AssetsPanel({ assets, onChange, onInsertAsset }: AssetsPanelProps) {
  const [source, setSource] = useState<AssetSource>('biblioteca');

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [filterMissing, setFilterMissing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('reciente');
  const [showFilters, setShowFilters] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('general');
  const [type, setType] = useState<AssetLibraryItem['type']>('image');
  const [tags, setTags] = useState('');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);

  const folders = useMemo(() => {
    const set = new Set(assets.map((a) => a.folder || 'general'));
    return Array.from(set).sort();
  }, [assets]);

  const missingCount = useMemo(() => assets.filter((a) => a.missing).length, [assets]);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    let result = assets.filter((asset) => {
      if (filterType !== 'all' && asset.type !== filterType) return false;
      if (filterFolder !== 'all' && (asset.folder || 'general') !== filterFolder) return false;
      if (filterMissing && !asset.missing) return false;
      if (term) {
        const haystack = [asset.name, asset.url, asset.folder || '', ...(asset.tags || [])]
          .join(' ')
          .toLocaleLowerCase('es');
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortKey === 'nombre') return a.name.localeCompare(b.name, 'es');
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [assets, search, filterType, filterFolder, filterMissing, sortKey]);

  const hasActiveFilters = filterType !== 'all' || filterFolder !== 'all' || filterMissing;
  const activeFilterCount = [filterType !== 'all', filterFolder !== 'all', filterMissing].filter(Boolean).length;

  const upsertAsset = (nextAsset: AssetLibraryItem) => {
    const exists = assets.some((a) => a.id === nextAsset.id);
    onChange(exists ? assets.map((a) => (a.id === nextAsset.id ? nextAsset : a)) : [...assets, nextAsset]);
  };

  const resetForm = () => {
    setEditingAssetId(null);
    setName('');
    setUrl('');
    setFolder('general');
    setTags('');
    setType('image');
  };

  const saveAsset = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;

    upsertAsset({
      id: editingAssetId || `asset_${generateId()}`,
      name: trimmedName,
      type,
      url: trimmedUrl,
      folder: folder.trim() || 'general',
      tags: tags.split(',').map((v) => v.trim()).filter(Boolean),
      sourceType: trimmedUrl.startsWith('data:') ? 'inline' : 'remote',
      updatedAt: new Date().toISOString(),
      createdAt: assets.find((a) => a.id === editingAssetId)?.createdAt || new Date().toISOString(),
      missing: false,
    });

    resetForm();
    if (editingAssetId) setAddOpen(false);
  };

  const startEdit = (asset: AssetLibraryItem) => {
    setEditingAssetId(asset.id);
    setName(asset.name);
    setUrl(asset.url);
    setFolder(asset.folder || 'general');
    setTags((asset.tags || []).join(', '));
    setType(asset.type);
    setAddOpen(true);
  };

  const handleAddUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setEditingAssetId(null);
    setName(file.name.replace(/\.[^.]+$/, ''));
    setUrl(dataUrl);
    setType(file.type.includes('svg') || file.name.toLowerCase().includes('logo') ? 'logo' : 'image');
    setAddOpen(true);
    if (event.target) event.target.value = '';
  };

  const handleReplaceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetId = replaceTargetIdRef.current;
    if (!file || !targetId) return;
    const dataUrl = await readFileAsDataUrl(file);
    const target = assets.find((a) => a.id === targetId);
    if (target) {
      upsertAsset({ ...target, url: dataUrl, sourceType: 'inline', missing: false, updatedAt: new Date().toISOString() });
    }
    replaceTargetIdRef.current = null;
    if (event.target) event.target.value = '';
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterFolder('all');
    setFilterMissing(false);
    setSearch('');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Selector de fuente */}
      <div className="flex border-b border-neutral-100 bg-white px-3 pt-2 pb-0 gap-0.5">
        <button
          type="button"
          onClick={() => setSource('biblioteca')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            source === 'biblioteca'
              ? 'border border-b-0 border-neutral-200 bg-white text-violet-600'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          <ImagePlus size={12} />
          Biblioteca
        </button>
        <button
          type="button"
          onClick={() => setSource('pexels')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            source === 'pexels'
              ? 'border border-b-0 border-neutral-200 bg-white text-violet-600'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          <Camera size={12} />
          Pexels
        </button>
      </div>

      {/* Pestaña Pexels */}
      {source === 'pexels' && (
        <PexelsTab
          assets={assets}
          onAssetsChange={onChange}
          onInsertAsset={onInsertAsset}
        />
      )}

      {/* Pestaña Biblioteca (oculta cuando Pexels está activo) */}
      {source === 'biblioteca' && (
      <div className="flex flex-col flex-1 min-h-0">

      {/* Cabecera sticky */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-neutral-100 bg-white px-3 pb-2 pt-2.5">
        {/* Búsqueda + filtro toggle */}
        <div className="flex gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
            <Search size={12} className="shrink-0 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, URL, tag…"
              className="w-full bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="shrink-0 text-neutral-400 hover:text-neutral-600">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              showFilters || hasActiveFilters
                ? 'border-violet-300 bg-violet-50 text-violet-600'
                : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
            }`}
            title="Filtros y ordenamiento"
          >
            <SlidersHorizontal size={13} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-[8px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel de filtros expandible */}
        {showFilters && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Tipo</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as FilterType)}
                  className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[11px] text-neutral-700 outline-none"
                >
                  <option value="all">Todos</option>
                  <option value="image">Imagen</option>
                  <option value="logo">Logo</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Carpeta</label>
                <select
                  value={filterFolder}
                  onChange={(e) => setFilterFolder(e.target.value)}
                  className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[11px] text-neutral-700 outline-none"
                >
                  <option value="all">Todas</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-600 select-none">
                <input
                  type="checkbox"
                  checked={filterMissing}
                  onChange={(e) => setFilterMissing(e.target.checked)}
                  className="h-3 w-3 accent-violet-600"
                />
                Solo faltantes
                {missingCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-700">
                    {missingCount}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                <span>Orden:</span>
                <button
                  type="button"
                  onClick={() => setSortKey((k) => (k === 'reciente' ? 'nombre' : 'reciente'))}
                  className="font-semibold text-violet-600 hover:text-violet-800"
                >
                  {sortKey === 'reciente' ? 'Reciente' : 'Nombre'}
                </button>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex w-full items-center justify-center gap-1 text-[10px] text-neutral-400 hover:text-red-500"
              >
                <X size={10} /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Contador + aviso de faltantes */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neutral-400">
            {filteredAssets.length} de {assets.length} asset{assets.length !== 1 ? 's' : ''}
          </span>
          {missingCount > 0 && !filterMissing && (
            <button
              type="button"
              onClick={() => { setFilterMissing(true); setShowFilters(true); }}
              className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 hover:bg-amber-100"
            >
              <AlertTriangle size={10} />
              {missingCount} faltante{missingCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Zona "Agregar asset" colapsable */}
      <div className="border-b border-neutral-100">
        <button
          type="button"
          onClick={() => { setAddOpen((v) => !v); if (addOpen) resetForm(); }}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600">
            <Plus size={12} className="text-violet-500" />
            {editingAssetId ? 'Editar asset' : 'Agregar asset'}
          </span>
          {addOpen ? <ChevronUp size={12} className="text-neutral-400" /> : <ChevronDown size={12} className="text-neutral-400" />}
        </button>

        {addOpen && (
          <div className="px-3 pb-3 space-y-2">
            {/* Upload como CTA principal */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/60 py-3 text-[11px] font-semibold text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition-colors"
            >
              <Upload size={14} />
              Subir desde archivo local
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddUpload} />

            {/* Separador visual */}
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="h-px flex-1 bg-neutral-100" />
              o completar datos manualmente
              <div className="h-px flex-1 bg-neutral-100" />
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <FormInput
                  value={name}
                  onChange={setName}
                  placeholder="Nombre del asset"
                  label="Nombre"
                />
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AssetLibraryItem['type'])}
                    className="h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
                  >
                    <option value="image">Imagen</option>
                    <option value="logo">Logo</option>
                  </select>
                </div>
              </div>
              <FormInput
                value={url}
                onChange={setUrl}
                placeholder="https://… o data:image/…"
                label="URL"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <FormInput value={folder} onChange={setFolder} placeholder="general" label="Carpeta" />
                <FormInput value={tags} onChange={setTags} placeholder="tag1, tag2" label="Tags" />
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { resetForm(); setAddOpen(false); }}
                className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveAsset}
                disabled={!name.trim() || !url.trim()}
                className="flex h-8 flex-[2] items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:pointer-events-none disabled:opacity-50"
              >
                <Plus size={12} />
                {editingAssetId ? 'Actualizar asset' : 'Guardar asset'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Biblioteca */}
      <div className="flex-1 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <EmptyState
            icon={<ImagePlus size={24} className="mx-auto text-neutral-300" />}
            title="Sin assets"
            description="Sube imágenes o pega URLs para construir tu biblioteca de assets."
            action={
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700"
              >
                <Plus size={12} /> Agregar primer asset
              </button>
            }
          />
        ) : filteredAssets.length === 0 ? (
          <EmptyState
            icon={<Search size={20} className="mx-auto text-neutral-300" />}
            title="Sin resultados"
            description="Ningún asset coincide con la búsqueda o filtros activos."
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                <X size={11} /> Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onInsert={() => onInsertAsset(asset)}
                onEdit={() => startEdit(asset)}
                onReplace={() => {
                  replaceTargetIdRef.current = asset.id;
                  replaceFileInputRef.current?.click();
                }}
                onDelete={() => onChange(assets.filter((a) => a.id !== asset.id))}
                onImageError={() => upsertAsset({ ...asset, missing: true })}
                onImageLoad={() => asset.missing && upsertAsset({ ...asset, missing: false })}
              />
            ))}
          </div>
        )}
      </div>

      <input ref={replaceFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceUpload} />
      </div>
      )}
    </div>
  );
}

interface AssetCardProps {
  asset: AssetLibraryItem;
  onInsert: () => void;
  onEdit: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onImageError: () => void;
  onImageLoad: () => void;
}

function AssetCard({ asset, onInsert, onEdit, onReplace, onDelete, onImageError, onImageLoad }: AssetCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div
      className={`group rounded-xl border transition-shadow hover:shadow-sm ${
        asset.missing
          ? 'border-amber-200 bg-amber-50/40'
          : 'border-neutral-200 bg-white hover:border-neutral-300'
      }`}
    >
      <div className="flex items-start gap-2.5 p-2">
        {/* Preview */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          <img
            src={asset.url}
            alt={asset.name}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={onImageError}
            onLoad={onImageLoad}
          />
          {asset.missing && (
            <div className="absolute inset-0 flex items-center justify-center bg-amber-50/80">
              <AlertTriangle size={16} className="text-amber-500" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <span className="truncate text-[11px] font-semibold leading-snug text-neutral-700" title={asset.name}>
              {asset.name}
            </span>
            <TypeBadge type={asset.type} />
          </div>

          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400">
            <FolderOpen size={10} className="shrink-0" />
            <span className="truncate">{asset.folder || 'general'}</span>
          </div>

          {asset.missing && (
            <div className="mt-1 flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle size={9} /> Faltante — requiere relink
            </div>
          )}

          {asset.tags && asset.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {asset.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-neutral-100 px-1.5 py-px text-[9px] text-neutral-500">
                  {tag}
                </span>
              ))}
              {asset.tags.length > 3 && (
                <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[9px] text-neutral-400">
                  +{asset.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="border-t border-neutral-100 px-2 pb-2 pt-1.5">
        {/* Acción primaria siempre visible */}
        <button
          type="button"
          onClick={onInsert}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors"
        >
          Insertar en canvas
        </button>

        {/* Acciones secundarias en acordeón */}
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-600"
          >
            {actionsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {actionsOpen ? 'Ocultar acciones' : 'Más acciones'}
          </button>

          {actionsOpen && (
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 hover:border-violet-200 hover:text-violet-600"
                title="Editar / Relink"
              >
                <Link2 size={11} /> Relink
              </button>
              <button
                type="button"
                onClick={onReplace}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 hover:border-blue-200 hover:text-blue-600"
                title="Reemplazar con archivo local"
              >
                <Upload size={11} /> Local
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                title="Eliminar asset"
              >
                <Trash2 size={11} /> Borrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: AssetLibraryItem['type'] }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
        type === 'logo' ? 'bg-violet-100 text-violet-600' : 'bg-neutral-100 text-neutral-500'
      }`}
    >
      {type}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center">
      {icon}
      <p className="mt-2 text-[12px] font-semibold text-neutral-500">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{description}</p>
      {action}
    </div>
  );
}

function FormInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none placeholder-neutral-400 focus:border-violet-300 focus:bg-white transition-colors"
      />
    </div>
  );
}
