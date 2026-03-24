import React, { useState } from 'react';
import { LayoutTemplate, Search, ChevronRight } from 'lucide-react';
import { useConfirmDialog } from '@/components/ui';
import type { CanvasDocument } from '../canvasTypes';
import { PRESET_TEMPLATES, PRESET_CATEGORIES, type PresetTemplate } from '../presetTemplates';

interface TemplatesPanelProps {
  onLoadTemplate: (doc: CanvasDocument) => void;
  currentDocName?: string;
  isDirty?: boolean;
}

const NEW_TEMPLATE_IDS = new Set([
  'informe-limpieza-estandar',
  'acta-conformidad',
  'hoja-membretada-base',
]);

function TemplateThumbnail({ color, category }: { color: string; category: string }) {
  const isReport = category === 'reportes' || category === 'fichas';
  const isCert = category === 'certificados';

  return (
    <div
      className="w-full h-full rounded overflow-hidden relative"
      style={{ backgroundColor: '#f8f9fa' }}
    >
      <div className="absolute top-0 left-0 right-0 h-3 flex items-center px-1 gap-0.5" style={{ backgroundColor: color + '22', borderBottom: `1.5px solid ${color}` }}>
        <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: color + '66' }} />
        <div className="flex-1 h-1.5 rounded" style={{ backgroundColor: color + '44' }} />
        <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: color + '66' }} />
      </div>

      {isCert ? (
        <>
          <div className="absolute inset-[3px] rounded border" style={{ borderColor: color }} />
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-8 h-2 rounded" style={{ backgroundColor: color + '66' }} />
          <div className="absolute top-8 left-1/2 -translate-x-1/2 w-12 h-1 rounded" style={{ backgroundColor: color + '44' }} />
          <div className="absolute top-10 left-2 right-2 h-1 rounded" style={{ backgroundColor: '#ddd' }} />
          <div className="absolute top-12 left-2 right-2 h-1 rounded" style={{ backgroundColor: '#eee' }} />
          <div className="absolute top-14 left-3 right-3 h-0.5 rounded" style={{ backgroundColor: color + '44' }} />
        </>
      ) : isReport ? (
        <>
          <div className="absolute top-4 left-1 right-1 h-1.5 rounded" style={{ backgroundColor: '#f5f5f5', border: '0.5px solid #ddd' }} />
          <div className="absolute left-1 right-1 h-1 rounded" style={{ top: '1.625rem', backgroundColor: color + '33', borderBottom: `0.5px solid ${color}` }} />
          <div className="absolute top-8 left-1 right-1 bottom-4 rounded border" style={{ borderColor: color + '88', backgroundColor: color + '11' }}>
            <div className="grid grid-cols-2 gap-0.5 p-0.5 h-full">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded" style={{ backgroundColor: color + '22', border: `0.5px solid ${color}44` }} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="absolute top-5 left-2 right-2 h-2 rounded" style={{ backgroundColor: '#e5e7eb' }} />
          <div className="absolute top-8 left-1 right-1 h-0.5 rounded" style={{ backgroundColor: '#374151' }} />
          <div className="absolute top-9 left-2 right-2 space-y-0.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-0.5 rounded" style={{ backgroundColor: '#e5e7eb', width: `${85 - i * 5}%` }} />
            ))}
          </div>
        </>
      )}

      {isReport && (
        <div className="absolute bottom-1 left-1 right-1 flex gap-1">
          <div className="flex-1 h-0.5 rounded" style={{ backgroundColor: '#999' }} />
          <div className="flex-1 h-0.5 rounded" style={{ backgroundColor: '#999' }} />
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onLoad,
  highlight = false,
}: {
  template: PresetTemplate;
  onLoad: (t: PresetTemplate) => void;
  highlight?: boolean;
}) {
  return (
    <button
      className={`w-full text-left group p-2 rounded-lg border transition-all focus:outline-none focus:ring-2 relative ${
        highlight
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 hover:border-emerald-400 hover:shadow-md focus:ring-emerald-300'
          : 'border-neutral-200 bg-white hover:border-violet-300 hover:shadow-sm focus:ring-violet-300'
      }`}
      onClick={() => onLoad(template)}
      title={template.description}
    >
      {highlight && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[8px] font-semibold tracking-wide">
          NUEVA
        </span>
      )}

      <div className="w-full h-16 mb-2 rounded overflow-hidden border border-neutral-100">
        <TemplateThumbnail color={template.thumbnail} category={template.category} />
      </div>

      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className={`text-xs font-semibold text-neutral-800 truncate transition-colors ${
            highlight ? 'group-hover:text-emerald-700' : 'group-hover:text-violet-700'
          }`}>
            {template.name}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5 leading-tight line-clamp-2">
            {template.description}
          </p>
        </div>
        <ChevronRight
          size={12}
          className={`transition-colors flex-shrink-0 mt-0.5 ${
            highlight ? 'text-emerald-300 group-hover:text-emerald-500' : 'text-neutral-300 group-hover:text-violet-400'
          }`}
        />
      </div>

      <div className="flex flex-wrap gap-1 mt-1.5">
        {template.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[9px] leading-none">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

export function TemplatesPanel({ onLoadTemplate, isDirty }: TemplatesPanelProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const confirmDialog = useConfirmDialog();

  const filtered = PRESET_TEMPLATES.filter((template) => {
    const matchesSearch =
      !search.trim() ||
      template.name.toLowerCase().includes(search.toLowerCase()) ||
      template.description.toLowerCase().includes(search.toLowerCase()) ||
      template.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = activeCategory === 'all' || template.category === activeCategory;
    return matchesSearch && matchesCat;
  });
  const newTemplates = filtered.filter((template) => NEW_TEMPLATE_IDS.has(template.id));
  const regularTemplates = filtered.filter((template) => !NEW_TEMPLATE_IDS.has(template.id));

  const handleLoad = async (template: PresetTemplate) => {
    if (isDirty) {
      const confirmed = await confirmDialog({
        title: `¿Cargar la plantilla "${template.name}"?`,
        description: 'Se perderán los cambios no guardados del documento actual.',
        confirmLabel: 'Descartar y cargar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    const doc = template.build();
    doc.name = template.name;
    onLoadTemplate(doc);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 rounded-lg border border-neutral-200 focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-300 transition-all">
          <Search size={12} className="text-neutral-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar plantilla..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 bg-transparent text-xs text-neutral-700 outline-none placeholder-neutral-400 min-w-0"
          />
          {search && (
            <button
              className="text-neutral-400 hover:text-neutral-600 text-xs"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 px-2 py-1.5 border-b border-neutral-100 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveCategory('all')}
          className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-violet-100 text-violet-700'
              : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          Todas
        </button>
        {PRESET_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              activeCategory === category.id
                ? 'bg-violet-100 text-violet-700'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-2">
              <LayoutTemplate size={16} className="text-neutral-400" />
            </div>
            <p className="text-xs text-neutral-500">Sin resultados</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Prueba con otro término</p>
          </div>
        ) : (
          <div className="space-y-3">
            {newTemplates.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-0.5 mb-1">
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                    Nuevas plantillas
                  </p>
                  <span className="text-[9px] text-emerald-600">
                    {newTemplates.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {newTemplates.map((template) => (
                    <TemplateCard key={template.id} template={template} onLoad={(item) => void handleLoad(item)} highlight />
                  ))}
                </div>
              </div>
            )}

            {regularTemplates.length > 0 && (
              <div>
                {newTemplates.length > 0 && (
                  <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide px-0.5 mb-1">
                    Catalogo general
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {regularTemplates.map((template) => (
                    <TemplateCard key={template.id} template={template} onLoad={(item) => void handleLoad(item)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}