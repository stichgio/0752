import { Scissors } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Toggle button to mark a cut point between pages.
 * @param {boolean} active - Whether the cut is active
 * @param {Function} onClick - Toggle handler
 */
export default function ScissorButton({ active, onClick }) {
    return (
        <div className="w-full flex items-center justify-center py-1 relative">
            {/* Cut line */}
            {active && (
                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    className="absolute left-0 right-0 h-[2px] bg-red-500/60 top-1/2 -translate-y-1/2"
                />
            )}

            <motion.button
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className={`
                    relative z-10 w-8 h-8 rounded-full flex items-center justify-center
                    transition-all duration-200 border-2
                    ${active
                        ? 'bg-red-500 text-white border-red-500 shadow-[0_0_12px_rgba(215,25,33,0.4)]'
                        : 'bg-neutral-800 text-neutral-500 border-neutral-600 hover:text-white hover:border-neutral-400 hover:bg-neutral-700'
                    }
                `}
            >
                <Scissors size={14} />
            </motion.button>
        </div>
    );
}
