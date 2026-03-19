import { Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import DashboardLayout from './components/layout/DashboardLayout';
import Compressor from './features/compressor';
import FichasTecnicas from './features/fichas-tecnicas';
import ImageOptimizer from './features/image-optimizer';
import PdfToolsApp from './features/pdf-tools/PdfToolsApp';
import TechnicalReports from './features/technical-reports';
import PageDocument from './components/layout/PageDocument';
import MultiSheetReportPage from './features/multi-sheet-report/page';
import TemplateEditorPage from './features/template-editor/page';
import GioBoardPage from './features/whiteboard/page';
import FormatosApp from './features/formatos/FormatosApp';
import PanelFotografico from './features/panel-fotografico/PanelFotograficoApp.tsx';

const legacyRoutes = [
    { path: 'index.html', to: '/' },
    { path: 'compressor.html', to: '/compressor' },
    { path: 'fichas-tecnicas.html', to: '/fichas-tecnicas' },
    { path: 'image-optimizer.html', to: '/image-optimizer' },
    { path: 'msheets.html', to: '/msheets' },
    { path: 'pdf-tools.html', to: '/pdf-tools' },
    { path: 'reportes-tecnicos.html', to: '/reportes-tecnicos' },
    { path: 'template-editor.html', to: '/template-editor' },
    { path: 'whiteboard.html', to: '/whiteboard' },
    { path: 'formato-d.html', to: '/formatos' },
    { path: 'formato-d', to: '/formatos' },
];

export default function AppRouter() {
    return (
        <Routes>
            {legacyRoutes.map(({ path, to }) => (
                <Route
                    key={path}
                    path={path}
                    element={<Navigate replace to={to} />}
                />
            ))}

            <Route element={<DashboardLayout />}>
                <Route
                    index
                    element={
                        <PageDocument title="Glitch" bodyClassName="bg-neutral-950 text-slate-50 min-h-screen">
                            <App />
                        </PageDocument>
                    }
                />
                <Route
                    path="compressor"
                    element={
                        <PageDocument title="PDF Compressor" bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]">
                            <Compressor />
                        </PageDocument>
                    }
                />
                <Route
                    path="image-optimizer"
                    element={
                        <PageDocument title="Optimizador de Imagenes" bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]">
                            <ImageOptimizer />
                        </PageDocument>
                    }
                />
                <Route path="msheets" element={<MultiSheetReportPage />} />
                <Route
                    path="pdf-tools"
                    element={
                        <PageDocument title="PDF Tools - Glitch" bodyClassName="bg-neutral-950 text-neutral-200 min-h-screen">
                            <PdfToolsApp />
                        </PageDocument>
                    }
                />
                <Route
                    path="whiteboard"
                    element={
                        <PageDocument title="GioBoard" bodyClassName="bg-neutral-950 text-neutral-200 min-h-screen">
                            <GioBoardPage />
                        </PageDocument>
                    }
                />
                <Route
                    path="formatos"
                    element={
                        <PageDocument title="Formatos - Glitch" bodyClassName="bg-[#0d0d0d] text-[#eee]">
                            <FormatosApp />
                        </PageDocument>
                    }
                />
                <Route
                    path="panel-fotografico"
                    element={
                        <PageDocument title="Panel Fotográfico - Glitch" bodyClassName="bg-[#0d0d0d] text-[#eee]">
                            <PanelFotografico />
                        </PageDocument>
                    }
                />
            </Route>

            <Route
                path="reportes-tecnicos"
                element={
                    <PageDocument title="Informes Tecnicos" bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]">
                        <TechnicalReports />
                    </PageDocument>
                }
            />
            <Route
                path="fichas-tecnicas"
                element={
                    <PageDocument title="Fichas Tecnicas" bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]">
                        <FichasTecnicas />
                    </PageDocument>
                }
            />
            <Route path="template-editor" element={<TemplateEditorPage />} />

            <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
    );
}
