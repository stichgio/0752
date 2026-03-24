import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { extractHttpErrorMessage } from '@/utils/apiClient';

/**
 * Extracts a user-friendly error message from an axios error or generic Error.
 */
export async function extractErrorMessage(error: unknown): Promise<string> {
    return extractHttpErrorMessage(error);
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
        } catch (error: unknown) {
            const msg = await extractErrorMessage(error);
            if (options?.onError) {
                options.onError(msg);
            } else {
                console.error('Action failed:', error);
                toast.error(msg);
            }
            return null;
        } finally {
            setIsLoading(false);
            setLoadingMessage(defaultMessage);
        }
    }, [defaultMessage]);

    return { isLoading, loadingMessage, run };
}
