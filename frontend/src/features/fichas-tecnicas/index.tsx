import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileDown, Files } from 'lucide-react';
import DatabasePanel from './DatabasePanel';
import PreviewPanel from './PreviewPanel';
import FormPanel from './FormPanel';
import { FichaTecnica, FichaTecnicaListItem } from './types';
import { fichasTecnicasApi } from './api';
import LoadingModal from '@/components/ui/LoadingModal';
import { useFocusMode } from '@/hooks/useFocusMode';
import { useLocalDraft } from '@/hooks/useLocalDraft';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSSEProgress } from '@/hooks/useSSEProgress';
import { getApiBase } from '@/utils/apiBase';
import { downloadBlob } from '@/utils/downloadBlob';

export default function FichasTecnicas() {
    const [fichas, setFichas] = useState<FichaTecnicaListItem[]>([]);
    const {
        formData, setFormData,
        selectedId: selectedFichaId, setSelectedId: setSelectedFichaId,
        hasUnsavedChanges, setHasUnsavedChanges,
    } = useLocalDraft<FichaTecnica>('current_ficha_draft');
    const { isLoading, loadingMessage, run } = useAsyncAction();
    const sseProgress = useSSEProgress();

    const [logoLeft, setLogoLeft] = useState<File | null>(null);
    const [logoRight, setLogoRight] = useState<File | null>(null);

    useEffect(() => {
        loadFichas();
    }, []);

    const loadFichas = async () => {
        await run(async () => {
            const data = await fichasTecnicasApi.getAllFichas(undefined, true);
            setFichas(data.fichas || []);
        });
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
        await run(async () => {
            const result = await fichasTecnicasApi.importFile(file);
            const freshData = await fichasTecnicasApi.getAllFichas(undefined, true);
            setFichas(freshData.fichas || []);
            alert(`${result.imported_count} fichas importadas`);
        }, {
            message: 'Importando archivo...',
            onError: msg => alert(`Error importando archivo: ${msg}`)
        });
    };

    const handleClearAllFichas = async () => {
        if (window.confirm('¿ESTÁ SEGURO? \n\nEsto eliminará TODAS las fichas de la base de datos permanentemente.\nEsta acción no se puede deshacer.')) {
            await run(async () => {
                await fichasTecnicasApi.deleteAllFichas();
                await loadFichas();
                setFormData(null);
                setSelectedFichaId(null);
                setHasUnsavedChanges(false);
            }, { onError: msg => alert(`Error eliminando fichas: ${msg}`) });
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

        // Use SSE for real-time progress
        const formData = new FormData();
        if (logoLeft) formData.append('logoLeft', logoLeft);
        if (logoRight) formData.append('logoRight', logoRight);

        sseProgress.run('/api/fichas-tecnicas/generate-consolidated-pdf-progress', formData, {
            onComplete: async (downloadUrl: string) => {
                try {
                    const base = getApiBase();
                    const resp = await fetch(`${base}${downloadUrl}`);
                    if (!resp.ok) throw new Error(`Error en descarga: ${resp.status}`);
                    const blob = await resp.blob();
                    downloadBlob(blob, `fichas_tecnicas_consolidado_${fichas.length}.pdf`);
                } catch (err: any) {
                    alert(`Error descargando PDF: ${err.message}`);
                }
            },
            onError: async (errMsg: string) => {
                // Fallback to original non-SSE endpoint
                console.warn('SSE failed, falling back:', errMsg);
                await run(
                    async () => {
                        const blob = await fichasTecnicasApi.generateConsolidatedPDF(logoLeft, logoRight);
                        downloadBlob(blob, `fichas_tecnicas_consolidado_${fichas.length}.pdf`);
                    },
                    {
                        message: `Generando PDF consolidado (${fichas.length} fichas)...`,
                        onError: msg => alert(`Error generando PDF consolidado: ${msg}`)
                    }
                );
            }
        });
    };

    const handleDownloadPDF = async () => {
        if (!selectedFichaId) {
            handleDownloadTemplatePDF();
            return;
        }
        await run(
            async () => {
                const blob = await fichasTecnicasApi.generatePDF(selectedFichaId, logoLeft, logoRight);
                downloadBlob(blob, `ficha_tecnica_${selectedFichaId}.pdf`);
            },
            { message: 'Generando PDF...', onError: msg => alert(`Error generando PDF: ${msg}`) }
        );
    };

    const handleDownloadTemplatePDF = async () => {
        await run(
            async () => {
                const blob = await fichasTecnicasApi.generateTemplatePDF(logoLeft, logoRight);
                downloadBlob(blob, `plantilla_ficha_tecnica.pdf`);
            },
            { message: 'Generando plantilla PDF...', onError: msg => alert(`Error generando plantilla PDF: ${msg}`) }
        );
    };

    const currentIndex = fichas.findIndex(f => f.id === selectedFichaId);
    const canPrev = currentIndex > 0;
    const canNext = currentIndex < fichas.length - 1;

    const isFocusMode = useFocusMode({
        onPrev: () => canPrev && handleFichaSelect(fichas[currentIndex - 1].id),
        onNext: () => canNext && handleFichaSelect(fichas[currentIndex + 1].id),
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
            {(isLoading || sseProgress.isLoading) && (
                <LoadingModal
                    message={sseProgress.isLoading ? `Generando PDF consolidado (${fichas.length} fichas)...` : loadingMessage}
                    accentColor="#00a0b0"
                    progress={sseProgress.isLoading ? sseProgress.progress : null}
                />
            )}
        </div>
    );
}


