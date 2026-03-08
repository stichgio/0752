import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Layers, FolderPlus, FileCheck, X, Info } from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import FileListItem from '../shared/FileListItem';
import ActionBar from '../shared/ActionBar';
import { mergePdfsInterleaved } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../utils/downloadBlob';

export default function MergeInterleavedTab() {
    const [view, setView] = useState('multiple'); // 'multiple' | 'individual'
    const [files, setFiles] = useState([]);
    const [slots, setSlots] = useState([
        { id: 1, file: null },
        { id: 2, file: null },
        { id: 3, file: null },
    ]);
    const [strict, setStrict] = useState(false);
    const [loading, setLoading] = useState(false);
    const dragIdx = useRef(null);

    // --- Multiple view ---
    const addFiles = useCallback((newFiles) => {
        setFiles((prev) => [...prev, ...newFiles]);
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
        setSlots((prev) => prev.map((s, i) => i === index ? { ...s, file: null } : s));
    }

    function addSlot() {
        if (slots.length >= 10) return;
        setSlots((prev) => [...prev, { id: Date.now(), file: null }]);
    }

    function removeSlot(index) {
        if (slots.length <= 2) return;
        setSlots((prev) => prev.filter((_, i) => i !== index));
    }

    // --- Merge ---
    async function handleMerge() {
        const filesToUpload = view === 'multiple'
            ? files
            : slots.map((s) => s.file).filter(Boolean);

        if (filesToUpload.length < 2) {
            toast.error('Se requieren al menos 2 archivos PDF.');
            return;
        }
        setLoading(true);
        try {
            const blob = await mergePdfsInterleaved(filesToUpload, strict);
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
            <div className="flex items-center gap-1 p-0.5 bg-neutral-900 border border-neutral-800 rounded-md w-fit">
                {['multiple', 'individual'].map((v) => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-4 py-2 text-sm font-medium rounded transition-all ${view === v
                            ? 'bg-neutral-700 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                    >
                        {v === 'multiple' ? 'Multiple' : 'Individual'}
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
                                {files.map((file, idx) => (
                                    <FileListItem
                                        key={`${file.name}-${file.lastModified}-${idx}`}
                                        file={file}
                                        index={idx}
                                        onRemove={() => removeFile(idx)}
                                        dragHandlers={makeDragHandlers(idx)}
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
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                            {slots.map((slot, idx) => (
                                <div
                                    key={slot.id}
                                    className="relative h-48 bg-neutral-900/60 border border-neutral-800 rounded-md flex flex-col overflow-hidden hover:border-neutral-600 transition-all"
                                >
                                    {/* Slot header */}
                                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800/50">
                                        <span className="text-sm text-neutral-500 uppercase tracking-wider">PDF {idx + 1}</span>
                                        {slots.length > 2 && !slot.file && (
                                            <button onClick={() => removeSlot(idx)} className="text-neutral-600 hover:text-red-400 transition-colors">
                                                <X size={12} />
                                            </button>
                                        )}
                                        {slot.file && (
                                            <button onClick={() => clearSlot(idx)} className="text-neutral-600 hover:text-red-400 transition-colors">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>

                                    {slot.file ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-3">
                                            <FileCheck size={24} className="text-emerald-400 mb-2" />
                                            <p className="text-sm text-neutral-300 text-center break-all line-clamp-2">{slot.file.name}</p>
                                            <p className="text-sm text-neutral-500 mt-1">{(slot.file.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    ) : (
                                        <label className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800/30 transition-colors">
                                            <FolderPlus size={24} className="text-neutral-600 mb-2" />
                                            <span className="text-sm text-neutral-500">Click para cargar</span>
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
                                    className="h-48 border border-dashed border-neutral-700 rounded-md flex flex-col items-center justify-center gap-2 text-neutral-600 hover:text-neutral-400 hover:border-neutral-500 transition-all"
                                >
                                    <FolderPlus size={20} />
                                    <span className="text-sm">Agregar PDF</span>
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Strict mode toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-500 hover:text-neutral-300 transition-colors w-fit">
                <input
                    type="checkbox"
                    checked={strict}
                    onChange={(e) => setStrict(e.target.checked)}
                    className="rounded border-neutral-600 bg-neutral-800 text-red-500 focus:ring-red-500/30"
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


