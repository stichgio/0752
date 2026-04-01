import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY = 'glitch-nav-prefs-v1';

/**
 * Default first 6 pinned item ids.
 * These are pinned by default when no preferences exist.
 */
const DEFAULT_PINNED_IDS = [
    'reportes-fotograficos',
    'informes-tecnicos',
    'fichas-tecnicas',
    'compressor',
    'image-optimizer',
    'template-editor',
];

/**
 * Reads stored preferences. Returns null if nothing stored or invalid JSON.
 */
function readStored() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            Array.isArray(parsed.order) &&
            Array.isArray(parsed.pinnedIds)
        ) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Reconcile stored prefs against the current catalog of nav items.
 *  - Remove ids that no longer exist in the catalog
 *  - Append new ids that appeared since last save (to the end, unpinned)
 */
function reconcile(stored, catalogIds) {
    const catalogSet = new Set(catalogIds);
    const storedSet = new Set(stored.order);

    // Remove stale ids
    const order = stored.order.filter((id) => catalogSet.has(id));
    const pinnedIds = stored.pinnedIds.filter((id) => catalogSet.has(id));

    // Add new ids at the end (unpinned by default)
    for (const id of catalogIds) {
        if (!storedSet.has(id)) {
            order.push(id);
        }
    }

    return { order, pinnedIds };
}

/**
 * Build default preferences for a given catalog.
 */
function buildDefaults(catalogIds) {
    return {
        order: [...catalogIds],
        pinnedIds: catalogIds.filter((id) => DEFAULT_PINNED_IDS.includes(id)),
    };
}

/**
 * Hook that manages nav preferences (order + pinnedIds) persisted in localStorage.
 *
 * @param {string[]} catalogIds - Ordered list of all nav item ids from the catalog definition.
 * @returns {{ order: string[], pinnedIds: string[], setPinned, setOrder, resetDefaults, togglePin }}
 */
export default function useNavPreferences(catalogIds) {
    const [prefs, setPrefs] = useState(() => {
        const stored = readStored();
        if (stored) {
            return reconcile(stored, catalogIds);
        }
        return buildDefaults(catalogIds);
    });

    // Persist on change
    const prefsRef = useRef(prefs);
    useEffect(() => {
        prefsRef.current = prefs;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch {
            // quota exceeded — silently ignore
        }
    }, [prefs]);

    const togglePin = useCallback((id) => {
        setPrefs((prev) => {
            const isPinned = prev.pinnedIds.includes(id);
            return {
                ...prev,
                pinnedIds: isPinned
                    ? prev.pinnedIds.filter((p) => p !== id)
                    : [...prev.pinnedIds, id],
            };
        });
    }, []);

    const setOrder = useCallback((newOrder) => {
        setPrefs((prev) => ({ ...prev, order: newOrder }));
    }, []);

    const setPinned = useCallback((newPinned) => {
        setPrefs((prev) => ({ ...prev, pinnedIds: newPinned }));
    }, []);

    const resetDefaults = useCallback(() => {
        setPrefs(buildDefaults(catalogIds));
    }, [catalogIds]);

    return {
        order: prefs.order,
        pinnedIds: prefs.pinnedIds,
        togglePin,
        setOrder,
        setPinned,
        resetDefaults,
    };
}
