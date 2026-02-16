// Detectar URL del backend automáticamente
// - Producción: VITE_API_URL se define en .env.production (apunta a HF Spaces)
// - Dev local:  VITE_API_URL se define en .env (apunta a localhost:7860/api)
// - Fallback:   /api (funciona con el proxy de Vite en dev)
export const getApiBase = (): string => {
    let baseUrl = '';

    if (import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
    }
    else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:7860';
    }
    else {
        // Fallback: asume que VITE_API_URL fue configurado en build (Vercel).
        // Si no, usa /api que solo funciona si backend y frontend comparten dominio.
        baseUrl = '/api';
    }

    return baseUrl.replace(/\/api\/?$/, '');
};
