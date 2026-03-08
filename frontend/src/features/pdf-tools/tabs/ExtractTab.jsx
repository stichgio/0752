import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileOutput, Info, Eye, Check } from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import PageThumbnail from '../shared/PageThumbnail';
import PageGrid from '../shared/PageGrid';
import ActionBar from '../shared/ActionBar';
import PdfPreviewModal from '../shared/PdfPreviewModal';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { extractPages } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../utils/downloadBlob';

export default function ExtractTab() {
    const [file, setFile] = useState(null);
    const [selectedPages, setSelectedPages] = useState(new Set());
    const [zoom, setZoom] = useState(0.3);
    const [loading, setLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewPage, setPreviewPage] = useState(1);

    const { loadFile, renderPage, getPdf, numPages, loading: pdfLoading } = usePdfDocument();

    const handleFile = useCallback(async (files) => {
        const f = files[0];
        setFile(f);
        setSelectedPages(new Set());
        setZoom(0.3);
        await loadFile(f);
    }, [loadFile]);

    function togglePage(pageNum) {
        setSelectedPages((prev) => {
            const next = new Set(prev);
            if (next.has(pageNum)) next.delete(pageNum);
            else next.add(pageNum);
            return next;
        });
    }

    function selectAll() {
        if (selectedPages.size === numPages) {
            setSelectedPages(new Set());
        } else {
            setSelectedPages(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
        }
    }

    const sortedSelection = useMemo(
        () => [...selectedPages].sort((a, b) => a - b),
        [selectedPages],
    );

    async function handleExtract() {
        if (!file || selectedPages.size === 0) {
            toast.error('Selecciona al menos una pagina.');
            return;
        }
        setLoading(true);
        try {
            const blob = await extractPages(file, sortedSelection);
            downloadBlob(blob, `extracted_${sortedSelection.length}pages.pdf`);
            toast.success(`${sortedSelection.length} paginas extraidas.`);
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    const hasFile = !!file && numPages > 0;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 bg-purple-500/[0.06] border border-purple-500/20 rounded-md">
                <Info size={16} className="text-purple-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-neutral-300">
                    <span className="font-semibold text-purple-300">Extraer Paginas:</span> Selecciona paginas especificas
                    para descargar como un nuevo PDF independiente.
                </p>
            </div>

            <PdfDropzone
                onFiles={handleFile}
                compact={!!file}
                label={file ? 'Click para cambiar archivo' : 'Seleccionar PDF'}
                sublabel={file ? file.name : 'Arrastra un PDF aqui'}
            />

            {pdfLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {hasFile && !pdfLoading && (
                <>
                    <PageGrid
                        zoom={zoom}
                        onZoomChange={setZoom}
                        totalPages={numPages}
                        headerRight={
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={selectAll}
                                    className="text-base text-neutral-500 hover:text-white transition-colors"
                                >
                                    {selectedPages.size === numPages ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </button>
                                <button
                                    onClick={() => { setPreviewPage(1); setPreviewOpen(true); }}
                                    className="flex items-center gap-1.5 text-base text-neutral-500 hover:text-white transition-colors"
                                >
                                    <Eye size={15} /> Preview
                                </button>
                            </div>
                        }
                    >
                        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                            <PageThumbnail
                                key={pageNum}
                                renderPage={renderPage}
                                pageNum={pageNum}
                                scale={zoom}
                                selected={selectedPages.has(pageNum)}
                                onClick={() => togglePage(pageNum)}
                                badge={pageNum}
                                overlay={
                                    <div className="absolute top-1.5 left-1.5 z-10">
                                        <div
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer
                                                ${selectedPages.has(pageNum)
                                                    ? 'bg-purple-500 border-purple-500 text-white'
                                                    : 'bg-black/50 border-neutral-500 text-transparent hover:border-neutral-300'
                                                }`}
                                            onClick={(e) => { e.stopPropagation(); togglePage(pageNum); }}
                                        >
                                            <Check size={12} />
                                        </div>
                                    </div>
                                }
                            />
                        ))}
                    </PageGrid>

                    {selectedPages.size > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between px-3 py-2.5 bg-purple-500/[0.06] border border-purple-500/20 rounded-md"
                        >
                            <span className="text-sm text-neutral-300">
                                <span className="font-semibold text-purple-300">{selectedPages.size}</span> paginas seleccionadas
                            </span>
                            <span className="text-sm text-neutral-500 font-mono">
                                [{sortedSelection.join(', ')}]
                            </span>
                        </motion.div>
                    )}
                </>
            )}

            <ActionBar
                onAction={handleExtract}
                actionLabel="EXTRAER PAGINAS"
                actionIcon={<FileOutput size={16} />}
                disabled={!hasFile || selectedPages.size === 0}
                loading={loading}
                left={selectedPages.size > 0 ? `${selectedPages.size} paginas` : null}
            />

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
