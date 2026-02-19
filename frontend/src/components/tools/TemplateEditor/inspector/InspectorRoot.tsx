import React from 'react';
import { TemplateElement, PageSettings, PhotoGridCount, PhotoGridOddPosition } from '../canvasTypes';
import { TransformPanel } from './TransformPanel.tsx';
import { StylePanel } from './StylePanel.tsx';
import { PageSettingsPanel } from './PageSettingsPanel.tsx';
import { Sliders } from 'lucide-react';

const PHOTO_COUNT_OPTIONS: Array<{ value: PhotoGridCount; label: string }> = [
    { value: 2, label: '2 (compatibilidad)' },
    { value: 3, label: '3 fotos' },
    { value: 4, label: '4 fotos' },
    { value: 5, label: '5 fotos' },
    { value: 6, label: '6 fotos' },
];

interface InspectorRootProps {
    selectedIds: string[];
    elements: TemplateElement[];
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void;
    pageSettings: PageSettings;
    onPageSettingsChange: (settings: PageSettings) => void;
}

export function InspectorRoot({
    selectedIds,
    elements,
    onUpdateElement,
    pageSettings,
    onPageSettingsChange,
}: InspectorRootProps) {
    const selectedElementId = selectedIds[0] ?? null;

    if (selectedElementId === null) {
        return (
            <PageSettingsPanel
                pageSettings={pageSettings}
                onChange={onPageSettingsChange}
            />
        );
    }

    const primaryElement = elements.find(el => el.id === selectedElementId);

    if (!primaryElement) return null;

    const isPhotoGrid = primaryElement.type === 'photo-grid';
    const photoCount: PhotoGridCount = isPhotoGrid ? (primaryElement.photoConfig?.count || 2) : 2;
    const photoShowLabels = isPhotoGrid ? Boolean(primaryElement.photoConfig?.showLabels) : false;
    const photoOddPosition: PhotoGridOddPosition = isPhotoGrid
        ? (primaryElement.photoConfig?.oddPosition || 'center')
        : 'center';
    const photoLabels = isPhotoGrid
        ? Array.from({ length: photoCount }, (_, i) => primaryElement.photoConfig?.labels?.[i] || `Foto ${i + 1}`)
        : [];

    const updatePhotoConfig = (updates: Partial<{
        count: PhotoGridCount;
        labels: string[];
        showLabels: boolean;
        oddPosition: PhotoGridOddPosition;
    }>) => {
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
        <div className="h-full border-l border-neutral-200 bg-white flex flex-col overflow-y-auto" style={{ width: 260 }}>
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-neutral-100 flex items-center gap-2">
                <Sliders size={14} className="text-neutral-400" />
                <h2 className="text-sm font-semibold text-neutral-700">Inspector</h2>
                {selectedIds.length > 1 && (
                    <span className="ml-auto text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                        {selectedIds.length}
                    </span>
                )}
            </div>

            {/* Element info */}
            <div className="px-3 py-2 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">
                        {primaryElement.type}
                    </span>
                    <span className="text-xs text-neutral-600 truncate flex-1" title={primaryElement.name}>
                        {primaryElement.name}
                    </span>
                </div>
            </div>

            {/* Transform */}
            <TransformPanel element={primaryElement} onUpdate={onUpdateElement} />

            {/* Style */}
            <StylePanel element={primaryElement} onUpdate={onUpdateElement} />

            {/* Variable - Jinja2 expression with backend presets */}
            {primaryElement.type === 'variable' && (
                <div className="px-3 py-3 border-b border-neutral-100 space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                        Expresion Jinja2
                    </label>

                    {/* Preset picker */}
                    <select
                        className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                        value=""
                        onChange={(e) => {
                            if (e.target.value) onUpdateElement(primaryElement.id, { variableName: e.target.value });
                            e.target.value = '';
                        }}
                    >
                        <option value="">- Insertar campo del reporte -</option>
                        <optgroup label="Datos del reporte">
                            <option value="report.data.get('CENTRO', '-')">CENTRO</option>
                            <option value="report.data.get('NIS', '-')">NIS</option>
                            <option value="report.data.get('Nro OT', '-')">Nro OT</option>
                            <option value="report.data.get('DIRECCION', '-')">DIRECCION</option>
                            <option value="report.data.get('LOCALIDAD', '-')">LOCALIDAD</option>
                            <option value="report.data.get('DISTRITO', '-')">DISTRITO</option>
                            <option value="report.data.get('SECTOR', '-')">SECTOR</option>
                            <option value="report.data.get('ESTADO', '-')">ESTADO</option>
                            <option value="report.data.get('ACTIVIDAD', '-')">ACTIVIDAD</option>
                            <option value="report.data.get('SUBACTIVIDAD', '-')">SUBACTIVIDAD</option>
                            <option value="report.data.get('CONTRATA', '-')">CONTRATA</option>
                            <option value="report.data.get('CONTRATISTA', '-')">CONTRATISTA</option>
                            <option value="report.data.get('CUADRILLA', '-')">CUADRILLA</option>
                            <option value="report.data.get('TIPO RED', '-')">TIPO RED</option>
                            <option value="report.data.get('FECHA', '-')">FECHA</option>
                            <option value="report.data.get('ZONAL', '-')">ZONAL</option>
                            <option value="report.data.get('OBSERVACION SEDAPAL', '-')">OBSERVACION SEDAPAL</option>
                            <option value="report.data.get('OBSERVACION CONTRATA', '-')">OBSERVACION CONTRATA</option>
                            <option value="report.data.get('COD INFRAESTRUCT', '-')">COD INFRAESTRUCT</option>
                            <option value="report.data.get('UBICACION', '-')">UBICACION</option>
                            <option value="report.data.get('NAME ACTIVITY', '-')">NAME ACTIVITY</option>
                            <option value="report.data.get('CODIGO BUZON', '-')">CODIGO BUZON</option>
                        </optgroup>
                        <optgroup label="Imagenes">
                            <option value="report.images[0].name">Nombre foto 1</option>
                            <option value="report.images[0].date">Fecha foto 1</option>
                            <option value="report.images[0].coords">Coordenadas foto 1</option>
                            <option value="report.images | length">Cantidad de fotos</option>
                        </optgroup>
                        <optgroup label="Logos">
                            <option value="logo_left">logo_left</option>
                            <option value="logo_right">logo_right</option>
                        </optgroup>
                    </select>

                    {/* Free-text expression input */}
                    <input
                        type="text"
                        value={primaryElement.variableName || ''}
                        onChange={(e) => onUpdateElement(primaryElement.id, { variableName: e.target.value })}
                        className="w-full h-7 px-2 text-xs font-mono border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                        placeholder="report.data.get('CAMPO', '-')"
                    />

                    {/* Generated expression preview */}
                    {primaryElement.variableName && (
                        <div className="px-2 py-1 bg-blue-50 border border-blue-100 rounded text-[10px] font-mono text-blue-700 break-all">
                            {'{{ '}{primaryElement.variableName}{' }}'}
                        </div>
                    )}
                </div>
            )}

            {/* Image / Logo URL */}
            {(primaryElement.type === 'image' || primaryElement.type === 'logo') && (
                <div className="px-3 py-3 border-b border-neutral-100">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
                        {primaryElement.type === 'logo' ? 'URL de Logo (opcional)' : 'URL de Imagen'}
                    </label>
                    <input
                        type="text"
                        value={primaryElement.imageUrl || ''}
                        onChange={(e) => onUpdateElement(primaryElement.id, { imageUrl: e.target.value })}
                        className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                        placeholder="https://..."
                    />
                </div>
            )}

            {/* Photo grid config */}
            {isPhotoGrid && (
                <div className="px-3 py-3 border-b border-neutral-100 space-y-2.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                        Configuracion de Fotos
                    </label>

                    <div>
                        <span className="text-[10px] font-medium text-neutral-400 block mb-1">Cantidad</span>
                        <select
                            value={photoCount}
                            onChange={(e) => {
                                const nextCount = Number(e.target.value) as PhotoGridCount;
                                const nextLabels = Array.from(
                                    { length: nextCount },
                                    (_, i) => photoLabels[i] || `Foto ${i + 1}`
                                );
                                updatePhotoConfig({ count: nextCount, labels: nextLabels });
                            }}
                            className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                        >
                            {PHOTO_COUNT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {photoCount % 2 !== 0 && (
                        <div>
                            <span className="text-[10px] font-medium text-neutral-400 block mb-1">Ubicacion impar</span>
                            <select
                                value={photoOddPosition}
                                onChange={(e) => updatePhotoConfig({ oddPosition: e.target.value as PhotoGridOddPosition })}
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
                            onChange={(e) => updatePhotoConfig({ showLabels: e.target.checked })}
                            className="rounded border-neutral-300"
                        />
                        Mostrar etiquetas
                    </label>

                    {photoShowLabels && (
                        <div className="space-y-1.5">
                            {photoLabels.map((label, i) => (
                                <input
                                    key={i}
                                    type="text"
                                    value={label}
                                    onChange={(e) => {
                                        const nextLabels = [...photoLabels];
                                        nextLabels[i] = e.target.value;
                                        updatePhotoConfig({ labels: nextLabels });
                                    }}
                                    className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                                    placeholder={`Etiqueta foto ${i + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Logo - Jinja2 variable (used when no URL is set) */}
            {primaryElement.type === 'logo' && (
                <div className="px-3 py-3 border-b border-neutral-100">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
                        Variable Jinja2
                    </label>
                    <select
                        value={primaryElement.variableName || 'logo_left'}
                        onChange={(e) => onUpdateElement(primaryElement.id, { variableName: e.target.value })}
                        className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                    >
                        <option value="logo_left">logo_left - logo izquierdo</option>
                        <option value="logo_right">logo_right - logo derecho</option>
                    </select>
                    <p className="mt-1 text-[10px] text-neutral-400">
                        Usada si no hay URL. El backend pasa <code className="bg-neutral-100 px-0.5 rounded">logo_left</code> y <code className="bg-neutral-100 px-0.5 rounded">logo_right</code>.
                    </p>
                </div>
            )}
        </div>
    );
}
