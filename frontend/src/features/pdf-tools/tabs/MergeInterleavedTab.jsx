import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Layers, FolderPlus, FileCheck, X, Info } from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import FileListItem from '../shared/FileListItem';
import ActionBar from '../shared/ActionBar';
import { mergePdfsInterleaved } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../utils/downloadBlob';

const MAX_INTERLEAVE_CHUNK = 1000;

export default function MergeInterleavedTab() {
    const [view, setView] = useState('multiple'); // 'multiple' | 'individual'
    const [files, setFiles] = useState([]);
    const [slots, setSlots] = useState([
        { id: 1, file: null, chunkSize: 1 },
        { id: 2, file: null, chunkSize: 1 },
        { id: 3, file: null, chunkSize: 1 },
    ]);
    const [strict, setStrict] = useState(false);
    const [loading, setLoading] = useState(false);
    const dragIdx = useRef(null);

    // --- Multiple view ({ file, chunkSize }) ---
    const addFiles = useCallback((newFiles) => {
        setFiles((prev) => [
            ...prev,
            ...newFiles.map((f) => ({ file: f, chunkSize: 1 })),
        ]);
    }, []);

    const setFileChunkAt = useCallback((idx, chunkSize) => {
        setFiles((prev) => prev.map((e, i) => (i === idx ? { ...e, chunkSize } : e)));
    }, []);

    const removeFile = useCallback((idx) => {
        setFiles((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    function makeDragHandlers(idx) {
        return {
            onDragStart: () => { dragIdx.current = idx; },
            onDragOver: (e) => { e.preventDefault(); },
            onDrop: (e) => {
                e.preventDefault();
                const from = dragIdx.current;
                if (from === null || from === idx) return;
                setFiles((prev) => {
                    const next = [...prev];
                    const [moved] = next.splice(from, 1);
                    next.splice(idx, 0, moved);
                    return next;
                });
                dragIdx.current = null;
            },
            onDragEnd: () => { dragIdx.current = null; },
        };
    }

    // --- Individual view (slots) ---
    function handleSlotFile(index, fileList) {
        const file = fileList[0];
        if (!file) return;
        setSlots((prev) => prev.map((s, i) => i === index ? { ...s, file } : s));
    }

    function clearSlot(index) {
        setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, file: null, chunkSize: 1 } : s)));
    }

    function setSlotChunk(index, chunkSize) {
        setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, chunkSize } : s)));
    }

    function addSlot() {
        if (slots.length >= 10) return;
        setSlots((prev) => [...prev, { id: Date.now(), file: null, chunkSize: 1 }]);
    }

    function removeSlot(index) {
        if (slots.length <= 2) return;
        setSlots((prev) => prev.filter((_, i) => i !== index));
    }

    // --- Merge ---
    async function handleMerge() {
        let filesToUpload;
        let chunkSizes;
        if (view === 'multiple') {
            filesToUpload = files.map((e) => e.file);
            chunkSizes = files.map((e) => e.chunkSize);
        } else {
            const filled = slots.filter((s) => s.file);
            filesToUpload = filled.map((s) => s.file);
            chunkSizes = filled.map((s) => s.chunkSize);
        }

        if (filesToUpload.length < 2) {
            toast.error('Se requieren al menos 2 archivos PDF.');
            return;
        }
        setLoading(true);
        try {
            const blob = await mergePdfsInterleaved(filesToUpload, strict, chunkSizes);
            downloadBlob(blob, 'merged_interleaved.pdf');
            toast.success('PDFs intercalados correctamente.');
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    const fileCount = view === 'multiple'
        ? files.length
        : slots.filter((s) => s.file).length;

    function handleChunkInput(val, setter) {
        let n = parseInt(val, 10);
        if (!Number.isFinite(n)) n = 1;
        n = Math.min(MAX_INTERLEAVE_CHUNK, Math.max(1, n));
        setter(n);
    }

    return (
        <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/[0.06] border border-blue-500/20 rounded-md">
                <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-neutral-300">
                    <span className="font-semibold text-blue-300">Merge Intercalado:</span> Alterna las paginas entre los PDFs.
                    Pagina 1 de PDF-A, pagina 1 de PDF-B, pagina 2 de PDF-A, etc.
                </p>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-lg w-fit shadow-sm">
                {['multiple', 'individual'].map((v) => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === v
                            ? 'bg-neutral-800 text-neutral-100 shadow-sm border border-neutral-700/50'
                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 border border-transparent'
                        }`}
                    >
                        {v === 'multiple' ? 'Múltiple' : 'Individual'}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {view === 'multiple' ? (
                    <motion.div
                        key="multiple"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-3"
                    >
                        <PdfDropzone onFiles={addFiles} multiple icon={Layers} />
                        <div className="space-y-1.5">
                            <AnimatePresence mode="popLayout">
                                {files.map((entry, idx) => (
                                    <FileListItem
                                        key={`${entry.file.name}-${entry.file.lastModified}-${idx}`}
                                        file={entry.file}
                                        index={idx}
                                        onRemove={() => removeFile(idx)}
                                        dragHandlers={makeDragHandlers(idx)}
                                        chunkSize={entry.chunkSize}
                                        onChunkSizeChange={(n) => setFileChunkAt(idx, n)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="individual"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                    >
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                            {slots.map((slot, idx) => (
                                <div
                                    key={slot.id}
                                    className="relative flex flex-col h-[220px] bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-all shadow-sm group"
                                >
                                    {/* Slot header */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-950/40 border-b border-neutral-800/60">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/80"></div>
                                            <span className="text-xs font-semibold text-neutral-400 tracking-wide">PDF {idx + 1}</span>
                                        </div>
                                        {slots.length > 2 && !slot.file && (
                                            <button onClick={() => removeSlot(idx)} className="text-neutral-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10" aria-label="Eliminar slot">
                                                <X size={14} />
                                            </button>
                                        )}
                                        {slot.file && (
                                            <button onClick={() => clearSlot(idx)} className="text-neutral-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10" aria-label="Limpiar archivo">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {slot.file ? (
                                        <div className="flex-1 flex flex-col p-3 relative">
                                            <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none"></div>
                                            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 relative z-10 w-full">
                                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 mb-1">
                                                    <FileCheck size={24} />
                                                </div>
                                                <p className="text-sm font-medium text-neutral-200 text-center break-words line-clamp-2 w-full px-1 leading-tight" title={slot.file.name}>
                                                    {slot.file.name}
                                                </p>
                                                <p className="text-xs text-neutral-500">{(slot.file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                            
                                            <div className="mt-3 relative z-10 w-full">
                                                <div className="flex items-center justify-between border border-neutral-800 bg-neutral-950 rounded-lg p-1.5">
                                                    <label className="text-xs text-neutral-400 ml-1 font-medium select-none">
                                                        Hojas por turno
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={MAX_INTERLEAVE_CHUNK}
                                                        value={slot.chunkSize}
                                                        onChange={(e) => handleChunkInput(e.target.value, (n) => setSlotChunk(idx, n))}
                                                        className="w-14 rounded-md border border-neutral-700 bg-neutral-900 px-1 py-1 text-center text-sm font-semibold text-neutral-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow"
                                                        aria-label={`Hojas a intercalar por turno para PDF ${idx + 1}`}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <label className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800/40 transition-colors group/label">
                                            <div className="p-3 bg-neutral-800/50 rounded-full text-neutral-500 group-hover/label:text-blue-400 group-hover/label:bg-blue-500/10 transition-colors mb-2">
                                                <FolderPlus size={24} />
                                            </div>
                                            <span className="text-[13px] font-medium text-neutral-400 group-hover/label:text-neutral-300 transition-colors">Click para cargar</span>
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                className="hidden"
                                                onChange={(e) => handleSlotFile(idx, e.target.files)}
                                            />
                                        </label>
                                    )}
                                </div>
                            ))}

                            {slots.length < 10 && (
                                <button
                                    onClick={addSlot}
                                    className="h-[220px] bg-neutral-900/30 border border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center gap-3 text-neutral-500 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                                >
                                    <div className="p-3 bg-neutral-800/50 rounded-full group-hover:bg-blue-500/10 transition-colors">
                                        <FolderPlus size={22} />
                                    </div>
                                    <span className="text-sm font-medium">Agregar PDF</span>
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Strict mode toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors w-fit select-none bg-neutral-900/50 border border-neutral-800 px-3 py-2 rounded-lg">
                <input
                    type="checkbox"
                    checked={strict}
                    onChange={(e) => setStrict(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-red-500 focus:ring-red-500/30 focus:ring-offset-0 transition-colors"
                />
                Modo Estricto (validar formato)
            </label>

            <ActionBar
                onAction={handleMerge}
                actionLabel="UNIR PDFs"
                actionIcon={<Layers size={16} />}
                disabled={fileCount < 2}
                loading={loading}
                left={fileCount > 0 ? `${fileCount} archivos — intercalado` : null}
            />
        </div>
    );
}


