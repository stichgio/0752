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

export function getFilenameFromHeaders(headers: Headers): string | null {
    const headerFilename = headers.get('X-Filename');
    if (headerFilename) {
        return decodeHeaderValue(headerFilename.trim());
    }

    const contentDisposition = headers.get('Content-Disposition') || '';
    const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
    if (encodedMatch?.[1]) {
        return decodeHeaderValue(encodedMatch[1].trim());
    }

    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(['"])(.*?)\1|([^;\n]*))/i);
    const rawFilename = filenameMatch?.[2] || filenameMatch?.[3];
    return rawFilename ? decodeHeaderValue(rawFilename.trim()) : null;
}
