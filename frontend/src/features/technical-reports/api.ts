import { TechnicalReport } from './types';
import { apiClient, appendLogos, postBlob } from '@/utils/apiClient';

export const technicalReportsApi = {
    getAllReports: async (
        filters?: { cs?: string; contratista?: string; status?: string },
        summary = false
    ) => {
        const params = new URLSearchParams();
        if (filters?.cs) params.append('cs', filters.cs);
        if (filters?.contratista) params.append('contratista', filters.contratista);
        if (filters?.status) params.append('status', filters.status);
        if (summary) params.append('summary', 'true');
        const { data } = await apiClient.get(`/api/technical-reports/reports?${params}`);
        return data;
    },

    getReport: async (reportId: string) => {
        const { data } = await apiClient.get(`/api/technical-reports/reports/${reportId}`);
        return data;
    },

    createReport: async (report: TechnicalReport) => {
        const { data } = await apiClient.post('/api/technical-reports/reports', report);
        return data;
    },

    updateReport: async (reportId: string, report: TechnicalReport) => {
        const { data } = await apiClient.put(`/api/technical-reports/reports/${reportId}`, report);
        return data;
    },

    deleteReport: async (reportId: string) => {
        const { data } = await apiClient.delete(`/api/technical-reports/reports/${reportId}`);
        return data;
    },

    deleteAllReports: async () => {
        const { data } = await apiClient.delete('/api/technical-reports/clear-all-reports');
        return data;
    },

    importCSV: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await apiClient.post('/api/technical-reports/import-csv', formData);
        return data;
    },

    generatePDF: async (report: TechnicalReport, images: File[] = [], logoLeft?: File | null, logoRight?: File | null) => {
        const formData = new FormData();
        formData.append('data', JSON.stringify(report));
        images.forEach((file) => formData.append('files', file));
        appendLogos(formData, logoLeft, logoRight);
        formData.append('templateName', 'informe_tecnico.html');
        return postBlob('/api/generate-pdf', formData);
    },

    getCSOptions: async () => {
        const { data } = await apiClient.get('/api/technical-reports/autocomplete/cs');
        return data.options;
    },

    getContratistaOptions: async (cs?: string) => {
        const params = cs ? `?cs=${cs}` : '';
        const { data } = await apiClient.get(`/api/technical-reports/autocomplete/contratista${params}`);
        return data.options;
    },

    generateConsolidatedPDF: async (logoLeft?: File | null, logoRight?: File | null, reportIds?: string[]) => {
        const formData = new FormData();
        appendLogos(formData, logoLeft, logoRight);
        if (reportIds && reportIds.length > 0) {
            formData.append('report_ids', JSON.stringify(reportIds));
        }
        return postBlob('/api/technical-reports/generate-consolidated-pdf', formData, 300000);
    }
};
