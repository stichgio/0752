import React from 'react';
import { TechnicalReport, ReportHeader, CheckState } from './types';
import { Save } from 'lucide-react';

interface Props {
    reportData: TechnicalReport | null;
    onChange: (data: Partial<TechnicalReport>) => void;
    onSave: () => void;
    hasUnsavedChanges: boolean;
    isLoading: boolean;
}

export default function FormPanel({
    reportData,
    onChange,
    onSave,
    hasUnsavedChanges,
    isLoading
}: Props) {
    if (!reportData) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-center h-full">
                <p className="text-gray-500 text-center">Selecciona un informe para editar</p>
            </div>
        );
    }

    // Helper para actualizar campos del header
    const updateHeader = (field: keyof ReportHeader, value: string | number) => {
        onChange({
            header: {
                ...reportData.header,
                [field]: value
            }
        });
    };

    // Helper para actualizar campos de inspección
    const updateInspeccion = (field: string, value: CheckState) => {
        onChange({
            inspeccion: {
                ...reportData.inspeccion,
                [field]: value
            }
        });
    };

    // Componente para checkbox tri-estado
    const TriStateCheck = ({
        label,
        field,
        value
    }: {
        label: string;
        field: string;
        value: CheckState;
    }) => (
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm">{label}</span>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => updateInspeccion(field, 'normal')}
                    className={`px-2 py-1 text-xs rounded ${value === 'normal'
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                >
                    Normal
                </button>
                <button
                    type="button"
                    onClick={() => updateInspeccion(field, 'critico')}
                    className={`px-2 py-1 text-xs rounded ${value === 'critico'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                >
                    Crítico
                </button>
                <button
                    type="button"
                    onClick={() => updateInspeccion(field, 'unchecked')}
                    className={`px-2 py-1 text-xs rounded ${value === 'unchecked'
                            ? 'bg-gray-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                >
                    N/A
                </button>
            </div>
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-auto h-full">
            <h2 className="text-lg font-bold mb-4 text-gray-900">Editar Informe #{reportData.metadata.informe_id}</h2>

            {/* Información básica */}
            <div className="space-y-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">Información General</h3>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">C-S:</label>
                        <input
                            type="text"
                            value={reportData.header.cs}
                            onChange={(e) => updateHeader('cs', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">Tipo:</label>
                        <select
                            value={reportData.header.tipo}
                            onChange={(e) => updateHeader('tipo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            <option value="ELEVADO">ELEVADO</option>
                            <option value="ENTERRADO">ENTERRADO</option>
                            <option value="SEMIENTERRADO">SEMIENTERRADO</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600">Contratista:</label>
                    <input
                        type="text"
                        value={reportData.header.contratista}
                        onChange={(e) => updateHeader('contratista', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600">Código Infraestructura:</label>
                    <input
                        type="text"
                        value={reportData.header.codigo_infraestructura}
                        onChange={(e) => updateHeader('codigo_infraestructura', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">Ubicación:</label>
                        <input
                            type="text"
                            value={reportData.header.ubicacion}
                            onChange={(e) => updateHeader('ubicacion', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">Volumen:</label>
                        <input
                            type="number"
                            value={reportData.header.volumen}
                            onChange={(e) => updateHeader('volumen', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Inspección */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">Estado de Inspección</h3>
                <div className="space-y-1">
                    <TriStateCheck label="Caja de Registro" field="caja_registro" value={reportData.inspeccion.caja_registro} />
                    <TriStateCheck label="Marco y Tapa" field="marco_tapa" value={reportData.inspeccion.marco_tapa} />
                    <TriStateCheck label="Escalera Interior" field="escalera_interior" value={reportData.inspeccion.escalera_interior} />
                    <TriStateCheck label="Escalera Exterior" field="escalera_exterior" value={reportData.inspeccion.escalera_exterior} />
                    <TriStateCheck label="Cuba Interior" field="cuba_interior" value={reportData.inspeccion.cuba_interior} />
                    <TriStateCheck label="Cuba Exterior" field="cuba_exterior" value={reportData.inspeccion.cuba_exterior} />
                    <TriStateCheck label="Loza de Fondo" field="loza_fondo" value={reportData.inspeccion.loza_fondo} />
                    <TriStateCheck label="Loza Techo Int." field="loza_techo_interior" value={reportData.inspeccion.loza_techo_interior} />
                    <TriStateCheck label="Loza Techo Ext." field="loza_techo_exterior" value={reportData.inspeccion.loza_techo_exterior} />
                    <TriStateCheck label="Ducto Ventilación" field="ducto_ventilacion" value={reportData.inspeccion.ducto_ventilacion} />
                    <TriStateCheck label="Cerco Perimetrico" field="cerco_perimetrico" value={reportData.inspeccion.cerco_perimetrico} />
                    <TriStateCheck label="Descarga" field="descarga" value={reportData.inspeccion.descarga} />
                </div>
            </div>

            {/* Observaciones y Sugerencias */}
            <div className="space-y-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">Notas</h3>

                <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600">Observaciones:</label>
                    <textarea
                        value={reportData.observaciones}
                        onChange={(e) => onChange({ observaciones: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        rows={3}
                        placeholder="Escribir observaciones..."
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600">Sugerencias:</label>
                    <textarea
                        value={reportData.sugerencias}
                        onChange={(e) => onChange({ sugerencias: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        rows={3}
                        placeholder="Escribir sugerencias..."
                    />
                </div>
            </div>

            {/* Botón guardar fijo */}
            {hasUnsavedChanges && (
                <div className="sticky bottom-0 bg-white pt-4 border-t">
                    <button
                        onClick={onSave}
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <Save size={20} />
                        {isLoading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            )}
        </div>
    );
}
