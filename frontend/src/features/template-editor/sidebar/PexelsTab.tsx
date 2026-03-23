import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { apiClient } from '@/utils/apiClient';
import type { AssetLibraryItem } from '../canvasTypes';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PexelsPhoto {
  provider: 'pexels';
  providerAssetId: string;
  name: string;
  type: 'image';
  url: string;
  previewUrl: string;
  thumbnailUrl: string;
  sourcePageUrl: string;
  photographer: string;
  photographerUrl: string;
  attributionText: string;
  avgColor: string;
  width: number;
  height: number;
  alt: string;
}

interface PexelsResponse {
  items: PexelsPhoto[];
  page: number;
  perPage: number;
  totalResults: number;
  nextPage?: string | null;
  prevPage?: string | null;
  rateLimit?: { limit: number; remaining: number; reset: number };
}

type Orientation = '' | 'landscape' | 'portrait' | 'square';
type PhotoSize = '' | 'large' | 'medium' | 'small';

interface PexelsTabProps {
  assets: AssetLibraryItem[];
  onAssetsChange: (assets: AssetLibraryItem[]) => void;
  onInsertAsset: (asset: AssetLibraryItem) => void;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 500;
const PER_PAGE = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detailMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message?: string }).message ?? '');
  }
  return '';
}

function detailCode(detail: unknown): string {
  if (detail && typeof detail === 'object' && 'code' in detail) {
    return String((detail as { code?: string }).code ?? '');
  }
  return '';
}

async function fetchPexelsCurated(page: number): Promise<PexelsResponse> {
  try {
    const { data } = await apiClient.get<PexelsResponse>('/api/template-editor/providers/pexels/curated', {
      params: { page, per_page: PER_PAGE },
      timeout: 20000,
    });
    return data;
  } catch (e) {
    if (!isAxiosError(e)) throw e;
    const detail = e.response?.data?.detail;
    const code = detailCode(detail);
    const msg = detailMessage(detail) || e.message || `Error ${e.response?.status ?? ''}`;
    const err = new Error(code ? `${code} ${msg}`.trim() : msg);
    throw err;
  }
}

async function fetchPexelsSearch(
  query: string,
  page: number,
  orientation: string,
  size: string,
  color: string,
): Promise<PexelsResponse> {
  const params: Record<string, string | number> = {
    query,
    page,
    per_page: PER_PAGE,
    locale: 'es-ES',
  };
  if (orientation) params.orientation = orientation;
  if (size) params.size = size;
  if (color) params.color = color;
  try {
    const { data } = await apiClient.get<PexelsResponse>('/api/template-editor/providers/pexels/search', {
      params,
      timeout: 20000,
    });
    return data;
  } catch (e) {
    if (!isAxiosError(e)) throw e;
    const detail = e.response?.data?.detail;
    const code = detailCode(detail);
    const msg = detailMessage(detail) || e.message || `Error ${e.response?.status ?? ''}`;
    throw new Error(code ? `${code} ${msg}`.trim() : msg);
  }
}

function buildAssetFromPhoto(photo: PexelsPhoto): AssetLibraryItem {
  return {
    id: `pexels_${photo.providerAssetId}`,
    name: photo.name,
    type: 'image',
    url: photo.url,
    folder: 'pexels',
    sourceType: 'remote',
    tags: ['pexels', photo.photographer].filter(Boolean),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    missing: false,
    provider: 'pexels',
    providerAssetId: photo.providerAssetId,
    previewUrl: photo.previewUrl,
    thumbnailUrl: photo.thumbnailUrl,
    sourcePageUrl: photo.sourcePageUrl,
    photographer: photo.photographer,
    photographerUrl: photo.photographerUrl,
    attributionText: photo.attributionText,
    avgColor: photo.avgColor,
  };
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PexelsTab({ assets, onAssetsChange, onInsertAsset }: PexelsTabProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('');
  const [size, setSize] = useState<PhotoSize>('');
  const [color, setColor] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PexelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce de búsqueda
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Reset página al cambiar filtros
  useEffect(() => { setPage(1); }, [orientation, size, color]);

  // Cargar fotos
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setNotConfigured(false);
      try {
        const result = debouncedQuery
          ? await fetchPexelsSearch(debouncedQuery, page, orientation, size, color)
          : await fetchPexelsCurated(page);
        if (!cancelled) setData(result);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        const lower = msg.toLowerCase();
        if (
          msg.includes('PEXELS_NOT_CONFIGURED')
          || lower.includes('no está habilitada')
          || lower.includes('no esta habilitada')
        ) {
          setNotConfigured(true);
        } else {
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [debouncedQuery, page, orientation, size, color]);

  const upsertAsset = useCallback(
    (photo: PexelsPhoto): AssetLibraryItem => {
      const next = buildAssetFromPhoto(photo);
      // Deduplicar por providerAssetId
      const existing = assets.find(
        (a) => a.provider === 'pexels' && a.providerAssetId === photo.providerAssetId,
      );
      if (existing) {
        onAssetsChange(
          assets.map((a) => (a.id === existing.id ? { ...existing, updatedAt: new Date().toISOString() } : a)),
        );
        return existing;
      }
      onAssetsChange([...assets, next]);
      return next;
    },
    [assets, onAssetsChange],
  );

  const handleImport = useCallback(
    (photo: PexelsPhoto) => { upsertAsset(photo); },
    [upsertAsset],
  );

  const handleImportAndInsert = useCallback(
    (photo: PexelsPhoto) => {
      const asset = upsertAsset(photo);
      onInsertAsset(asset);
    },
    [upsertAsset, onInsertAsset],
  );

  const isImported = (photo: PexelsPhoto) =>
    assets.some((a) => a.provider === 'pexels' && a.providerAssetId === photo.providerAssetId);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (notConfigured) {
    return <PexelsNotConfigured />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barra de búsqueda */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-neutral-100 bg-white px-3 pb-2 pt-2.5">
        <div className="flex gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
            <Search size={12} className="shrink-0 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fotos en Pexels…"
              className="w-full bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="shrink-0 text-neutral-400 hover:text-neutral-600">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              showFilters || orientation || size || color
                ? 'border-violet-300 bg-violet-50 text-violet-600'
                : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
            }`}
            title="Filtros"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Orientación</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as Orientation)}
                  className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-1 text-[11px] text-neutral-700 outline-none"
                >
                  <option value="">Todas</option>
                  <option value="landscape">Horizontal</option>
                  <option value="portrait">Vertical</option>
                  <option value="square">Cuadrada</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Tamaño</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as PhotoSize)}
                  className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-1 text-[11px] text-neutral-700 outline-none"
                >
                  <option value="">Todos</option>
                  <option value="large">Grande</option>
                  <option value="medium">Mediano</option>
                  <option value="small">Pequeño</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Color</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="red, #fff…"
                  className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
                />
              </div>
            </div>
            {(orientation || size || color) && (
              <button
                type="button"
                onClick={() => { setOrientation(''); setSize(''); setColor(''); }}
                className="flex w-full items-center justify-center gap-1 text-[10px] text-neutral-400 hover:text-red-500"
              >
                <X size={10} /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Contexto */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neutral-400">
            {debouncedQuery ? (
              <>Búsqueda: <span className="font-medium text-neutral-600">"{debouncedQuery}"</span></>
            ) : (
              'Fotos curadas'
            )}
          </span>
          {data && (
            <span className="text-[10px] text-neutral-400">
              {data.totalResults.toLocaleString('es')} resultado{data.totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-violet-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
            <p className="text-[11px] font-semibold text-red-600">Error al cargar fotos</p>
            <p className="mt-1 text-[10px] text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => setPage((p) => p)}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        ) : data?.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center">
            <ImagePlus size={24} className="mx-auto text-neutral-300" />
            <p className="mt-2 text-[12px] font-semibold text-neutral-500">Sin resultados</p>
            <p className="mt-1 text-[11px] text-neutral-400">Prueba con otra búsqueda o quita los filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {(data?.items || []).map((photo) => (
              <PhotoCard
                key={photo.providerAssetId}
                photo={photo}
                imported={isImported(photo)}
                onImport={() => handleImport(photo)}
                onImportAndInsert={() => handleImportAndInsert(photo)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {data && data.totalResults > PER_PAGE && (
        <div className="border-t border-neutral-100 bg-white px-3 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="flex h-7 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft size={12} /> Anterior
          </button>
          <span className="text-[10px] text-neutral-400">Página {page}</span>
          <button
            type="button"
            disabled={!data.nextPage || loading}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-7 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-40"
          >
            Siguiente <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Atribución Pexels */}
      <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-1.5 flex items-center justify-center gap-1.5">
        <Camera size={10} className="text-neutral-400" />
        <span className="text-[10px] text-neutral-400">Fotos por</span>
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-semibold text-violet-600 hover:text-violet-800"
        >
          Pexels
        </a>
      </div>
    </div>
  );
}

// ── PhotoCard ─────────────────────────────────────────────────────────────────

interface PhotoCardProps {
  photo: PexelsPhoto;
  imported: boolean;
  onImport: () => void;
  onImportAndInsert: () => void;
}

function PhotoCard({ photo, imported, onImport, onImportAndInsert }: PhotoCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="group rounded-xl border border-neutral-200 bg-white overflow-hidden hover:border-violet-200 hover:shadow-sm transition-all">
      {/* Preview */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-neutral-100"
        style={{ backgroundColor: photo.avgColor || undefined }}
      >
        <img
          src={photo.thumbnailUrl || photo.previewUrl}
          alt={photo.alt}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        {/* Badge Pexels */}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-px text-[8px] font-bold tracking-wide text-neutral-600 shadow-sm">
          PEXELS
        </span>
        {imported && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-violet-600/90 px-1.5 py-px text-[8px] font-bold text-white">
            ✓
          </span>
        )}
      </div>

      {/* Info + acciones */}
      <div className="p-1.5 space-y-1">
        <p className="truncate text-[10px] text-neutral-500" title={photo.photographer}>
          {photo.photographer}
        </p>

        {/* Acción primaria */}
        <button
          type="button"
          onClick={onImportAndInsert}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-violet-600 py-1.5 text-[10px] font-semibold text-white hover:bg-violet-700 transition-colors"
        >
          Importar e insertar
        </button>

        {/* Acciones secundarias */}
        <button
          type="button"
          onClick={() => setActionsOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1 text-[9px] text-neutral-400 hover:text-neutral-600"
        >
          {actionsOpen ? 'Ocultar' : 'Más acciones'}
        </button>

        {actionsOpen && (
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={onImport}
              disabled={imported}
              className="flex h-6 items-center justify-center gap-0.5 rounded-lg border border-neutral-200 bg-white text-[9px] font-semibold text-neutral-600 hover:bg-neutral-50 hover:border-violet-200 hover:text-violet-600 disabled:pointer-events-none disabled:opacity-50"
              title={imported ? 'Ya importado' : 'Importar a biblioteca'}
            >
              {imported ? '✓ Importado' : 'Importar'}
            </button>
            <a
              href={photo.sourcePageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 items-center justify-center gap-0.5 rounded-lg border border-neutral-200 bg-white text-[9px] font-semibold text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              title="Abrir en Pexels"
            >
              <ExternalLink size={9} /> Pexels
            </a>
          </div>
        )}

        {/* Atribución visible */}
        <p className="text-[9px] leading-tight text-neutral-400 truncate" title={photo.attributionText}>
          {photo.attributionText}
        </p>
      </div>
    </div>
  );
}

// ── Estado sin configurar ─────────────────────────────────────────────────────

function PexelsNotConfigured() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-8 text-center max-w-[220px]">
        <Camera size={28} className="mx-auto text-neutral-300" />
        <p className="mt-3 text-[12px] font-semibold text-neutral-600">Pexels no configurado</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
          Define <code className="rounded bg-neutral-100 px-1 py-px text-[10px] text-neutral-600">PEXELS_API_KEY</code> en el entorno del backend para activar esta fuente.
        </p>
        <a
          href="https://www.pexels.com/api/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700"
        >
          <ExternalLink size={11} /> Obtener API key
        </a>
      </div>
    </div>
  );
}
