type HeaderLike =
    | Headers
    | { get?: (name: string) => unknown }
    | Record<string, unknown>;

export function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

function decodeHeaderValue(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function getHeaderValue(headers: HeaderLike, name: string): string | null {
    if (headers instanceof Headers) {
        return headers.get(name);
    }

    if (typeof headers.get === 'function') {
        const value = headers.get(name);
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }

    const lowerName = name.toLowerCase();
    const rawValue = headers[lowerName] ?? headers[name];

    if (Array.isArray(rawValue)) {
        return rawValue.join(', ');
    }

    if (rawValue === null || rawValue === undefined) {
        return null;
    }

    return String(rawValue);
}

export function getFilenameFromHeaders(headers: HeaderLike): string | null {
    const headerFilename = getHeaderValue(headers, 'X-Filename');
    if (headerFilename) {
        return decodeHeaderValue(headerFilename.trim());
    }

    const contentDisposition = getHeaderValue(headers, 'Content-Disposition') || '';
    const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
    if (encodedMatch?.[1]) {
        return decodeHeaderValue(encodedMatch[1].trim());
    }

    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(['"])(.*?)\1|([^;\n]*))/i);
    const rawFilename = filenameMatch?.[2] || filenameMatch?.[3];
    return rawFilename ? decodeHeaderValue(rawFilename.trim()) : null;
}
