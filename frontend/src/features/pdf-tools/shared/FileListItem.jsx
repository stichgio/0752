import { GripVertical, X, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

const MAX_INTERLEAVE_CHUNK = 1000;

/**
 * A single file row in a reorderable list.
 * @param {File} file - The file object
 * @param {number} index - Current position (0-based)
 * @param {Function} onRemove - Callback to remove this file
 * @param {Object} dragHandlers - HTML5 drag event handlers
 * @param {number} [chunkSize] - Páginas a intercalar por turno (solo merge intercalado)
 * @param {Function} [onChunkSizeChange] - (n: number) => void
 */
export default function FileListItem({
    file,
    index,
    onRemove,
    dragHandlers = {},
    chunkSize,
    onChunkSizeChange,
}) {
    const sizeKB = (file.size / 1024).toFixed(1);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
            draggable
            {...dragHandlers}
            className="group flex items-center gap-3 px-3 py-2.5 bg-neutral-900/60 border border-neutral-800 rounded-md
                       hover:border-neutral-700 hover:bg-neutral-900 transition-all cursor-grab active:cursor-grabbing"
        >
            {/* Drag handle */}
            <GripVertical size={14} className="text-neutral-600 group-hover:text-neutral-400 flex-shrink-0" />

            {/* Index badge */}
            <span className="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 text-sm font-mono text-neutral-400 flex-shrink-0">
                {index + 1}
            </span>

            {/* File info */}
            <FileText size={14} className="text-neutral-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-base text-neutral-300 truncate font-medium">{file.name}</p>
                <p className="text-sm text-neutral-500">{sizeKB} KB</p>
                {onChunkSizeChange != null && chunkSize != null && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950/50 px-2.5 py-1.5">
                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                            PDF {index + 1} — hojas por turno
                        </span>
                        <input
                            type="number"
                            min={1}
                            max={MAX_INTERLEAVE_CHUNK}
                            value={chunkSize}
                            onChange={(e) => {
                                let n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) n = 1;
                                n = Math.min(MAX_INTERLEAVE_CHUNK, Math.max(1, n));
                                onChunkSizeChange(n);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-center text-sm font-semibold text-neutral-100 focus:border-neutral-500 focus:outline-none"
                            aria-label={`Hojas a intercalar por turno para PDF ${index + 1}`}
                        />
                    </div>
                )}
            </div>

            {/* Remove button */}
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-neutral-600 transition-all"
            >
                <X size={14} />
            </button>
        </motion.div>
    );
}


