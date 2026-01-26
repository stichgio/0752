import React from 'react';
import { TechnicalReport } from './types';
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <p className="text-gray-500 text-center">Selecciona un informe</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-auto">
            <h2 className="text-lg font-bold mb-4">Editar Informe</h2>

            {/* Formulario básico */}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">C-S:</label>
                    <input
                        type="text"
                        value={reportData.header.cs}
                        onChange={(e) => onChange({
                            header: { ...reportData.header, cs: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Contratista:</label>
                    <input
                        type="text"
                        value={reportData.header.contratista}
                        onChange={(e) => onChange({
                            header: { ...reportData.header, contratista: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Observaciones:</label>
                    <textarea
                        value={reportData.observaciones}
                        onChange={(e) => onChange({ observaciones: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows={3}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Sugerencias:</label>
                    <textarea
                        value={reportData.sugerencias}
                        onChange={(e) => onChange({ sugerencias: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows={3}
                    />
                </div>

                {/* Más campos aquí... */}
            </div>

            {/* Botón guardar */}
            {hasUnsavedChanges && (
                <button
                    onClick={onSave}
                    disabled={isLoading}
                    className="w-full mt-6 btn-primary flex items-center justify-center gap-2"
                >
                    <Save size={20} />
                    Guardar Cambios
                </button>
            )}
        </div>
    );
}
