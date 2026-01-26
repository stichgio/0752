import React, { useRef } from 'react';
import { Upload, RefreshCw, FileText } from 'lucide-react';
import { TechnicalReport } from './types';

interface Props {
    reports: TechnicalReport[];
    selectedReportId: string | null;
    onReportSelect: (id: string) => void;
    onImportCSV: (file: File) => void;
    onReload: () => void;
    isLoading: boolean;
}

export default function DatabasePanel({
    reports,
    selectedReportId,
    onReportSelect,
    onImportCSV,
    onReload,
    isLoading
}: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportCSV(file);
            e.target.value = '';
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-auto">
            <h2 className="text-lg font-bold mb-4">
                Base de Datos ({reports.length} {reports.length === 1 ? 'informe' : 'informes'})
            </h2>

            {/* Botones de acción */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                    <Upload size={16} />
                    Importar CSV
                </button>
                <button
                    onClick={onReload}
                    disabled={isLoading}
                    className="btn-secondary flex items-center justify-center p-2"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Lista de reportes */}
            <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
                {reports.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                        No hay informes. Importa un CSV para comenzar.
                    </p>
                ) : (
                    reports.map(report => (
                        <button
                            key={report.id}
                            onClick={() => onReportSelect(report.id)}
                            className={`
                        w-full text-left p-3 rounded-md border transition-all duration-200 group
                        ${selectedReportId === report.id
                                    ? 'bg-[#D71921]/10 border-[#D71921] shadow-[0_0_10px_rgba(215,25,33,0.2)]'
                                    : 'bg-transparent border-gray-800 hover:border-gray-600 hover:bg-white/5'
                                }
                    `}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`
                                    mt-1 w-2 h-2 rounded-full flex-shrink-0 transition-colors
                                    ${selectedReportId === report.id ? 'bg-[#D71921]' : 'bg-gray-700 group-hover:bg-gray-500'}
                                `} />

                                <div className="flex-1 min-w-0">
                                    <p className={`font-mono text-xs font-bold truncate mb-0.5 ${selectedReportId === report.id ? 'text-[#D71921]' : 'text-gray-300'}`}>
                                        #{report.metadata.informe_id} - {report.header.cs}
                                    </p>
                                    <p className="text-[10px] text-gray-500 truncate mb-1.5 font-mono">
                                        {report.header.codigo_infraestructura || 'Sin código'}
                                    </p>

                                    <div className="flex items-center justify-between">
                                        <span className={`
                                            inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border
                                            ${report.status === 'completed'
                                                ? 'bg-green-900/20 text-green-400 border-green-900'
                                                : 'bg-yellow-900/20 text-yellow-500 border-yellow-900'
                                            }
                                        `}>
                                            {report.status === 'completed' ? 'COMPLETADO' : 'BORRADOR'}
                                        </span>
                                        <span className="text-[9px] text-gray-600 font-mono uppercase">
                                            {report.metadata.dia} {report.metadata.mes?.substring(0, 3)} {report.metadata.anio}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
