import { useState, useCallback, useEffect } from 'react';

export function useZoomPan(
    containerRef: React.RefObject<HTMLDivElement>,
    initialZoom = 100
) {
    const [zoom, setZoom] = useState(initialZoom);
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 10, 400)), []);
    const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 10, 10)), []);
    const handleZoomReset = useCallback(() => setZoom(100), []);
    const handleFitScreen = useCallback(() => {
        // Logic to calculate fit zoom would go here, requires canvas dims
        setZoom(100);
    }, []);

    const startPan = useCallback((e: React.MouseEvent) => {
        setIsPanning(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }, []);

    const updatePan = useCallback((e: MouseEvent) => {
        if (!isPanning || !containerRef.current) return;

        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;

        containerRef.current.scrollLeft -= dx;
        containerRef.current.scrollTop -= dy;

        setLastMousePos({ x: e.clientX, y: e.clientY });
    }, [isPanning, lastMousePos]);

    const endPan = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        if (isPanning) {
            window.addEventListener('mousemove', updatePan);
            window.addEventListener('mouseup', endPan);
            return () => {
                window.removeEventListener('mousemove', updatePan);
                window.removeEventListener('mouseup', endPan);
            };
        }
    }, [isPanning, updatePan, endPan]);

    // Wheel zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setZoom(z => {
                    const newZoom = z - e.deltaY * 0.1;
                    return Math.max(10, Math.min(400, newZoom));
                });
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [containerRef]);

    return {
        zoom,
        setZoom,
        isPanning,
        startPan,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
        handleFitScreen
    };
}
