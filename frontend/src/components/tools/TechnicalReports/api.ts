import axios from 'axios';
import { TechnicalReport } from './types';

// Detectar URL del backend automáticamente
const getApiBase = (): string => {
    let baseUrl = '';

    // Si hay variable de entorno definida, usarla
    if (import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
    }
    // En desarrollo local
    else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:7860'; // Correct port where FastAPI is running
    }
    // En producción (HuggingFace Spaces), el backend está en el mismo origen
    else {
        baseUrl = window.location.origin;
    }

    // Asegurarse de quitar /api al final si existe para evitar duplicación
    return baseUrl.replace(/\/api\/?$/, '');
};

const API_BASE = getApiBase();

export const technicalReportsApi = {
    getAllReports: async (filters?: { cs?: string; contratista?: string; status?: string }) => {
        const params = new URLSearchParams();
        if (filters?.cs) params.append('cs', filters.cs);
        if (filters?.contratista) params.append('contratista', filters.contratista);
        if (filters?.status) params.append('status', filters.status);
        const response = await axios.get(`${API_BASE}/api/technical-reports/reports?${params}`);
        return response.data;
    },

    getReport: async (reportId: string) => {
        const response = await axios.get(`${API_BASE}/api/technical-reports/reports/${reportId}`);
        return response.data;
    },

    createReport: async (report: TechnicalReport) => {
        const response = await axios.post(`${API_BASE}/api/technical-reports/reports`, report);
        return response.data;
    },

    updateReport: async (reportId: string, report: TechnicalReport) => {
        const response = await axios.put(`${API_BASE}/api/technical-reports/reports/${reportId}`, report);
        return response.data;
    },

    deleteReport: async (reportId: string) => {
        const response = await axios.delete(`${API_BASE}/api/technical-reports/reports/${reportId}`);
        return response.data;
    },

    deleteAllReports: async () => {
        const response = await axios.delete(`${API_BASE}/api/technical-reports/clear-all-reports`);
        return response.data;
    },

    importCSV: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_BASE}/api/technical-reports/import-csv`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    generatePDF: async (report: TechnicalReport, images: File[] = [], logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();

        // Se envía el reporte como JSON en el campo 'data'
        // El backend detecta que NO es una lista, por lo que asocia todos los 'files' a este único reporte
        formData.append('data', JSON.stringify(report));

        // Se adjuntan las imágenes seleccionadas
        images.forEach((file) => {
            formData.append('files', file);
        });

        // Adjuntar logos si existen
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        // Se especifica el nombre del template para que el backend lo cargue correctamente
        formData.append('templateName', 'informe_tecnico.html');

        const response = await axios.post(`${API_BASE}/api/generate-pdf`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob'
        });
        return response.data;
    },

    getCSOptions: async () => {
        const response = await axios.get(`${API_BASE}/api/technical-reports/autocomplete/cs`);
        return response.data.options;
    },

    getContratistaOptions: async (cs?: string) => {
        const params = cs ? `?cs=${cs}` : '';
        const response = await axios.get(`${API_BASE}/api/technical-reports/autocomplete/contratista${params}`);
        return response.data.options;
    },

    generateConsolidatedPDF: async (logoLeft?: File | null, logoRight?: File | null, reportIds?: string[]) => {
        const formData = new FormData();

        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);
        if (reportIds && reportIds.length > 0) {
            formData.append('report_ids', JSON.stringify(reportIds));
        }

        const response = await axios.post(
            `${API_BASE}/api/technical-reports/generate-consolidated-pdf`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                responseType: 'blob',
                timeout: 300000 // 5 minutos para PDFs grandes
            }
        );
        return response.data;
    }
};
