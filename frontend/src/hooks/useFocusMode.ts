import { useState, useEffect } from 'react';

export function useFocusMode() {
    const [isFocusMode, setIsFocusMode] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '.') {
                e.preventDefault();
                setIsFocusMode(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return isFocusMode;
}
