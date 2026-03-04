import { useState, useEffect, useRef } from 'react';

interface FocusModeOptions {
    onPrev?: () => void;
    onNext?: () => void;
}

export function useFocusMode(options?: FocusModeOptions) {
    const [isFocusMode, setIsFocusMode] = useState(false);
    const onPrevRef = useRef<(() => void) | undefined>(undefined);
    const onNextRef = useRef<(() => void) | undefined>(undefined);

    // Keep refs up to date so arrow handlers always use the latest callbacks
    onPrevRef.current = options?.onPrev;
    onNextRef.current = options?.onNext;

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

    useEffect(() => {
        if (!isFocusMode) return;

        const handleArrowKeys = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onPrevRef.current?.();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onNextRef.current?.();
            }
        };

        window.addEventListener('keydown', handleArrowKeys);
        return () => window.removeEventListener('keydown', handleArrowKeys);
    }, [isFocusMode]);

    return isFocusMode;
}
