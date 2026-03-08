import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scissors, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import PdfDropzone from '../shared/PdfDropzone';
import PageThumbnail from '../shared/PageThumbnail';
import PageGrid from '../shared/PageGrid';
import ScissorButton from '../shared/ScissorButton';
import ActionBar from '../shared/ActionBar';
import PdfPreviewModal from '../shared/PdfPreviewModal';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { splitPdf } from '../api/pdfToolsApi';
import { downloadBlob } from '../../../utils/downloadBlob';

export default function SplitTab() {
    const [file, setFile] = useState(null);
    const [mode, setMode] = useState('pages'); // 'pages' | 'custom'
    const [pagesPerFile, setPagesPerFile] = useState(1);
    const [cutPoints, setCutPoints] = useState([]);
    const [zoom, setZoom] = useState(0.3);
    const [loading, setLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewPage, setPreviewPage] = useState(1);

    const { loadFile, renderPage, getPdf, numPages, loading: pdfLoading } = usePdfDocument();

    const handleFile = useCallback(async (files) => {
        const f = files[0];
        setFile(f);
        setCutPoints([]);
        setZoom(0.3);
        await loadFile(f);
    }, [loadFile]);

    function toggleCut(pageIdx) {
        setCutPoints((prev) =>
            prev.includes(pageIdx)
                ? prev.filter((p) => p !== pageIdx)
                : [...prev, pageIdx].sort((a, b) => a - b),
        );
    }

    async function handleSplit() {
        if (!file) {
            toast.error('Selecciona un archivo PDF primero.');
            return;
        }

        if (mode === 'custom' && cutPoints.length === 0) {
            toast.error('Marca al menos un punto de corte.');
            return;
        }

        setLoading(true);
        try {
            let blob;
            if (mode === 'pages') {
                blob = await splitPdf(file, 'pages', { pagesPerFile });
            } else {
                // Build ranges from cut points
                const ranges = [];
                let start = 1;
                cutPoints.forEach((cut) => {
                    ranges.push([start, cut]);
                    start = cut + 1;
                });
                if (start <= numPages) {
                    ranges.push([start, numPages]);
                }
                blob = await splitPdf(file, 'custom', { ranges });
            }
            downloadBlob(blob, 'split_result.zip');
            toast.success('PDF dividido correctamente.');
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Mode selector */}
            <div className="flex items-center gap-3">
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="bg-neutral-900 border border-neutral-700 text-neutral-300 text-sm rounded-md px-3 py-2 font-mono focus:border-neutral-500 focus:outline-none"
                >
                    <option value="pages">Por Paginas</option>
                    <option value="custom">Custom Split (Visual)</option>
                </select>

                {file && (
                    <span className="text-sm text-neutral-500 flex items-center gap-1.5">
                        <FileText size={12} />
                        {file.name}
                    </span>
                )}
            </div>

            {/* File upload */}
            <PdfDropzone
                onFiles={handleFile}
                compact={!!file}
                label={file ? 'Click para cambiar archivo' : 'Seleccionar PDF'}
                sublabel={file ? file.name : 'Arrastra un PDF aqui'}
            />

            <AnimatePresence mode="wait">
                {mode === 'pages' ? (
                    <motion.div
                        key="pages"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-3"
                    >
                        <div>
                            <label className="block text-sm text-neutral-500 uppercase tracking-wider mb-2">
                                Paginas por archivo
                            </label>
                            <input
                                type="number"
                                value={pagesPerFile}
                                onChange={(e) => setPagesPerFile(Math.max(1, parseInt(e.target.value) || 1))}
                                min={1}
                                className="w-24 bg-neutral-900 border border-neutral-700 text-white px-3 py-2.5 rounded-md font-mono text-base focus:border-neutral-500 focus:outline-none"
                            />
                            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                                1 = Cada pagina en un archivo<br />
                                2 = Pares de paginas (1-2, 3-4...)
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="custom"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-3"
                    >
                        {numPages > 0 && (
                            <>
                                <PageGrid
                                    zoom={zoom}
                                    onZoomChange={setZoom}
                                    totalPages={numPages}
                                    headerRight={
                                        <button
                                            onClick={() => { setPreviewPage(1); setPreviewOpen(true); }}
                                            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors"
                                        >
                                            <Eye size={14} /> Preview
                                        </button>
                                    }
                                >
                                    {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                                        <div key={pageNum} className="flex flex-col items-center gap-1">
                                            <PageThumbnail
                                                renderPage={renderPage}
                                                pageNum={pageNum}
                                                scale={zoom}
                                                badge={pageNum}
                                                onClick={() => { setPreviewPage(pageNum); setPreviewOpen(true); }}
                                            />
                                            {pageNum < numPages && (
                                                <ScissorButton
                                                    active={cutPoints.includes(pageNum)}
                                                    onClick={() => toggleCut(pageNum)}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </PageGrid>

                                {/* Cut info */}
                                <div className="flex items-center justify-between px-3 py-2.5 bg-red-500/[0.06] border border-red-500/20 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <Scissors size={14} className="text-red-400" />
                                        <span className="text-sm text-neutral-300">
                                            Click en las <span className="font-semibold text-red-300">tijeras</span> para marcar puntos de corte
                                        </span>
                                    </div>
                                    <span className={`text-sm font-semibold ${cutPoints.length > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {cutPoints.length} {cutPoints.length === 1 ? 'corte' : 'cortes'}
                                    </span>
                                </div>
                            </>
                        )}

                        {pdfLoading && (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <ActionBar
                onAction={handleSplit}
                actionLabel="DIVIDIR PDF"
                actionIcon={<Scissors size={16} />}
                disabled={!file}
                loading={loading}
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


