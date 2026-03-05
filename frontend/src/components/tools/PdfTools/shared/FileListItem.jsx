import { GripVertical, X, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * A single file row in a reorderable list.
 * @param {File} file - The file object
 * @param {number} index - Current position (0-based)
 * @param {Function} onRemove - Callback to remove this file
 * @param {Object} dragHandlers - HTML5 drag event handlers
 */
export default function FileListItem({ file, index, onRemove, dragHandlers = {} }) {
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


