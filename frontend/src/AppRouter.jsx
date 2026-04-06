import { Navigate, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import Compressor from "./features/compressor";
import FichasTecnicas from "./features/fichas-tecnicas";
import ImageOptimizer from "./features/image-optimizer";
import PdfToolsApp from "./features/pdf-tools/PdfToolsApp";
import TechnicalReports from "./features/technical-reports";
import PageDocument from "./components/layout/PageDocument";
import MultiSheetReportPage from "./features/multi-sheet-report/page";
import TemplateEditorPage from "./features/template-editor/page";
import GioBoardPage from "./features/whiteboard/page";
import FormatosApp from "./features/formatos/FormatosApp";
import PanelFotografico from "./features/panel-fotografico/PanelFotograficoApp.tsx";
import DesinfeccionReservorios from "./features/desinfeccion-reservorios/DesinfeccionReservoriosApp.tsx";
import MaquinaBalde from "./features/maquina-balde/MaquinaBaldeApp.tsx";
import CalculatorWrapper from "./features/calculator/CalculatorWrapper";
import VolantesGeneratorApp from "./features/volantes-generator/VolantesGeneratorApp";
import PadronGeneratorApp from "./features/padron-generator/PadronGeneratorApp";
import Login from "./pages/Login";
import UserPanel from "./pages/admin/UserPanel";

const legacyRoutes = [
  { path: "index.html", to: "/" },
  { path: "compressor.html", to: "/compressor" },
  { path: "fichas-tecnicas.html", to: "/fichas-tecnicas" },
  { path: "image-optimizer.html", to: "/image-optimizer" },
  { path: "msheets.html", to: "/msheets" },
  { path: "pdf-tools.html", to: "/pdf-tools" },
  { path: "reportes-tecnicos.html", to: "/reportes-tecnicos" },
  { path: "template-editor.html", to: "/template-editor" },
  { path: "whiteboard.html", to: "/whiteboard" },
  { path: "formato-d.html", to: "/formatos" },
  { path: "formato-d", to: "/formatos" },
  { path: "volantes.html", to: "/volantes-generator" },
  { path: "padron.html", to: "/padron-generator" },
];

export default function AppRouter() {
  return (
    <Routes>
      {/* Public route: Login */}
      <Route path="login" element={<Login />} />

      {/* Legacy redirects */}
      {legacyRoutes.map(({ path, to }) => (
        <Route key={path} path={path} element={<Navigate replace to={to} />} />
      ))}

      {/* Protected routes inside DashboardLayout */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <PageDocument title="Glitch" bodyClassName="glitch-ui-shell">
              <App />
            </PageDocument>
          }
        />
        <Route
          path="compressor"
          element={
            <PageDocument
              title="PDF Compressor"
              bodyClassName="glitch-ui-shell"
            >
              <Compressor />
            </PageDocument>
          }
        />
        <Route
          path="image-optimizer"
          element={
            <PageDocument
              title="Optimizador de Imagenes"
              bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]"
            >
              <ImageOptimizer />
            </PageDocument>
          }
        />
        <Route path="msheets" element={<MultiSheetReportPage />} />
        <Route
          path="pdf-tools"
          element={
            <PageDocument
              title="PDF Tools - Glitch"
              bodyClassName="glitch-ui-shell"
            >
              <PdfToolsApp />
            </PageDocument>
          }
        />
        <Route
          path="whiteboard"
          element={
            <PageDocument
              title="GioBoard"
              bodyClassName="bg-neutral-950 text-neutral-200 min-h-screen"
            >
              <GioBoardPage />
            </PageDocument>
          }
        />
        <Route
          path="formatos"
          element={
            <PageDocument
              title="Formatos - Glitch"
              bodyClassName="bg-[#0d0d0d] text-[#eee]"
            >
              <FormatosApp />
            </PageDocument>
          }
        />
        <Route
          path="panel-fotografico"
          element={
            <PageDocument
              title="Panel Fotografico - Glitch"
              bodyClassName="bg-[#0d0d0d] text-[#eee]"
            >
              <PanelFotografico />
            </PageDocument>
          }
        />
        <Route
          path="desinfeccion-reservorios"
          element={
            <PageDocument
              title="Desinfeccion de Reservorios - Glitch"
              bodyClassName="bg-[#0d0d0d] text-[#eee]"
            >
              <DesinfeccionReservorios />
            </PageDocument>
          }
        />
        <Route
          path="maquina-balde"
          element={
            <PageDocument
              title="Maquina de Balde - Glitch"
              bodyClassName="bg-[#0d0d0d] text-[#eee]"
            >
              <MaquinaBalde />
            </PageDocument>
          }
        />
        <Route
          path="calculator"
          element={
            <PageDocument
              title="Calculadora - Glitch"
              bodyClassName="bg-[#0d0d0d] text-[#eee]"
            >
              <CalculatorWrapper />
            </PageDocument>
          }
        />

        {/* Admin routes */}
        <Route
          path="admin/users"
          element={
            <AdminRoute>
              <UserPanel />
            </AdminRoute>
          }
        />
        <Route
          path="volantes-generator"
          element={
            <PageDocument title="Generador de Volantes" bodyClassName="overflow-hidden">
              <VolantesGeneratorApp />
            </PageDocument>
          }
        />
        <Route
          path="padron-generator"
          element={
            <PageDocument title="Generador de Padrones" bodyClassName="bg-neutral-950 min-h-screen">
              <PadronGeneratorApp />
            </PageDocument>
          }
        />
      </Route>

      {/* Protected routes outside DashboardLayout */}
      <Route
        path="reportes-tecnicos"
        element={
          <ProtectedRoute>
            <PageDocument
              title="Informes Tecnicos"
              bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]"
            >
              <TechnicalReports />
            </PageDocument>
          </ProtectedRoute>
        }
      />
      <Route
        path="fichas-tecnicas"
        element={
          <ProtectedRoute>
            <PageDocument
              title="Fichas Tecnicas"
              bodyClassName="technical-theme bg-[#0d0d0d] text-[#eee]"
            >
              <FichasTecnicas />
            </PageDocument>
          </ProtectedRoute>
        }
      />
      <Route
        path="template-editor"
        element={
          <ProtectedRoute>
            <TemplateEditorPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
