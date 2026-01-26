import React, { useState, useEffect } from 'react';
import { Upload, Save, FileDown, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { TechnicalReport } from './types';
import { technicalReportsApi } from './api';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import '../../../technical-theme.css';

export default function TechnicalReports() {
    const [reports, setReports] = useState<TechnicalReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [formData, setFormData] = useState<TechnicalReport | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cargar reportes al montar
    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await technicalReportsApi.getReports();
            setReports(data.reports);
        } catch (err) {
            setError('Error cargando reportes');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReportSelect = async (reportId: string) => {
        // Guardar cambios del reporte actual si hay
        if (hasUnsavedChanges && selectedReportId) {
            const shouldSave = window.confirm('¿Guardar cambios antes de cambiar de reporte?');
            if (shouldSave) {
                await handleSaveChanges();
            }
        }

        // Cargar nuevo reporte
        setIsLoading(true);
        try {
            const report = await technicalReportsApi.getReport(reportId);
            setFormData(report);
            setSelectedReportId(reportId);
            setHasUnsavedChanges(false);
        } catch (err) {
            setError('Error cargando reporte');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormChange = (updatedData: Partial<TechnicalReport>) => {
        if (formData) {
            setFormData({ ...formData, ...updatedData });
            setHasUnsavedChanges(true);
        }
    };

    const handleSaveChanges = async () => {
        if (!formData || !selectedReportId) return;

        setIsLoading(true);
        try {
            await technicalReportsApi.updateReport(selectedReportId, formData);
            setHasUnsavedChanges(false);
            await loadReports();
        } catch (err) {
            setError('Error guardando cambios');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImportCSV = async (file: File) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await technicalReportsApi.importCSV(file);
            console.log('Import result:', result);

            if (result.errors && result.errors.length > 0) {
                setError(`Importado con ${result.errors.length} errores`);
                console.error('Import errors:', result.errors);
            } else {
                alert(`✅ ${result.imported_count} informes importados exitosamente`);
            }

            await loadReports();

            // Si se importó al menos 1, seleccionar el primero automáticamente
            if (result.created_ids && result.created_ids.length > 0) {
                await handleReportSelect(result.created_ids[0]);
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
            setError('Error importando CSV: ' + errorMsg);
            console.error('Import error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedReportId) return;

        setIsLoading(true);
        try {
            await technicalReportsApi.downloadPDF(selectedReportId);
        } catch (err) {
            setError('Error generando PDF');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // Navegación
    const currentIndex = reports.findIndex(r => r.id === selectedReportId);
    const canGoPrevious = currentIndex > 0;
    const canGoNext = currentIndex < reports.length - 1;

    const handlePrevious = () => {
        if (canGoPrevious) {
            handleReportSelect(reports[currentIndex - 1].id);
        }
    };

    const handleNext = () => {
        if (canGoNext) {
            handleReportSelect(reports[currentIndex + 1].id);
        }
    };



    return (
        <div className="min-h-screen bg-gray-50 technical-theme">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a
                            href="/"
                            className="text-gray-500 hover:text-gray-900 transition-colors"
                            title="Volver a Inicio"
                        >
                            <ChevronLeft size={24} />
                        </a>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Generador de Informes Técnicos
                        </h1>
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePrevious}
                            disabled={!canGoPrevious || isLoading}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                        >
                            <ChevronLeft size={20} />
                            Anterior
                        </button>

                        <span className="text-sm text-gray-600 min-w-[80px] text-center">
                            {selectedReportId ? `${currentIndex + 1} de ${reports.length}` : '-'}
                        </span>

                        <button
                            onClick={handleNext}
                            disabled={!canGoNext || isLoading}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                        >
                            Siguiente
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {hasUnsavedChanges && (
                            <button
                                onClick={handleSaveChanges}
                                disabled={isLoading}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Save size={20} />
                                Guardar Cambios
                            </button>
                        )}

                        <button
                            onClick={handleDownloadPDF}
                            disabled={!selectedReportId || isLoading}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <FileDown size={20} />
                            Descargar PDF
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                        <AlertCircle className="text-red-600" size={20} />
                        <span className="text-red-800 text-sm">{error}</span>
                        <button
                            onClick={() => setError(null)}
                            className="ml-auto text-red-600 hover:text-red-800"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Main Layout: 3 Columns */}
            <div className="grid grid-cols-[320px_1fr_400px] gap-6 p-6 h-[calc(100vh-100px)]">
                {/* Left Panel */}
                <DatabasePanel
                    reports={reports}
                    selectedReportId={selectedReportId}
                    onReportSelect={handleReportSelect}
                    onImportCSV={handleImportCSV}
                    onReload={loadReports}
                    isLoading={isLoading}
                />

                {/* Center Panel */}
                <PreviewPanel
                    reportData={formData}
                    isLoading={isLoading}
                />

                {/* Right Panel */}
                <FormPanel
                    reportData={formData}
                    onChange={handleFormChange}
                    onSave={handleSaveChanges}
                    hasUnsavedChanges={hasUnsavedChanges}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
}
