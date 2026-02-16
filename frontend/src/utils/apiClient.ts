import axios from 'axios';
import { getApiBase } from './apiBase';

/**
 * Shared axios instance with base URL and default timeout.
 */
export const apiClient = axios.create({
    baseURL: getApiBase(),
    timeout: 60000,
});

/**
 * Append logo files to a FormData instance.
 */
export function appendLogos(
    formData: FormData,
    logoLeft?: File | null,
    logoRight?: File | null
): void {
    if (logoLeft) formData.append('logoLeft', logoLeft);
    if (logoRight) formData.append('logoRight', logoRight);
}

/**
 * POST a FormData payload expecting a Blob response.
 */
export async function postBlob(
    url: string,
    formData: FormData,
    timeout = 60000
): Promise<Blob> {
    const response = await apiClient.post(url, formData, {
        responseType: 'blob',
        timeout,
    });
    return response.data;
}
