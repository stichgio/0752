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

                {/* ========== PÁGINA 1 ========== */}

                {/* Header Principal */}
                <div className="border-2 border-black p-4 mb-4">
                    <div className="text-center">
                        <h1 className="text-lg font-bold uppercase">INFORME TÉCNICO DE LIMPIEZA Y DESINFECCIÓN</h1>
                        <h2 className="text-sm font-bold uppercase">DE RESERVORIOS Y CISTERNAS</h2>
                    </div>
                    <div className="mt-2 text-right text-sm">
                        <strong>INFORME:</strong> {reportData.metadata.informe_id} |
                        <strong> DÍA:</strong> {reportData.metadata.dia} |
                        <strong> MES:</strong> {reportData.metadata.mes} |
                        <strong> AÑO:</strong> {reportData.metadata.anio}
                    </div>
                </div>

                {/* Información Básica */}
                <div className="border border-black mb-4">
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">C-S:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.cs}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">CONTRATISTA:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.contratista}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">CÓDIGO:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.codigo_infraestructura}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">UBICACIÓN:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.ubicacion}</div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-black">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">SUMINISTRO:</div>
                        <div className="col-span-3 p-2 text-xs">{reportData.header.suministro}</div>
                    </div>
                    <div className="grid grid-cols-4">
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">TIPO:</div>
                        <div className="col-span-1 p-2 border-r border-black text-xs">{reportData.header.tipo}</div>
                        <div className="col-span-1 bg-gray-200 p-2 border-r border-black font-bold text-xs">VOLUMEN (m³):</div>
                        <div className="col-span-1 p-2 text-xs">{reportData.header.volumen}</div>
                    </div>
                </div>

                {/* Tabla de Inspección */}
                <div className="border border-black mb-4">
                    <div className="bg-gray-200 p-2 border-b border-black font-bold text-xs text-center uppercase">
                        DESCRIPCIÓN DEL ESTADO DE LA INFRAESTRUCTURA
                    </div>

                    {/* Headers de columnas */}
                    <div className="grid grid-cols-4 border-b border-black bg-gray-100">
                        <div className="col-span-2 p-2 border-r border-black text-xs font-bold text-center">DESCRIPCIÓN</div>
                        <div className="p-2 border-r border-black text-xs font-bold text-center">NORMAL</div>
                        <div className="p-2 text-xs font-bold text-center">CRÍTICO</div>
                    </div>

                    {/* Filas de inspección */}
                    {[
                        { key: 'caja_registro', label: 'Caja de Registro' },
                        { key: 'marco_tapa', label: 'Marco y Tapa' },
                        { key: 'escalera_interior', label: 'Escalera Interior' },
                        { key: 'escalera_exterior', label: 'Escalera Exterior' },
                        { key: 'cuba_interior', label: 'Cuba Interior' },
                        { key: 'cuba_exterior', label: 'Cuba Exterior' },
                        { key: 'loza_fondo', label: 'Loza de Fondo' },
                        { key: 'loza_techo_interior', label: 'Loza Techo Interior' },
                        { key: 'loza_techo_exterior', label: 'Loza Techo Exterior' },
                        { key: 'ducto_ventilacion', label: 'Ducto de Ventilación' },
                        { key: 'cerco_perimetrico', label: 'Cerco Perimetrico' },
                        { key: 'descarga', label: 'Descarga' }
                    ].map(({ key, label }) => (
                        <div key={key} className="grid grid-cols-4 border-b border-black last:border-b-0">
                            <div className="col-span-2 p-2 border-r border-black text-xs">{label}</div>
                            <div className="text-center p-2 border-r border-black text-xs font-bold">
                                {reportData.inspeccion[key] === 'normal' ? '✓' : ''}
                            </div>
                            <div className="text-center p-2 text-xs font-bold">
                                {reportData.inspeccion[key] === 'critico' ? '✓' : ''}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabla de Válvulas */}
                <div className="border border-black mb-4">
                    <div className="bg-gray-200 p-2 border-b border-black font-bold text-xs text-center uppercase">
                        VÁLVULAS
                    </div>

                    {/* Headers */}
                    <div className="grid grid-cols-10 border-b border-black bg-gray-100">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold text-center">DIÁMETRO</div>
                        {['2"', '3"', '4"', '6"', '8"', '10"', '12"', 'TOTAL'].map((d, i) => (
                            <div key={i} className={`p-1 text-[10px] font-bold text-center ${i < 7 ? 'border-r border-black' : ''}`}>{d}</div>
                        ))}
                    </div>

                    {/* Cantidad Row */}
                    <div className="grid grid-cols-10 border-b border-black">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">CANTIDAD</div>
                        {['2', '3', '4', '6', '8', '10', '12'].map(d => (
                            <div key={d} className="p-1 text-[10px] text-center border-r border-black">
                                {reportData.valvulas.diametros[d] || 0}
                            </div>
                        ))}
                        <div className="p-1 text-[10px] text-center font-bold">
                            {Object.values(reportData.valvulas.diametros).reduce((a, b) => a + b, 0)}
                        </div>
                    </div>

                    {/* Operativas/No Operativas */}
                    <div className="grid grid-cols-10 border-b border-black">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">OPERATIVAS</div>
                        <div className="col-span-8 p-1 text-[10px] text-center">{reportData.valvulas.operativas}</div>
                    </div>
                    <div className="grid grid-cols-10">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">NO OPERATIVAS</div>
                        <div className="col-span-8 p-1 text-[10px] text-center">{reportData.valvulas.no_operativas}</div>
                    </div>
                </div>

                {/* Tabla de Canastillas (igual estructura que válvulas) */}
                <div className="border border-black mb-4">
                    <div className="bg-gray-200 p-2 border-b border-black font-bold text-xs text-center uppercase">
                        CANASTILLAS
                    </div>

                    <div className="grid grid-cols-10 border-b border-black bg-gray-100">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold text-center">DIÁMETRO</div>
                        {['2"', '3"', '4"', '6"', '8"', '10"', '12"', 'TOTAL'].map((d, i) => (
                            <div key={i} className={`p-1 text-[10px] font-bold text-center ${i < 7 ? 'border-r border-black' : ''}`}>{d}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-10 border-b border-black">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">CANTIDAD</div>
                        {['2', '3', '4', '6', '8', '10', '12'].map(d => (
                            <div key={d} className="p-1 text-[10px] text-center border-r border-black">
                                {reportData.canastillas.diametros[d] || 0}
                            </div>
                        ))}
                        <div className="p-1 text-[10px] text-center font-bold">
                            {Object.values(reportData.canastillas.diametros).reduce((a, b) => a + b, 0)}
                        </div>
                    </div>

                    <div className="grid grid-cols-10 border-b border-black">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">OPERATIVAS</div>
                        <div className="col-span-8 p-1 text-[10px] text-center">{reportData.canastillas.operativas}</div>
                    </div>
                    <div className="grid grid-cols-10">
                        <div className="col-span-2 p-1 border-r border-black text-[10px] font-bold bg-gray-100">NO OPERATIVAS</div>
                        <div className="col-span-8 p-1 text-[10px] text-center">{reportData.canastillas.no_operativas}</div>
                    </div>
                </div>

                {/* Observaciones */}
                <div className="border border-black mb-4">
                    <div className="bg-gray-200 p-2 border-b border-black font-bold text-xs uppercase">OBSERVACIONES</div>
                    <div className="p-3 text-xs min-h-[60px]">{reportData.observaciones || '-'}</div>
                </div>

                {/* Sugerencias */}
                <div className="border border-black mb-6">
                    <div className="bg-gray-200 p-2 border-b border-black font-bold text-xs uppercase">SUGERENCIAS</div>
                    <div className="p-3 text-xs min-h-[60px]">{reportData.sugerencias || '-'}</div>
                </div>

                {/* Footer */}
                <div className="text-right text-[10px] text-gray-500 mt-4">
                    Página {reportData.metadata.pagina}
                </div>
            </div>
        </div>
    );
}
