import React, { useState, useMemo, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Image as ImageIcon, Search, Table2 } from 'lucide-react';

const ROWS_PER_PAGE = 15;

/**
 * Floating data-preview table that shows loaded Excel rows,
 * photo counts per record, and lets the user pick a row to preview.
 */
export default function DataPreviewTable({
    headers,
    data,
    images,
    idColumn,
    matchesRecordId,
    selectedIndex,
    onSelectRow,
    onClose,
}) {
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');

    // Close on ESC key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Determine which columns to show (max 6 meaningful ones + ID + photos)
    const visibleHeaders = useMemo(() => {
        if (!headers || headers.length === 0) return [];
        // Always show ID column first if set, then up to 5 others
        const cols = [];
        if (idColumn && headers.includes(idColumn)) {
            cols.push(idColumn);
        }
        for (const h of headers) {
            if (h !== idColumn && cols.length < 6) {
                cols.push(h);
            }
        }
        return cols;
    }, [headers, idColumn]);

    // Compute photo counts per row (memoized to avoid re-scanning on every render)
    const photoCountMap = useMemo(() => {
        if (!idColumn || !images || images.length === 0) return {};
        const counts = {};
        data.forEach((row, idx) => {
            const recordId = String(row[idColumn] ?? '').trim();
            if (!recordId) {
                counts[idx] = 0;
                return;
            }
            counts[idx] = images.filter(img => matchesRecordId(img.name, recordId)).length;
        });
        return counts;
    }, [data, images, idColumn, matchesRecordId]);

    // Filter rows by search term
    const filteredRows = useMemo(() => {
        if (!search.trim()) return data.map((row, idx) => ({ row, idx }));
        const term = search.toLowerCase();
        return data
            .map((row, idx) => ({ row, idx }))
            .filter(({ row, idx }) => {
                // Search across all visible columns + row number
                const rowNum = String(idx + 1);
                if (rowNum.includes(term)) return true;
                return visibleHeaders.some(h => {
                    const val = String(row[h] ?? '').toLowerCase();
                    return val.includes(term);
                });
            });
    }, [data, search, visibleHeaders]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
    const currentPage = Math.min(page, totalPages - 1);
    const pageRows = filteredRows.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

    const totalPhotos = images?.length ?? 0;
    const rowsWithPhotos = Object.values(photoCountMap).filter(c => c > 0).length;

    // Truncate cell values for display
    const truncate = (val, max = 22) => {
        const s = String(val ?? '-');
        return s.length > max ? s.slice(0, max) + '…' : s;
    };

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div
                className="bg-neutral-950/95 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                style={{ width: '90%', maxWidth: '960px', maxHeight: '85vh' }}
            >
                {/* ── Header ─────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <Table2 size={18} className="text-neutral-400" />
                        <h3 className="text-white font-mono font-bold text-sm tracking-wide">
                            DATOS CARGADOS
                        </h3>
                        <span className="text-neutral-500 text-xs font-mono">
                            {data.length} filas · {headers.length} columnas
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-white transition-colors p-1 rounded hover:bg-neutral-800"
                        title="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Stats Bar ───────────────────────────────────── */}
                <div className="flex items-center gap-4 px-5 py-2.5 bg-neutral-900/80 border-b border-neutral-800 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                        <ImageIcon size={13} className="text-blue-400" />
                        <span className="text-neutral-400">Fotos cargadas:</span>
                        <span className="text-white font-semibold">{totalPhotos}</span>
                    </div>
                    {idColumn && (
                        <>
                            <span className="text-neutral-700">│</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-neutral-400">Filas con fotos:</span>
                                <span className={`font-semibold ${rowsWithPhotos === data.length ? 'text-green-400' : rowsWithPhotos > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {rowsWithPhotos}/{data.length}
                                </span>
                            </div>
                            <span className="text-neutral-700">│</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-neutral-400">Columna ID:</span>
                                <span className="text-cyan-400 font-semibold">{idColumn}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Search ──────────────────────────────────────── */}
                <div className="px-5 py-2 border-b border-neutral-800/60">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar en datos..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(0); }}
                            className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:border-neutral-500 outline-none placeholder:text-neutral-600 font-mono"
                        />
                    </div>
                </div>

                {/* ── Table ───────────────────────────────────────── */}
                <div className="flex-1 overflow-auto px-1">
                    <table className="w-full text-xs font-mono border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-neutral-900 border-b border-neutral-700">
                                <th className="text-center text-neutral-500 px-2 py-2 font-semibold w-10">#</th>
                                {visibleHeaders.map(h => (
                                    <th
                                        key={h}
                                        className={`text-left px-2 py-2 font-semibold truncate max-w-[140px] ${h === idColumn ? 'text-cyan-400' : 'text-neutral-400'}`}
                                        title={h}
                                    >
                                        {truncate(h, 18)}
                                    </th>
                                ))}
                                <th className="text-center text-neutral-400 px-2 py-2 font-semibold w-16">
                                    <div className="flex items-center justify-center gap-1">
                                        <ImageIcon size={12} />
                                        <span>Fotos</span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleHeaders.length + 2} className="text-center text-neutral-500 py-8">
                                        No se encontraron coincidencias
                                    </td>
                                </tr>
                            ) : (
                                pageRows.map(({ row, idx }) => {
                                    const photoCount = photoCountMap[idx] ?? 0;
                                    const isSelected = String(idx) === String(selectedIndex);
                                    return (
                                        <tr
                                            key={idx}
                                            onClick={() => onSelectRow(idx)}
                                            className={`border-b border-neutral-800/50 cursor-pointer transition-colors ${isSelected
                                                ? 'bg-white/10 border-l-2 border-l-white'
                                                : 'hover:bg-neutral-800/60'
                                                }`}
                                        >
                                            <td className="text-center text-neutral-600 px-2 py-1.5">
                                                {idx + 1}
                                            </td>
                                            {visibleHeaders.map(h => (
                                                <td
                                                    key={h}
                                                    className={`px-2 py-1.5 truncate max-w-[140px] ${h === idColumn ? 'text-white font-semibold' : 'text-neutral-300'
                                                        }`}
                                                    title={String(row[h] ?? '')}
                                                >
                                                    {truncate(row[h])}
                                                </td>
                                            ))}
                                            <td className="text-center px-2 py-1.5">
                                                {idColumn ? (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${photoCount > 0
                                                        ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                                                        : 'bg-red-500/10 text-red-400/70 border border-red-500/20'
                                                        }`}>
                                                        {photoCount > 0 ? (
                                                            <><ImageIcon size={10} /> {photoCount}</>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-600 text-[10px]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ──────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-2.5 border-t border-neutral-800 bg-neutral-900/60">
                    <span className="text-neutral-500 text-[10px] font-mono">
                        {filteredRows.length === data.length
                            ? `Mostrando ${currentPage * ROWS_PER_PAGE + 1}–${Math.min((currentPage + 1) * ROWS_PER_PAGE, data.length)} de ${data.length}`
                            : `${filteredRows.length} resultados de ${data.length}`
                        }
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            className="p-1 text-neutral-400 hover:text-white disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors rounded hover:bg-neutral-800"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-neutral-400 text-xs font-mono min-w-[60px] text-center">
                            {currentPage + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage >= totalPages - 1}
                            className="p-1 text-neutral-400 hover:text-white disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors rounded hover:bg-neutral-800"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                {/* ── Footer Hint ─────────────────────────────────── */}
                <div className="px-5 py-2 border-t border-neutral-800/40 text-center">
                    <span className="text-neutral-600 text-[10px] font-mono">
                        Haz clic en una fila para previsualizarla · ESC para cerrar
                    </span>
                </div>
            </div>
        </div>
    );
}
