import { getApiBase } from '../../../utils/apiBase';

const API_BASE = `${getApiBase()}/api/tools`;

/**
 * Centralized fetch wrapper for PDF Tools endpoints.
 * Handles network errors vs HTTP errors with descriptive messages.
 */
async function callApi(path, formData) {
    const fullUrl = `${API_BASE}${path}`;
    let res;

    try {
        res = await fetch(fullUrl, { method: 'POST', body: formData });
    } catch (_networkErr) {
        const isLocal =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
        throw new Error(
            isLocal
                ? 'No se pudo conectar con el servidor. Verifica que el backend esta corriendo en http://localhost:7860 y que el proxy de Vite esta activo.'
                : `No se pudo conectar con el backend. URL intentada: ${fullUrl}`,
        );
    }

    if (!res.ok) {
        let detail = `Error del servidor (${res.status})`;
        try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                const json = await res.json();
                detail = json.detail || JSON.stringify(json);
            } else {
                detail = (await res.text()) || detail;
            }
        } catch { /* ignore parse errors */ }
        throw new Error(detail);
    }

    return res;
}

export async function mergePdfsInterleaved(files, strict = false, chunkSizes = null) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('strict', strict);
    if (Array.isArray(chunkSizes) && chunkSizes.length === files.length && chunkSizes.length > 0) {
        fd.append('chunk_sizes', JSON.stringify(chunkSizes));
    }
    const res = await callApi('/merge-pdfs', fd);
    return res.blob();
}

export async function mergePdfsNormal(files) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const res = await callApi('/merge-pdfs-normal', fd);
    return res.blob();
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

    const res = await callApi('/split-pdf', fd);
    return res.blob();
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

    const res = await callApi('/organize-pdf', fd);
    return res.blob();
}

export async function extractPages(file, pageNumbers) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', JSON.stringify(pageNumbers));
    const res = await callApi('/extract-pages', fd);
    return res.blob();
}
