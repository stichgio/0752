import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Files } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { TechnicalReport } from './types';
import { technicalReportsApi } from './api';
import html2canvas from 'html2canvas';
import LoadingModal from '@/components/common/LoadingModal';
import { useFocusMode } from '@/hooks/useFocusMode';
import { downloadBlob } from '@/utils/downloadBlob';

const STORAGE_KEY = 'current_report_draft';

export default function TechnicalReports() {
    const [reports, setReports] = useState<TechnicalReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [formData, setFormData] = useState<TechnicalReport | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Procesando...');

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
        } catch (error: any) {
            console.error('Error importing file:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error importando archivo: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearAllReports = async () => {
        if (window.confirm('⚠️ ¿ESTÁ SEGURO? \n\nEsto eliminará TODOS los informes de la base de datos permanentemente.\nEsta acción no se puede deshacer.')) {
            setIsLoading(true);
            try {
                await technicalReportsApi.deleteAllReports();
                await loadReports();
                setFormData(null);
                setSelectedReportId(null);
                setHasUnsavedChanges(false);
            } catch (error) {
                console.error('Error clearing reports:', error);
                alert('Error eliminando informes');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedReportId || !formData) return;
        setIsLoading(true);
        setLoadingMessage('Generando PDF...');
        try {
            // Pass empty array for images as per new requirement
            const blob = await technicalReportsApi.generatePDF(formData, [], logoLeft, logoRight);
            downloadBlob(blob, `informe_${selectedReportId}.pdf`);
        } catch (error: any) {
            console.error('Error:', error);
            const msg = error.response?.data?.detail?.message || error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando PDF: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadImage = async () => {
        const element = document.getElementById('technical-report-preview');
        if (!element || !selectedReportId) return;

        setIsLoading(true);
        setLoadingMessage('Capturando imagen...');
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
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadConsolidatedPDF = async () => {
        if (reports.length === 0) {
            alert('No hay informes para exportar');
            return;
        }

        const confirmed = window.confirm(
            `¿Desea generar un PDF consolidado con los ${reports.length} informes?\n\nEsto puede tomar varios minutos dependiendo de la cantidad de informes.`
        );

        if (!confirmed) return;

        setIsLoading(true);
        setLoadingMessage(`Generando PDF consolidado (${reports.length} informes)...`);

        try {
            const blob = await technicalReportsApi.generateConsolidatedPDF(logoLeft, logoRight);
            downloadBlob(blob, `informes_tecnicos_consolidado_${reports.length}.pdf`);
        } catch (error: any) {
            console.error('Error generating consolidated PDF:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando PDF consolidado: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const isFocusMode = useFocusMode();

    const currentIndex = reports.findIndex(r => r.id === selectedReportId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < reports.length - 1;

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            <div className={`bg-[#0d0d0d] border-b border-[#333] px-6 py-4 transition-all duration-300 ${isFocusMode ? '-mt-[80px]' : ''}`}>
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
                        <button onClick={handleDownloadPDF} disabled={!selectedReportId || isLoading} className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <FileDown size={16} />
                            Descargar PDF
                        </button>
                        <button
                            onClick={handleDownloadConsolidatedPDF}
                            disabled={reports.length === 0 || isLoading}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white border-blue-500"
                            title={`Descargar PDF consolidado con ${reports.length} informes`}
                        >
                            <Files size={16} />
                            PDF Consolidado
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Layout Grid - Adjusted for Focus Mode */}
            <div className={`grid transition-all duration-300 ease-in-out h-[calc(100vh-80px)] overflow-hidden ${isFocusMode
                ? 'grid-cols-[0px_1fr_0px] gap-0 p-0 h-screen'
                : 'grid-cols-[300px_1fr_400px] gap-6 p-6'
                }`}>
                {/* Columna Izquierda: Scroll Independiente */}
                <div className={`h-full overflow-y-auto pr-2 transition-opacity duration-300 ${isFocusMode ? 'invisible opacity-0' : 'visible opacity-100'}`}>
                    <DatabasePanel reports={reports} selectedReportId={selectedReportId} onReportSelect={handleReportSelect} onImportCSV={handleImportCSV} onReload={loadReports} onClearAll={handleClearAllReports} />
                </div>

                {/* Columna Central */}
                <PreviewPanel reportData={formData} zoom={100} logoLeft={logoLeft} logoRight={logoRight} />

                {/* Columna Derecha: Scroll Independiente */}
                <div className={`h-full overflow-y-auto pl-2 transition-opacity duration-300 ${isFocusMode ? 'invisible opacity-0' : 'visible opacity-100'}`}>
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
            </div>
            {/* Navigation Buttons for Focus Mode */}
            {isFocusMode && (
                <>
                    <button
                        onClick={() => canPrev && handleReportSelect(reports[currentIndex - 1].id)}
                        disabled={!canPrev}
                        className={`fixed left-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canPrev ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Informe Anterior"
                    >
                        <ChevronLeft size={80} strokeWidth={1.5} />
                    </button>

                    <button
                        onClick={() => canNext && handleReportSelect(reports[currentIndex + 1].id)}
                        disabled={!canNext}
                        className={`fixed right-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canNext ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Siguiente Informe"
                    >
                        <ChevronRight size={80} strokeWidth={1.5} />
                    </button>

                    {/* Exit hint */}
                    <div className="fixed top-4 right-4 z-[100] text-white/30 text-xs font-mono pointer-events-none select-none">
                        MODO FOCUS (CTRL + .)
                    </div>
                </>
            )}

            {isLoading && <LoadingModal message={loadingMessage} accentColor="#D71921" />}
        </div>
    );
}