import React, { useState } from 'react';
import {
  TemplateElement,
  PageSettings,
  PhotoGridCount,
  PhotoGridOddPosition,
  generateId,
  type BindingDefinition,
  type CanvasDocument,
  type DocumentTheme,
} from '../canvasTypes';
import { TransformPanel } from './TransformPanel.tsx';
import { StylePanel } from './StylePanel.tsx';
import { PageSettingsPanel } from './PageSettingsPanel.tsx';
import { resolvePreviewExpression } from '../documentModel';
import { Sliders, Unplug, ChevronDown } from 'lucide-react';

const PHOTO_COUNT_OPTIONS: Array<{ value: PhotoGridCount; label: string }> = [
  { value: 2, label: '2 (compatibilidad)' },
  { value: 3, label: '3 fotos' },
  { value: 4, label: '4 fotos' },
  { value: 5, label: '5 fotos' },
  { value: 6, label: '6 fotos' },
];

interface InspectorRootProps {
  width?: number;
  selectedIds: string[];
  elements: TemplateElement[];
  onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void;
  theme?: DocumentTheme;
  pageSettings: PageSettings;
  onPageSettingsChange: (settings: PageSettings) => void;
  bindingMap?: CanvasDocument['bindingMap'];
  dataSourceDefinition?: CanvasDocument['dataSourceDefinition'];
  dataPreview?: Record<string, unknown>;
  assetLibrary?: NonNullable<CanvasDocument['assetLibrary']>;
  brandKits?: NonNullable<CanvasDocument['brandKits']>;
  onUpsertBinding?: (binding: BindingDefinition) => void;
  onRemoveBinding?: (elementId: string) => void;
}

function buildDefaultBinding(element: TemplateElement, bindingMap: CanvasDocument['bindingMap'], fields: NonNullable<NonNullable<CanvasDocument['dataSourceDefinition']>['fields']>): BindingDefinition {
  const existing = bindingMap?.[element.id];
  if (existing) return existing;

  if (element.type === 'logo') {
    const slot = element.variableName === 'logo_right' ? 'right' : 'left';
    return {
      id: `binding_${generateId()}`,
      elementId: element.id,
      target: 'logo',
      mode: 'brand-kit',
      brandKitSlot: slot,
      expression: slot === 'right' ? 'logo_right' : 'logo_left',
      previewLabel: slot === 'right' ? 'Logo right' : 'Logo left',
    };
  }

  if (element.type === 'image') {
    return {
      id: `binding_${generateId()}`,
      elementId: element.id,
      target: 'image',
      mode: element.assetRefId ? 'asset' : 'expression',
      assetId: element.assetRefId,
      expression: element.imageUrl || '',
      previewLabel: element.imageUrl || '',
    };
  }

  if (element.type === 'qr') {
    return {
      id: `binding_${generateId()}`,
      elementId: element.id,
      target: 'qr',
      mode: 'expression',
      expression: element.qrConfig?.content || '',
      previewLabel: element.qrConfig?.content || '',
    };
  }

  return {
    id: `binding_${generateId()}`,
    elementId: element.id,
    target: 'variable',
    mode: 'field',
    sourceField: fields[0]?.key,
    expression: element.variableName || '',
    previewLabel: element.variableName || fields[0]?.key || '',
  };
}

export function InspectorRoot({
  width = 260,
  selectedIds,
  elements,
  onUpdateElement,
  theme,
  pageSettings,
  onPageSettingsChange,
  bindingMap,
  dataSourceDefinition,
  dataPreview,
  assetLibrary,
  brandKits,
  onUpsertBinding,
  onRemoveBinding,
}: InspectorRootProps) {
  const [transformOpen, setTransformOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(true);

  const selectedElementId = selectedIds[0] ?? null;

  if (selectedElementId === null) {
    return (
      <PageSettingsPanel
        width={width}
        pageSettings={pageSettings}
        onChange={onPageSettingsChange}
        className="bg-[#f9f8f7]"
      />
    );
  }

  const primaryElement = elements.find((element) => element.id === selectedElementId);
  if (!primaryElement) return null;

  const fields = Array.isArray(dataSourceDefinition?.fields) ? dataSourceDefinition.fields : [];
  const safeBinding = buildDefaultBinding(primaryElement, bindingMap, fields);
  const resolvedPreview = resolvePreviewExpression(safeBinding.expression || primaryElement.variableName || '', dataPreview);
  const safeAssets = assetLibrary || [];
  const safeBrandKits = brandKits || [];

  const updateBinding = (updates: Partial<BindingDefinition>) => {
    onUpsertBinding?.({
      ...safeBinding,
      ...updates,
    });
  };

  const isPhotoGrid = primaryElement.type === 'photo-grid';
  const photoCount: PhotoGridCount = isPhotoGrid ? (primaryElement.photoConfig?.count || 2) : 2;
  const photoShowLabels = isPhotoGrid ? Boolean(primaryElement.photoConfig?.showLabels) : false;
  const photoOddPosition: PhotoGridOddPosition = isPhotoGrid ? (primaryElement.photoConfig?.oddPosition || 'center') : 'center';
  const photoLabels = isPhotoGrid
    ? Array.from({ length: photoCount }, (_, index) => primaryElement.photoConfig?.labels?.[index] || `Foto ${index + 1}`)
    : [];

  const updatePhotoConfig = (updates: Partial<{ count: PhotoGridCount; labels: string[]; showLabels: boolean; oddPosition: PhotoGridOddPosition }>) => {
    if (!isPhotoGrid) return;
    onUpdateElement(primaryElement.id, {
      photoConfig: {
        count: updates.count ?? photoCount,
        labels: updates.labels ?? photoLabels,
        showLabels: updates.showLabels ?? photoShowLabels,
        oddPosition: updates.oddPosition ?? photoOddPosition,
      },
    });
  };

  return (
    <div className="h-full flex-none border-l border-neutral-200/70 bg-[#f9f8f7] flex flex-col overflow-y-auto" style={{ width, scrollbarWidth: 'thin', scrollbarColor: '#d4d4d8 transparent' }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-3 py-2.5 border-b border-neutral-100 flex items-center gap-2 bg-white/80 backdrop-blur-sm">
        <Sliders size={13} className="text-violet-400 flex-shrink-0" />
        <h2 className="text-xs font-bold text-neutral-600 tracking-wide uppercase flex-1">Inspector</h2>
        {selectedIds.length > 1 && (
          <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-semibold">
            {selectedIds.length} sel.
          </span>
        )}
      </div>

      {/* Element identity card */}
      <div className="px-3 py-2.5 border-b border-neutral-100 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold font-mono bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-md flex-shrink-0 uppercase tracking-wide">
            {primaryElement.type}
          </span>
          <span className="text-xs text-neutral-600 truncate flex-1" title={primaryElement.name}>
            {primaryElement.name}
          </span>
          {primaryElement.componentId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600 flex-shrink-0">
              <Unplug size={9} />
              comp.
            </span>
          )}
        </div>
      </div>

      {/* Transform accordion */}
      <div className="border-b border-neutral-100">
        <button
          onClick={() => setTransformOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:bg-neutral-50/80 transition-colors"
        >
          <span>Posición y tamaño</span>
          <ChevronDown className={`w-3 h-3 transition-transform text-neutral-300 ${transformOpen ? '' : '-rotate-90'}`} />
        </button>
        {transformOpen && <div className="bg-white"><TransformPanel element={primaryElement} onUpdate={onUpdateElement} /></div>}
      </div>

      {/* Style accordion */}
      <div className="border-b border-neutral-100">
        <button
          onClick={() => setStyleOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:bg-neutral-50/80 transition-colors"
        >
          <span>Estilo</span>
          <ChevronDown className={`w-3 h-3 transition-transform text-neutral-300 ${styleOpen ? '' : '-rotate-90'}`} />
        </button>
        {styleOpen && <div className="bg-white"><StylePanel element={primaryElement} onUpdate={onUpdateElement} theme={theme} /></div>}
      </div>

      {(primaryElement.type === 'variable' || primaryElement.type === 'logo' || primaryElement.type === 'image' || primaryElement.type === 'qr') && (
        <div className="px-3 py-3 border-b border-neutral-100 space-y-2 bg-white">
          <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block">Binding</label>

          {(primaryElement.type === 'variable' || primaryElement.type === 'qr') && (
            <>
              <select
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                value={safeBinding.sourceField || ''}
                onChange={(event) => updateBinding({
                  target: primaryElement.type === 'qr' ? 'qr' : 'variable',
                  mode: 'field',
                  sourceField: event.target.value,
                  previewLabel: event.target.value,
                })}
              >
                <option value="">- Seleccionar campo -</option>
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>{field.label || field.key}</option>
                ))}
              </select>
              <input
                type="text"
                value={safeBinding.expression || primaryElement.variableName || primaryElement.qrConfig?.content || ''}
                onChange={(event) => updateBinding({
                  target: primaryElement.type === 'qr' ? 'qr' : 'variable',
                  mode: 'expression',
                  expression: event.target.value,
                  previewLabel: event.target.value,
                })}
                className="w-full h-7 px-2 text-xs font-mono border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                placeholder={primaryElement.type === 'qr' ? 'report.data.get(\'codigo\', \'-\')' : "report.data.get('CAMPO', '-')"}
              />
            </>
          )}

          {primaryElement.type === 'logo' && (
            <>
              <select
                value={safeBinding.brandKitSlot || 'left'}
                onChange={(event) => updateBinding({
                  target: 'logo',
                  mode: 'brand-kit',
                  brandKitSlot: event.target.value === 'right' ? 'right' : 'left',
                  expression: event.target.value === 'right' ? 'logo_right' : 'logo_left',
                  previewLabel: event.target.value === 'right' ? 'Logo right' : 'Logo left',
                })}
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
              >
                <option value="left">Brand kit left</option>
                <option value="right">Brand kit right</option>
              </select>
              <input
                type="text"
                value={primaryElement.imageUrl || ''}
                onChange={(event) => onUpdateElement(primaryElement.id, { imageUrl: event.target.value })}
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                placeholder="URL opcional para override"
              />
            </>
          )}

          {primaryElement.type === 'image' && (
            <>
              <select
                value={safeBinding.assetId || ''}
                onChange={(event) => updateBinding({
                  target: 'image',
                  mode: event.target.value ? 'asset' : 'expression',
                  assetId: event.target.value || undefined,
                  previewLabel: safeAssets.find((asset) => asset.id === event.target.value)?.name || '',
                })}
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
              >
                <option value="">- Seleccionar asset -</option>
                {safeAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={primaryElement.imageUrl || ''}
                onChange={(event) => onUpdateElement(primaryElement.id, { imageUrl: event.target.value })}
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                placeholder="URL opcional de imagen"
              />
            </>
          )}

          {safeBrandKits.length > 0 && primaryElement.type === 'logo' && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-[10px] text-neutral-500">
              Slots disponibles: {safeBrandKits.map((brandKit) => brandKit.name).join(', ')}
            </div>
          )}

          <div className="px-2 py-1 bg-blue-50 border border-blue-100 rounded text-[10px] font-mono text-blue-700 break-all">
            Preview: {resolvedPreview || '-'}
          </div>
          <button
            type="button"
            onClick={() => onRemoveBinding?.(primaryElement.id)}
            className="inline-flex h-7 items-center justify-center rounded-md border border-neutral-200 bg-white px-2 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            Limpiar binding
          </button>
        </div>
      )}

      {isPhotoGrid && (
        <div className="px-3 py-3 border-b border-neutral-100 space-y-2.5 bg-white">
          <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block">Configuración de Fotos</label>
          <div>
            <span className="text-[10px] font-medium text-neutral-400 block mb-1">Cantidad</span>
            <select
              value={photoCount}
              onChange={(event) => {
                const nextCount = Number(event.target.value) as PhotoGridCount;
                const nextLabels = Array.from({ length: nextCount }, (_, index) => photoLabels[index] || `Foto ${index + 1}`);
                updatePhotoConfig({ count: nextCount, labels: nextLabels });
              }}
              className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
            >
              {PHOTO_COUNT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {photoCount % 2 !== 0 && (
            <div>
              <span className="text-[10px] font-medium text-neutral-400 block mb-1">Ubicacion impar</span>
              <select
                value={photoOddPosition}
                onChange={(event) => updatePhotoConfig({ oddPosition: event.target.value as PhotoGridOddPosition })}
                className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={photoShowLabels}
              onChange={(event) => updatePhotoConfig({ showLabels: event.target.checked })}
              className="rounded border-neutral-300"
            />
            Mostrar etiquetas
          </label>

          {photoShowLabels && (
            <div className="space-y-1.5">
              {photoLabels.map((label, index) => (
                <input
                  key={index}
                  type="text"
                  value={label}
                  onChange={(event) => {
                    const nextLabels = [...photoLabels];
                    nextLabels[index] = event.target.value;
                    updatePhotoConfig({ labels: nextLabels });
                  }}
                  className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                  placeholder={`Etiqueta foto ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
