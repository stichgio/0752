import { useState, useCallback, useRef } from 'react';

/**
 * Hook to load a PDF file and render page thumbnails using PDF.js (CDN global).
 * Provides: loadFile, renderPage, numPages, loading, error
 */
export function usePdfDocument() {
    const [numPages, setNumPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const pdfRef = useRef(null);
    const renderStateRef = useRef(new WeakMap());

    const loadFile = useCallback(async (file) => {
        setLoading(true);
        setError(null);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
            pdfRef.current = pdf;
            renderStateRef.current = new WeakMap();
            setNumPages(pdf.numPages);
            return pdf;
        } catch (err) {
            setError(err.message);
            pdfRef.current = null;
            renderStateRef.current = new WeakMap();
            setNumPages(0);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const renderPage = useCallback(async (pageNum, canvas, scale = 0.3, rotation = 0) => {
        const pdf = pdfRef.current;
        if (!pdf || !canvas) return;

        const previousState = renderStateRef.current.get(canvas);
        const requestId = (previousState?.requestId || 0) + 1;

        if (previousState?.task) {
            previousState.task.cancel();
        }

        renderStateRef.current.set(canvas, { requestId, task: null });

        try {
            const page = await pdf.getPage(pageNum);
            const latestState = renderStateRef.current.get(canvas);
            if (!latestState || latestState.requestId !== requestId) {
                return;
            }

            const viewport = page.getViewport({ scale, rotation });
            const context = canvas.getContext('2d');
            if (!context) return;

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const task = page.render({ canvasContext: context, viewport });
            renderStateRef.current.set(canvas, { requestId, task });

            await task.promise;

            const settledState = renderStateRef.current.get(canvas);
            if (settledState?.requestId === requestId) {
                renderStateRef.current.delete(canvas);
            }
        } catch (err) {
            if (err?.name === 'RenderingCancelledException') {
                return;
            }
            console.error(`Error rendering page ${pageNum}:`, err);
        }
    }, []);

    const getPdf = useCallback(() => pdfRef.current, []);

    return { loadFile, renderPage, getPdf, numPages, loading, error };
}
