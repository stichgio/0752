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

    const [logoLeft, setLogoLeft] = useState<string | null>(localStorage.getItem('tech_report_logo_left'));
    const [logoRight, setLogoRight] = useState<string | null>(localStorage.getItem('tech_report_logo_right'));

    useEffect(() => {
        if (logoLeft) localStorage.setItem('tech_report_logo_left', logoLeft);
        else localStorage.removeItem('tech_report_logo_left');
    }, [logoLeft]);

    useEffect(() => {
        if (logoRight) localStorage.setItem('tech_report_logo_right', logoRight);
        else localStorage.removeItem('tech_report_logo_right');
    }, [logoRight]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, isLeft: boolean) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                if (isLeft) setLogoLeft(base64String);
                else setLogoRight(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

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
            // Convert base64 logos back to files or let the API handle base64 if it supports it
            // Current API in main.py handles logoLeft/logoRight as UploadFile (multipart)
            // We need to convert base64 strings back to Blobs to send via FormData

            const base64ToBlob = (base64: string) => {
                const parts = base64.split(';base64,');
                const contentType = parts[0].split(':')[1];
                const raw = window.atob(parts[1]);
                const rawLength = raw.length;
                const uInt8Array = new Uint8Array(rawLength);
                for (let i = 0; i < rawLength; ++i) {
                    uInt8Array[i] = raw.charCodeAt(i);
                }
                return new Blob([uInt8Array], { type: contentType });
            };

            const logoLeftBlob = logoLeft ? base64ToBlob(logoLeft) : null;
            const logoRightBlob = logoRight ? base64ToBlob(logoRight) : null;

            const blob = await technicalReportsApi.generatePDF(
                formData,
                selectedImages,
                logoLeftBlob as any,
                logoRightBlob as any
            );
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
                <PreviewPanel reportData={formData} zoom={100} logoLeft={logoLeft} logoRight={logoRight} />

                <div className="flex flex-col gap-6 overflow-hidden">
                    {/* LOGOS CONFIGURATION - ALWAYS VISIBLE AT TOP OF RIGHT PANEL */}
                    <div className="bg-[#111] rounded-lg shadow border border-[#333] p-4">
                        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-[#eee] uppercase tracking-wider">
                            <span className="text-[#D71921]">●</span> Configuración de Logos
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Logo Left */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-[#888] uppercase font-bold">Logo Izquierda</span>
                                <label className="relative aspect-[4/3] border border-dashed border-[#444] rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-[#D71921] hover:bg-[#1a1a1a] transition-all group overflow-hidden">
                                    {logoLeft ? (
                                        <>
                                            <img src={logoLeft} className="w-full h-full object-contain p-2" />
                                            <button
                                                onClick={(e) => { e.preventDefault(); setLogoLeft(null); }}
                                                className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                ×
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-2">
                                            <div className="text-[#444] group-hover:text-[#D71921] mb-1">↑</div>
                                            <span className="text-[9px] text-[#666]">SUBIR</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, true)} />
                                </label>
                            </div>
                            {/* Logo Right */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-[#888] uppercase font-bold">Logo Derecha</span>
                                <label className="relative aspect-[4/3] border border-dashed border-[#444] rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-[#D71921] hover:bg-[#1a1a1a] transition-all group overflow-hidden">
                                    {logoRight ? (
                                        <>
                                            <img src={logoRight} className="w-full h-full object-contain p-2" />
                                            <button
                                                onClick={(e) => { e.preventDefault(); setLogoRight(null); }}
                                                className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                ×
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-2">
                                            <div className="text-[#444] group-hover:text-[#D71921] mb-1">↑</div>
                                            <span className="text-[9px] text-[#666]">SUBIR</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, false)} />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <FormPanel
                            reportData={formData}
                            onChange={handleFormChange}
                            onSave={handleSaveChanges}
                            hasUnsavedChanges={hasUnsavedChanges}
                            selectedImages={selectedImages}
                            onImageSelect={setSelectedImages}
                        />
                    </div>
                </div>
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
