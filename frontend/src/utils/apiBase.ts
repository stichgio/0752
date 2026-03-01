// Detectar URL del backend automáticamente
// - Producción: VITE_API_URL se define en .env.production (apunta a HF Spaces)
// - Dev local:  VITE_API_URL se define en .env (apunta a localhost:7860/api)
// - Fallback:   /api (funciona con el proxy de Vite en dev)

const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const hasApiUrl = !!import.meta.env.VITE_API_URL;

/**
 * True when running on a non-localhost domain without VITE_API_URL configured.
 * This almost always indicates a misconfigured production deployment.
 */
export const isApiConfigMissing: boolean = !hasApiUrl && !isLocalhost;

// Log a loud warning at module load so it shows up immediately in DevTools.
if (isApiConfigMissing) {
    console.error(
        '[API Config] VITE_API_URL is not set and the app is running on a non-localhost domain (%s). ' +
        'API calls will fall back to "/api" which only works if backend and frontend share the same origin. ' +
        'Set VITE_API_URL in your build environment to point to the backend.',
        typeof window !== 'undefined' ? window.location.hostname : 'unknown',
    );
}

export const getApiBase = (): string => {
    let baseUrl = '';

    if (hasApiUrl) {
        baseUrl = import.meta.env.VITE_API_URL;
    }
    else if (isLocalhost) {
        baseUrl = 'http://localhost:7860';
    }
    else {
        // Fallback: asume que VITE_API_URL fue configurado en build (Vercel).
        // Si no, usa /api que solo funciona si backend y frontend comparten dominio.
        baseUrl = '/api';
    }

    return baseUrl.replace(/\/api\/?$/, '');
};
