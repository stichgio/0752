import { useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Layers, Info } from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import FileListItem from '../shared/FileListItem';
import ActionBar from '../shared/ActionBar';
import { mergePdfsNormal } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../../utils/downloadBlob';

export default function MergeNormalTab() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const dragIdx = useRef(null);

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

    async function handleMerge() {
        if (files.length < 2) {
            toast.error('Se requieren al menos 2 archivos PDF.');
            return;
        }
        setLoading(true);
        try {
            const blob = await mergePdfsNormal(files);
            downloadBlob(blob, 'merged_normal.pdf');
            toast.success('PDFs unidos correctamente.');
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-md">
                <Info size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-neutral-300">
                    <span className="font-semibold text-emerald-300">Merge Secuencial:</span> Une los PDFs en orden.
                    Todas las paginas del PDF 1, seguidas del PDF 2, etc.
                </p>
            </div>

            <PdfDropzone
                onFiles={addFiles}
                multiple
                icon={Layers}
                label="Arrastra tus archivos PDF aqui"
            />

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

            <ActionBar
                onAction={handleMerge}
                actionLabel="UNIR PDFs"
                actionIcon={<Layers size={16} />}
                disabled={files.length < 2}
                loading={loading}
                left={files.length > 0 ? `${files.length} archivos en orden secuencial` : null}
            />
        </div>
    );
}
