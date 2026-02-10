// Detectar URL del backend automáticamente
export const getApiBase = (): string => {
    let baseUrl = '';

    if (import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
    }
    else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:7860';
    }
    else {
        baseUrl = window.location.origin;
    }

    return baseUrl.replace(/\/api\/?$/, '');
};
