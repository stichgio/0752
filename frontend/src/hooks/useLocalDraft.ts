import { useState, useEffect, useRef, useCallback } from 'react';

interface DraftState<T> {
    formData: T | null;
    selectedId: string | null;
    hasUnsavedChanges: boolean;
}

export function useLocalDraft<T>(storageKey: string) {
    const [formData, setFormData] = useState<T | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const latestStateRef = useRef<DraftState<T>>({
        formData: null,
        selectedId: null,
        hasUnsavedChanges: false,
    });

    const persistDraft = useCallback(() => {
        try {
            const nextState = latestStateRef.current;
            if (!nextState.formData) {
                localStorage.removeItem(storageKey);
                return;
            }
            localStorage.setItem(storageKey, JSON.stringify(nextState));
        } catch (e) {
            console.error('Error saving draft:', e);
        }
    }, [storageKey]);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed: DraftState<T> = JSON.parse(saved);
                setFormData(parsed.formData);
                setSelectedId(parsed.selectedId);
                setHasUnsavedChanges(parsed.hasUnsavedChanges || false);
            } catch (e) {
                console.error('Error loading draft:', e);
            }
        }
        setIsHydrated(true);
    }, [storageKey]);

    useEffect(() => {
        latestStateRef.current = {
            formData,
            selectedId,
            hasUnsavedChanges,
        };
    }, [formData, selectedId, hasUnsavedChanges]);

    // Persist to localStorage on change, but defer writes to avoid blocking the UI on every keystroke.
    useEffect(() => {
        if (!isHydrated) return;
        const timeoutId = window.setTimeout(() => {
            persistDraft();
        }, 250);
        return () => window.clearTimeout(timeoutId);
    }, [formData, selectedId, hasUnsavedChanges, isHydrated, persistDraft]);

    useEffect(() => {
        if (!isHydrated) return;

        const flushDraft = () => {
            persistDraft();
        };

        window.addEventListener('pagehide', flushDraft);
        window.addEventListener('beforeunload', flushDraft);

        return () => {
            window.removeEventListener('pagehide', flushDraft);
            window.removeEventListener('beforeunload', flushDraft);
            flushDraft();
        };
    }, [isHydrated, persistDraft]);

    return {
        formData, setFormData,
        selectedId, setSelectedId,
        hasUnsavedChanges, setHasUnsavedChanges,
    };
}
