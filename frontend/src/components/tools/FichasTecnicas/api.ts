import axios from 'axios';
import { FichaTecnica } from './types';

// Detectar URL del backend automáticamente
const getApiBase = (): string => {
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

const API_BASE = getApiBase();

export const fichasTecnicasApi = {
    getAllFichas: async (filters?: { cliente?: string; distrito?: string; status?: string }) => {
        const params = new URLSearchParams();
        if (filters?.cliente) params.append('cliente', filters.cliente);
        if (filters?.distrito) params.append('distrito', filters.distrito);
        if (filters?.status) params.append('status', filters.status);
        const response = await axios.get(`${API_BASE}/api/fichas-tecnicas/fichas?${params}`);
        return response.data;
    },

    getFicha: async (fichaId: string) => {
        const response = await axios.get(`${API_BASE}/api/fichas-tecnicas/fichas/${fichaId}`);
        return response.data;
    },

    createFicha: async (ficha: FichaTecnica) => {
        const response = await axios.post(`${API_BASE}/api/fichas-tecnicas/fichas`, ficha);
        return response.data;
    },

    updateFicha: async (fichaId: string, ficha: FichaTecnica) => {
        const response = await axios.put(`${API_BASE}/api/fichas-tecnicas/fichas/${fichaId}`, ficha);
        return response.data;
    },

    deleteFicha: async (fichaId: string) => {
        const response = await axios.delete(`${API_BASE}/api/fichas-tecnicas/fichas/${fichaId}`);
        return response.data;
    },

    deleteAllFichas: async () => {
        const response = await axios.delete(`${API_BASE}/api/fichas-tecnicas/clear-all-fichas`);
        return response.data;
    },

    importFile: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_BASE}/api/fichas-tecnicas/import-file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    generateConsolidatedPDF: async (logoLeft?: File | null, logoRight?: File | null, fichaIds?: string[]) => {
        const formData = new FormData();

        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);
        if (fichaIds && fichaIds.length > 0) {
            formData.append('ficha_ids', JSON.stringify(fichaIds));
        }

        const response = await axios.post(
            `${API_BASE}/api/fichas-tecnicas/generate-consolidated-pdf`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 300000
            }
        );
        return response.data;
    },

    generatePDF: async (fichaId: string, logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        formData.append('fichaId', fichaId);
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        const response = await axios.post(
            `${API_BASE}/api/fichas-tecnicas/generate-pdf`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 60000
            }
        );
        return response.data;
    },

    getClienteOptions: async () => {
        const response = await axios.get(`${API_BASE}/api/fichas-tecnicas/autocomplete/cliente`);
        return response.data.options;
    },

    getDistritoOptions: async () => {
        const response = await axios.get(`${API_BASE}/api/fichas-tecnicas/autocomplete/distrito`);
        return response.data.options;
    },

    generateTemplatePDF: async (logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        const response = await axios.post(
            `${API_BASE}/api/fichas-tecnicas/generate-template-pdf`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 60000
            }
        );
        return response.data;
    },

    // ── Word (DOCX) Export ──────────────────────────────────

    generateDOCX: async (fichaId: string, logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        formData.append('fichaId', fichaId);
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        const response = await axios.post(
            `${API_BASE}/api/fichas-tecnicas/generate-docx`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 60000
            }
        );
        return response.data;
    },

    generateConsolidatedDOCX: async (logoLeft?: File | null, logoRight?: File | null, fichaIds?: string[]) => {
        const formData = new FormData();

        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);
        if (fichaIds && fichaIds.length > 0) {
            formData.append('ficha_ids', JSON.stringify(fichaIds));
        }

        const response = await axios.post(
            `${API_BASE}/api/fichas-tecnicas/generate-consolidated-docx`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 300000
            }
        );
        return response.data;
    }
};
