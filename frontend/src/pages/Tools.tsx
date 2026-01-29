// frontend/src/pages/Tools.tsx

import { useState } from 'react';
import { Calculator, FileText, ClipboardList, FileSpreadsheet } from 'lucide-react';
import Calculadora from '@/components/tools/Calculator';
import PDFTools from '@/components/tools/PDFTools';
import TechnicalReports from '@/components/tools/TechnicalReports';
import FichasTecnicas from '@/components/tools/FichasTecnicas';

export default function Tools() {
    const [activeTool, setActiveTool] = useState<'calculator' | 'pdf' | 'technical-reports' | 'fichas-tecnicas' | null>(null);

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {activeTool === null ? (
                // Menu de Tools
                <div className="container mx-auto px-4 py-12">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                            <span className="text-2xl">⚙️</span>
                        </div>
                        <h1 className="text-3xl font-bold">TOOLS</h1>
                    </div>

                    <div className="grid gap-4 max-w-md">
                        {/* Calculadora (existente) */}
                        <button
                            onClick={() => setActiveTool('calculator')}
                            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 text-left transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Calculator size={24} />
                                <span className="text-lg font-medium">Calculadora</span>
                            </div>
                        </button>

                        {/* PDF Tools (existente) */}
                        <button
                            onClick={() => setActiveTool('pdf')}
                            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 text-left transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <FileText size={24} />
                                <span className="text-lg font-medium">PDF Tools</span>
                            </div>
                        </button>

                        {/* Informes Técnicos */}
                        <button
                            onClick={() => setActiveTool('technical-reports')}
                            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 text-left transition-colors block"
                        >
                            <div className="flex items-center gap-3">
                                <ClipboardList size={24} />
                                <span className="text-lg font-medium">Informes Técnicos</span>
                            </div>
                        </button>

                        {/* Fichas Técnicas (NUEVA) */}
                        <button
                            onClick={() => setActiveTool('fichas-tecnicas')}
                            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 text-left transition-colors block"
                        >
                            <div className="flex items-center gap-3">
                                <FileSpreadsheet size={24} />
                                <span className="text-lg font-medium">Fichas Técnicas</span>
                            </div>
                        </button>
                    </div>
                </div>
            ) : (
                // Tool activa
                <div className="relative">
                    {/* Botón volver */}
                    <button
                        onClick={() => setActiveTool(null)}
                        className="absolute top-4 left-4 z-20 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                        ← Volver a Tools
                    </button>

                    {/* Renderizar tool seleccionada */}
                    {activeTool === 'calculator' && <Calculadora />}
                    {activeTool === 'pdf' && <PDFTools />}
                    {activeTool === 'technical-reports' && <TechnicalReports />}
                    {activeTool === 'fichas-tecnicas' && <FichasTecnicas />}
                </div>
            )}
        </div>
    );
}
