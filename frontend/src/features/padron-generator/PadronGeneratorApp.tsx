import { useMemo, useRef, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import { toJpeg } from "html-to-image";
import {
  Upload,
  Download,
  Printer,
  Trash2,
  CheckCircle,
  FileText,
} from "lucide-react";
import PreviewPage from "./components/PreviewPage";
import {
  HEADER_FIELDS,
  ORIENTATION_OPTIONS,
  DATE_FIELDS,
  toDisplayDate,
  toISODate,
  createDefaultHeaderData,
  createInitialItems,
} from "./data/template";
import type { HeaderData, PadronItem, Orientation } from "./data/template";
import { parseWorkbook } from "./utils/excel";
import type { ExcelRecord } from "./utils/excel";
import "./vpad-styles.css";

const VPAD_ASSETS = "/vpad-assets";
const ACCIONA_LOGO = `${VPAD_ASSETS}/logo_acciona.png`;
const SEDAPAL_LOGO = `${VPAD_ASSETS}/logo_sedapal.jpg`;

function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

const MAX_PREVIEW_PAGES = 5;

export default function PadronGeneratorApp() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [headerData, setHeaderData] = useState<HeaderData>(
    createDefaultHeaderData(),
  );
  const [items, setItems] = useState<PadronItem[]>(createInitialItems());
  const [startItem, setStartItem] = useState(1);
  const [endItem, setEndItem] = useState(18);
  const [totalItemsCount, setTotalItemsCount] = useState(36);
  const [excelRecords, setExcelRecords] = useState<ExcelRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [importedFileName, setImportedFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [logosBase64, setLogosBase64] = useState<{
    acciona: string | null;
    sedapal: string | null;
  }>({ acciona: null, sedapal: null });
  const [logosLoaded, setLogosLoaded] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [previewPageOffset, setPreviewPageOffset] = useState(0);

  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      loadImageAsBase64(ACCIONA_LOGO),
      loadImageAsBase64(SEDAPAL_LOGO),
    ]).then(([acciona, sedapal]) => {
      setLogosBase64({ acciona, sedapal });
      setLogosLoaded(true);
    });
  }, []);

  const rowsPerPage = orientation === "landscape" ? 18 : 24;
  const maxItem = totalItemsCount;

  const handleTotalItemsChange = (value: string) => {
    const count = Math.max(1, Number(value) || 1);
    setTotalItemsCount(count);
    setItems((prevItems) => {
      const newItems = createInitialItems(count);
      prevItems.forEach((existing) => {
        const idx = Number(existing.item) - 1;
        if (idx >= 0 && idx < count) {
          newItems[idx] = { ...existing };
        }
      });
      return newItems;
    });
    setEndItem((prev) => Math.min(prev, count));
  };

  const visibleItems = useMemo(() => {
    const s = clamp(startItem, 1, maxItem);
    const e = clamp(endItem, s, maxItem);
    return items
      .filter((item) => {
        const n = Number(item.item) || 0;
        return n >= s && n <= e;
      })
      .sort((a, b) => Number(a.item) - Number(b.item));
  }, [items, startItem, endItem, maxItem]);

  const pages = useMemo(
    () => chunkArray(visibleItems, rowsPerPage),
    [visibleItems, rowsPerPage],
  );

  const previewPages = useMemo(() => {
    const start = Math.min(
      previewPageOffset,
      Math.max(0, pages.length - MAX_PREVIEW_PAGES),
    );
    const end = Math.min(start + MAX_PREVIEW_PAGES, pages.length);
    return { start, end, items: pages.slice(start, end) };
  }, [pages, previewPageOffset]);

  useEffect(() => {
    setPreviewPageOffset(0);
  }, [startItem, endItem, orientation]);

  const handleHeaderChange = (field: string, value: string) => {
    setHeaderData((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setHeaderData(createDefaultHeaderData());
    setItems(createInitialItems());
    setTotalItemsCount(36);
    setStartItem(1);
    setEndItem(18);
    setExcelRecords([]);
    setSelectedRecordId("");
    setImportedFileName("");
    setImportStatus("");
  };

  const handleExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportStatus("Leyendo archivo...");
      const data = await parseWorkbook(file);
      setExcelRecords(data.records);
      setImportedFileName(file.name);

      const first = data.records[0];
      setHeaderData(first.data);
      setSelectedRecordId(first.id);

      const importedCount = Number(first.data.cantidadItems) || 0;
      if (data.importedItems.length > 0) {
        const sorted = [...data.importedItems].sort(
          (a, b) => Number(a.item) - Number(b.item),
        );
        const total = importedCount > 0 ? importedCount : sorted.length;
        const finalItems =
          total > sorted.length
            ? [
                ...sorted,
                ...Array.from({ length: total - sorted.length }, (_, i) => ({
                  item: sorted.length + i + 1,
                  nombresApellidos: "",
                  direccion: "",
                  horaComunicacion: "",
                  firmaSuministro: "",
                })),
              ]
            : sorted.slice(0, total);
        setItems(finalItems);
        setTotalItemsCount(total);
        setStartItem(1);
        setEndItem(total);
      } else if (importedCount > 0) {
        handleTotalItemsChange(String(importedCount));
      }

      const missing = HEADER_FIELDS.filter(
        (f) => f.required && !String(first.data[f.key] ?? "").trim(),
      );
      setImportStatus(
        `${data.records.length} registro(s) encontrado(s).` +
          (missing.length
            ? ` ${missing.length} campo(s) por completar.`
            : " Todos los campos completos."),
      );
    } catch (err) {
      setImportStatus(
        `Error al leer el archivo: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const handleRecordSelect = (id: string) => {
    setSelectedRecordId(id);
    const rec = excelRecords.find((r) => r.id === id);
    if (rec) {
      setHeaderData(rec.data);
      const importedCount = Number(rec.data.cantidadItems) || 0;
      if (importedCount > 0) {
        setTotalItemsCount(importedCount);
        setStartItem(1);
        setEndItem(importedCount);
      }
    }
  };

  const handleOrientationChange = (next: string) => {
    setOrientation(next as Orientation);
    const rows = next === "landscape" ? 18 : 24;
    setEndItem((prev) =>
      Math.max(startItem, Math.min(prev, maxItem, startItem + rows - 1)),
    );
  };

  const handleGeneratePdf = async () => {
    if (!logosLoaded) return;

    setIsGeneratingPdf(true);
    setPdfProgress(`0 / ${pages.length} páginas`);

    try {
      const isLandscape = orientation === "landscape";
      const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: isLandscape ? "landscape" : "portrait",
      });

      const pdfW = isLandscape ? 297 : 210;
      const pdfH = isLandscape ? 210 : 297;

      // Pixel width target for A4 at ~3× of 96dpi (3.7795 px/mm)
      // This ensures the captured canvas has the correct proportions for PDF
      const PX_PER_MM = 3.7795;
      const SCALE = 3;
      const targetPxW = Math.round(pdfW * PX_PER_MM * SCALE);

      const container = pdfContainerRef.current;
      if (!container) return;

      for (let j = 0; j < pages.length; j++) {
        const pageItems = pages[j];

        const wrapper = document.createElement("div");
        wrapper.style.position = "absolute";
        wrapper.style.left = "-99999px";
        wrapper.style.top = "0";
        wrapper.style.overflow = "hidden";

        container.appendChild(wrapper);

        const root = createRoot(wrapper);
        root.render(
          <PreviewPage
            headerData={headerData}
            items={pageItems}
            orientation={orientation}
            accionaLogo={logosBase64.acciona || ACCIONA_LOGO}
            sedapalLogo={logosBase64.sedapal || SEDAPAL_LOGO}
            pageNumber={j + 1}
            totalPages={pages.length}
            isLastPage={j === pages.length - 1}
          />,
        );

        await new Promise((r) => setTimeout(r, 250));

        const target = wrapper.querySelector(
          ".vpad-sheet",
        ) as HTMLElement | null;

        if (!target) {
          root.unmount();
          container.removeChild(wrapper);
          continue;
        }

        // Capture with html-to-image at exact A4 pixel dimensions.
        // pixelRatio scales the capture so the output image is exactly
        // targetPxW × targetPxH pixels, matching A4 proportions perfectly.
        const naturalW = target.offsetWidth;

        const imgData = await toJpeg(target, {
          quality: 1.0,
          backgroundColor: "#ffffff",
          pixelRatio: targetPxW / naturalW,
          width: naturalW,
          height: target.offsetHeight,
        });

        root.unmount();
        container.removeChild(wrapper);

        if (j > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);

        setPdfProgress(`${j + 1} / ${pages.length} páginas`);
        await new Promise((r) => setTimeout(r, 0));
      }

      pdf.save(`padron-${startItem}-${endItem}.pdf`);
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress("");
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="vpad-app">
      <aside className="vpad-sidebar">
        <div className="vpad-sidebar-header">
          <div className="vpad-brand-wrapper">
            <h1 className="vpad-brand-title">
              <FileText size={20} />
              Vpad
            </h1>
          </div>
        </div>

        <div className="vpad-config-panel">
          <section className="vpad-section">
            <div className="vpad-section-header">
              <span className="vpad-section-number">1</span>
              <h3 className="vpad-section-title">Importar Excel</h3>
            </div>

            <label
              className={`vpad-upload-zone${isImporting ? " active" : ""}`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                disabled={isImporting}
              />
              <div className="vpad-upload-icon">
                <Upload size={20} />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <span className="vpad-upload-text">
                  {isImporting
                    ? "Procesando archivo..."
                    : "Selecciona o arrastra el archivo"}
                </span>
                <span className="vpad-upload-hint">
                  Soporte para .xlsx, .xls, .csv
                </span>
              </div>
            </label>

            {importedFileName && (
              <div className="vpad-file-info">
                <CheckCircle size={18} className="vpad-file-info-icon" />
                <div className="vpad-file-info-text">
                  <strong>{importedFileName}</strong>
                  <p>{importStatus}</p>
                </div>
              </div>
            )}

            {excelRecords.length > 1 && (
              <div className="vpad-field">
                <span>Seleccionar registro</span>
                <select
                  value={selectedRecordId}
                  onChange={(e) => handleRecordSelect(e.target.value)}
                >
                  {excelRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <section className="vpad-section">
            <div className="vpad-section-header">
              <span className="vpad-section-number">2</span>
              <h3 className="vpad-section-title">Formato de Salida</h3>
            </div>

            <div className="vpad-card">
              <div className="vpad-field">
                <span>Cantidad total de ítems</span>
                <input
                  type="number"
                  min={1}
                  value={totalItemsCount}
                  onChange={(e) => handleTotalItemsChange(e.target.value)}
                />
              </div>
              <div className="vpad-field-row">
                <div className="vpad-field">
                  <span>Orientación</span>
                  <select
                    value={orientation}
                    onChange={(e) => handleOrientationChange(e.target.value)}
                  >
                    {ORIENTATION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vpad-field">
                  <span>Item inicial</span>
                  <input
                    type="number"
                    min={1}
                    max={maxItem}
                    value={clamp(startItem, 1, maxItem)}
                    onChange={(e) =>
                      setStartItem(clamp(Number(e.target.value), 1, maxItem))
                    }
                  />
                </div>
                <div className="vpad-field">
                  <span>Item final</span>
                  <input
                    type="number"
                    min={clamp(startItem, 1, maxItem)}
                    max={maxItem}
                    value={clamp(
                      endItem,
                      clamp(startItem, 1, maxItem),
                      maxItem,
                    )}
                    onChange={(e) =>
                      setEndItem(
                        clamp(
                          Number(e.target.value),
                          clamp(startItem, 1, maxItem),
                          maxItem,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="vpad-section">
            <div className="vpad-section-header">
              <span className="vpad-section-number">3</span>
              <h3 className="vpad-section-title">Datos del Padrón</h3>
            </div>

            <div className="vpad-card">
              <div className="vpad-form-grid">
                {HEADER_FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className={`vpad-field ${field.wide ? "wide" : ""}`}
                  >
                    <span>{field.shortLabel || field.label}</span>
                    {DATE_FIELDS.has(field.key) ? (
                      <input
                        type="date"
                        value={toISODate(headerData[field.key] ?? "")}
                        onChange={(e) =>
                          handleHeaderChange(
                            field.key,
                            toDisplayDate(e.target.value),
                          )
                        }
                      />
                    ) : field.wide &&
                      field.key !== "codigoServicio" &&
                      field.key !== "cantidadItems" &&
                      field.key !== "descripcionServicio" ? (
                      <textarea
                        rows={2}
                        value={headerData[field.key] ?? ""}
                        onChange={(e) =>
                          handleHeaderChange(field.key, e.target.value)
                        }
                        placeholder={
                          field.required ? "Campo requerido" : "Opcional"
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        value={headerData[field.key] ?? ""}
                        onChange={(e) =>
                          handleHeaderChange(field.key, e.target.value)
                        }
                        placeholder={
                          field.required ? "Campo requerido" : "Opcional"
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="vpad-action-box">
            <button
              className="vpad-btn vpad-btn-primary"
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
            >
              <Download size={18} />{" "}
              {isGeneratingPdf ? pdfProgress || "Generando..." : "Descargar PDF"}
            </button>
            <div className="vpad-actions-row">
              <button
                className="vpad-btn vpad-btn-secondary"
                onClick={handlePrint}
              >
                <Printer size={18} /> Imprimir
              </button>
              <button className="vpad-btn vpad-btn-ghost" onClick={handleReset}>
                <Trash2 size={18} /> Limpiar
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="vpad-preview-area">
        <header className="vpad-preview-toolbar">
          <div className="vpad-badges">
            <span className="vpad-badge">
              {orientation === "landscape" ? "Horizontal" : "Vertical"}
            </span>
            <span className="vpad-badge">{visibleItems.length} ítems</span>
            <span className="vpad-badge">{pages.length} página(s)</span>
          </div>
          {pages.length > MAX_PREVIEW_PAGES && (
            <div className="vpad-preview-nav">
              <button
                className="vpad-btn vpad-btn-nav"
                disabled={previewPages.start === 0}
                onClick={() =>
                  setPreviewPageOffset(
                    Math.max(0, previewPageOffset - MAX_PREVIEW_PAGES),
                  )
                }
              >
                &laquo;
              </button>
              <span className="vpad-preview-nav-info">
                Pág. {previewPages.start + 1}–{previewPages.end} de{" "}
                {pages.length}
              </span>
              <button
                className="vpad-btn vpad-btn-nav"
                disabled={previewPages.end >= pages.length}
                onClick={() =>
                  setPreviewPageOffset(
                    Math.min(
                      pages.length - 1,
                      previewPageOffset + MAX_PREVIEW_PAGES,
                    ),
                  )
                }
              >
                &raquo;
              </button>
            </div>
          )}
        </header>

        <div className="vpad-preview-scroll-container">
          <div className="vpad-print-doc" ref={previewRef}>
            {previewPages.items.map((pageItems, i) => {
              const globalIndex = previewPages.start + i;
              return (
                <div className="vpad-print-page" key={globalIndex}>
                  <PreviewPage
                    headerData={headerData}
                    items={pageItems}
                    orientation={orientation}
                    accionaLogo={logosBase64.acciona || ACCIONA_LOGO}
                    sedapalLogo={logosBase64.sedapal || SEDAPAL_LOGO}
                    pageNumber={globalIndex + 1}
                    totalPages={pages.length}
                    isLastPage={globalIndex === pages.length - 1}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <div
        ref={pdfContainerRef}
        style={{ position: "absolute", left: "-9999px", top: 0 }}
      />
    </div>
  );
}
