import { FichaTecnica } from './types';
import { apiClient, appendLogos, postBlob } from '@/utils/apiClient';

export const fichasTecnicasApi = {
    getAllFichas: async (
        filters?: { cliente?: string; distrito?: string; status?: string },
        summary = false
    ) => {
        const params = new URLSearchParams();
        if (filters?.cliente) params.append('cliente', filters.cliente);
        if (filters?.distrito) params.append('distrito', filters.distrito);
        if (filters?.status) params.append('status', filters.status);
        if (summary) params.append('summary', 'true');
        const { data } = await apiClient.get(`/api/fichas-tecnicas/fichas?${params}`);
        return data;
    },

    getFicha: async (fichaId: string) => {
        const { data } = await apiClient.get(`/api/fichas-tecnicas/fichas/${fichaId}`);
        return data;
    },

    createFicha: async (ficha: FichaTecnica) => {
        const { data } = await apiClient.post('/api/fichas-tecnicas/fichas', ficha);
        return data;
    },

    updateFicha: async (fichaId: string, ficha: FichaTecnica) => {
        const { data } = await apiClient.put(`/api/fichas-tecnicas/fichas/${fichaId}`, ficha);
        return data;
    },

    deleteFicha: async (fichaId: string) => {
        const { data } = await apiClient.delete(`/api/fichas-tecnicas/fichas/${fichaId}`);
        return data;
    },

    deleteAllFichas: async () => {
        const { data } = await apiClient.delete('/api/fichas-tecnicas/clear-all-fichas');
        return data;
    },

    importFile: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await apiClient.post('/api/fichas-tecnicas/import-file', formData);
        return data;
    },

    generateConsolidatedPDF: async (logoLeft?: File | null, logoRight?: File | null, fichaIds?: string[]) => {
        const formData = new FormData();
        appendLogos(formData, logoLeft, logoRight);
        if (fichaIds && fichaIds.length > 0) {
            formData.append('ficha_ids', JSON.stringify(fichaIds));
        }
        return postBlob('/api/fichas-tecnicas/generate-consolidated-pdf', formData, 300000);
    },

    generatePDF: async (fichaId: string, logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        formData.append('fichaId', fichaId);
        appendLogos(formData, logoLeft, logoRight);
        return postBlob('/api/fichas-tecnicas/generate-pdf', formData);
    },

    getClienteOptions: async () => {
        const { data } = await apiClient.get('/api/fichas-tecnicas/autocomplete/cliente');
        return data.options;
    },

    getDistritoOptions: async () => {
        const { data } = await apiClient.get('/api/fichas-tecnicas/autocomplete/distrito');
        return data.options;
    },

    generateTemplatePDF: async (logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        appendLogos(formData, logoLeft, logoRight);
        return postBlob('/api/fichas-tecnicas/generate-template-pdf', formData);
    }
};
