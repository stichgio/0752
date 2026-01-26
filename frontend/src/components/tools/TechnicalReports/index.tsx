import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { TechnicalReport } from './types';
import { technicalReportsApi } from './api';

export default function TechnicalReports() {
    const [reports, setReports] = useState<TechnicalReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [formData, setFormData] = useState<TechnicalReport | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [selectedImages, setSelectedImages] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => { loadReports(); }, []);

    const loadReports = async () => {
        setIsLoading(true);
        try {
            const data = await technicalReportsApi.getAllReports();
            setReports(data.reports);
        } catch (error) {
            console.error('Error:', error);
            // alert('Error cargando informes'); // Removed alert to avoid spam on initial load if empty
        } finally {
            setIsLoading(false);
        }
    };

    const handleReportSelect = async (reportId: string) => {
        if (hasUnsavedChanges && !window.confirm('¿Guardar cambios?')) return;
        if (hasUnsavedChanges) await handleSaveChanges();

        try {
            const report = await technicalReportsApi.getReport(reportId);
            setFormData(report);
            setSelectedReportId(reportId);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('Error:', error);
            alert('Error cargando informe');
        }
    };

    const handleFormChange = (data: Partial<TechnicalReport>) => {
        if (formData) {
            setFormData({ ...formData, ...data });
            setHasUnsavedChanges(true);
        }
    };

    const handleSaveChanges = async () => {
        if (!formData || !selectedReportId) return;
        try {
            await technicalReportsApi.updateReport(selectedReportId, formData);
            setHasUnsavedChanges(false);
            await loadReports();
        } catch (error) {
            console.error('Error:', error);
            alert('Error guardando');
        }
    };

    const handleImportCSV = async (file: File) => {
        setIsLoading(true);
        try {
            const result = await technicalReportsApi.importCSV(file);
            await loadReports();
            alert(`✅ ${result.imported_count} informes importados`);
        } catch (error) {
            console.error('Error:', error);
            alert('Error importando CSV');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedReportId || !formData) return;
        setIsLoading(true);
        try {
            const blob = await technicalReportsApi.generatePDF(formData, selectedImages);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `informe_${selectedReportId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error:', error);
            alert('Error generando PDF');
        } finally {
            setIsLoading(false);
        }
    };

    const currentIndex = reports.findIndex(r => r.id === selectedReportId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < reports.length - 1;

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            <div className="bg-[#0d0d0d] border-b border-[#333] px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a href="/" className="text-[#888] hover:text-[#eee] transition-colors">
                            <ChevronLeft size={24} />
                        </a>
                        <h1 className="text-2xl font-bold font-mono tracking-wide text-[#eee] uppercase">
                            Generador de Informes Técnicos
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={() => canPrev && handleReportSelect(reports[currentIndex - 1].id)} disabled={!canPrev} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                            <ChevronLeft size={16} />
                            Anterior
                        </button>
                        <span className="text-sm text-[#888] font-mono min-w-[80px] text-center">{selectedReportId ? `${currentIndex + 1} de ${reports.length}` : '-'}</span>
                        <button onClick={() => canNext && handleReportSelect(reports[currentIndex + 1].id)} disabled={!canNext} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                            Siguiente
                            <ChevronRight size={16} />
                        </button>
                        <button onClick={handleDownloadPDF} disabled={!selectedReportId} className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <FileDown size={16} />
                            Descargar PDF
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[300px_1fr_400px] gap-6 p-6 h-[calc(100vh-80px)]">
                <DatabasePanel reports={reports} selectedReportId={selectedReportId} onReportSelect={handleReportSelect} onImportCSV={handleImportCSV} onReload={loadReports} />
                <PreviewPanel reportData={formData} zoom={100} />
                <FormPanel
                    reportData={formData}
                    onChange={handleFormChange}
                    onSave={handleSaveChanges}
                    hasUnsavedChanges={hasUnsavedChanges}
                    selectedImages={selectedImages}
                    onImageSelect={setSelectedImages}
                />
            </div>

            {isLoading && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-[#111] border border-[#333] rounded-lg p-6 flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D71921] mx-auto"></div>
                        <p className="mt-4 text-[#eee] font-mono">Procesando...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
