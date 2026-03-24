import { extractHttpErrorMessage, requestBlob } from '../../../utils/apiClient';

const API_BASE = '/api/tools';

/**
 * Centralized fetch wrapper for PDF Tools endpoints.
 * Handles network errors vs HTTP errors with descriptive messages.
 */
async function callApi(path, formData) {
    try {
        return await requestBlob(`${API_BASE}${path}`, {
            method: 'POST',
            data: formData,
        });
    } catch (error) {
        const message = await extractHttpErrorMessage(error);
        const isLocal =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
        if (message === 'No se pudo conectar con el servidor.') {
            throw new Error(
                isLocal
                    ? 'No se pudo conectar con el servidor. Verifica que el backend esta corriendo en http://localhost:7860 y que el proxy de Vite esta activo.'
                    : `No se pudo conectar con el backend. URL intentada: ${API_BASE}${path}`,
            );
        }

        throw new Error(message);
    }
}

export async function mergePdfsInterleaved(files, strict = false, chunkSizes = null) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('strict', strict);
    if (Array.isArray(chunkSizes) && chunkSizes.length === files.length && chunkSizes.length > 0) {
        fd.append('chunk_sizes', JSON.stringify(chunkSizes));
    }
    return callApi('/merge-pdfs', fd);
}

export async function mergePdfsNormal(files) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return callApi('/merge-pdfs-normal', fd);
}

export async function splitPdf(file, mode, options = {}) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);

    if (mode === 'pages') {
        fd.append('pages_per_file', options.pagesPerFile || 1);
    } else if (mode === 'custom') {
        fd.append('ranges', JSON.stringify(options.ranges));
    }

    return callApi('/split-pdf', fd);
}

export async function organizePdf(file, operations, cutPoints = []) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('operations', JSON.stringify(operations));

    if (cutPoints.length > 0) {
        const activeCount = operations.pageOrder.length;
        const ranges = [];
        let start = 0;
        cutPoints.forEach((cut) => {
            ranges.push([start + 1, cut + 1]);
            start = cut + 1;
        });
        if (start < activeCount) {
            ranges.push([start + 1, activeCount]);
        }
        fd.append('ranges', JSON.stringify(ranges));
        fd.append('mode', 'organize-split');
    } else {
        fd.append('mode', 'organize');
    }

    return callApi('/organize-pdf', fd);
}

export async function extractPages(file, pageNumbers) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', JSON.stringify(pageNumbers));
    return callApi('/extract-pages', fd);
}
