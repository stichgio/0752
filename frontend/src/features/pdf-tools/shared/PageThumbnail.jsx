import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Single PDF page thumbnail that renders via PDF.js canvas.
 * @param {Function} renderPage - From usePdfDocument
 * @param {number} pageNum - 1-based page number to render
 * @param {number} scale - Render scale (default 0.3)
 * @param {number} rotation - Rotation degrees (0, 90, 180, 270)
 * @param {boolean} selected - Whether the page is selected
 * @param {Function} onClick - Click handler
 * @param {string} className - Additional classes
 * @param {React.ReactNode} overlay - Optional overlay content
 * @param {React.ReactNode} badge - Optional badge (e.g., page number)
 */
export default function PageThumbnail({
    renderPage,
    pageNum,
    scale = 0.3,
    rotation = 0,
    selected = false,
    onClick,
    className = '',
    overlay = null,
    badge = null,
}) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (canvasRef.current && renderPage) {
            renderPage(pageNum, canvasRef.current, scale, rotation);
        }
    }, [renderPage, pageNum, scale, rotation]);

    return (
        <motion.div
            layout
            onClick={onClick}
            className={`
                relative bg-white rounded overflow-hidden cursor-pointer
                transition-all duration-200 group
                shadow-[0_2px_8px_rgba(0,0,0,0.4)]
                hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)]
                hover:-translate-y-0.5
                ${selected
                    ? 'ring-2 ring-red-500 shadow-[0_0_20px_rgba(215,25,33,0.25)]'
                    : 'ring-1 ring-neutral-700 hover:ring-neutral-500'
                }
                ${className}
            `}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            <canvas ref={canvasRef} className="w-full h-full object-contain" />

            {overlay}

            {badge && (
                <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-sm font-mono font-semibold px-2 py-1 rounded">
                    {badge}
                </div>
            )}
        </motion.div>
    );
}
