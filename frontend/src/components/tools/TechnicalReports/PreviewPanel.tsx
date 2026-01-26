import React from 'react';
import { TechnicalReport } from './types';
import { Loader } from 'lucide-react';

interface Props {
    reportData: TechnicalReport | null;
    isLoading: boolean;
}

export default function PreviewPanel({ reportData, isLoading }: Props) {
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex items-center justify-center h-full">
                <Loader className="animate-spin" size={32} />
            </div>
        );
    }

    if (!reportData) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex items-center justify-center h-full">
                <p className="text-gray-500">Selecciona un informe para ver la vista previa</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-auto">
            <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-8" style={{ minHeight: '297mm' }}>
                {/* Header con bordes */}
                <div className="border-2 border-black p-4 mb-4">
                    <div className="text-center">
                        <h1 className="text-lg font-bold">INFORME TÉCNICO DE LIMPIEZA Y DESINFECCIÓN</h1>
                        <h2 className="text-sm font-bold">DE RESERVORIOS Y CISTERNAS</h2>
                    </div>
                    <div className="mt-2 text-right text-sm">
                        <strong>INFORME:</strong> {reportData.metadata.informe_id} |
                        <strong> DÍA:</strong> {reportData.metadata.dia} |
                        <strong> MES:</strong> {reportData.metadata.mes} |
                        <strong> AÑO:</strong> {reportData.metadata.anio}
                    </div>
                </div>

                {/* Tabla info básica */}
                <div className="border border-black mb-4">
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-100 p-2 border-r border-black font-bold text-xs">C-S:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.cs}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-100 p-2 border-r border-black font-bold text-xs">CONTRATISTA:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.contratista}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-100 p-2 border-r border-black font-bold text-xs">CÓDIGO:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.codigo_infraestructura}</div>
                    </div>
                    <div className="grid grid-cols-4">
                        <div className="col-span-1 bg-gray-100 p-2 border-r border-black font-bold text-xs">UBICACIÓN:</div>
                        <div className="col-span-1 p-2 border-r border-black text-xs">{reportData.header.ubicacion}</div>
                        <div className="bg-gray-100 p-2 border-r border-black font-bold text-xs">TIPO:</div>
                        <div className="p-2 text-xs">{reportData.header.tipo}</div>
                    </div>
                </div>

                {/* Tabla de inspección con checkboxes */}
                <div className="border border-black mb-4">
                    <div className="bg-gray-100 p-2 border-b border-black font-bold text-xs text-center">
                        DESCRIPCIÓN DEL ESTADO DE LA INFRAESTRUCTURA
                    </div>
                    {Object.entries(reportData.inspeccion).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-4 border-b border-black last:border-b-0">
                            <div className="col-span-2 p-2 border-r border-black text-xs capitalize">
                                {key.replace(/_/g, ' ')}
                            </div>
                            <div className="text-center p-2 border-r border-black text-xs">
                                {value === 'normal' ? '✓' : ''}
                            </div>
                            <div className="text-center p-2 text-xs">
                                {value === 'critico' ? '✓' : ''}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Observaciones y sugerencias */}
                <div className="border border-black mb-4 p-3">
                    <div className="font-bold text-xs mb-2">OBSERVACIONES:</div>
                    <div className="text-xs">{reportData.observaciones || '-'}</div>
                </div>

                <div className="border border-black p-3">
                    <div className="font-bold text-xs mb-2">SUGERENCIAS:</div>
                    <div className="text-xs">{reportData.sugerencias || '-'}</div>
                </div>
            </div>
        </div>
    );
}
