import { useEffect } from 'react';

/**
 * Keyboard shortcut handler for PDF Tools.
 * @param {Object} handlers - Map of shortcut keys to callbacks
 *   Keys: 'ctrl+z', 'ctrl+shift+z', 'ctrl+a', 'delete', 'r', 'escape'
 * @param {boolean} enabled - Whether shortcuts are active
 */
export function useKeyboardShortcuts(handlers, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        function onKeyDown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            const key = e.key.toLowerCase();

            if (ctrl && shift && key === 'z') {
                e.preventDefault();
                handlers['ctrl+shift+z']?.();
            } else if (ctrl && key === 'z') {
                e.preventDefault();
                handlers['ctrl+z']?.();
            } else if (ctrl && key === 'a') {
                e.preventDefault();
                handlers['ctrl+a']?.();
            } else if (key === 'delete' || key === 'backspace') {
                e.preventDefault();
                handlers['delete']?.();
            } else if (key === 'r') {
                e.preventDefault();
                handlers['r']?.();
            } else if (key === 'escape') {
                handlers['escape']?.();
            }
        }

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handlers, enabled]);
}
