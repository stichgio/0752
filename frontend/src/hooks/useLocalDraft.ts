import { useState, useEffect } from 'react';

interface DraftState<T> {
    formData: T | null;
    selectedId: string | null;
    hasUnsavedChanges: boolean;
}

export function useLocalDraft<T>(storageKey: string) {
    const [formData, setFormData] = useState<T | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
    }, [storageKey]);

    // Persist to localStorage on change
    useEffect(() => {
        if (formData) {
            localStorage.setItem(storageKey, JSON.stringify({
                formData,
                selectedId,
                hasUnsavedChanges
            } as DraftState<T>));
        }
    }, [formData, selectedId, hasUnsavedChanges, storageKey]);

    return {
        formData, setFormData,
        selectedId, setSelectedId,
        hasUnsavedChanges, setHasUnsavedChanges,
    };
}
