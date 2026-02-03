import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Files } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { FichaTecnica } from './types';
import { fichasTecnicasApi } from './api';

const STORAGE_KEY = 'current_ficha_draft';

export default function FichasTecnicas() {
    const [fichas, setFichas] = useState<FichaTecnica[]>([]);
    const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<FichaTecnica | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Procesando...');

    const [logoLeft, setLogoLeft] = useState<File | null>(null);
    const [logoRight, setLogoRight] = useState<File | null>(null);

    // Cargar borrador desde localStorage al iniciar
    useEffect(() => {
        loadFichas();
        const savedDraft = localStorage.getItem(STORAGE_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setFormData(parsed.formData);
                setSelectedFichaId(parsed.selectedFichaId);
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
                selectedFichaId,
                hasUnsavedChanges
            }));
        }
    }, [formData, selectedFichaId, hasUnsavedChanges]);

    const loadFichas = async () => {
        setIsLoading(true);
        try {
            const data = await fichasTecnicasApi.getAllFichas();
            console.log('[FichasTecnicas] Loaded fichas:', data.fichas?.length, 'total:', data.total);
            setFichas(data.fichas || []);
        } catch (error) {
            console.error('Error loading fichas:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFichaSelect = async (fichaId: string) => {
        if (hasUnsavedChanges && !window.confirm('¿Guardar cambios?')) return;
        if (hasUnsavedChanges) await handleSaveChanges();

        try {
            const ficha = await fichasTecnicasApi.getFicha(fichaId);
            setFormData(ficha);
            setSelectedFichaId(fichaId);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('Error:', error);
            alert('Error cargando ficha');
        }
    };

    const handleFormChange = (data: Partial<FichaTecnica>) => {
        if (formData) {
            setFormData({ ...formData, ...data });
            setHasUnsavedChanges(true);
        }
    };

    const handleSaveChanges = async () => {
        if (!formData || !selectedFichaId) return;
        try {
            await fichasTecnicasApi.updateFicha(selectedFichaId, formData);
            setHasUnsavedChanges(false);
            await loadFichas();
        } catch (error) {
            console.error('Error:', error);
            alert('Error guardando');
        }
    };

    const handleImportFile = async (file: File) => {
        setIsLoading(true);
        setLoadingMessage('Importando archivo...');
        try {
            const result = await fichasTecnicasApi.importFile(file);
            console.log('[FichasTecnicas] Import result:', result);

            const freshData = await fichasTecnicasApi.getAllFichas();
            console.log('[FichasTecnicas] Fresh fichas count:', freshData.fichas?.length);
            setFichas(freshData.fichas || []);

            alert(`${result.imported_count} fichas importadas`);
        } catch (error: any) {
            console.error('Error importing file:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error importando archivo: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleClearAllFichas = async () => {
        if (window.confirm('¿ESTÁ SEGURO? \n\nEsto eliminará TODAS las fichas de la base de datos permanentemente.\nEsta acción no se puede deshacer.')) {
            setIsLoading(true);
            try {
                await fichasTecnicasApi.deleteAllFichas();
                await loadFichas();
                setFormData(null);
                setSelectedFichaId(null);
                setHasUnsavedChanges(false);
            } catch (error) {
                console.error('Error clearing fichas:', error);
                alert('Error eliminando fichas');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDownloadConsolidatedPDF = async () => {
        if (fichas.length === 0) {
            alert('No hay fichas para exportar');
            return;
        }

        const confirmed = window.confirm(
            `¿Desea generar un PDF consolidado con las ${fichas.length} fichas?\n\nEsto puede tomar varios minutos dependiendo de la cantidad de fichas.`
        );

        if (!confirmed) return;

        setIsLoading(true);
        setLoadingMessage(`Generando PDF consolidado (${fichas.length} fichas)...`);

        try {
            const blob = await fichasTecnicasApi.generateConsolidatedPDF(logoLeft, logoRight);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fichas_tecnicas_consolidado_${fichas.length}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error('Error generating consolidated PDF:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando PDF consolidado: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedFichaId) {
            handleDownloadTemplatePDF();
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Generando PDF...');

        try {
            const blob = await fichasTecnicasApi.generatePDF(selectedFichaId, logoLeft, logoRight);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ficha_tecnica_${selectedFichaId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error('Error generating PDF:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando PDF: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadTemplatePDF = async () => {
        setIsLoading(true);
        setLoadingMessage('Generando plantilla PDF...');

        try {
            const blob = await fichasTecnicasApi.generateTemplatePDF(logoLeft, logoRight);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `plantilla_ficha_tecnica.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error('Error generating template PDF:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando plantilla PDF: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const currentIndex = fichas.findIndex(f => f.id === selectedFichaId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < fichas.length - 1;

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            <div className="bg-[#0d0d0d] border-b border-[#333] px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a href="/" className="text-[#888] hover:text-[#eee] transition-colors">
                            <ChevronLeft size={24} />
                        </a>
                        <h1 className="text-2xl font-bold font-mono tracking-wide text-[#eee] uppercase">
                            Fichas Técnicas de Evaluación
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => canPrev && handleFichaSelect(fichas[currentIndex - 1].id)} disabled={!canPrev} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                            <ChevronLeft size={16} />
                            Anterior
                        </button>
                        <span className="text-sm text-[#888] font-mono min-w-[80px] text-center">{selectedFichaId ? `${currentIndex + 1} de ${fichas.length}` : '-'}</span>
                        <button onClick={() => canNext && handleFichaSelect(fichas[currentIndex + 1].id)} disabled={!canNext} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                            Siguiente
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={isLoading}
                            className="btn-red flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={selectedFichaId ? "Descargar PDF de la ficha actual" : "Descargar plantilla en blanco"}
                        >
                            <FileDown size={16} />
                            {selectedFichaId ? 'Descargar PDF' : 'Descargar Plantilla'}
                        </button>
                        <button
                            onClick={handleDownloadConsolidatedPDF}
                            disabled={fichas.length === 0 || isLoading}
                            className="btn-red flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`Descargar PDF consolidado con ${fichas.length} fichas`}
                        >
                            <Files size={16} />
                            PDF Consolidado
                        </button>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-[300px_1fr_400px] gap-6 p-6 h-[calc(100vh-80px)] overflow-hidden">
                {/* Columna Izquierda: Base de Datos */}
                <div className="h-full overflow-y-auto pr-2">
                    <DatabasePanel fichas={fichas} selectedFichaId={selectedFichaId} onFichaSelect={handleFichaSelect} onImportFile={handleImportFile} onReload={loadFichas} onClearAll={handleClearAllFichas} />
                </div>
                {/* Columna Central: Vista Previa */}
                <PreviewPanel fichaData={formData} logoLeft={logoLeft} logoRight={logoRight} />
                {/* Columna Derecha: Formulario */}
                <div className="h-full overflow-y-auto pl-2">
                    <FormPanel
                        fichaData={formData}
                        onChange={handleFormChange}
                        onSave={handleSaveChanges}
                        hasUnsavedChanges={hasUnsavedChanges}
                        logoLeft={logoLeft}
                        logoRight={logoRight}
                        onLogoLeftChange={setLogoLeft}
                        onLogoRightChange={setLogoRight}
                    />
                </div>
            </div>
            {isLoading && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-[#111] border border-[#333] rounded-lg p-8 flex flex-col items-center min-w-[300px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00a0b0] mx-auto"></div>
                        <p className="mt-4 text-[#eee] font-mono text-center">{loadingMessage}</p>
                        <p className="mt-2 text-[#666] text-xs">Por favor espere...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
