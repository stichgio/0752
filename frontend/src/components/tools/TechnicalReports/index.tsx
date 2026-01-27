import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Trash2 } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { TechnicalReport } from './types';
import { technicalReportsApi } from './api';
import html2canvas from 'html2canvas';

const STORAGE_KEY = 'current_report_draft';

export default function TechnicalReports() {
    const [reports, setReports] = useState<TechnicalReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [formData, setFormData] = useState<TechnicalReport | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [logoLeft, setLogoLeft] = useState<File | null>(null);
    const [logoRight, setLogoRight] = useState<File | null>(null);

    // Cargar borrador desde localStorage al iniciar
    useEffect(() => {
        loadReports();
        const savedDraft = localStorage.getItem(STORAGE_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setFormData(parsed.formData);
                setSelectedReportId(parsed.selectedReportId);
                setHasUnsavedChanges(parsed.hasUnsavedChanges || false);
            } catch (e) {
                console.error('Error loading draft:', e);
            }
        }
    }, []);

    // Guardar borrador en localStorage cuando cambia formData
    useEffect(() => {
        if (formData) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                formData,
                selectedReportId,
                hasUnsavedChanges
            }));
        }
    }, [formData, selectedReportId, hasUnsavedChanges]);

    // Función para limpiar borrador
    const handleClearDraft = () => {
        if (window.confirm('¿Limpiar borrador actual? Los cambios no guardados se perderán.')) {
            localStorage.removeItem(STORAGE_KEY);
            setFormData(null);
            setSelectedReportId(null);
            setHasUnsavedChanges(false);
        }
    };

    const loadReports = async () => {
        setIsLoading(true);
        try {
            const data = await technicalReportsApi.getAllReports();
            console.log('[TechReports] Loaded reports:', data.reports?.length, 'total:', data.total);
            setReports(data.reports || []);
        } catch (error) {
            console.error('Error loading reports:', error);
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
            console.log('[TechReports] Import result:', result);

            // Reload reports from server to get fresh data
            const freshData = await technicalReportsApi.getAllReports();
            console.log('[TechReports] Fresh reports count:', freshData.reports?.length);
            setReports(freshData.reports || []);

            alert(`✅ ${result.imported_count} informes importados`);
        } catch (error) {
            console.error('Error importing CSV:', error);
            alert('Error importando CSV');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedReportId || !formData) return;
        setIsLoading(true);
        try {
            // Pass empty array for images as per new requirement
            const blob = await technicalReportsApi.generatePDF(formData, [], logoLeft, logoRight);
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

    const handleDownloadImage = async () => {
        const element = document.getElementById('technical-report-preview');
        if (!element || !selectedReportId) return;

        setIsLoading(true);
        try {
            // Capture at slightly higher scale for better quality
            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true // Important for external images/logos
            });

            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `informe_${selectedReportId}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error creating image:', error);
            alert('Error descargando imagen');
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
                        <button onClick={handleClearDraft} disabled={!formData} className="btn-secondary flex items-center gap-2 disabled:opacity-50 text-red-400 hover:text-red-300" title="Limpiar borrador actual">
                            <Trash2 size={16} />
                            Nuevo
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[300px_1fr_400px] gap-6 p-6 h-[calc(100vh-80px)]">
                <DatabasePanel reports={reports} selectedReportId={selectedReportId} onReportSelect={handleReportSelect} onImportCSV={handleImportCSV} onReload={loadReports} />
                <PreviewPanel reportData={formData} zoom={100} logoLeft={logoLeft} logoRight={logoRight} />
                <FormPanel
                    reportData={formData}
                    onChange={handleFormChange}
                    onSave={handleSaveChanges}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onDownloadImage={handleDownloadImage}
                    logoLeft={logoLeft}
                    logoRight={logoRight}
                    onLogoLeftChange={setLogoLeft}
                    onLogoRightChange={setLogoRight}
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
