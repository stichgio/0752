// Cliente API para informes técnicos

import axios from 'axios';
import { TechnicalReport, ReportListItem } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/technical-reports';

export const technicalReportsApi = {
    // Importar CSV
    importCSV: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(
            `${API_BASE}${API_PREFIX}/import-csv`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' }
            }
        );

        return response.data;
    },

    // Obtener todos los reportes
    getReports: async (filters?: {
        cs?: string;
        contratista?: string;
        status?: string;
    }): Promise<{ reports: TechnicalReport[]; total: number }> => {
        const params = new URLSearchParams();
        if (filters?.cs) params.append('cs', filters.cs);
        if (filters?.contratista) params.append('contratista', filters.contratista);
        if (filters?.status) params.append('status', filters.status);

        const response = await axios.get(
            `${API_BASE}${API_PREFIX}/reports?${params.toString()}`
        );

        return response.data;
    },

    // Obtener un reporte
    getReport: async (reportId: string): Promise<TechnicalReport> => {
        const response = await axios.get(
            `${API_BASE}${API_PREFIX}/reports/${reportId}`
        );

        return response.data;
    },

    // Crear reporte
    createReport: async (report: TechnicalReport) => {
        const response = await axios.post(
            `${API_BASE}${API_PREFIX}/reports`,
            report
        );

        return response.data;
    },

    // Actualizar reporte
    updateReport: async (reportId: string, report: TechnicalReport) => {
        const response = await axios.put(
            `${API_BASE}${API_PREFIX}/reports/${reportId}`,
            report
        );

        return response.data;
    },

    // Eliminar reporte
    deleteReport: async (reportId: string) => {
        const response = await axios.delete(
            `${API_BASE}${API_PREFIX}/reports/${reportId}`
        );

        return response.data;
    },

    // Generar PDF
    downloadPDF: async (reportId: string) => {
        const response = await axios.post(
            `${API_BASE}${API_PREFIX}/reports/${reportId}/generate-pdf`,
            null,
            { responseType: 'blob' }
        );

        // Descargar automáticamente
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `informe_${reportId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    },

    // Autocompletado
    autocomplete: {
        cs: async (): Promise<string[]> => {
            const response = await axios.get(
                `${API_BASE}${API_PREFIX}/autocomplete/cs`
            );
            return response.data.options;
        },

        contratista: async (cs?: string): Promise<string[]> => {
            const params = cs ? `?cs=${cs}` : '';
            const response = await axios.get(
                `${API_BASE}${API_PREFIX}/autocomplete/contratista${params}`
            );
            return response.data.options;
        },

        tipo: async (): Promise<string[]> => {
            const response = await axios.get(
                `${API_BASE}${API_PREFIX}/autocomplete/tipo`
            );
            return response.data.options;
        }
    }
};
