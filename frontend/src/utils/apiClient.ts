import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getApiBase } from './apiBase';

export const HTTP_TIMEOUTS = {
    NONE: 0,
    SHORT: 20000,
    DEFAULT: 60000,
    EXPORT: 120000,
    LONG_EXPORT: 300000,
} as const;

export const apiClient = axios.create({
    baseURL: getApiBase(),
    timeout: HTTP_TIMEOUTS.DEFAULT,
});

type ApiRequestConfig<D = unknown> = Omit<AxiosRequestConfig<D>, 'url'>;

interface EventStreamOptions {
    method?: 'GET' | 'POST';
    body?: BodyInit | null;
    headers?: HeadersInit;
    signal?: AbortSignal;
}

function isBlobPayload(value: unknown): value is Blob {
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readErrorDetail(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (Array.isArray(value)) {
        return value.map(readErrorDetail).filter(Boolean).join(', ');
    }

    if (!isRecord(value)) {
        return '';
    }

    const detail = value.detail;
    if (typeof detail === 'string') {
        return detail.trim();
    }

    if (isRecord(detail)) {
        const message = detail.message;
        if (typeof message === 'string' && message.trim()) {
            return message.trim();
        }
    }

    const message = value.message;
    if (typeof message === 'string') {
        return message.trim();
    }

    return '';
}

function fallbackErrorMessage(message?: string): string {
    if (!message) {
        return 'Error desconocido';
    }

    if (
        message.includes('Network Error')
        || message.includes('Failed to fetch')
        || message.includes('Load failed')
    ) {
        return 'No se pudo conectar con el servidor.';
    }

    return message;
}

async function parseBlobPayload(blob: Blob): Promise<unknown> {
    const text = await blob.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function readResponseErrorMessage(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') || '';

    try {
        if (contentType.includes('application/json')) {
            const payload = await response.json();
            const detail = readErrorDetail(payload);
            if (detail) {
                return detail;
            }
        }

        const text = await response.text();
        if (text.trim()) {
            return text.trim();
        }
    } catch {
        // Ignore parse errors and fall back to status text.
    }

    return `Error del servidor: ${response.status}`;
}

export function resolveApiUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    return apiClient.getUri({ url });
}

export function extractHttpErrorMessageSync(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const detail = readErrorDetail(error.response?.data);
        return detail || fallbackErrorMessage(error.message);
    }

    if (error instanceof Error) {
        return fallbackErrorMessage(error.message);
    }

    return 'Error desconocido';
}

export async function extractHttpErrorMessage(error: unknown): Promise<string> {
    if (axios.isAxiosError(error)) {
        let payload = error.response?.data;

        if (isBlobPayload(payload)) {
            payload = await parseBlobPayload(payload);
        }

        const detail = readErrorDetail(payload);
        return detail || fallbackErrorMessage(error.message);
    }

    if (error instanceof Error) {
        return fallbackErrorMessage(error.message);
    }

    return 'Error desconocido';
}

export async function requestJson<T = unknown, D = unknown>(
    url: string,
    config: ApiRequestConfig<D> = {}
): Promise<T> {
    const response = await apiClient.request<T, AxiosResponse<T>, D>({
        url,
        ...config,
    });

    return response.data;
}

export async function requestText<D = unknown>(
    url: string,
    config: ApiRequestConfig<D> = {}
): Promise<string> {
    const response = await apiClient.request<string, AxiosResponse<string>, D>({
        url,
        responseType: 'text',
        ...config,
    });

    return response.data;
}

export async function requestBlobResponse<D = unknown>(
    url: string,
    config: ApiRequestConfig<D> = {}
): Promise<AxiosResponse<Blob, D>> {
    return apiClient.request<Blob, AxiosResponse<Blob, D>, D>({
        url,
        responseType: 'blob',
        ...config,
    });
}

export async function requestBlob<D = unknown>(
    url: string,
    config: ApiRequestConfig<D> = {}
): Promise<Blob> {
    const response = await requestBlobResponse(url, config);
    return response.data;
}

export async function downloadByUrl(
    url: string,
    config: ApiRequestConfig = {}
): Promise<AxiosResponse<Blob>> {
    return requestBlobResponse(url, {
        method: 'GET',
        ...config,
    });
}

export async function openEventStream(
    url: string,
    options: EventStreamOptions
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const response = await fetch(resolveApiUrl(url), {
        method: options.method || 'GET',
        body: options.body || null,
        headers: options.headers,
        signal: options.signal,
    });

    if (!response.ok) {
        throw new Error(await readResponseErrorMessage(response));
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No se pudo obtener el flujo de lectura');
    }

    return reader;
}

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
    timeout: number = HTTP_TIMEOUTS.DEFAULT
): Promise<Blob> {
    return requestBlob(url, {
        method: 'POST',
        data: formData,
        timeout,
    });
}
