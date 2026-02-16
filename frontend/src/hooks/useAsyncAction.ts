import { useState, useCallback } from 'react';

/**
 * Extracts a user-friendly error message from an axios error or generic Error.
 */
export function extractErrorMessage(error: any): string {
    return (
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        'Error desconocido'
    );
}

/**
 * Wraps async actions with loading state, loading message, and error handling.
 */
export function useAsyncAction(defaultMessage = 'Procesando...') {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState(defaultMessage);

    const run = useCallback(async <T>(
        action: () => Promise<T>,
        options?: { message?: string; onError?: (msg: string) => void }
    ): Promise<T | null> => {
        setIsLoading(true);
        if (options?.message) setLoadingMessage(options.message);
        try {
            const result = await action();
            return result;
        } catch (error: any) {
            const msg = extractErrorMessage(error);
            if (options?.onError) {
                options.onError(msg);
            } else {
                console.error('Action failed:', error);
                alert(msg);
            }
            return null;
        } finally {
            setIsLoading(false);
            setLoadingMessage(defaultMessage);
        }
    }, [defaultMessage]);

    return { isLoading, loadingMessage, run };
}
