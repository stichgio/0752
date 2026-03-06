import { Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import DashboardLayout from './components/DashboardLayout';
import Compressor from './components/tools/Compressor';
import FichasTecnicas from './components/tools/FichasTecnicas';
import ImageOptimizer from './components/tools/ImageOptimizer';
import OCRTool from './components/tools/OCRTool';
import PdfToolsApp from './components/tools/PdfTools/PdfToolsApp';
import TechnicalReports from './components/tools/TechnicalReports';
import PageDocument from './routes/PageDocument';
import MultiSheetReportPage from './routes/MultiSheetReportPage';
import TemplateEditorPage from './routes/TemplateEditorPage';

const legacyRoutes = [
    { path: 'index.html', to: '/' },
    { path: 'ocr.html', to: '/ocr' },
    { path: 'compressor.html', to: '/compressor' },
    { path: 'fichas-tecnicas.html', to: '/fichas-tecnicas' },
    { path: 'image-optimizer.html', to: '/image-optimizer' },
    { path: 'msheets.html', to: '/msheets' },
    { path: 'pdf-tools.html', to: '/pdf-tools' },
    { path: 'reportes-tecnicos.html', to: '/reportes-tecnicos' },
    { path: 'template-editor.html', to: '/template-editor' },
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
                        <PageDocument title="Glitch">
                            <App />
                        </PageDocument>
                    }
                />
                <Route
                    path="ocr"
                    element={
                        <PageDocument title="OCR - Glitch">
                            <OCRTool />
                        </PageDocument>
                    }
                />
                <Route
                    path="compressor"
                    element={
                        <PageDocument title="PDF Compressor">
                            <Compressor />
                        </PageDocument>
                    }
                />
                <Route
                    path="image-optimizer"
                    element={
                        <PageDocument title="Optimizador de Imagenes">
                            <ImageOptimizer />
                        </PageDocument>
                    }
                />
                <Route path="msheets" element={<MultiSheetReportPage />} />
                <Route
                    path="pdf-tools"
                    element={
                        <PageDocument title="PDF Tools - Glitch">
                            <PdfToolsApp />
                        </PageDocument>
                    }
                />
            </Route>

            <Route
                path="reportes-tecnicos"
                element={
                    <PageDocument title="Informes Técnicos">
                        <TechnicalReports />
                    </PageDocument>
                }
            />
            <Route
                path="fichas-tecnicas"
                element={
                    <PageDocument title="Fichas Técnicas">
                        <FichasTecnicas />
                    </PageDocument>
                }
            />
            <Route path="template-editor" element={<TemplateEditorPage />} />

            <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
    );
}
