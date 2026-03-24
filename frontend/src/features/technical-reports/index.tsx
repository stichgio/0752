import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileDown, Files } from 'lucide-react';
import { toast } from 'sonner';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { TechnicalReport, TechnicalReportListItem } from './types';
import { technicalReportsApi } from './api';
import html2canvas from 'html2canvas';
import LoadingModal from '@/components/ui/LoadingModal';
import { useConfirmDialog } from '@/components/ui';
import { useFocusMode } from '@/hooks/useFocusMode';
import { useLocalDraft } from '@/hooks/useLocalDraft';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSSEProgress } from '@/hooks/useSSEProgress';
import { downloadByUrl, extractHttpErrorMessage, HTTP_TIMEOUTS } from '@/utils/apiClient';
import { downloadBlob } from '@/utils/downloadBlob';

export default function TechnicalReports() {
    const [reports, setReports] = useState<TechnicalReportListItem[]>([]);
    const {
        formData, setFormData,
        selectedId: selectedReportId, setSelectedId: setSelectedReportId,
        hasUnsavedChanges, setHasUnsavedChanges,
    } = useLocalDraft<TechnicalReport>('current_report_draft');
    const { isLoading, loadingMessage, run } = useAsyncAction();
    const sseProgress = useSSEProgress();
    const confirmDialog = useConfirmDialog();

    const [logoLeft, setLogoLeft] = useState<File | null>(null);
    const [logoRight, setLogoRight] = useState<File | null>(null);

    useEffect(() => {
        void loadReports();
    }, []);

    const loadReports = async () => {
        await run(async () => {
            const data = await technicalReportsApi.getAllReports(undefined, true);
            setReports(data.reports || []);
        });
    };

    const handleReportSelect = async (reportId: string) => {
        if (hasUnsavedChanges) {
            const shouldSave = await confirmDialog({
                title: '¿Guardar cambios antes de continuar?',
                description: 'Se guardará el informe actual antes de cargar otro registro.',
                confirmLabel: 'Guardar y continuar',
                cancelLabel: 'Seguir editando',
            });
            if (!shouldSave) return;
            await handleSaveChanges();
        }

        try {
            const report = await technicalReportsApi.getReport(reportId);
            setFormData(report);
            setSelectedReportId(reportId);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error cargando informe');
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
            toast.error('Error guardando');
        }
    };

    const handleImportCSV = async (file: File) => {
        await run(async () => {
            const result = await technicalReportsApi.importCSV(file);
            const freshData = await technicalReportsApi.getAllReports(undefined, true);
            setReports(freshData.reports || []);
            toast.success(`${result.imported_count} informes importados`);
        }, { onError: (msg) => toast.error(`Error importando archivo: ${msg}`) });
    };

    const handleClearAllReports = async () => {
        const confirmed = await confirmDialog({
            title: '¿Eliminar todos los informes?',
            description: 'Esta acción eliminará todos los informes de la base de datos de forma permanente y no se puede deshacer.',
            confirmLabel: 'Eliminar todo',
            cancelLabel: 'Cancelar',
            tone: 'danger',
        });
        if (!confirmed) return;

        await run(async () => {
            await technicalReportsApi.deleteAllReports();
            await loadReports();
            setFormData(null);
            setSelectedReportId(null);
            setHasUnsavedChanges(false);
        }, { onError: (msg) => toast.error(`Error eliminando informes: ${msg}`) });
    };

    const handleDownloadPDF = async () => {
        if (!selectedReportId || !formData) return;
        await run(
            async () => {
                const blob = await technicalReportsApi.generatePDF(formData, [], logoLeft, logoRight);
                downloadBlob(blob, `informe_${selectedReportId}.pdf`);
            },
            { message: 'Generando PDF...', onError: (msg) => toast.error(`Error generando PDF: ${msg}`) }
        );
    };

    const handleDownloadImage = async () => {
        const element = document.getElementById('technical-report-preview');
        if (!element || !selectedReportId || !formData) return;

        await run(
            async () => {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                });
                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `informe_${selectedReportId}.png`;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                link.remove();
            },
            { message: 'Capturando imagen...', onError: (msg) => toast.error(`Error descargando imagen: ${msg}`) }
        );
    };

    const handleDownloadConsolidatedPDF = async () => {
        if (reports.length === 0) {
            toast.info('No hay informes para exportar');
            return;
        }

        const confirmed = await confirmDialog({
            title: '¿Generar PDF consolidado?',
            description: `Se generará un PDF consolidado con ${reports.length} informes. Esto puede tomar varios minutos.`,
            confirmLabel: 'Generar PDF',
            cancelLabel: 'Cancelar',
        });
        if (!confirmed) return;

        const formData = new FormData();
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        sseProgress.run('/api/technical-reports/generate-consolidated-pdf-progress', formData, {
            onComplete: async (downloadUrl: string) => {
                try {
                    const response = await downloadByUrl(downloadUrl, {
                        timeout: HTTP_TIMEOUTS.NONE,
                    });
                    downloadBlob(response.data, `informes_tecnicos_consolidado_${reports.length}.pdf`);
                } catch (err: unknown) {
                    const message = await extractHttpErrorMessage(err);
                    toast.error(`Error descargando PDF: ${message}`);
                }
            },
            onError: async (_errMsg: string) => {
                console.warn('SSE failed, falling back');
                await run(
                    async () => {
                        const blob = await technicalReportsApi.generateConsolidatedPDF(logoLeft, logoRight);
                        downloadBlob(blob, `informes_tecnicos_consolidado_${reports.length}.pdf`);
                    },
                    {
                        message: `Generando PDF consolidado (${reports.length} informes)...`,
                        onError: (msg) => toast.error(`Error generando PDF consolidado: ${msg}`),
                    }
                );
            },
        });
    };

    const currentIndex = reports.findIndex((report) => report.id === selectedReportId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < reports.length - 1;

    const isFocusMode = useFocusMode({
        onPrev: () => canPrev && void handleReportSelect(reports[currentIndex - 1].id),
        onNext: () => canNext && void handleReportSelect(reports[currentIndex + 1].id),
    });

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            <div className={`bg-[#0d0d0d] border-b border-[#333] px-6 py-4 transition-all duration-300 ${isFocusMode ? '-mt-[80px]' : ''}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-[#888] hover:text-[#eee] transition-colors">
                            <ChevronLeft size={24} />
                        </Link>
                        <h1 className="text-2xl font-bold font-mono tracking-wide text-[#eee] uppercase">
                            Generador de Informes Técnicos
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => canPrev && void handleReportSelect(reports[currentIndex - 1].id)} disabled={!canPrev} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                            <ChevronLeft size={16} />
                            Anterior
                        </button>
                        <span className="text-sm text-[#888] font-mono min-w-[80px] text-center">{selectedReportId ? `${currentIndex + 1} de ${reports.length}` : '-'}</span>
                        <button onClick={() => canNext && void handleReportSelect(reports[currentIndex + 1].id)} disabled={!canNext} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
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

            <div className={`grid transition-all duration-300 ease-in-out h-[calc(100vh-80px)] overflow-hidden ${isFocusMode
                ? 'grid-cols-[0px_1fr_0px] gap-0 p-0 h-screen'
                : 'grid-cols-[300px_1fr_400px] gap-6 p-6'
            }`}>
                <div className={`h-full overflow-y-auto pr-2 transition-opacity duration-300 ${isFocusMode ? 'invisible opacity-0' : 'visible opacity-100'}`}>
                    <DatabasePanel reports={reports} selectedReportId={selectedReportId} onReportSelect={handleReportSelect} onImportCSV={handleImportCSV} onReload={loadReports} onClearAll={handleClearAllReports} />
                </div>

                <PreviewPanel reportData={formData} zoom={100} logoLeft={logoLeft} logoRight={logoRight} />

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
            {isFocusMode && (
                <>
                    <button
                        onClick={() => canPrev && void handleReportSelect(reports[currentIndex - 1].id)}
                        disabled={!canPrev}
                        className={`fixed left-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canPrev ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Informe anterior"
                    >
                        <ChevronLeft size={80} strokeWidth={1.5} />
                    </button>

                    <button
                        onClick={() => canNext && void handleReportSelect(reports[currentIndex + 1].id)}
                        disabled={!canNext}
                        className={`fixed right-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canNext ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Siguiente informe"
                    >
                        <ChevronRight size={80} strokeWidth={1.5} />
                    </button>

                    <div className="fixed top-4 right-4 z-[100] text-white/30 text-xs font-mono pointer-events-none select-none">
                        MODO FOCUS (CTRL + .)
                    </div>
                </>
            )}

            {(isLoading || sseProgress.isLoading) && (
                <LoadingModal
                    message={sseProgress.isLoading ? `Generando PDF consolidado (${reports.length} informes)...` : loadingMessage}
                    accentColor="#D71921"
                    progress={sseProgress.isLoading ? sseProgress.progress : null}
                />
            )}
        </div>
    );
}
