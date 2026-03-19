// Detectar URL del backend automaticamente.
// - Produccion: VITE_API_URL se define en .env.production (apunta a HF Spaces)
// - Dev local: usa /api para aprovechar el proxy de Vite y evitar CORS
// - Fallback: /api cuando frontend y backend comparten origen

const getHostname = (): string =>
    typeof window !== 'undefined' ? window.location.hostname : '';

export const isLocalhost = (): boolean => {
    const hostname = getHostname();
    return hostname === 'localhost' || hostname === '127.0.0.1';
};

export const hasApiUrl = (): boolean => !!import.meta.env.VITE_API_URL;

/**
 * True when running on a non-localhost domain without VITE_API_URL configured.
 * This almost always indicates a misconfigured production deployment.
 */
export const isApiConfigMissing = (): boolean => !hasApiUrl() && !isLocalhost();

// Log a loud warning at module load so it shows up immediately in DevTools.
if (isApiConfigMissing()) {
    console.error(
        '[API Config] VITE_API_URL is not set and the app is running on a non-localhost domain (%s). ' +
        'API calls will fall back to "/api" which only works if backend and frontend share the same origin. ' +
        'Set VITE_API_URL in your build environment to point to the backend.',
        getHostname() || 'unknown',
    );
}

export const getApiBase = (): string => {
    if (hasApiUrl()) {
        return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
    }

    return '';
};
