import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignEndVertical, BarChart3, BookOpen, Check, ChevronDown, ChevronUp,
  BookmarkPlus, Copy, GripVertical, Heading, Image, Layers, LayoutTemplate,
  Lock, Minus, Grid3X3, PenTool, Plus, Search, Sparkles,
  Table, Table2, Trash2, Type, Unlock, Wand2, X,
} from 'lucide-react';
import type {
  BlockConfig, BlockPaletteItem, BlockTemplateDocument, BlockType,
  DataGridConfig, FooterConfig, HeaderConfig, InfoBarConfig,
  PhotoGridConfig, SectionTitleConfig, SignaturesConfig, SpacerConfig,
  TableConfig, TemplateBlock, TextConfig, FieldDef,
} from './blockTypes';
import { BLOCK_PALETTE, PRESET_TEMPLATES, blockId, createBlock } from './blocks';

/* ── Icon map ── */
const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutTemplate: <LayoutTemplate size={18} />,
  BarChart3: <BarChart3 size={18} />,
  Heading: <Heading size={18} />,
  Grid3X3: <Grid3X3 size={18} />,
  Table2: <Table2 size={18} />,
  Table: <Table size={18} />,
  Type: <Type size={18} />,
  Image: <Image size={18} />,
  Images: <Image size={18} />,
  PenTool: <PenTool size={18} />,
  AlignEndVertical: <AlignEndVertical size={18} />,
  Minus: <Minus size={18} />,
};

const BLOCK_LABELS: Record<BlockType, string> = {
  header: 'Encabezado',
  'info-bar': 'Barra Info',
  'section-title': 'Título Sección',
  'data-grid': 'Grilla Datos',
  'photo-grid': 'Panel Fotos',
  text: 'Texto',
  table: 'Tabla',
  signatures: 'Firmas',
  footer: 'Pie de Página',
  spacer: 'Espaciador',
};

const BLOCK_COLORS: Record<BlockType, string> = {
  header: '#3b82f6',
  'info-bar': '#8b5cf6',
  'section-title': '#0ea5e9',
  'data-grid': '#10b981',
  'photo-grid': '#f59e0b',
  text: '#6b7280',
  table: '#14b8a6',
  signatures: '#ec4899',
  footer: '#78716c',
  spacer: '#d4d4d8',
};

const CATEGORIES = [
  { id: 'structure' as const, label: 'Estructura' },
  { id: 'data' as const, label: 'Datos' },
  { id: 'media' as const, label: 'Media' },
  { id: 'other' as const, label: 'Otros' },
];

const SAVED_BLOCKS_STORAGE_KEY = 'template-editor-saved-blocks-v1';

interface SavedBlockItem {
  id: string;
  name: string;
  description: string;
  type: BlockType;
  icon: string;
  category: BlockPaletteItem['category'];
  config: BlockConfig;
  createdAt: string;
}

/* ── Props ── */
interface BlockEditorProps {
  document: BlockTemplateDocument;
  onChange: (doc: BlockTemplateDocument) => void;
  publishedTemplates?: Array<{ id: string; name: string }>;
  deletingTemplateId?: string | null;
  onDeletePublishedTemplate?: (templateId: string, templateName: string) => void | Promise<void>;
  onLoadTemplate?: (template: { id: string; name: string; status: string }) => void | Promise<void>;
  loadingTemplateId?: string | null;
}

type PanelMode = 'blocks' | 'constructor' | 'plantillas' | 'publicadas';

type ConstructorMode = 'append' | 'replace';
type ConstructorBlockKind = 'photo-grid' | 'data-grid';

const PHOTO_LABEL_PRESETS: Record<2 | 3 | 4, string[]> = {
  2: ['ANTES', 'DESPUES'],
  3: ['ANTES', 'DURANTE', 'DESPUES'],
  4: ['ANTES', 'DURANTE', 'DESPUES', 'RESIDUOS'],
};

const DATA_FIELD_PRESETS: Record<4 | 6, FieldDef[]> = {
  4: [
    { label: 'ESTADO', variable: 'ESTADO' },
    { label: 'TIPO RED', variable: 'TIPO_RED' },
    { label: 'SECTOR', variable: 'SECTOR' },
    { label: 'CUADRILLA', variable: 'CUADRILLA' },
  ],
  6: [
    { label: 'DIRECCION', variable: 'DIRECCION' },
    { label: 'LOCALIDAD', variable: 'LOCALIDAD' },
    { label: 'DISTRITO', variable: 'DISTRITO' },
    { label: 'ESTADO', variable: 'ESTADO' },
    { label: 'TIPO RED', variable: 'TIPO_RED' },
    { label: 'SECTOR', variable: 'SECTOR' },
  ],
};

function cloneFields(fields: FieldDef[]): FieldDef[] {
  return fields.map((f) => ({ ...f }));
}

function normalizeVariableToken(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || 'CAMPO';
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/* ── BlockEditor ── */
export default function BlockEditor({
  document,
  onChange,
  publishedTemplates = [],
  deletingTemplateId = null,
  onDeletePublishedTemplate,
  onLoadTemplate,
  loadingTemplateId = null,
}: BlockEditorProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('blocks');
  const [blockSearch, setBlockSearch] = useState('');
  const [constructorMode, setConstructorMode] = useState<ConstructorMode>('append');
  const [constructorName, setConstructorName] = useState(document.name || 'Nueva Plantilla');
  const [constructorBlockKind, setConstructorBlockKind] = useState<ConstructorBlockKind>('photo-grid');
  const [constructorPhotoTitle, setConstructorPhotoTitle] = useState('Panel Fotos');
  const [constructorPhotoCount, setConstructorPhotoCount] = useState<2 | 3 | 4>(4);
  const [constructorPhotoShowLabels, setConstructorPhotoShowLabels] = useState(true);
  const [constructorPhotoLabels, setConstructorPhotoLabels] = useState<string[]>([...PHOTO_LABEL_PRESETS[4]]);
  const [constructorDataColumns, setConstructorDataColumns] = useState<4 | 6>(6);
  const [constructorDataFields, setConstructorDataFields] = useState<FieldDef[]>(() => cloneFields(DATA_FIELD_PRESETS[6]));
  const [savedBlocks, setSavedBlocks] = useState<SavedBlockItem[]>([]);

  /* ── Canvas UX state ── */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deleteConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [recentlyDuplicatedId, setRecentlyDuplicatedId] = useState<string | null>(null);
  const [removingBlockId, setRemovingBlockId] = useState<string | null>(null);
  const [canvasHovered, setCanvasHovered] = useState(false);

  const filteredPalette = useMemo(() => {
    const term = normalizeSearchText(blockSearch);
    if (!term) return BLOCK_PALETTE;
    return BLOCK_PALETTE.filter((item) => {
      const haystack = normalizeSearchText(`${item.label} ${item.description} ${item.type}`);
      return haystack.includes(term);
    });
  }, [blockSearch]);

  const filteredSavedBlocks = useMemo(() => {
    const term = normalizeSearchText(blockSearch);
    if (!term) return savedBlocks;
    return savedBlocks.filter((item) => {
      const haystack = normalizeSearchText(`${item.name} ${item.description} ${item.type}`);
      return haystack.includes(term);
    });
  }, [blockSearch, savedBlocks]);

  const documentHealth = useMemo(() => {
    const hasHeader = document.blocks.some((b) => b.type === 'header');
    const hasData = document.blocks.some((b) => b.type === 'data-grid' || b.type === 'table');
    const hasPhotos = document.blocks.some((b) => b.type === 'photo-grid');
    const hasClosing = document.blocks.some((b) => b.type === 'signatures' || b.type === 'footer');
    return { hasHeader, hasData, hasPhotos, hasClosing };
  }, [document.blocks]);

  useEffect(() => {
    setConstructorName(document.name || 'Nueva Plantilla');
  }, [document.name]);

  useEffect(() => {
    if (panelMode !== 'constructor') return;
    setSelectedBlockId(null);
    setDeleteConfirmId(null);
  }, [panelMode]);

  useEffect(() => {
    setConstructorPhotoLabels((prev) => {
      const target = PHOTO_LABEL_PRESETS[constructorPhotoCount];
      const next = Array.from({ length: constructorPhotoCount }, (_, idx) => {
        const current = prev[idx]?.trim();
        return current || target[idx];
      });
      return next;
    });
  }, [constructorPhotoCount]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_BLOCKS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((item) =>
        item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.type === 'string'
      ) as SavedBlockItem[];
      setSavedBlocks(valid);
    } catch {
      setSavedBlocks([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_BLOCKS_STORAGE_KEY, JSON.stringify(savedBlocks));
    } catch {
      // Ignore persistence issues (quota/private mode).
    }
  }, [savedBlocks]);

  const selectedBlock = useMemo(
    () => document.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [document.blocks, selectedBlockId],
  );

  const updateBlocks = useCallback(
    (blocks: TemplateBlock[]) => {
      onChange({ ...document, blocks, updatedAt: new Date().toISOString() });
    },
    [document, onChange],
  );

  const addBlock = (item: BlockPaletteItem, insertIdx?: number) => {
    const block = createBlock(item);
    if (typeof insertIdx === 'number' && insertIdx >= 0 && insertIdx <= document.blocks.length) {
      const next = [...document.blocks];
      next.splice(insertIdx, 0, block);
      updateBlocks(next);
    } else {
      updateBlocks([...document.blocks, block]);
    }
    setSelectedBlockId(block.id);
    setRecentlyAddedId(block.id);
    setTimeout(() => setRecentlyAddedId(null), 500);
  };

  const addSavedBlockToCanvas = (item: SavedBlockItem, insertIdx?: number) => {
    const paletteItem: BlockPaletteItem = {
      type: item.type,
      label: item.name,
      description: item.description,
      icon: item.icon,
      category: item.category,
      defaultConfig: deepClone(item.config),
    };
    addBlock(paletteItem, insertIdx);
  };

  const saveBlockAsReusable = (block: TemplateBlock, preferredName?: string) => {
    const defaultName = preferredName?.trim() || `Mi ${BLOCK_LABELS[block.type] || block.type}`;
    const rawName = window.prompt('Nombre para guardar en Elementos', defaultName);
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) return;

    const paletteMeta = BLOCK_PALETTE.find((item) => item.type === block.type);
    const description = `Bloque guardado (${BLOCK_LABELS[block.type] || block.type})`;

    const saved: SavedBlockItem = {
      id: `saved_${block.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      description,
      type: block.type,
      icon: paletteMeta?.icon || 'LayoutTemplate',
      category: paletteMeta?.category || 'other',
      config: deepClone(block.config),
      createdAt: new Date().toISOString(),
    };

    setSavedBlocks((prev) => [saved, ...prev]);
  };

  const removeSavedBlock = (savedBlockId: string) => {
    const target = savedBlocks.find((item) => item.id === savedBlockId);
    if (!target) return;
    const confirmed = window.confirm(`Eliminar "${target.name}" de Elementos guardados?`);
    if (!confirmed) return;
    setSavedBlocks((prev) => prev.filter((item) => item.id !== savedBlockId));
  };

  const REMOVE_ANIM_MS = 250;

  const requestDeleteBlock = (id: string) => {
    const target = document.blocks.find((b) => b.id === id);
    if (target?.locked) return;
    setDeleteConfirmId(id);
    if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    deleteConfirmTimer.current = setTimeout(() => setDeleteConfirmId(null), 3000);
  };

  const confirmDeleteBlock = (id: string) => {
    setDeleteConfirmId(null);
    if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    setRemovingBlockId(id);
    setTimeout(() => {
      updateBlocks(document.blocks.filter((b) => b.id !== id));
      if (selectedBlockId === id) setSelectedBlockId(null);
      setRemovingBlockId(null);
    }, REMOVE_ANIM_MS);
  };

  const cancelDeleteBlock = () => {
    setDeleteConfirmId(null);
    if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
  };

  const duplicateBlock = (id: string) => {
    const idx = document.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const clone: TemplateBlock = {
      ...JSON.parse(JSON.stringify(document.blocks[idx])),
      id: blockId(document.blocks[idx].type),
    };
    const next = [...document.blocks];
    next.splice(idx + 1, 0, clone);
    updateBlocks(next);
    setSelectedBlockId(clone.id);
    setRecentlyAddedId(clone.id);
    setRecentlyDuplicatedId(clone.id);
    setTimeout(() => { setRecentlyAddedId(null); setRecentlyDuplicatedId(null); }, 700);
  };

  const moveBlock = (id: string, dir: 'up' | 'down') => {
    const idx = document.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    if (document.blocks[idx].locked) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= document.blocks.length) return;
    const next = [...document.blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    updateBlocks(next);
  };

  const updateBlockConfig = (id: string, config: BlockConfig) => {
    const target = document.blocks.find((b) => b.id === id);
    if (target?.locked) return;
    updateBlocks(document.blocks.map((b) => (b.id === id ? { ...b, config } : b)));
  };

  const toggleBlockLock = (id: string) => {
    updateBlocks(
      document.blocks.map((b) => (b.id === id ? { ...b, locked: !b.locked } : b))
    );
  };

  const loadPreset = (presetId: string) => {
    const preset = PRESET_TEMPLATES.find((p) => p.id === presetId);
    if (!preset) return;
    const blocks = preset.blocks.map((b) => ({ ...b, id: blockId(b.type) }));
    onChange({
      ...document,
      name: preset.name,
      blocks,
      updatedAt: new Date().toISOString(),
    });
    setPanelMode('blocks');
    setSelectedBlockId(null);
  };

  const applyConstructorResult = (generated: TemplateBlock[]) => {
    if (generated.length === 0) return;

    if (constructorMode === 'replace' && document.blocks.length > 0) {
      const confirmed = window.confirm('Esto reemplazara los bloques actuales. Deseas continuar?');
      if (!confirmed) return;
    }

    const nextBlocks = constructorMode === 'replace'
      ? generated
      : [...document.blocks, ...generated];

    onChange({
      ...document,
      name: constructorName.trim() || document.name,
      blocks: nextBlocks,
      updatedAt: new Date().toISOString(),
    });

    setSelectedBlockId(generated[0]?.id ?? null);
  };

  const applyPhotoReference = (count: 2 | 3 | 4 = 4) => {
    setConstructorBlockKind('photo-grid');
    setConstructorPhotoCount(count);
    setConstructorPhotoShowLabels(true);
    setConstructorPhotoTitle('Panel Fotos');
    setConstructorPhotoLabels([...PHOTO_LABEL_PRESETS[count]]);
  };

  const applyDataReference = (columns: 4 | 6 = 6) => {
    setConstructorBlockKind('data-grid');
    setConstructorDataColumns(columns);
    setConstructorDataFields(cloneFields(DATA_FIELD_PRESETS[columns]));
  };

  const buildProfessionalConstructorBlock = (): TemplateBlock | null => {
    if (constructorBlockKind === 'photo-grid') {
      const baseItem = BLOCK_PALETTE.find((item) => item.type === 'photo-grid');
      if (!baseItem) return null;

      const block = createBlock(baseItem);
      const labels = constructorPhotoLabels
        .slice(0, constructorPhotoCount)
        .map((label, idx) => (label.trim() || `FOTO ${idx + 1}`).toUpperCase());

      block.config = {
        ...(block.config as PhotoGridConfig),
        maxPhotos: constructorPhotoCount,
        showLabels: constructorPhotoShowLabels,
        labels,
        panelTitle: constructorPhotoTitle.trim() || 'Panel Fotos',
      };
      return block;
    }

    const baseItem = BLOCK_PALETTE.find(
      (item) => item.type === 'data-grid' && (item.defaultConfig as DataGridConfig).columns === constructorDataColumns
    ) ?? BLOCK_PALETTE.find((item) => item.type === 'data-grid');
    if (!baseItem) return null;

    const parsedFields = constructorDataFields
      .map((field, idx) => {
        const label = field.label.trim() || `CAMPO ${idx + 1}`;
        const variable = field.variable.trim() || normalizeVariableToken(label);
        return { label: label.toUpperCase(), variable };
      })
      .filter((field) => field.label.length > 0 && field.variable.length > 0);

    const block = createBlock(baseItem);
    block.config = {
      ...(block.config as DataGridConfig),
      columns: constructorDataColumns,
      fields: parsedFields.length > 0 ? parsedFields : cloneFields(DATA_FIELD_PRESETS[constructorDataColumns]),
      spanFields: constructorDataColumns === 4 ? [] : undefined,
    };
    return block;
  };

  const addProfessionalConstructorBlock = () => {
    const block = buildProfessionalConstructorBlock();
    if (!block) return;
    applyConstructorResult([block]);
  };

  const constructorPreviewBlock = useMemo<TemplateBlock | null>(() => {
    const block = buildProfessionalConstructorBlock();
    if (!block) return null;
    return { ...block, id: 'constructor-preview' };
  }, [
    constructorBlockKind,
    constructorPhotoTitle,
    constructorPhotoCount,
    constructorPhotoShowLabels,
    constructorPhotoLabels,
    constructorDataColumns,
    constructorDataFields,
  ]);

  const updateConstructorPreviewConfig = useCallback((config: BlockConfig) => {
    if (constructorBlockKind === 'photo-grid') {
      const cfg = config as PhotoGridConfig;
      const nextCount = cfg.maxPhotos === 'auto' ? 4 : cfg.maxPhotos;
      const count: 2 | 3 | 4 = nextCount === 2 || nextCount === 3 || nextCount === 4 ? nextCount : 4;
      const preset = PHOTO_LABEL_PRESETS[count];

      setConstructorBlockKind('photo-grid');
      setConstructorPhotoCount(count);
      setConstructorPhotoShowLabels(cfg.showLabels ?? true);
      setConstructorPhotoTitle(cfg.panelTitle?.trim() || 'Panel Fotos');
      setConstructorPhotoLabels(
        Array.from({ length: count }, (_, idx) => cfg.labels?.[idx]?.trim() || preset[idx]),
      );
      return;
    }

    const cfg = config as DataGridConfig;
    const columns: 4 | 6 = cfg.columns === 4 ? 4 : 6;
    const nextFields = cfg.fields && cfg.fields.length > 0 ? cfg.fields : DATA_FIELD_PRESETS[columns];

    setConstructorBlockKind('data-grid');
    setConstructorDataColumns(columns);
    setConstructorDataFields(cloneFields(nextFields));
  }, [constructorBlockKind]);

  /* Drag-reorder handlers */
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (document.blocks[idx]?.locked) return;
    setDragIdx(idx);
    // Custom drag ghost
    const el = e.currentTarget as HTMLElement;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.opacity = '0.55';
    clone.style.transform = 'scale(0.96)';
    clone.style.width = `${el.offsetWidth}px`;
    clone.style.position = 'fixed';
    clone.style.top = '-9999px';
    window.document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setTimeout(() => { try { window.document.body.removeChild(clone); } catch { } }, 0);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    if (document.blocks[dragIdx]?.locked) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...document.blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    updateBlocks(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  /* Palette drag into canvas */
  const [paletteDragItem, setPaletteDragItem] = useState<BlockPaletteItem | null>(null);
  const handlePaletteDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (paletteDragItem) {
      addBlock(paletteDragItem);
      setPaletteDragItem(null);
    }
  };

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (deleteConfirmId) { cancelDeleteBlock(); return; }
        if (selectedBlockId) { setSelectedBlockId(null); e.preventDefault(); }
        return;
      }
      if (!selectedBlockId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const target = document.blocks.find((b) => b.id === selectedBlockId);
        if (target && !target.locked) {
          if (deleteConfirmId === selectedBlockId) confirmDeleteBlock(selectedBlockId);
          else requestDeleteBlock(selectedBlockId);
        }
        return;
      }
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateBlock(selectedBlockId); return; }
      if (isCtrl && e.key === 'ArrowUp') { e.preventDefault(); moveBlock(selectedBlockId, 'up'); return; }
      if (isCtrl && e.key === 'ArrowDown') { e.preventDefault(); moveBlock(selectedBlockId, 'down'); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedBlockId, deleteConfirmId, document.blocks]);

  /* Cleanup timer on unmount */
  useEffect(() => () => { if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current); }, []);

  const inspectorBlock = panelMode === 'constructor' ? constructorPreviewBlock : selectedBlock;
  const inspectorCanLock = panelMode !== 'constructor' && !!selectedBlock;
  const handleInspectorChange = (config: BlockConfig) => {
    if (panelMode === 'constructor') {
      updateConstructorPreviewConfig(config);
      return;
    }
    if (!selectedBlock) return;
    updateBlockConfig(selectedBlock.id, config);
  };

  return (
    <>
      <style>{`
      @keyframes beSlideDown { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes beDuplicateGlow { 0% { box-shadow: 0 0 0 0 rgba(139,92,246,0.4); } 40% { box-shadow: 0 0 0 6px rgba(139,92,246,0.18); } 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); } }
      @keyframes beFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `}</style>
      <div className="h-full min-w-[1020px] grid grid-cols-[280px_minmax(740px,1fr)_340px]">
        {/* ── LEFT: Palette ── */}
        <aside className="bg-white/90 backdrop-blur border-r border-neutral-200/70 flex flex-col overflow-hidden shadow-[1px_0_8px_rgba(0,0,0,0.04)]">
          {/* Tabs with icons */}
          <div className="sticky top-0 z-10 flex border-b border-neutral-100 shrink-0 bg-white/95 backdrop-blur">
            {([
              { mode: 'blocks' as PanelMode, label: 'Elementos', icon: <Layers size={15} /> },
              { mode: 'constructor' as PanelMode, label: 'Constructor', icon: <Wand2 size={15} /> },
              { mode: 'plantillas' as PanelMode, label: 'Plantillas', icon: <LayoutTemplate size={15} /> },
              { mode: 'publicadas' as PanelMode, label: 'Publicadas', icon: <BookOpen size={15} /> },
            ]).map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => setPanelMode(mode)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-semibold transition-all border-b-2 ${panelMode === mode
                    ? 'text-violet-600 border-violet-500 bg-violet-50/60'
                    : 'text-neutral-400 border-transparent hover:text-neutral-600 hover:bg-neutral-50'
                  }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {panelMode === 'constructor' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-3">
                  <div className="flex items-center gap-2 text-violet-700">
                    <Sparkles size={14} />
                    <span className="text-[12px] font-semibold">Constructor de bloques</span>
                  </div>
                  <p className="text-[10px] text-violet-700/80 mt-1">
                    El armado del bloque ahora se realiza en el preview central para mayor visibilidad.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-neutral-700">Barras laterales para configuracion</p>
                  <p className="text-[10px] text-neutral-500 mt-1.5 leading-relaxed">
                    Usa el inspector derecho para editar propiedades del bloque (fuente, alineacion, color, logos, etc.).
                    El constructor visual esta en el preview central.
                  </p>
                </div>

                <div className="hidden space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Nombre sugerido</label>
                    <input
                      value={constructorName}
                      onChange={(e) => setConstructorName(e.target.value)}
                      className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-violet-300"
                      placeholder="Ej. Informe tecnico - Norte"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConstructorMode('append')}
                      className={`rounded-lg py-1.5 text-[11px] font-semibold ${constructorMode === 'append' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    >
                      Agregar al final
                    </button>
                    <button
                      onClick={() => setConstructorMode('replace')}
                      className={`rounded-lg py-1.5 text-[11px] font-semibold ${constructorMode === 'replace' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    >
                      Reemplazar todo
                    </button>
                  </div>
                </div>

                <div className="hidden rounded-xl border border-violet-200 bg-white p-3 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-neutral-800">Bloque profesional desde cero</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">Configura estructura y agrega el bloque al canvas.</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => applyPhotoReference(4)}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Ref Fotos
                      </button>
                      <button
                        onClick={() => applyDataReference(6)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Ref Datos
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConstructorBlockKind('photo-grid')}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold border transition-colors ${constructorBlockKind === 'photo-grid' ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'}`}
                    >
                      Panel Fotos
                    </button>
                    <button
                      onClick={() => setConstructorBlockKind('data-grid')}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold border transition-colors ${constructorBlockKind === 'data-grid' ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'}`}
                    >
                      Grilla Datos
                    </button>
                  </div>

                  {constructorBlockKind === 'photo-grid' ? (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Titulo panel</label>
                        <input
                          value={constructorPhotoTitle}
                          onChange={(e) => setConstructorPhotoTitle(e.target.value)}
                          className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-violet-300"
                          placeholder="Panel Fotos"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([2, 3, 4] as const).map((count) => (
                          <button
                            key={count}
                            onClick={() => setConstructorPhotoCount(count)}
                            className={`rounded-md py-1.5 text-[10px] font-semibold ${constructorPhotoCount === count ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                          >
                            {count} slots
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={constructorPhotoShowLabels}
                          onChange={(e) => setConstructorPhotoShowLabels(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-[11px] text-neutral-600">Mostrar etiquetas</span>
                      </label>
                      {constructorPhotoShowLabels && (
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Etiquetas por slot</label>
                          {Array.from({ length: constructorPhotoCount }).map((_, idx) => (
                            <input
                              key={idx}
                              value={constructorPhotoLabels[idx] || ''}
                              onChange={(e) => {
                                const next = [...constructorPhotoLabels];
                                next[idx] = e.target.value;
                                setConstructorPhotoLabels(next);
                              }}
                              className="w-full h-7 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-300"
                              placeholder={`Etiqueta ${idx + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => applyDataReference(4)}
                          className={`rounded-md py-1.5 text-[10px] font-semibold ${constructorDataColumns === 4 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                        >
                          2 columnas
                        </button>
                        <button
                          onClick={() => applyDataReference(6)}
                          className={`rounded-md py-1.5 text-[10px] font-semibold ${constructorDataColumns === 6 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                        >
                          3 columnas
                        </button>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Campos</label>
                        <FieldListEditor fields={constructorDataFields} onChange={setConstructorDataFields} />
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5">
                    <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">Preview del bloque</p>
                    <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
                      {constructorPreviewBlock ? <BlockPreview block={constructorPreviewBlock} /> : <p className="text-[11px] text-neutral-400">Sin configuracion.</p>}
                    </div>
                  </div>

                  <button
                    onClick={addProfessionalConstructorBlock}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2.5 text-[12px] font-semibold hover:bg-violet-700 transition-colors"
                  >
                    <Plus size={14} /> Agregar bloque al canvas
                  </button>
                  <button
                    onClick={() => {
                      if (!constructorPreviewBlock) return;
                      saveBlockAsReusable(constructorPreviewBlock);
                    }}
                    disabled={!constructorPreviewBlock}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 py-2.5 text-[12px] font-semibold hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BookmarkPlus size={14} /> Guardar en Elementos
                  </button>
                </div>


              </div>
            ) : panelMode === 'plantillas' ? (
              /* Preset templates */
              <div className="space-y-2">
                <p className="text-[10px] text-neutral-400 px-1 mb-2">
                  Plantillas pre-armadas listas para usar. Se reemplazarán los bloques actuales.
                </p>
                {PRESET_TEMPLATES.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => loadPreset(preset.id)}
                    className="w-full text-left rounded-xl p-3 bg-white border border-neutral-150 hover:border-violet-300 hover:shadow-md shadow-sm transition-all group"
                  >
                    <div className="text-[12px] font-semibold text-neutral-800 group-hover:text-violet-700">{preset.name}</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{preset.description}</div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {preset.blocks.map((b) => (
                        <span
                          key={b.id}
                          className="inline-block rounded px-1.5 py-0.5 text-[8px] font-bold text-white"
                          style={{ backgroundColor: BLOCK_COLORS[b.type] || '#888' }}
                        >
                          {BLOCK_LABELS[b.type] || b.type}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : panelMode === 'publicadas' ? (
              <div className="space-y-2">
                <p className="text-[10px] text-neutral-400 px-1 mb-2">
                  Plantillas publicadas. Puedes cargarlas para editar o eliminarlas.
                </p>
                {publishedTemplates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-[11px] text-neutral-400">
                    No hay plantillas publicadas.
                  </div>
                )}
                {publishedTemplates.map((template) => {
                  const isDeleting = deletingTemplateId === template.id;
                  const isLoading = loadingTemplateId === template.id;
                  return (
                    <div
                      key={template.id}
                      className="w-full rounded-xl p-3 bg-white border border-neutral-150 shadow-sm transition-all"
                    >
                      <div className="text-[12px] font-semibold text-neutral-800 truncate mb-2">{template.name}</div>
                      <div className="flex items-center gap-1.5">
                        {onLoadTemplate && (
                          <button
                            onClick={() => onLoadTemplate({ id: template.id, name: template.name, status: 'published' })}
                            disabled={isLoading || isDeleting}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cargar para editar"
                          >
                            {isLoading ? 'Cargando...' : 'Editar'}
                          </button>
                        )}
                        <button
                          onClick={() => onDeletePublishedTemplate?.(template.id, template.name)}
                          disabled={isDeleting || isLoading}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Eliminar plantilla publicada"
                        >
                          <Trash2 size={10} />
                          {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Block palette by category */
              <>
                <div className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder="Buscar bloque..."
                      className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 pl-8 pr-8 text-[11px] focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    {blockSearch.trim() && (
                      <button
                        onClick={() => setBlockSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70"
                        title="Limpiar busqueda"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-neutral-500">Bloques en canvas: <b>{document.blocks.length}</b></div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span className={`rounded-md px-2 py-1 ${documentHealth.hasHeader ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {documentHealth.hasHeader ? 'Cabecera lista' : 'Falta cabecera'}
                      </span>
                      <span className={`rounded-md px-2 py-1 ${documentHealth.hasData ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {documentHealth.hasData ? 'Datos listos' : 'Faltan datos'}
                      </span>
                      <span className={`rounded-md px-2 py-1 ${documentHealth.hasPhotos ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {documentHealth.hasPhotos ? 'Fotos listas' : 'Sin fotos'}
                      </span>
                      <span className={`rounded-md px-2 py-1 ${documentHealth.hasClosing ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {documentHealth.hasClosing ? 'Cierre listo' : 'Falta cierre'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 px-1">Mis Guardados</div>
                    <span className="text-[10px] text-neutral-400">{savedBlocks.length}</span>
                  </div>
                  {savedBlocks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-2 text-[10px] text-neutral-400">
                      Guarda bloques desde el canvas o desde el constructor para reutilizarlos aqui.
                    </div>
                  ) : filteredSavedBlocks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-2 text-[10px] text-neutral-400">
                      No hay bloques guardados con ese filtro.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredSavedBlocks.map((item) => (
                        <div key={item.id} className="relative group">
                          <button
                            draggable
                            onDragStart={() => setPaletteDragItem({
                              type: item.type,
                              label: item.name,
                              description: item.description,
                              icon: item.icon,
                              category: item.category,
                              defaultConfig: deepClone(item.config),
                            })}
                            onDragEnd={() => setPaletteDragItem(null)}
                            onClick={() => addSavedBlockToCanvas(item)}
                            className="w-full flex flex-col items-center gap-1.5 rounded-xl p-2.5 bg-white border border-neutral-100 hover:border-violet-200 hover:shadow-md shadow-sm transition-all cursor-grab active:cursor-grabbing active:scale-[0.96] text-center"
                            title={item.description}
                          >
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                              style={{ backgroundColor: BLOCK_COLORS[item.type] || '#888' }}
                            >
                              {ICON_MAP[item.icon] || <Type size={18} />}
                            </div>
                            <div className="text-[10px] font-semibold text-neutral-600 leading-tight truncate w-full">{item.name}</div>
                          </button>
                          <button
                            onClick={() => removeSavedBlock(item.id)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/95 border border-neutral-200 text-neutral-400 hover:text-red-500 hover:border-red-200 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Eliminar guardado"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {CATEGORIES.map((cat) => {
                  const items = filteredPalette.filter((item) => item.category === cat.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat.id} className="mb-4">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 px-1 mb-2">{cat.label}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {items.map((item, i) => (
                          <button
                            key={`${item.type}-${i}`}
                            draggable
                            onDragStart={() => setPaletteDragItem(item)}
                            onDragEnd={() => setPaletteDragItem(null)}
                            onClick={() => addBlock(item)}
                            className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 bg-white border border-neutral-100 hover:border-violet-200 hover:shadow-md shadow-sm transition-all cursor-grab active:cursor-grabbing active:scale-[0.96] group text-center"
                            title={item.description}
                          >
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                              style={{ backgroundColor: BLOCK_COLORS[item.type] || '#888' }}
                            >
                              {ICON_MAP[item.icon] || <Type size={18} />}
                            </div>
                            <div className="text-[10px] font-semibold text-neutral-600 group-hover:text-neutral-900 leading-tight">{item.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {filteredPalette.length === 0 && filteredSavedBlocks.length === 0 && (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-[11px] text-neutral-400 text-center">
                    No se encontraron bloques con ese criterio.
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── CENTER: Canvas ── */}
        <main
          className="relative overflow-auto bg-[#eef1f7]"
          style={{ backgroundImage: 'radial-gradient(circle, #c8ced9 0.7px, transparent 0.7px)', backgroundSize: '20px 20px' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePaletteDrop}
          onMouseEnter={() => setCanvasHovered(true)}
          onMouseLeave={() => setCanvasHovered(false)}
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedBlockId(null); setDeleteConfirmId(null); } }}
        >
          {/* Sticky canvas header */}
          <div className="sticky top-0 z-20 px-4 py-2 border-b border-white/80 bg-white/80 backdrop-blur-sm flex items-center justify-between text-[10px] text-neutral-600">
            <span className="font-semibold tracking-wide">{panelMode === 'constructor' ? 'Preview Constructor' : 'Canvas A4'}</span>
            <div className="flex items-center gap-3">
              <span>
                {panelMode === 'constructor'
                  ? 'Arma tu bloque en el preview central'
                  : (document.blocks.length === 0 ? 'Arrastra bloques desde el panel izquierdo' : `${document.blocks.length} bloque(s) en pagina`)}
              </span>
              {selectedBlockId && panelMode !== 'constructor' && (
                <span className="text-[9px] text-neutral-400 hidden xl:inline">
                  Del eliminar &middot; Ctrl+D duplicar &middot; Ctrl+&uarr;&darr; mover &middot; Esc deseleccionar
                </span>
              )}
            </div>
          </div>

          <div
            className="flex justify-center py-8 px-6 min-h-full"
            onClick={(e) => { if (e.target === e.currentTarget) { setSelectedBlockId(null); setDeleteConfirmId(null); } }}
          >
            <div
              className="relative bg-white rounded-sm flex-shrink-0 flex flex-col"
              style={{
                width: 794,
                minHeight: 1123,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 20px 60px -10px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.06)',
                padding: '12px',
              }}
              onClick={(e) => { if (e.target === e.currentTarget) { setSelectedBlockId(null); setDeleteConfirmId(null); } }}
            >
              {panelMode === 'constructor' ? (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold text-violet-700">Constructor visual</p>
                        <p className="text-[10px] text-violet-700/80 mt-0.5">
                          Construye el bloque desde este preview y usa el inspector derecho para ajustar propiedades.
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => applyPhotoReference(4)}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Ref Fotos
                        </button>
                        <button
                          onClick={() => applyDataReference(6)}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Ref Datos
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
                      <input
                        value={constructorName}
                        onChange={(e) => setConstructorName(e.target.value)}
                        className="w-full h-9 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                        placeholder="Nombre sugerido de plantilla"
                      />
                      <div className="grid grid-cols-2 gap-1.5 min-w-[250px]">
                        <button
                          onClick={() => setConstructorMode('append')}
                          className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${constructorMode === 'append' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                        >
                          Agregar
                        </button>
                        <button
                          onClick={() => setConstructorMode('replace')}
                          className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${constructorMode === 'replace' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                        >
                          Reemplazar
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => setConstructorBlockKind('photo-grid')}
                        className={`rounded-lg px-3 py-2 text-[11px] font-semibold border transition-colors ${constructorBlockKind === 'photo-grid' ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-violet-200 bg-white text-neutral-600 hover:bg-violet-50'}`}
                      >
                        Panel Fotos
                      </button>
                      <button
                        onClick={() => setConstructorBlockKind('data-grid')}
                        className={`rounded-lg px-3 py-2 text-[11px] font-semibold border transition-colors ${constructorBlockKind === 'data-grid' ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-violet-200 bg-white text-neutral-600 hover:bg-violet-50'}`}
                      >
                        Grilla Datos
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-2">Preview principal del bloque</p>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 min-h-[560px]">
                      <div className="rounded-lg border border-neutral-200 bg-white p-4">
                        {constructorPreviewBlock ? (
                          <BlockPreview block={constructorPreviewBlock} />
                        ) : (
                          <p className="text-[11px] text-neutral-400">Sin configuracion.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={addProfessionalConstructorBlock}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2.5 text-[12px] font-semibold hover:bg-violet-700 transition-colors"
                    >
                      <Plus size={14} /> Agregar bloque al canvas
                    </button>
                    <button
                      onClick={() => {
                        if (!constructorPreviewBlock) return;
                        saveBlockAsReusable(constructorPreviewBlock);
                      }}
                      disabled={!constructorPreviewBlock}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 py-2.5 text-[12px] font-semibold hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <BookmarkPlus size={14} /> Guardar en Elementos
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {/* Blocks */}
              {document.blocks.map((block, idx) => (
                <div key={block.id} className="relative">
                  {/* Insertion line — above block */}
                  {dragOverIdx === idx && dragIdx !== null && dragIdx !== idx && (
                    <div className="absolute -top-[3px] left-2 right-2 z-20 flex items-center pointer-events-none">
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-white shadow-sm" />
                      <div className="flex-1 h-[3px] rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-white shadow-sm" />
                    </div>
                  )}

                  {/* Block index number */}
                  <div className={`absolute -left-10 top-1/2 -translate-y-1/2 z-10 transition-opacity duration-200 ${canvasHovered || selectedBlockId === block.id ? 'opacity-60' : 'opacity-0'
                    }`}>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-[9px] font-bold text-neutral-500 border border-neutral-200">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Block container */}
                  <div
                    draggable={!block.locked}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); setDeleteConfirmId((prev) => prev === block.id ? prev : null); }}
                    className={[
                      'group relative rounded-xl border-2 mb-2 cursor-pointer bg-white overflow-visible transition-all duration-200 ease-out',
                      removingBlockId === block.id ? 'opacity-0 scale-[0.97] max-h-0 !mb-0 !py-0 overflow-hidden' : '',
                      recentlyAddedId === block.id && !recentlyDuplicatedId ? 'animate-[beSlideDown_0.35s_ease-out]' : '',
                      recentlyDuplicatedId === block.id ? 'animate-[beDuplicateGlow_0.7s_ease-out]' : '',
                      selectedBlockId === block.id
                        ? 'border-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.15),0_4px_12px_rgba(0,0,0,0.08)]'
                        : 'border-transparent hover:border-violet-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
                      dragIdx === idx ? 'opacity-40 scale-[0.97]' : '',
                      block.locked ? 'bg-neutral-50/80' : '',
                    ].filter(Boolean).join(' ')}
                    style={removingBlockId === block.id
                      ? { transition: `opacity ${REMOVE_ANIM_MS}ms ease-out, transform ${REMOVE_ANIM_MS}ms ease-out, max-height ${REMOVE_ANIM_MS}ms ease-out, margin ${REMOVE_ANIM_MS}ms ease-out` }
                      : undefined
                    }
                  >
                    {/* Drag handle — left edge */}
                    <div className={`absolute -left-6 top-1/2 -translate-y-1/2 z-10 transition-opacity ${block.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${selectedBlockId === block.id ? 'opacity-50' : 'opacity-0 group-hover:opacity-30'
                      }`}>
                      <GripVertical size={14} className="text-neutral-500" />
                    </div>

                    {/* Block type badge — top left overlay */}
                    <div className={`absolute top-2 left-2.5 z-10 transition-opacity duration-150 pointer-events-none ${selectedBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: BLOCK_COLORS[block.type] || '#888' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/50 inline-block" />
                        {BLOCK_LABELS[block.type] || block.type}
                        {block.locked && <Lock size={9} className="ml-0.5" />}
                      </span>
                    </div>

                    {/* Action toolbar — top right overlay */}
                    <div className={`absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-white/95 rounded-lg shadow-md border border-neutral-100 p-0.5 backdrop-blur-sm transition-all duration-150 ${selectedBlockId === block.id ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover:opacity-100 -translate-y-0.5 group-hover:translate-y-0'
                      }`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                        disabled={block.locked}
                        className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={block.locked ? 'Bloque bloqueado' : 'Subir (Ctrl+\u2191)'}
                      ><ChevronUp size={12} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                        disabled={block.locked}
                        className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={block.locked ? 'Bloque bloqueado' : 'Bajar (Ctrl+\u2193)'}
                      ><ChevronDown size={12} /></button>
                      <div className="w-px h-3 bg-neutral-200 mx-0.5" />
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }}
                        className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                        title="Duplicar (Ctrl+D)"
                      ><Copy size={12} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); saveBlockAsReusable(block); }}
                        className="p-1 rounded-md hover:bg-violet-50 text-neutral-400 hover:text-violet-600 transition-colors"
                        title="Guardar en Elementos"
                      ><BookmarkPlus size={12} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleBlockLock(block.id); }}
                        className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                        title={block.locked ? 'Desbloquear' : 'Bloquear'}
                      >
                        {block.locked ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>

                      {/* Delete: confirmation popover or button */}
                      {deleteConfirmId === block.id ? (
                        <div
                          className="flex items-center gap-0.5 bg-red-50 rounded-md px-1 py-0.5 border border-red-200 ml-0.5"
                          style={{ animation: 'beFadeIn 0.15s ease-out' }}
                        >
                          <span className="text-[9px] font-semibold text-red-600 px-1 whitespace-nowrap">Eliminar?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); confirmDeleteBlock(block.id); }}
                            className="p-0.5 rounded hover:bg-red-100 text-red-600"
                            title="Confirmar"
                          ><Check size={12} /></button>
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelDeleteBlock(); }}
                            className="p-0.5 rounded hover:bg-neutral-200 text-neutral-500"
                            title="Cancelar"
                          ><X size={12} /></button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); requestDeleteBlock(block.id); }}
                          disabled={block.locked}
                          className="p-1 rounded-md hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={block.locked ? 'Desbloquea para eliminar' : 'Eliminar (Del)'}
                        ><Trash2 size={12} /></button>
                      )}
                    </div>

                    {/* Block preview */}
                    <div className="px-4 py-3.5">
                      <BlockPreview block={block} />
                    </div>
                  </div>
                </div>
              ))}

              {/* Insertion line at bottom during drag */}
              {dragOverIdx === document.blocks.length && dragIdx !== null && (
                <div className="relative mx-2 my-1 flex items-center pointer-events-none">
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-white shadow-sm" />
                  <div className="flex-1 h-[3px] rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-white shadow-sm" />
                </div>
              )}

              {/* Empty state */}
              {document.blocks.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-300 min-h-[400px]">
                  <div className="w-16 h-16 rounded-2xl bg-neutral-50 border-2 border-dashed border-neutral-200 flex items-center justify-center mb-4">
                    <LayoutTemplate size={26} className="text-neutral-300" />
                  </div>
                  <p className="text-[14px] font-semibold text-neutral-400">Disena tu plantilla</p>
                  <p className="text-[11px] text-neutral-400 mt-1.5">Arrastra elementos desde el panel izquierdo</p>
                  <p className="text-[10px] text-neutral-300 mt-0.5">o elige una plantilla pre-armada</p>
                </div>
              )}

              {/* Drop zone at bottom */}
              {document.blocks.length > 0 && (
                <div
                  className={`mt-3 border-2 border-dashed rounded-xl p-4 text-center text-[11px] font-medium transition-all duration-300 ${paletteDragItem || dragIdx !== null
                      ? 'border-violet-400 text-violet-500 bg-violet-50/50 scale-[1.01] shadow-[0_0_12px_rgba(139,92,246,0.12)]'
                      : 'border-neutral-200 text-neutral-400 hover:border-violet-300 hover:text-violet-400 hover:bg-violet-50/30'
                    }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(document.blocks.length); }}
                  onDrop={() => {
                    if (dragIdx !== null) handleDrop(document.blocks.length);
                    if (paletteDragItem) { addBlock(paletteDragItem); setPaletteDragItem(null); }
                  }}
                >
                  {paletteDragItem || dragIdx !== null
                    ? 'Soltar aqui para agregar al final'
                    : '+ Soltar bloque aqui'}
                </div>
              )}
                </>
              )}
            </div>
          </div>
        </main>

        {/* ── RIGHT: Inspector ── */}
        <aside className="bg-white/95 backdrop-blur border-l border-neutral-200/70 flex flex-col overflow-hidden shadow-[-1px_0_8px_rgba(0,0,0,0.04)]">
          <div className="sticky top-0 z-10 shrink-0 border-b border-neutral-100 min-h-[56px] flex items-center px-4 py-3 transition-colors bg-white/95"
            style={inspectorBlock ? { borderBottomColor: `${BLOCK_COLORS[inspectorBlock.type]}28` } : {}}
          >
            {inspectorBlock ? (
              <div className="flex items-center justify-between w-full gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: BLOCK_COLORS[inspectorBlock.type] || '#888' }}
                  >
                    {ICON_MAP[BLOCK_PALETTE.find(p => p.type === inspectorBlock.type)?.icon ?? ''] ?? <Type size={14} />}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-neutral-800">{BLOCK_LABELS[inspectorBlock.type] || inspectorBlock.type}</div>
                    <div className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium mt-0.5">Propiedades</div>
                    <div className="text-[9px] text-neutral-400 font-mono mt-0.5">{inspectorBlock.id}</div>
                  </div>
                </div>
                {inspectorCanLock && selectedBlock && (
                  <button
                    onClick={() => toggleBlockLock(selectedBlock.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
                    title={selectedBlock.locked ? 'Desbloquear bloque' : 'Bloquear bloque'}
                  >
                    {selectedBlock.locked ? <Unlock size={11} /> : <Lock size={11} />}
                    {selectedBlock.locked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Grid3X3 size={15} className="text-neutral-300" />
                <h2 className="text-[12px] font-semibold text-neutral-400">Inspector</h2>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!inspectorBlock ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-300 px-4">
                <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center mb-3">
                  <Grid3X3 size={20} className="text-neutral-300" />
                </div>
                <p className="text-[12px] text-neutral-400 font-semibold text-center">Selecciona un bloque</p>
                <p className="text-[10px] text-neutral-300 mt-1 text-center">Haz clic en cualquier elemento del canvas para editar sus propiedades</p>
              </div>
            ) : (
              <>
                {inspectorCanLock && selectedBlock?.locked && (
                  <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
                    Este bloque esta protegido. Desbloquealo para editar propiedades.
                  </div>
                )}
                <BlockInspector
                  block={inspectorBlock}
                  onChange={handleInspectorChange}
                />
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ═══ Block Preview Components ═══ */

function BlockPreview({ block }: { block: TemplateBlock }) {
  const c = block.config;
  switch (block.type) {
    case 'header': {
      const cfg = c as HeaderConfig;
      return (
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          {cfg.showLogos && <div className="w-14 h-5 bg-neutral-100 rounded text-[7px] text-neutral-400 flex items-center justify-center">LOGO</div>}
          <div className="flex-1 text-center font-bold text-[11px] text-neutral-700 uppercase">{cfg.title}</div>
          {cfg.showLogos && <div className="w-14 h-5 bg-neutral-100 rounded text-[7px] text-neutral-400 flex items-center justify-center">LOGO</div>}
        </div>
      );
    }
    case 'info-bar': {
      const cfg = c as InfoBarConfig;
      return (
        <div className="flex gap-3 bg-neutral-50 rounded px-2 py-1.5 text-[9px]">
          {cfg.fields.map((f, i) => (
            <span key={i}><b className="text-neutral-500">{f.label}:</b> <span className="text-violet-600 font-mono">{`{{${f.variable}}}`}</span></span>
          ))}
        </div>
      );
    }
    case 'section-title': {
      const cfg = c as SectionTitleConfig;
      return (
        <div className="text-[10px] font-bold uppercase border-b pb-0.5" style={{ color: cfg.color, borderColor: cfg.color }}>
          {cfg.number ? `${cfg.number} ` : ''}{cfg.text}
        </div>
      );
    }
    case 'data-grid': {
      const cfg = c as DataGridConfig;
      const cols = cfg.columns === 6 ? 3 : 2;
      const fields = cfg.fields.length > 0 ? cfg.fields : [{ label: 'CAMPO', variable: 'VALOR' }];
      return (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {fields.map((f, i) => (
            <div key={i} className="min-w-0">
              <div className="text-[8px] text-neutral-500 uppercase tracking-wide font-semibold mb-0.5">{f.label}:</div>
              <div className="h-5 rounded border border-dotted border-neutral-300 bg-neutral-50 px-1.5 text-[8px] text-violet-600 font-mono flex items-center">
                {`{{${f.variable}}}`}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'photo-grid': {
      const cfg = c as PhotoGridConfig;
      const count = cfg.maxPhotos === 'auto' ? 4 : cfg.maxPhotos;
      const labels = (cfg.labels || []).slice(0, count);
      const panelTitle = cfg.panelTitle?.trim() || 'Panel Fotos';
      return (
        <div className="rounded-[14px] border border-violet-400 bg-violet-50 p-2">
          <div className="relative rounded-[10px] border border-neutral-300 bg-white p-2">
            <span className="absolute -top-2 left-2 inline-flex items-center rounded-full bg-amber-300 px-2 py-0.5 text-[7px] font-bold uppercase tracking-wide text-amber-900">
              {panelTitle}
            </span>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-md border border-neutral-200 bg-neutral-100/80 flex flex-col items-center justify-center text-[8px] text-neutral-400 ${count === 3 && i === 2 ? 'col-span-2 h-14' : 'h-16'}`}
                >
                  <Image size={14} className="text-neutral-300" />
                  {cfg.showLabels && labels[i] && (
                    <span className="mt-1 font-bold text-[7px] uppercase tracking-wide text-neutral-500">{labels[i]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    case 'text': {
      const cfg = c as TextConfig;
      return (
        <div className="text-[9px] text-neutral-600" style={{ textAlign: cfg.align, fontWeight: cfg.bold ? 700 : 400 }}>
          {cfg.content}
        </div>
      );
    }
    case 'table': {
      const cfg = c as TableConfig;
      return (
        <table className="w-full text-[8px] border-collapse">
          <thead>
            <tr>
              {cfg.headers.map((h, i) => (
                <th key={i} className="border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-left font-semibold text-neutral-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cfg.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-neutral-200 px-1.5 py-0.5 text-neutral-500 font-mono">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'signatures': {
      const cfg = c as SignaturesConfig;
      return (
        <div className="flex gap-6 justify-center pt-4">
          {cfg.signatures.map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-20 border-t border-neutral-400 mb-1" />
              <div className="text-[8px] font-bold text-neutral-600 uppercase">{s.title}</div>
              {s.name && <div className="text-[7px] text-neutral-400">{s.name}</div>}
            </div>
          ))}
        </div>
      );
    }
    case 'footer': {
      const cfg = c as FooterConfig;
      return (
        <div className="text-[8px] text-center border-t border-neutral-200 pt-1" style={{ color: cfg.color, fontFamily: cfg.fontFamily }}>
          {cfg.content}
        </div>
      );
    }
    case 'spacer': {
      const cfg = c as SpacerConfig;
      return (
        <div className="flex items-center justify-center text-[9px] text-neutral-300" style={{ height: `${Math.min(cfg.height * 2, 40)}px` }}>
          ↕ {cfg.height}mm
        </div>
      );
    }
    default:
      return <div className="text-[9px] text-neutral-400">{block.type}</div>;
  }
}

/* ═══ Block Inspector ═══ */

function BlockInspector({ block, onChange }: { block: TemplateBlock; onChange: (config: BlockConfig) => void }) {
  const c = block.config;
  switch (block.type) {
    case 'header':
      return <HeaderInspector config={c as HeaderConfig} onChange={onChange} />;
    case 'info-bar':
      return <InfoBarInspector config={c as InfoBarConfig} onChange={onChange} />;
    case 'section-title':
      return <SectionTitleInspector config={c as SectionTitleConfig} onChange={onChange} />;
    case 'data-grid':
      return <DataGridInspector config={c as DataGridConfig} onChange={onChange} />;
    case 'photo-grid':
      return <PhotoGridInspector config={c as PhotoGridConfig} onChange={onChange} />;
    case 'text':
      return <TextInspector config={c as TextConfig} onChange={onChange} />;
    case 'table':
      return <TableInspector config={c as TableConfig} onChange={onChange} />;
    case 'signatures':
      return <SignaturesInspector config={c as SignaturesConfig} onChange={onChange} />;
    case 'footer':
      return <FooterInspector config={c as FooterConfig} onChange={onChange} />;
    case 'spacer':
      return <SpacerInspector config={c as SpacerConfig} onChange={onChange} />;
    default:
      return <div className="p-4 text-[11px] text-neutral-400">Sin propiedades editables</div>;
  }
}

/* ── Reusable Inspector Components ── */

function InspLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">{children}</label>;
}

function InspInput({ value, onChange, placeholder, type = 'text' }: { value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all"
    />
  );
}

function InspSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-neutral-100 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50/60 transition-colors">
        <span>{title}</span>
        <ChevronDown size={13} className={`text-neutral-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Field List Editor (reused by info-bar, data-grid) ── */

function FieldListEditor({ fields, onChange }: { fields: FieldDef[]; onChange: (fields: FieldDef[]) => void }) {
  const addField = () => onChange([...fields, { label: 'NUEVO', variable: 'NUEVO' }]);
  const removeField = (idx: number) => onChange(fields.filter((_, i) => i !== idx));
  const updateField = (idx: number, key: 'label' | 'variable', value: string) => {
    const next = [...fields];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };
  const moveField = (idx: number, dir: 'up' | 'down') => {
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const next = [...fields];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-1 bg-neutral-50 rounded-lg p-1.5">
          <div className="flex flex-col gap-0.5 mr-1">
            <button onClick={() => moveField(i, 'up')} className="text-neutral-400 hover:text-neutral-600 p-0.5"><ChevronUp size={10} /></button>
            <button onClick={() => moveField(i, 'down')} className="text-neutral-400 hover:text-neutral-600 p-0.5"><ChevronDown size={10} /></button>
          </div>
          <input
            value={f.label}
            onChange={(e) => updateField(i, 'label', e.target.value)}
            className="flex-1 h-6 rounded border border-neutral-200 bg-white px-1.5 text-[10px] text-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            placeholder="Label"
          />
          <input
            value={f.variable}
            onChange={(e) => updateField(i, 'variable', e.target.value)}
            className="flex-1 h-6 rounded border border-neutral-200 bg-white px-1.5 text-[10px] text-violet-600 font-mono focus:outline-none focus:ring-1 focus:ring-violet-300"
            placeholder="Variable"
          />
          <button onClick={() => removeField(i)} className="p-1 text-neutral-400 hover:text-red-500 rounded hover:bg-red-50"><X size={10} /></button>
        </div>
      ))}
      <button
        onClick={addField}
        className="w-full border border-dashed border-neutral-300 rounded-lg py-1.5 text-[10px] text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 transition-colors flex items-center justify-center gap-1"
      >
        <Plus size={10} /> Agregar campo
      </button>
    </div>
  );
}

/* ── Individual Inspector Components ── */

function HeaderInspector({ config, onChange }: { config: HeaderConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Encabezado">
      <div>
        <InspLabel>Título</InspLabel>
        <InspInput value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={config.showLogos} onChange={(e) => onChange({ ...config, showLogos: e.target.checked })} className="rounded" />
        <span className="text-[11px] text-neutral-600">Mostrar logos</span>
      </label>
    </InspSection>
  );
}

function InfoBarInspector({ config, onChange }: { config: InfoBarConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Barra de Información">
      <InspLabel>Campos</InspLabel>
      <FieldListEditor fields={config.fields} onChange={(fields) => onChange({ ...config, fields })} />
    </InspSection>
  );
}

function SectionTitleInspector({ config, onChange }: { config: SectionTitleConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Título de Sección">
      <div className="grid grid-cols-[60px_1fr] gap-2">
        <div>
          <InspLabel>Número</InspLabel>
          <InspInput value={config.number} onChange={(v) => onChange({ ...config, number: v })} placeholder="1.0" />
        </div>
        <div>
          <InspLabel>Texto</InspLabel>
          <InspInput value={config.text} onChange={(v) => onChange({ ...config, text: v })} />
        </div>
      </div>
      <div>
        <InspLabel>Color</InspLabel>
        <div className="flex items-center gap-2">
          <input type="color" value={config.color} onChange={(e) => onChange({ ...config, color: e.target.value })} className="w-8 h-8 rounded border border-neutral-200 cursor-pointer" />
          <span className="text-[11px] text-neutral-500 font-mono">{config.color}</span>
        </div>
      </div>
    </InspSection>
  );
}

function DataGridInspector({ config, onChange }: { config: DataGridConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Grilla de Datos">
      <div>
        <InspLabel>Columnas</InspLabel>
        <div className="flex gap-2">
          {([4, 6] as const).map((n) => (
            <button
              key={n}
              onClick={() => onChange({ ...config, columns: n })}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${config.columns === n ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
            >
              {n} columnas
            </button>
          ))}
        </div>
      </div>
      <div>
        <InspLabel>Campos</InspLabel>
        <FieldListEditor fields={config.fields} onChange={(fields) => onChange({ ...config, fields })} />
      </div>
    </InspSection>
  );
}

function PhotoGridInspector({ config, onChange }: { config: PhotoGridConfig; onChange: (c: BlockConfig) => void }) {
  const labelCount = config.maxPhotos === 'auto' ? 4 : config.maxPhotos;
  const labels = Array.from({ length: labelCount }, (_, i) => config.labels?.[i] || `ETIQUETA ${i + 1}`);

  return (
    <InspSection title="Panel Fotografico">
      <div>
        <InspLabel>Titulo del panel</InspLabel>
        <InspInput
          value={config.panelTitle || ''}
          onChange={(v) => onChange({ ...config, panelTitle: v })}
          placeholder="Panel Fotos"
        />
      </div>
      <div>
        <InspLabel>Maximo de fotos</InspLabel>
        <div className="flex gap-1.5">
          {(['auto', 2, 3, 4] as const).map((n) => (
            <button
              key={n}
              onClick={() => onChange({ ...config, maxPhotos: n })}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${config.maxPhotos === n ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
            >
              {n === 'auto' ? 'Auto' : n}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={config.showLabels} onChange={(e) => onChange({ ...config, showLabels: e.target.checked })} className="rounded" />
        <span className="text-[11px] text-neutral-600">Mostrar etiquetas por foto</span>
      </label>
      {config.showLabels && (
        <div className="space-y-1.5">
          <InspLabel>Etiquetas</InspLabel>
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[9px] text-neutral-400 w-4">{i + 1}</span>
              <input
                value={label}
                onChange={(e) => {
                  const next = [...labels];
                  next[i] = e.target.value;
                  onChange({ ...config, labels: next });
                }}
                className="flex-1 h-7 rounded border border-neutral-200 bg-neutral-50 px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white"
              />
            </div>
          ))}
          <button
            onClick={() => onChange({ ...config, labels: [...PHOTO_LABEL_PRESETS[labelCount as 2 | 3 | 4]] })}
            className="w-full border border-dashed border-neutral-300 rounded py-1 text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center justify-center gap-1"
          >
            <Sparkles size={10} /> Restaurar etiquetas sugeridas
          </button>
        </div>
      )}
    </InspSection>
  );
}

function TextInspector({ config, onChange }: { config: TextConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Texto">
      <div>
        <InspLabel>Contenido</InspLabel>
        <textarea
          value={config.content}
          onChange={(e) => onChange({ ...config, content: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-[11px] text-neutral-800 min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white"
          placeholder="Texto con {{ variables }} opcionales..."
        />
        <p className="text-[9px] text-neutral-400 mt-1">Usa {`{{ report.data.get('CAMPO', '-') }}`} para variables</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <InspLabel>Tamaño</InspLabel>
          <InspInput type="number" value={config.fontSize || 9} onChange={(v) => onChange({ ...config, fontSize: Number(v) })} />
        </div>
        <div>
          <InspLabel>Alineación</InspLabel>
          <select
            value={config.align || 'left'}
            onChange={(e) => onChange({ ...config, align: e.target.value as TextConfig['align'] })}
            className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
            <option value="justify">Justificado</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={config.bold || false} onChange={(e) => onChange({ ...config, bold: e.target.checked })} className="rounded" />
        <span className="text-[11px] text-neutral-600">Negrita</span>
      </label>
    </InspSection>
  );
}

function TableInspector({ config, onChange }: { config: TableConfig; onChange: (c: BlockConfig) => void }) {
  const addRow = () => onChange({ ...config, rows: [...config.rows, config.headers.map(() => '')] });
  const addCol = () => onChange({
    ...config,
    headers: [...config.headers, `Col ${config.headers.length + 1}`],
    rows: config.rows.map((r) => [...r, '']),
  });
  const updateHeader = (i: number, v: string) => {
    const next = [...config.headers]; next[i] = v; onChange({ ...config, headers: next });
  };
  const updateCell = (ri: number, ci: number, v: string) => {
    const next = config.rows.map((r) => [...r]); next[ri][ci] = v; onChange({ ...config, rows: next });
  };
  const removeRow = (ri: number) => onChange({ ...config, rows: config.rows.filter((_, i) => i !== ri) });
  const removeCol = (ci: number) => onChange({
    ...config,
    headers: config.headers.filter((_, i) => i !== ci),
    rows: config.rows.map((r) => r.filter((_, i) => i !== ci)),
  });

  return (
    <InspSection title="Tabla">
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse">
          <thead>
            <tr>
              {config.headers.map((h, i) => (
                <th key={i} className="border border-neutral-200 p-0">
                  <div className="flex items-center">
                    <input value={h} onChange={(e) => updateHeader(i, e.target.value)} className="w-full h-6 px-1.5 bg-neutral-50 text-[10px] font-semibold focus:outline-none focus:bg-white border-0" />
                    <button onClick={() => removeCol(i)} className="p-0.5 text-neutral-400 hover:text-red-500"><X size={9} /></button>
                  </div>
                </th>
              ))}
              <th className="border-0 w-6"><button onClick={addCol} className="p-0.5 text-neutral-400 hover:text-blue-500"><Plus size={10} /></button></th>
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-neutral-200 p-0">
                    <input value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} className="w-full h-6 px-1.5 text-[10px] font-mono focus:outline-none focus:bg-blue-50 border-0" />
                  </td>
                ))}
                <td className="border-0 w-6"><button onClick={() => removeRow(ri)} className="p-0.5 text-neutral-400 hover:text-red-500"><X size={9} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="w-full border border-dashed border-neutral-300 rounded py-1 text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center justify-center gap-1">
        <Plus size={10} /> Agregar fila
      </button>
    </InspSection>
  );
}

function SignaturesInspector({ config, onChange }: { config: SignaturesConfig; onChange: (c: BlockConfig) => void }) {
  const updateSig = (idx: number, key: 'title' | 'name', value: string) => {
    const next = [...config.signatures]; next[idx] = { ...next[idx], [key]: value }; onChange({ ...config, signatures: next });
  };
  return (
    <InspSection title="Firmas">
      <div className="space-y-2">
        {config.signatures.map((sig, i) => (
          <div key={i} className="bg-neutral-50 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-400 font-bold">Firma {i + 1}</span>
              <button onClick={() => onChange({ ...config, signatures: config.signatures.filter((_, j) => j !== i) })} className="text-neutral-400 hover:text-red-500"><X size={10} /></button>
            </div>
            <InspInput value={sig.title} onChange={(v) => updateSig(i, 'title', v)} placeholder="Cargo / Título" />
            <InspInput value={sig.name} onChange={(v) => updateSig(i, 'name', v)} placeholder="Nombre (opcional)" />
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange({ ...config, signatures: [...config.signatures, { title: 'CARGO', name: '' }] })}
        className="w-full border border-dashed border-neutral-300 rounded-lg py-1.5 text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center justify-center gap-1"
      >
        <Plus size={10} /> Agregar firma
      </button>
      <div>
        <InspLabel>Separación (mm)</InspLabel>
        <InspInput type="number" value={config.gap || 15} onChange={(v) => onChange({ ...config, gap: Number(v) })} />
      </div>
    </InspSection>
  );
}

function FooterInspector({ config, onChange }: { config: FooterConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Pie de Página">
      <div>
        <InspLabel>Contenido</InspLabel>
        <textarea
          value={config.content}
          onChange={(e) => onChange({ ...config, content: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-[11px] min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white"
          placeholder="Texto del pie de página..."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <InspLabel>Color</InspLabel>
          <div className="flex items-center gap-1.5">
            <input type="color" value={config.color || '#555555'} onChange={(e) => onChange({ ...config, color: e.target.value })} className="w-7 h-7 rounded border border-neutral-200 cursor-pointer" />
            <span className="text-[10px] text-neutral-400 font-mono">{config.color}</span>
          </div>
        </div>
        <div>
          <InspLabel>Tamaño</InspLabel>
          <InspInput type="number" value={config.fontSize || 8} onChange={(v) => onChange({ ...config, fontSize: Number(v) })} />
        </div>
      </div>
      <div>
        <InspLabel>Fuente</InspLabel>
        <select
          value={config.fontFamily || 'Arial'}
          onChange={(e) => onChange({ ...config, fontFamily: e.target.value })}
          className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          {['Arial', 'Segoe UI', 'Helvetica Neue', 'Georgia', 'Times New Roman', 'Courier New'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
    </InspSection>
  );
}

function SpacerInspector({ config, onChange }: { config: SpacerConfig; onChange: (c: BlockConfig) => void }) {
  return (
    <InspSection title="Espaciador">
      <div>
        <InspLabel>Altura (mm)</InspLabel>
        <InspInput type="number" value={config.height} onChange={(v) => onChange({ ...config, height: Number(v) })} />
      </div>
    </InspSection>
  );
}

