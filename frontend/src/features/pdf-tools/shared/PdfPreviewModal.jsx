import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Full-page PDF preview modal with page navigation.
 * @param {boolean} open - Whether the modal is visible
 * @param {Function} onClose - Close handler
 * @param {Object} pdf - PDF.js document proxy (from usePdfDocument.getPdf())
 * @param {number} initialPage - 1-based page to start on
 * @param {number} totalPages - Total page count
 */
export default function PdfPreviewModal({ open, onClose, pdf, initialPage = 1, totalPages = 0 }) {
    const [page, setPage] = useState(initialPage);
    const [zoom, setZoom] = useState(1.0);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (open) setPage(initialPage);
    }, [open, initialPage]);

    const renderCurrentPage = useCallback(async () => {
        if (!pdf || !canvasRef.current) return;
        try {
            const pdfPage = await pdf.getPage(page);
            const viewport = pdfPage.getViewport({ scale: zoom });
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        } catch (err) {
            console.error('Preview render error:', err);
        }
    }, [pdf, page, zoom]);

    useEffect(() => {
        if (open) renderCurrentPage();
    }, [open, renderCurrentPage]);

    useEffect(() => {
        if (!open) return;
        function handleKey(e) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setPage((p) => Math.max(1, p - 1));
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setPage((p) => Math.min(totalPages, p + 1));
            } else if (e.key === 'Escape') {
                onClose();
            }
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, totalPages, onClose]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center"
                onClick={onClose}
            >
                {/* Header bar */}
                <div
                    className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 bg-black/60 border-b border-neutral-800/50"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="text-base text-neutral-300 font-mono">
                        Pagina <span className="text-white font-semibold">{page}</span> de {totalPages}
                    </span>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                            className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        >
                            <ZoomOut size={16} />
                        </button>
                        <span className="text-sm text-neutral-400 font-mono min-w-[48px] text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                            className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        >
                            <ZoomIn size={16} />
                        </button>

                        <div className="w-px h-6 bg-neutral-700 mx-1" />

                        <button
                            onClick={onClose}
                            className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 flex items-center justify-center overflow-auto pt-14" onClick={(e) => e.stopPropagation()}>
                    <canvas
                        ref={canvasRef}
                        className="max-w-[90vw] max-h-[85vh] rounded shadow-2xl"
                    />
                </div>

                {/* Navigation arrows */}
                {page > 1 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setPage((p) => p - 1); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}
                {page < totalPages && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setPage((p) => p + 1); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                    >
                        <ChevronRight size={24} />
                    </button>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

