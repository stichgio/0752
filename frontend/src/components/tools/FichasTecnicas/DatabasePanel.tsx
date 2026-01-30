import React, { useRef } from 'react';
import { Upload, Trash2, RefreshCw, Search, FileSpreadsheet } from 'lucide-react';
import { FichaTecnica } from './types';

interface Props {
    fichas: FichaTecnica[];
    selectedFichaId: string | null;
    onFichaSelect: (id: string) => void;
    onImportFile: (file: File) => void;
    onReload: () => void;
    onClearAll: () => void;
}

export default function DatabasePanel({
    fichas,
    selectedFichaId,
    onFichaSelect,
    onImportFile,
    onReload,
    onClearAll
}: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = React.useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportFile(file);
            e.target.value = '';
        }
    };

    const filteredFichas = fichas.filter(f => {
        const search = searchTerm.toLowerCase();
        return (
            f.cliente?.toLowerCase().includes(search) ||
            f.os_numero?.toLowerCase().includes(search) ||
            f.distrito?.toLowerCase().includes(search) ||
            f.id?.toLowerCase().includes(search)
        );
    });

    return (
        <div className="bg-[#111] border border-[#333] rounded-lg p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#eee] font-['DotGothic16']">Base de Datos</h2>
                <span className="text-xs text-[#666] font-mono">{fichas.length} fichas</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-4">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.xlsx"
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-red flex-1 flex items-center justify-center gap-2 text-xs"
                    title="Importar archivo CSV o XLSX"
                >
                    <Upload size={14} />
                    Importar
                </button>
                <button
                    onClick={onReload}
                    className="btn-secondary p-2"
                    title="Recargar datos"
                >
                    <RefreshCw size={14} />
                </button>
                <button
                    onClick={onClearAll}
                    className="btn-secondary p-2 text-red-400 hover:text-red-300 hover:border-red-500"
                    title="Eliminar todas las fichas"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <input
                    type="text"
                    placeholder="Buscar por cliente, O.S., distrito..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 pl-9 text-sm text-[#eee] placeholder-[#666] focus:border-[#666] focus:outline-none"
                />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2">
                {filteredFichas.length === 0 ? (
                    <div className="text-center text-[#666] py-8">
                        <FileSpreadsheet size={48} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No hay fichas</p>
                        <p className="text-xs mt-1">Importe un archivo CSV/XLSX</p>
                    </div>
                ) : (
                    filteredFichas.map((ficha) => (
                        <div
                            key={ficha.id}
                            onClick={() => onFichaSelect(ficha.id)}
                            className={`p-3 rounded cursor-pointer transition-all border ${selectedFichaId === ficha.id
                                ? 'bg-[#222] border-[#666]'
                                : 'bg-[#1a1a1a] border-[#333] hover:border-[#555]'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-['DotGothic16'] text-[14px] text-[#888888]">{ficha.os_numero || ficha.id}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${ficha.status === 'completed'
                                    ? 'bg-green-900/50 text-green-400'
                                    : 'bg-yellow-900/50 text-yellow-400'
                                    }`}>
                                    {ficha.status === 'completed' ? 'Completado' : 'Borrador'}
                                </span>
                            </div>
                            <div className="text-sm text-[#eee] truncate">{ficha.cliente || 'Sin cliente'}</div>
                            <div className="text-xs text-[#888] truncate">{ficha.direccion || 'Sin dirección'}</div>
                            <div className="flex justify-between mt-1">
                                <span className="text-[10px] text-[#666]">{ficha.fecha || '-'}</span>
                                <span className="text-[10px] text-[#666]">{ficha.distrito || '-'}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
