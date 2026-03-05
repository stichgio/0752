import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * Bottom action bar with primary action button and optional left content.
 * @param {Function} onAction - Primary action callback
 * @param {string} actionLabel - Button text
 * @param {boolean} disabled - Disable the button
 * @param {boolean} loading - Show spinner
 * @param {React.ReactNode} left - Optional left-side content
 * @param {React.ReactNode} actionIcon - Optional icon for the button
 */
export default function ActionBar({
    onAction,
    actionLabel = 'PROCESAR',
    disabled = false,
    loading = false,
    left = null,
    actionIcon = null,
}) {
    return (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-800/60">
            <div className="text-base text-neutral-500">{left}</div>
            <motion.button
                onClick={onAction}
                disabled={disabled || loading}
                whileHover={!disabled ? { scale: 1.02 } : {}}
                whileTap={!disabled ? { scale: 0.98 } : {}}
                className={`
                    flex items-center gap-2 px-6 py-3 rounded-md text-base font-semibold tracking-wide
                    transition-all duration-200 font-[DotGothic16] uppercase
                    ${disabled
                        ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed border border-neutral-700'
                        : 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] border border-white/20'
                    }
                `}
            >
                {loading ? <Loader2 size={16} className="animate-spin" /> : actionIcon}
                {actionLabel}
            </motion.button>
        </div>
    );
}
