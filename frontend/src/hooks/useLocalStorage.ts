import { useState, useEffect } from 'react';

/**
 * Hook para persistir estado en localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
    // Estado inicial desde localStorage o valor por defecto
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    // Persistir cambios en localStorage
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(storedValue));
        } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, storedValue]);

    return [storedValue, setStoredValue];
}

export default useLocalStorage;
