import React, { useCallback, useMemo, useState } from 'react';
import {
  AlignEndVertical, BarChart3, ChevronDown, ChevronRight, ChevronUp,
  Copy, GripVertical, Heading, Image, LayoutTemplate,
  Minus, Grid3X3, PenTool, Plus, Table, Table2, Trash2, Type, X,
} from 'lucide-react';
import type {
  BlockConfig, BlockPaletteItem, BlockTemplateDocument, BlockType,
  DataGridConfig, FooterConfig, HeaderConfig, InfoBarConfig,
  PhotoGridConfig, SectionTitleConfig, SignaturesConfig, SpacerConfig,
  TableConfig, TemplateBlock, TextConfig, FieldDef, SignatureDef,
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

/* ── Props ── */
interface BlockEditorProps {
  document: BlockTemplateDocument;
  onChange: (doc: BlockTemplateDocument) => void;
}

/* ── BlockEditor ── */
export default function BlockEditor({ document, onChange }: BlockEditorProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showPresets, setShowPresets] = useState(false);

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

  const addBlock = (item: BlockPaletteItem) => {
    const block = createBlock(item);
    updateBlocks([...document.blocks, block]);
    setSelectedBlockId(block.id);
  };

  const removeBlock = (id: string) => {
    updateBlocks(document.blocks.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
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
  };

  const moveBlock = (id: string, dir: 'up' | 'down') => {
    const idx = document.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= document.blocks.length) return;
    const next = [...document.blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    updateBlocks(next);
  };

  const updateBlockConfig = (id: string, config: BlockConfig) => {
    updateBlocks(document.blocks.map((b) => (b.id === id ? { ...b, config } : b)));
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
    setShowPresets(false);
    setSelectedBlockId(null);
  };

  /* Drag-reorder handlers */
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
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

  return (
    <div className="h-full grid" style={{ gridTemplateColumns: '280px 1fr 340px' }}>
      {/* ── LEFT: Palette ── */}
      <aside className="bg-white/70 backdrop-blur-md border-r border-neutral-200/50 flex flex-col overflow-hidden">
        <div className="p-4 pb-3 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Bloques</h2>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="text-[10px] font-semibold text-violet-600 hover:text-violet-700 transition-colors"
          >
            {showPresets ? 'Bloques' : 'Plantillas'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {showPresets ? (
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
          ) : (
            /* Block palette by category */
            CATEGORIES.map((cat) => {
              const items = BLOCK_PALETTE.filter((item) => item.category === cat.id);
              if (items.length === 0) return null;
              return (
                <div key={cat.id} className="mb-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 px-1 mb-1.5">{cat.label}</div>
                  <div className="space-y-1">
                    {items.map((item, i) => (
                      <button
                        key={`${item.type}-${i}`}
                        draggable
                        onDragStart={() => setPaletteDragItem(item)}
                        onDragEnd={() => setPaletteDragItem(null)}
                        onClick={() => addBlock(item)}
                        className="w-full flex items-center gap-2.5 rounded-lg p-2.5 bg-white border border-neutral-150 hover:border-neutral-300 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:scale-[0.98] group"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: BLOCK_COLORS[item.type] || '#888' }}
                        >
                          {ICON_MAP[item.icon] || <Type size={16} />}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-neutral-700 group-hover:text-neutral-900">{item.label}</div>
                          <div className="text-[9px] text-neutral-400 truncate">{item.description}</div>
                        </div>
                        <Plus size={12} className="text-neutral-300 group-hover:text-neutral-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── CENTER: Canvas ── */}
      <main
        className="relative overflow-auto bg-[#f0f0f3]"
        style={{ backgroundImage: 'radial-gradient(circle, #d4d4d8 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handlePaletteDrop}
      >
        <div className="flex justify-center py-8 px-6 min-h-full">
          <div
            className="relative bg-white rounded-sm flex-shrink-0 flex flex-col"
            style={{
              width: 794,
              minHeight: 1123,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 20px 60px -10px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.06)',
              padding: '12px',
            }}
          >
            {/* Blocks */}
            {document.blocks.map((block, idx) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedBlockId(block.id)}
                className={`
                  group relative rounded-lg border-2 transition-all duration-150 mb-1.5 cursor-pointer
                  ${selectedBlockId === block.id
                    ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]'
                    : 'border-transparent hover:border-neutral-200'}
                  ${dragOverIdx === idx ? 'border-t-4 border-t-blue-400' : ''}
                `}
              >
                {/* Block toolbar */}
                <div className={`absolute -left-9 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity ${selectedBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}>
                  <button
                    className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <GripVertical size={14} />
                  </button>
                </div>

                {/* Block type indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-100">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: BLOCK_COLORS[block.type] || '#888' }}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                    {BLOCK_LABELS[block.type] || block.type}
                  </span>
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }} className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400" title="Subir"><ChevronUp size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }} className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400" title="Bajar"><ChevronDown size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }} className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400" title="Duplicar"><Copy size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} className="p-0.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500" title="Eliminar"><Trash2 size={12} /></button>
                  </div>
                </div>

                {/* Block preview */}
                <div className="p-3">
                  <BlockPreview block={block} />
                </div>

                {/* Puzzle connector visual */}
                {idx < document.blocks.length - 1 && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-3 bg-neutral-200 rounded-b-full z-10 opacity-0 group-hover:opacity-50 transition-opacity" />
                )}
              </div>
            ))}

            {/* Empty state */}
            {document.blocks.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-300 min-h-[400px]">
                <LayoutTemplate size={40} className="mb-3 text-neutral-200" />
                <p className="text-[13px] font-medium text-neutral-400">Arrastra bloques desde la paleta</p>
                <p className="text-[11px] text-neutral-300 mt-1">o selecciona una plantilla pre-armada</p>
              </div>
            )}

            {/* Drop zone at bottom */}
            {document.blocks.length > 0 && (
              <div
                className="mt-2 border-2 border-dashed border-neutral-200 rounded-lg p-4 text-center text-neutral-300 text-[11px] hover:border-blue-300 hover:text-blue-400 transition-colors"
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(document.blocks.length); }}
                onDrop={() => {
                  if (dragIdx !== null) handleDrop(document.blocks.length);
                  if (paletteDragItem) { addBlock(paletteDragItem); setPaletteDragItem(null); }
                }}
              >
                + Soltar bloque aquí
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── RIGHT: Inspector ── */}
      <aside className="bg-white/70 backdrop-blur-md border-l border-neutral-200/50 flex flex-col overflow-hidden">
        <div className="p-4 pb-3 border-b border-neutral-100">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            {selectedBlock ? `Propiedades: ${BLOCK_LABELS[selectedBlock.type] || selectedBlock.type}` : 'Inspector'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedBlock ? (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-300">
              <Grid3X3 size={28} className="mb-2" />
              <p className="text-[12px] text-neutral-400 font-medium">Selecciona un bloque</p>
              <p className="text-[10px] text-neutral-300 mt-0.5">para editar sus propiedades</p>
            </div>
          ) : (
            <BlockInspector
              block={selectedBlock}
              onChange={(config) => updateBlockConfig(selectedBlock.id, config)}
            />
          )}
        </div>
      </aside>
    </div>
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
      return (
        <div className={`grid gap-x-3 gap-y-1 text-[8px]`} style={{ gridTemplateColumns: `repeat(${cols}, auto 1fr)` }}>
          {cfg.fields.map((f, i) => (
            <React.Fragment key={i}>
              <span className="text-neutral-500 font-semibold text-right whitespace-nowrap">{f.label}:</span>
              <span className="border border-dotted border-neutral-300 rounded px-1 py-0.5 text-violet-600 font-mono bg-neutral-50">{`{{${f.variable}}}`}</span>
            </React.Fragment>
          ))}
        </div>
      );
    }
    case 'photo-grid': {
      const cfg = c as PhotoGridConfig;
      const count = cfg.maxPhotos === 'auto' ? 4 : cfg.maxPhotos;
      return (
        <div className="border-2 border-neutral-300 rounded p-2">
          <div className="grid grid-cols-2 gap-1">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="bg-neutral-100 rounded flex items-center justify-center h-16 text-[8px] text-neutral-400">
                <Image size={14} className="text-neutral-300" />
                {cfg.showLabels && cfg.labels?.[i] && (
                  <span className="ml-1 font-bold text-[7px]">{cfg.labels[i]}</span>
                )}
              </div>
            ))}
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
      className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white transition-all"
    />
  );
}

function InspSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-neutral-100">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-600">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Field List Editor (reused by info-bar, data-grid) ── */

function FieldListEditor({ fields, onChange, labels }: { fields: FieldDef[]; onChange: (fields: FieldDef[]) => void; labels?: { label: string; variable: string } }) {
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
  return (
    <InspSection title="Panel Fotográfico">
      <div>
        <InspLabel>Máximo de fotos</InspLabel>
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
          {(config.labels || []).map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[9px] text-neutral-400 w-4">{i + 1}</span>
              <input
                value={label}
                onChange={(e) => {
                  const next = [...(config.labels || [])];
                  next[i] = e.target.value;
                  onChange({ ...config, labels: next });
                }}
                className="flex-1 h-7 rounded border border-neutral-200 bg-neutral-50 px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white"
              />
              <button
                onClick={() => onChange({ ...config, labels: (config.labels || []).filter((_, j) => j !== i) })}
                className="p-0.5 text-neutral-400 hover:text-red-500"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...config, labels: [...(config.labels || []), `ETIQUETA ${(config.labels?.length || 0) + 1}`] })}
            className="w-full border border-dashed border-neutral-300 rounded py-1 text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center justify-center gap-1"
          >
            <Plus size={10} /> Agregar etiqueta
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
