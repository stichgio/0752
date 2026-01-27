import React from 'react';
import { Save, Settings, Upload } from 'lucide-react';
import { TechnicalReport } from './types';

interface Props {
    reportData: TechnicalReport | null;
    onChange: (data: Partial<TechnicalReport>) => void;
    onSave: () => void;
    hasUnsavedChanges: boolean;
    onDownloadImage: () => void;
    logoLeft: File | null;
    logoRight: File | null;
    onLogoLeftChange: (file: File | null) => void;
    onLogoRightChange: (file: File | null) => void;
}

export default function FormPanel({
    reportData,
    onChange,
    onSave,
    hasUnsavedChanges,
    onDownloadImage,
    logoLeft,
    logoRight,
    onLogoLeftChange,
    onLogoRightChange
}: Props) {
    if (!reportData) {
        return (
            <div className="flex items-center justify-center h-full bg-[#111] rounded-lg shadow border border-[#333]">
                <p className="text-[#666]">Selecciona un informe para editar</p>
            </div>
        );
    }

    const updateHeader = (field: string, value: any) => {
        onChange({ header: { ...reportData.header, [field]: value } });
    };

    const updateInspeccion = (field: string, value: any) => {
        onChange({ inspeccion: { ...reportData.inspeccion, [field]: value } });
    };

    const cycleCheck = (current: string): string => {
        if (current === 'unchecked') return 'normal';
        if (current === 'normal') return 'critico';
        return 'unchecked';
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, isLeft: boolean) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (isLeft) onLogoLeftChange(file);
            else onLogoRightChange(file);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#111] rounded-lg shadow border border-[#333] text-[#eee]">
            <div className="p-4 border-b border-[#333]">
                <h2 className="text-lg font-semibold mb-3">Editar #{reportData.metadata.informe_id}</h2>
                {hasUnsavedChanges && (
                    <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-2 text-sm text-yellow-200 mb-3">
                        ⚠️ Cambios sin guardar
                    </div>
                )}
                <button onClick={onSave} disabled={!hasUnsavedChanges} className="btn-primary w-full flex items-center justify-center gap-2">
                    <Save size={18} />
                    Guardar
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* LOGOS SECTION */}
                <div className="bg-[#1a1a1a] p-2 rounded border border-[#333]">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#eee]">
                        <div className="bg-[#eee] text-[#000] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">0</div>
                        <Settings size={12} />
                        LOGOS Y CABECERA
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Logo Left */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-[#888]">Logo Izq</span>
                            <label className="w-full h-12 border border-dashed border-[#444] rounded flex flex-col items-center justify-center cursor-pointer hover:border-[#666] hover:bg-[#222] transition-colors relative overflow-hidden">
                                {logoLeft ? (
                                    <img src={URL.createObjectURL(logoLeft)} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <span className="text-[9px] text-[#666]">Subir</span>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, true)} />
                            </label>
                        </div>
                        {/* Logo Right */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-[#888]">Logo Der</span>
                            <label className="w-full h-12 border border-dashed border-[#444] rounded flex flex-col items-center justify-center cursor-pointer hover:border-[#666] hover:bg-[#222] transition-colors relative overflow-hidden">
                                {logoRight ? (
                                    <img src={URL.createObjectURL(logoRight)} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <span className="text-[9px] text-[#666]">Subir</span>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, false)} />
                            </label>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold mb-2 text-sm text-[#888] uppercase tracking-wider">Información General</h3>
                    <div className="space-y-2">
                        <div>
                            <label className="block text-xs font-medium mb-1 text-[#aaa]">C-S</label>
                            <input type="text" value={reportData.header.cs} onChange={(e) => updateHeader('cs', e.target.value)} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee] focus:border-[#666]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1 text-[#aaa]">Contratista</label>
                            <input type="text" value={reportData.header.contratista} onChange={(e) => updateHeader('contratista', e.target.value)} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1 text-[#aaa]">Código Infraestructura</label>
                            <input type="text" value={reportData.header.codigo_infraestructura} onChange={(e) => updateHeader('codigo_infraestructura', e.target.value)} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1 text-[#aaa]">Ubicación</label>
                            <input type="text" value={reportData.header.ubicacion} onChange={(e) => updateHeader('ubicacion', e.target.value)} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium mb-1 text-[#aaa]">Tipo</label>
                                <select value={reportData.header.tipo} onChange={(e) => updateHeader('tipo', e.target.value)} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]">
                                    <option value="ELEVADO">ELEVADO</option>
                                    <option value="ENTERRADO">ENTERRADO</option>
                                    <option value="SEMIENTERRADO">SEMIENTERRADO</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1 text-[#aaa]">Volumen</label>
                                <input type="number" value={reportData.header.volumen} onChange={(e) => updateHeader('volumen', parseInt(e.target.value))} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" />
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold mb-2 text-sm text-[#888] uppercase tracking-wider">Estado de Inspección</h3>
                    <div className="space-y-2">
                        {Object.entries(reportData.inspeccion)
                            .filter(([key]) => !key.startsWith('observaciones_') && !key.startsWith('sugerencias_'))
                            .map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between p-2 bg-[#1a1a1a] border border-[#333] rounded">
                                    <span className="text-xs uppercase text-[#ccc]">{key.replace(/_/g, ' ')}</span>
                                    <button
                                        onClick={() => updateInspeccion(key, cycleCheck(value as string))}
                                        className={`px-3 py-1 rounded text-xs font-medium min-w-[80px] ${value === 'normal' ? 'bg-green-900/50 text-green-200 border border-green-800' :
                                            value === 'critico' ? 'bg-red-900/50 text-red-200 border border-red-800' :
                                                'bg-[#333] text-[#888] border border-[#444]'
                                            }`}
                                    >
                                        {value === 'normal' ? '✓ Normal' : value === 'critico' ? '✗ Crítico' : '---'}
                                    </button>
                                </div>
                            ))}
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold mb-2 text-sm text-[#888] uppercase tracking-wider">Observaciones (Solo Críticos)</h3>
                    <textarea value={reportData.observaciones} onChange={(e) => onChange({ observaciones: e.target.value })} rows={3} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" placeholder="Ej: MAL ESTADO" />
                </div>

                <div>
                    <h3 className="font-semibold mb-2 text-sm text-[#888] uppercase tracking-wider">Sugerencias</h3>
                    <textarea value={reportData.sugerencias} onChange={(e) => onChange({ sugerencias: e.target.value })} rows={3} className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-sm text-[#eee]" placeholder="Ej: CAMBIAR" />
                </div>

                <div>
                    <h3 className="font-semibold mb-2 text-sm text-[#888] uppercase tracking-wider">Exportar como Imagen</h3>
                    <div className="space-y-3">
                        <button
                            onClick={onDownloadImage}
                            className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer text-sm p-2 border border-dashed border-[#666] hover:border-[#aaa] hover:bg-[#222] transition-colors"
                        >
                            <span>📷 Descargar como Imagen</span>
                        </button>
                        <p className="text-[10px] text-[#666]">
                            * Descarga una captura de alta calidad del reporte actual.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
