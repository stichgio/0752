import React from 'react';
import { TemplateElement } from '../canvasTypes';
import { TransformPanel } from './TransformPanel.tsx';
import { StylePanel } from './StylePanel.tsx';
import { Sliders, Info } from 'lucide-react';

interface InspectorRootProps {
    selectedIds: string[];
    elements: TemplateElement[];
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void;
}

export function InspectorRoot({ selectedIds, elements, onUpdateElement }: InspectorRootProps) {
    if (selectedIds.length === 0) {
        return (
            <div className="h-full border-l border-neutral-200 bg-white flex flex-col items-center justify-center text-center px-6" style={{ width: 260 }}>
                <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
                    <Info size={20} className="text-neutral-300" />
                </div>
                <p className="text-sm font-medium text-neutral-400">Sin seleccion</p>
                <p className="text-xs text-neutral-300 mt-1">Selecciona un elemento del canvas para editar sus propiedades</p>
            </div>
        );
    }

    const primaryId = selectedIds[0];
    const primaryElement = elements.find(el => el.id === primaryId);

    if (!primaryElement) return null;

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

            {/* Content editing for text */}
            {(primaryElement.type === 'text' || primaryElement.type === 'heading') && (
                <div className="px-3 py-3 border-b border-neutral-100">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
                        Contenido
                    </label>
                    <textarea
                        value={primaryElement.content || ''}
                        onChange={(e) => onUpdateElement(primaryElement.id, { content: e.target.value })}
                        className="w-full h-20 px-2 py-1.5 text-sm border border-neutral-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
                        placeholder="Escribe aqui..."
                    />
                </div>
            )}

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
