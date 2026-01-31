/**
 * Configuración centralizada del cliente API
 * Detecta automáticamente la URL del backend
 */

import axios from 'axios';

/**
 * Detecta la URL base del backend automáticamente
 */
export const getApiBase = (): string => {
    let baseUrl = '';

    // Si hay variable de entorno definida, usarla
    if (import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
    }
    // En desarrollo local
    else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:7860';
    }
    // En producción (HuggingFace Spaces), el backend está en el mismo origen
    else {
        baseUrl = window.location.origin;
    }

    // Asegurarse de quitar /api al final si existe para evitar duplicación
    return baseUrl.replace(/\/api\/?$/, '');
};

/**
 * URL base de la API
 */
export const API_BASE_URL = getApiBase();

/**
 * Instancia de axios preconfigurada
 */
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Instancia de axios para uploads de archivos
 */
export const uploadClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000, // 5 minutos para archivos grandes
    headers: {
        'Content-Type': 'multipart/form-data',
    },
});

/**
 * Helper para crear FormData con archivos
 */
export const createFormData = (data: Record<string, unknown>, files?: Record<string, File | File[] | null>): FormData => {
    const formData = new FormData();

    // Agregar datos como JSON
    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
    });

    // Agregar archivos
    if (files) {
        Object.entries(files).forEach(([key, file]) => {
            if (file) {
                if (Array.isArray(file)) {
                    file.forEach(f => formData.append(key, f));
                } else {
                    formData.append(key, file);
                }
            }
        });
    }

    return formData;
};

export default apiClient;
