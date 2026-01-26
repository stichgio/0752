import React, { useState, useRef, useEffect } from 'react';
import { Upload, RefreshCw, Search } from 'lucide-react';
import { TechnicalReport } from './types';

interface Props {
    reports: TechnicalReport[];
    selectedReportId: string | null;
    onReportSelect: (reportId: string) => void;
    onImportCSV: (file: File) => void;
    onReload: () => void;
}

export default function DatabasePanel({ reports, selectedReportId, onReportSelect, onImportCSV, onReload }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCS, setFilterCS] = useState('');
    const selectedItemRef = useRef<HTMLButtonElement>(null);

    const filteredReports = reports.filter(r => {
        const matchSearch = r.header.cs.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.header.codigo_infraestructura.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCS = !filterCS || r.header.cs === filterCS;
        return matchSearch && matchCS;
    });

    const uniqueCS = [...new Set(reports.map(r => r.header.cs))];

    useEffect(() => {
        if (selectedItemRef.current) {
            selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedReportId]);

    return (
        <div className="flex flex-col h-full bg-[#111] rounded-lg shadow-sm border border-[#333]">
            <div className="p-4 border-b border-[#333]">
                <h2 className="text-lg font-bold mb-3 text-[#eee]">Base de Datos ({reports.length})</h2>
                <div className="space-y-2">
                    <label className="btn-primary w-full flex items-center justify-center gap-2 cursor-pointer text-sm">
                        <Upload size={16} />
                        Importar CSV / Excel
                        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onImportCSV(e.target.files[0])} className="hidden" />
                    </label>
                    <button onClick={onReload} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm p-2">
                        <RefreshCw size={16} />
                        Recargar
                    </button>
                </div>
            </div>

            <div className="p-4 border-b border-[#333] space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-[#222] border border-[#444] rounded text-[#eee] text-sm focus:ring-1 focus:ring-[#666]"
                    />
                </div>
                <select
                    value={filterCS}
                    onChange={(e) => setFilterCS(e.target.value)}
                    className="w-full px-3 py-2 bg-[#222] border border-[#444] rounded text-[#eee] text-sm"
                >
                    <option value="">Todos los C-S</option>
                    {uniqueCS.map(cs => <option key={cs} value={cs}>{cs}</option>)}
                </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                {filteredReports.map(r => (
                    <button
                        key={r.id}
                        ref={selectedReportId === r.id ? selectedItemRef : null}
                        onClick={() => onReportSelect(r.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedReportId === r.id
                            ? 'bg-[#222] border-[#666]'
                            : 'bg-[#1a1a1a] border-[#333] hover:border-[#555]'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1 mr-2">
                                <div className="font-bold text-xs text-[#eee] truncate flex items-center gap-2">
                                    <span className="text-[#888]">#{r.metadata.informe_id}</span>
                                    {r.header.cs}
                                </div>
                                <div className="text-[10px] text-[#888] mt-1 truncate">{r.header.codigo_infraestructura}</div>
                            </div>
                            <div className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${r.status === 'completed' ? 'bg-green-900 text-green-100' : 'bg-yellow-900 text-yellow-100'
                                }`}>
                                {r.status === 'completed' ? 'Listo' : 'Borrador'}
                            </div>
                        </div>
                    </button>
                ))}
                {filteredReports.length === 0 && (
                    <div className="text-center text-[#666] py-8 text-sm">No hay informes</div>
                )}
            </div>
        </div>
    );
}
