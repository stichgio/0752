import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Files, FileText } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { FichaTecnica } from './types';
import { fichasTecnicasApi } from './api';
import LoadingModal from '@/components/common/LoadingModal';
import { useFocusMode } from '@/hooks/useFocusMode';
import { downloadBlob } from '@/utils/downloadBlob';

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
            downloadBlob(blob, `fichas_tecnicas_consolidado_${fichas.length}.pdf`);
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
            downloadBlob(blob, `ficha_tecnica_${selectedFichaId}.pdf`);
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
            downloadBlob(blob, `plantilla_ficha_tecnica.pdf`);
        } catch (error: any) {
            console.error('Error generating template PDF:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando plantilla PDF: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadDOCX = async () => {
        if (!selectedFichaId) {
            alert('Seleccione una ficha para exportar a Word');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Generando Word...');

        try {
            const blob = await fichasTecnicasApi.generateDOCX(selectedFichaId, logoLeft, logoRight);
            downloadBlob(blob, `ficha_tecnica_${selectedFichaId}.docx`);
        } catch (error: any) {
            console.error('Error generating DOCX:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando Word: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const handleDownloadConsolidatedDOCX = async () => {
        if (fichas.length === 0) {
            alert('No hay fichas para exportar');
            return;
        }

        const confirmed = window.confirm(
            `¿Desea generar documentos Word para las ${fichas.length} fichas?\n\nSe descargará un archivo ZIP con todos los documentos .docx.`
        );

        if (!confirmed) return;

        setIsLoading(true);
        setLoadingMessage(`Generando Word consolidado (${fichas.length} fichas)...`);

        try {
            const blob = await fichasTecnicasApi.generateConsolidatedDOCX(logoLeft, logoRight);
            downloadBlob(blob, `fichas_tecnicas_${fichas.length}_docx.zip`);
        } catch (error: any) {
            console.error('Error generating consolidated DOCX:', error);
            const msg = error.response?.data?.detail || error.message || 'Error desconocido';
            alert(`Error generando Word consolidado: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Procesando...');
        }
    };

    const isFocusMode = useFocusMode();

    const currentIndex = fichas.findIndex(f => f.id === selectedFichaId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < fichas.length - 1;

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] technical-theme">
            <div className={`bg-[#0d0d0d] border-b border-[#333] px-6 py-4 transition-all duration-300 ${isFocusMode ? '-mt-[80px]' : ''}`}>
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

                        {/* Separador visual */}
                        <div className="w-px h-6 bg-[#444]"></div>

                        <button
                            onClick={handleDownloadDOCX}
                            disabled={!selectedFichaId || isLoading}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={selectedFichaId ? "Descargar Word de la ficha actual" : "Seleccione una ficha primero"}
                        >
                            <FileText size={16} />
                            Word
                        </button>
                        <button
                            onClick={handleDownloadConsolidatedDOCX}
                            disabled={fichas.length === 0 || isLoading}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`Descargar Word consolidado con ${fichas.length} fichas`}
                        >
                            <Files size={16} />
                            Word Consolidado
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Layout Grid - Adjusted for Focus Mode */}
            <div className={`grid transition-all duration-300 ease-in-out h-[calc(100vh-80px)] overflow-hidden ${isFocusMode
                    ? 'grid-cols-[0px_1fr_0px] gap-0 p-0 h-screen'
                    : 'grid-cols-[300px_1fr_400px] gap-6 p-6'
                }`}>
                {/* Columna Izquierda: Base de Datos */}
                <div className={`h-full overflow-y-auto pr-2 transition-opacity duration-300 ${isFocusMode ? 'invisible opacity-0' : 'visible opacity-100'}`}>
                    <DatabasePanel fichas={fichas} selectedFichaId={selectedFichaId} onFichaSelect={handleFichaSelect} onImportFile={handleImportFile} onReload={loadFichas} onClearAll={handleClearAllFichas} />
                </div>

                {/* Columna Central: Vista Previa */}
                <PreviewPanel fichaData={formData} logoLeft={logoLeft} logoRight={logoRight} />

                {/* Columna Derecha: Formulario */}
                <div className={`h-full overflow-y-auto pl-2 transition-opacity duration-300 ${isFocusMode ? 'invisible opacity-0' : 'visible opacity-100'}`}>
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

            {/* Navigation Buttons for Focus Mode */}
            {isFocusMode && (
                <>
                    <button
                        onClick={() => canPrev && handleFichaSelect(fichas[currentIndex - 1].id)}
                        disabled={!canPrev}
                        className={`fixed left-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canPrev ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Ficha Anterior"
                    >
                        <ChevronLeft size={80} strokeWidth={1.5} />
                    </button>

                    <button
                        onClick={() => canNext && handleFichaSelect(fichas[currentIndex + 1].id)}
                        disabled={!canNext}
                        className={`fixed right-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canNext ? 'text-gray-800 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                        title="Siguiente Ficha"
                    >
                        <ChevronRight size={80} strokeWidth={1.5} />
                    </button>

                    {/* Exit hint */}
                    <div className="fixed top-4 right-4 z-[100] text-white/30 text-xs font-mono pointer-events-none select-none">
                        MODO FOCUS (CTRL + .)
                    </div>
                </>
            )}
            {isLoading && <LoadingModal message={loadingMessage} accentColor="#00a0b0" />}
        </div>
    );
}
