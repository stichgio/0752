import { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RotateCw, Trash2, Undo2, Redo2, CheckSquare, Scissors,
    Info, Download, RefreshCw, Eye, Check
} from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import PageThumbnail from '../shared/PageThumbnail';
import PageGrid from '../shared/PageGrid';
import ScissorButton from '../shared/ScissorButton';
import ActionBar from '../shared/ActionBar';
import PdfPreviewModal from '../shared/PdfPreviewModal';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { organizePdf } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../../utils/downloadBlob';

function makeInitialState() {
    return { pages: [], cutPoints: [], selectedPages: [] };
}

export default function OrganizeTab() {
    const [file, setFile] = useState(null);
    const [zoom, setZoom] = useState(0.25);
    const [loading, setLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewPage, setPreviewPage] = useState(1);

    const { loadFile, renderPage, getPdf, numPages, loading: pdfLoading } = usePdfDocument();
    const { current: state, push, undo, redo, canUndo, canRedo, reset } = useUndoRedo(makeInitialState());

    const dragIdx = useRef(null);

    const activePages = useMemo(() => state.pages.filter((p) => !p.deleted), [state.pages]);
    const selectedSet = useMemo(() => new Set(state.selectedPages), [state.selectedPages]);
    const rotatedCount = useMemo(() => activePages.filter((p) => p.rotation !== 0).length, [activePages]);
    const deletedCount = useMemo(() => state.pages.filter((p) => p.deleted).length, [state.pages]);

    // --- File load ---
    const handleFile = useCallback(async (files) => {
        const f = files[0];
        setFile(f);
        setZoom(0.25);
        const pdf = await loadFile(f);
        if (pdf) {
            const pages = Array.from({ length: pdf.numPages }, (_, i) => ({
                pageNum: i + 1,
                originalPageNum: i + 1,
                rotation: 0,
                deleted: false,
            }));
            const initialState = { pages, cutPoints: [], selectedPages: [] };
            reset(initialState);
        }
    }, [loadFile, reset]);

    // --- Selection ---
    function toggleSelect(index) {
        const next = selectedSet.has(index)
            ? state.selectedPages.filter((i) => i !== index)
            : [...state.selectedPages, index];
        push({ ...state, selectedPages: next });
    }

    function selectAll() {
        const allSelected = state.selectedPages.length === activePages.length;
        push({
            ...state,
            selectedPages: allSelected ? [] : activePages.map((_, i) => i),
        });
    }

    function clearSelection() {
        if (state.selectedPages.length > 0) {
            push({ ...state, selectedPages: [] });
        }
    }

    // --- Page operations ---
    function rotatePage(index) {
        const newPages = [...state.pages];
        const active = newPages.filter((p) => !p.deleted);
        active[index] = { ...active[index], rotation: (active[index].rotation + 90) % 360 };
        push({ ...state, pages: newPages, selectedPages: [] });
    }

    function rotateSelected() {
        if (state.selectedPages.length === 0) return;
        const newPages = [...state.pages];
        const active = newPages.filter((p) => !p.deleted);
        state.selectedPages.forEach((idx) => {
            if (idx < active.length) {
                active[idx] = { ...active[idx], rotation: (active[idx].rotation + 90) % 360 };
            }
        });
        push({ ...state, pages: newPages, selectedPages: [] });
    }

    function deletePage(index) {
        const newPages = state.pages.map((p) => ({ ...p }));
        const active = newPages.filter((p) => !p.deleted);
        if (index < active.length) {
            active[index].deleted = true;
        }
        // Adjust cut points
        const newCuts = state.cutPoints
            .filter((cp) => cp !== index)
            .map((cp) => (cp > index ? cp - 1 : cp));
        // Adjust selection
        const newSelected = state.selectedPages
            .filter((i) => i !== index)
            .map((i) => (i > index ? i - 1 : i));
        push({ pages: newPages, cutPoints: newCuts, selectedPages: newSelected });
    }

    function deleteSelected() {
        if (state.selectedPages.length === 0) return;
        const newPages = state.pages.map((p) => ({ ...p }));
        const active = newPages.filter((p) => !p.deleted);
        const sorted = [...state.selectedPages].sort((a, b) => b - a);
        sorted.forEach((idx) => {
            if (idx < active.length) active[idx].deleted = true;
        });
        // Recalculate cuts
        const toDelete = new Set(state.selectedPages);
        const oldToNew = new Map();
        let newIdx = 0;
        for (let old = 0; old < activePages.length; old++) {
            if (!toDelete.has(old)) { oldToNew.set(old, newIdx); newIdx++; }
        }
        const newCuts = state.cutPoints
            .filter((cp) => oldToNew.has(cp) && oldToNew.has(cp + 1))
            .map((cp) => oldToNew.get(cp));
        push({ pages: newPages, cutPoints: newCuts, selectedPages: [] });
    }

    // --- Cut points ---
    function toggleCut(index) {
        const newCuts = state.cutPoints.includes(index)
            ? state.cutPoints.filter((cp) => cp !== index)
            : [...state.cutPoints, index].sort((a, b) => a - b);
        push({ ...state, cutPoints: newCuts });
    }

    // --- Drag reorder ---
    function handleDragStart(index) {
        dragIdx.current = index;
    }

    function handleDrop(dropIndex) {
        const from = dragIdx.current;
        if (from === null || from === dropIndex) return;

        const newActive = [...activePages];
        const [moved] = newActive.splice(from, 1);
        newActive.splice(dropIndex, 0, moved);

        const deleted = state.pages.filter((p) => p.deleted);
        const newPages = [...newActive, ...deleted];

        // Remap selections
        const newSelected = state.selectedPages.map((sel) => {
            if (sel === from) return dropIndex;
            if (from < dropIndex && sel > from && sel <= dropIndex) return sel - 1;
            if (from > dropIndex && sel >= dropIndex && sel < from) return sel + 1;
            return sel;
        });

        push({ ...state, pages: newPages, selectedPages: newSelected });
        dragIdx.current = null;
    }

    // --- Keyboard shortcuts ---
    useKeyboardShortcuts({
        'ctrl+z': undo,
        'ctrl+shift+z': redo,
        'ctrl+a': selectAll,
        'delete': deleteSelected,
        'r': rotateSelected,
        'escape': clearSelection,
    }, !!file);

    // --- Download ---
    async function handleDownload() {
        if (!file || activePages.length === 0) {
            toast.error('No hay paginas para procesar.');
            return;
        }
        setLoading(true);
        try {
            const operations = {
                pageOrder: activePages.map((p) => p.originalPageNum),
                rotations: activePages.map((p) => p.rotation),
                cuts: state.cutPoints,
            };
            const blob = await organizePdf(file, operations, state.cutPoints);
            const filename = state.cutPoints.length > 0 ? 'organized_split.zip' : 'organized.pdf';
            downloadBlob(blob, filename);
            toast.success('PDF organizado correctamente.');
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    // --- Reset ---
    function handleReset() {
        setFile(null);
        reset(makeInitialState());
    }

    const hasFile = !!file && numPages > 0;

    return (
        <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 px-4 py-3 bg-red-500/[0.06] border border-red-500/20 rounded-md">
                <Info size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-neutral-300 space-y-1.5">
                    <p>
                        <span className="font-semibold text-red-300">Organizar:</span> Reordena paginas arrastrando, rota, elimina y marca puntos de corte.
                    </p>
                    <p className="text-neutral-500">
                        Atajos: Ctrl+Z (Deshacer) | Ctrl+Shift+Z (Rehacer) | Ctrl+A (Seleccionar todo) | R (Rotar) | Supr (Eliminar)
                    </p>
                </div>
            </div>

            {/* Upload */}
            {!hasFile && (
                <PdfDropzone
                    onFiles={handleFile}
                    label="Selecciona un PDF para organizar"
                />
            )}

            {pdfLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {hasFile && !pdfLoading && (
                <>
                    {/* Stats bar */}
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/60 border border-neutral-800 rounded-md">
                        <div className="text-sm text-neutral-500 flex items-center gap-4">
                            <span>Total: <span className="text-neutral-300 font-semibold">{state.pages.length}</span></span>
                            <span>Activas: <span className="text-neutral-300 font-semibold">{activePages.length}</span></span>
                            {deletedCount > 0 && <span>Eliminadas: <span className="text-red-400 font-semibold">{deletedCount}</span></span>}
                            {rotatedCount > 0 && <span>Rotadas: <span className="text-blue-400 font-semibold">{rotatedCount}</span></span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={selectAll} title="Seleccionar todo (Ctrl+A)"
                                className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-all">
                                <CheckSquare size={14} />
                            </button>
                            <button onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)"
                                className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                <Undo2 size={14} />
                            </button>
                            <button onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Shift+Z)"
                                className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                <Redo2 size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Bulk actions */}
                    <AnimatePresence>
                        {state.selectedPages.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center justify-between px-3 py-2.5 bg-red-500/[0.08] border border-red-500/20 rounded-md overflow-hidden"
                            >
                                <span className="text-sm text-neutral-300">
                                    <span className="font-semibold text-red-300">{state.selectedPages.length}</span> paginas seleccionadas
                                </span>
                                <div className="flex items-center gap-2">
                                    <button onClick={rotateSelected} title="Rotar (R)"
                                        className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-all">
                                        <RotateCw size={14} />
                                    </button>
                                    <button onClick={deleteSelected} title="Eliminar (Supr)"
                                        className="p-1.5 rounded bg-red-500/80 border border-red-500 text-white hover:bg-red-600 transition-all">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Page grid */}
                    <PageGrid
                        zoom={zoom}
                        onZoomChange={setZoom}
                        totalPages={activePages.length}
                        maxHeight="550px"
                        headerRight={
                            <button
                                onClick={() => { setPreviewPage(1); setPreviewOpen(true); }}
                                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors"
                            >
                                <Eye size={14} /> Preview
                            </button>
                        }
                    >
                        {activePages.map((pageData, i) => (
                            <div key={`${pageData.originalPageNum}-${i}`} className="flex flex-col items-center gap-1">
                                <div
                                    draggable
                                    onDragStart={() => handleDragStart(i)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => handleDrop(i)}
                                    className="relative"
                                >
                                    <PageThumbnail
                                        renderPage={renderPage}
                                        pageNum={pageData.originalPageNum}
                                        scale={zoom}
                                        rotation={pageData.rotation}
                                        selected={selectedSet.has(i)}
                                        onClick={() => toggleSelect(i)}
                                        badge={
                                            <span>
                                                {i + 1}
                                                {pageData.rotation > 0 && <span className="ml-0.5 text-[10px]">↻{pageData.rotation}°</span>}
                                            </span>
                                        }
                                        overlay={
                                            /* Checkbox overlay */
                                            <div
                                                className="absolute top-1.5 left-1.5 z-10"
                                                onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                                            >
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer
                                                    ${selectedSet.has(i)
                                                        ? 'bg-red-500 border-red-500 text-white'
                                                        : 'bg-black/50 border-neutral-500 text-transparent hover:border-neutral-300'
                                                    }`}
                                                >
                                                    <Check size={12} />
                                                </div>
                                            </div>
                                        }
                                    />
                                    {/* Page controls */}
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); rotatePage(i); }}
                                            className="p-1 rounded bg-neutral-800/90 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-all"
                                            title="Rotar 90°"
                                        >
                                            <RotateCw size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deletePage(i); }}
                                            className="p-1 rounded bg-neutral-800/90 border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
                                            title="Eliminar"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>

                                {/* Scissors between pages */}
                                {i < activePages.length - 1 && (
                                    <ScissorButton
                                        active={state.cutPoints.includes(i)}
                                        onClick={() => toggleCut(i)}
                                    />
                                )}
                            </div>
                        ))}
                    </PageGrid>

                    {/* Scissors info */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-red-500/[0.06] border border-red-500/20 rounded-md">
                        <div className="flex items-center gap-2">
                            <Scissors size={14} className="text-red-400" />
                            <span className="text-sm text-neutral-300">
                                Click en las <span className="font-semibold text-red-300">tijeras</span> para marcar puntos de corte
                            </span>
                        </div>
                        <span className={`text-sm font-semibold ${state.cutPoints.length > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {state.cutPoints.length} {state.cutPoints.length === 1 ? 'corte' : 'cortes'}
                        </span>
                    </div>
                </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-800/60">
                <motion.button
                    onClick={handleReset}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-md text-base text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-all"
                >
                    <RefreshCw size={14} /> NUEVO
                </motion.button>
                <motion.button
                    onClick={handleDownload}
                    disabled={!hasFile || activePages.length === 0}
                    whileHover={hasFile ? { scale: 1.02 } : {}}
                    whileTap={hasFile ? { scale: 0.98 } : {}}
                    className={`
                        flex items-center gap-2 px-6 py-3 rounded-md text-base font-semibold tracking-wide
                        transition-all duration-200 font-[DotGothic16] uppercase
                        ${!hasFile || activePages.length === 0
                            ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed border border-neutral-700'
                            : 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] border border-white/20'
                        }
                    `}
                >
                    {loading
                        ? <div className="w-4 h-4 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                        : <Download size={16} />
                    }
                    DESCARGAR PDF
                </motion.button>
            </div>

            <PdfPreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                pdf={getPdf()}
                initialPage={previewPage}
                totalPages={numPages}
            />
        </div>
    );
}


