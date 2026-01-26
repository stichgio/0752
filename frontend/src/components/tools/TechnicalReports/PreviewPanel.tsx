import React from 'react';
import { TechnicalReport } from './types';

interface Props {
    reportData: TechnicalReport | null;
    zoom: number;
}

export default function PreviewPanel({ reportData, zoom }: Props) {
    if (!reportData) {
        return (
            <div className="flex items-center justify-center h-full bg-[#111] rounded-lg border border-[#333]">
                <div className="text-center text-[#666]">
                    <p className="text-lg font-medium">Selecciona un informe</p>
                    <p className="text-sm mt-2">para ver la vista previa</p>
                </div>
            </div>
        );
    }

    const renderCheck = (state: string) => {
        if (state === 'normal') return <span className="text-black font-bold">X</span>;
        if (state === 'critico') return <span className="text-red-600 font-bold">X</span>;
        return null;
    };

    return (
        <div className="h-full overflow-auto bg-gray-50 p-6 rounded-lg border border-gray-200">
            <div className="mx-auto bg-white shadow-lg text-gray-900" style={{
                width: '210mm',
                minHeight: '297mm',
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
                padding: '10mm',
                fontSize: '9pt',
                fontFamily: 'Arial, sans-serif'
            }}>
                {/* Simplified preview - mimicking the PDF layout roughly for quick feedback */}
                <div className="border-2 border-black p-2 mb-4 grid grid-cols-[100px_1fr_100px] gap-2">
                    <div className="flex items-center justify-center border-r border-black font-bold">LOGOS</div>
                    <div className="text-center flex flex-col justify-center">
                        <div className="font-bold">INFORME TÉCNICO DE LIMPIEZA Y DESINFECCIÓN</div>
                    </div>
                    <div className="text-center text-[8pt] border-l border-black p-1">
                        <div>INFORME: {reportData.metadata.informe_id}</div>
                        <div>{reportData.metadata.dia}/{reportData.metadata.mes}/{reportData.metadata.anio}</div>
                    </div>
                </div>

                <div className="border border-black p-2 mb-3 text-[8pt]">
                    <div className="grid grid-cols-[120px_1fr] gap-y-1 border-b border-black pb-1 mb-1">
                        <div className="font-bold">C-S:</div><div>{reportData.header.cs}</div>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-y-1 border-b border-black pb-1 mb-1">
                        <div className="font-bold">CONTRATISTA:</div><div>{reportData.header.contratista}</div>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-y-1 border-b border-black pb-1 mb-1">
                        <div className="font-bold">CÓDIGO:</div><div>{reportData.header.codigo_infraestructura}</div>
                    </div>
                    <div className="grid grid-cols-[120px_1fr_80px_1fr] gap-1">
                        <div className="font-bold">UBICACIÓN:</div><div>{reportData.header.ubicacion}</div>
                        <div className="font-bold">TIPO:</div><div>{reportData.header.tipo}</div>
                    </div>
                </div>

                <div className="border border-black mb-3 text-[7pt]">
                    <div className="grid grid-cols-[2fr_1fr_1fr_2fr_2fr] border-b border-black font-bold text-center bg-gray-100">
                        <div className="p-1">DESCRIPCIÓN</div>
                        <div className="p-1 border-l border-black">NORMAL</div>
                        <div className="p-1 border-l border-black">CRÍTICO</div>
                        <div className="p-1 border-l border-black">OBSERVACIONES</div>
                        <div className="p-1 border-l border-black">SUGERENCIAS</div>
                    </div>
                    {Object.entries(reportData.inspeccion).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[2fr_1fr_1fr_2fr_2fr] border-b border-black last:border-0 text-gray-900">
                            <div className="p-1 uppercase border-r border-black">{key.replace(/_/g, ' ')}</div>
                            <div className="p-1 text-center border-r border-black">{renderCheck(value === 'normal' ? 'normal' : '')}</div>
                            <div className="p-1 text-center border-r border-black">{renderCheck(value === 'critico' ? 'critico' : '')}</div>
                            <div className="p-1 border-r border-black text-center text-gray-700">{value === 'critico' ? reportData.observaciones : ''}</div>
                            <div className="p-1 text-center text-gray-700">{value === 'critico' ? reportData.sugerencias : ''}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
