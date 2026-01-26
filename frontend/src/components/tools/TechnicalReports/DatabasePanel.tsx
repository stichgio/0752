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
    const selectedItemRef = useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
        if (selectedItemRef.current) {
            selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedReportId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportCSV(file);
            e.target.value = '';
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
            <h2 className="text-lg font-bold mb-4 flex-shrink-0">
                Base de Datos ({reports.length} {reports.length === 1 ? 'informe' : 'informes'})
            </h2>

            {/* Botones de acción */}
            <div className="flex gap-2 mb-4 flex-shrink-0">
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
            <div className="space-y-2 flex-1 overflow-y-auto pr-2 min-h-0">
                {reports.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                        No hay informes. Importa un CSV para comenzar.
                    </p>
                ) : (
                    reports.map(report => (
                        <button
                            key={report.id}
                            ref={selectedReportId === report.id ? selectedItemRef : null}
                            onClick={() => onReportSelect(report.id)}
                            className={`
                        w-full text-left p-2.5 rounded-lg border transition-colors
                        ${selectedReportId === report.id
                                    ? 'bg-blue-50 border-blue-500'
                                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                }
                    `}
                        >
                            <div className="flex items-start gap-2">
                                <FileText size={14} className="mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-xs truncate">
                                        #{report.metadata.informe_id} - {report.header.cs}
                                    </p>
                                    <p className="text-[10px] text-gray-600 truncate">
                                        {report.header.codigo_infraestructura}
                                    </p>
                                    <span className={`
                                inline-block text-[9px] px-1.5 py-0.5 rounded-full mt-1
                                ${report.status === 'completed'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-yellow-100 text-yellow-800'
                                        }
                            `}>
                                        {report.status === 'completed' ? 'Completado' : 'Borrador'}
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
