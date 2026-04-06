import "./vgen-styles.css";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import SheetPreview from "./components/SheetPreview";
import { DEFAULT_BRAND } from "./constants";
import type { BrandConfig, FlyerRecord, LayoutMode } from "./types";
import { sanitizeMultilineText, toSlugId } from "./utils/format";
import { exportPagesToPdf } from "./utils/pdf";
import { importSpreadsheet, exportTemplateWorkbook } from "./utils/import";

const defaultBrand: BrandConfig = {
  logoIzquierdo: DEFAULT_BRAND.logoIzquierdo,
  logoDerecho: DEFAULT_BRAND.logoDerecho,
};

export default function VolantesGeneratorApp() {
  const [records, setRecords] = useState<FlyerRecord[]>([]);
  const [brand, setBrand] = useState<BrandConfig>(defaultBrand);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("2-up");
  const [activeSidebarTab, setActiveSidebarTab] = useState<
    "content" | "records"
  >("records");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [pendingExport, setPendingExport] = useState<{
    record: FlyerRecord;
    mode: LayoutMode;
  } | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const exportSingleRef = useRef<HTMLDivElement | null>(null);

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ??
    records[0] ??
    null;

  const filteredRecords = filterText.trim()
    ? records.filter((r) => {
        const q = filterText.toLowerCase();
        return (
          r.distrito.toLowerCase().includes(q) ||
          r.reservorio.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q) ||
          r.zonasAfectadas.toLowerCase().includes(q)
        );
      })
    : records;

  /* ── pending single-record export ── */
  useEffect(() => {
    if (!pendingExport) return;

    const doExport = async () => {
      await new Promise((r) => setTimeout(r, 300));
      const container = exportSingleRef.current;
      if (!container) {
        setPendingExport(null);
        return;
      }

      try {
        const layoutName =
          pendingExport.mode === "2-up" ? "2-por-hoja" : "3-por-hoja";
        const fileName = `${pendingExport.record.distrito}-${layoutName}`;
        await exportPagesToPdf(container, pendingExport.mode, fileName);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudo generar el PDF.";
        window.alert(message);
      } finally {
        setPendingExport(null);
      }
    };

    doExport();
  }, [pendingExport]);

  /* ── handlers ── */
  const updateSelectedRecord = (
    patch: Partial<Omit<FlyerRecord, "id">>,
  ): void => {
    if (!selectedRecord) return;
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id ? { ...record, ...patch } : record,
      ),
    );
  };

  const handleLogoChange =
    (side: keyof BrandConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setBrand((current) => ({
          ...current,
          [side]: String(reader.result),
        }));
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    };

  const handleLogoDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };

  const handleLogoDrop =
    (side: keyof BrandConfig) => (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        setBrand((current) => ({
          ...current,
          [side]: String(reader.result),
        }));
      };
      reader.readAsDataURL(file);
    };

  const handleImport = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await importSpreadsheet(file);
      setRecords(result.records);
      setSelectedRecordId(result.records[0]?.id ?? null);
      setActiveSidebarTab("records");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo importar el archivo.";
      window.alert(message);
    } finally {
      event.target.value = "";
    }
  };

  const handleAddRecord = (): void => {
    const newRecord: FlyerRecord = {
      id: toSlugId(),
      distrito: "NUEVO DISTRITO",
      fecha: "2026-04-03",
      horaInicio: "08:00",
      horaFin: "16:00",
      reservorio: "NUEVO RESERVORIO",
      sector: "NUEVO SECTOR",
      zonasAfectadas: "Ingrese aqui el detalle de las zonas afectadas.",
    };
    setRecords((current) => [newRecord, ...current]);
    setSelectedRecordId(newRecord.id);
    setActiveSidebarTab("content");
  };

  const handleDeleteRecord = (recordId: string): void => {
    setRecords((current) => {
      const nextRecords = current.filter((record) => record.id !== recordId);
      if (selectedRecordId === recordId) {
        setSelectedRecordId(nextRecords[0]?.id ?? null);
      }
      return nextRecords;
    });
  };

  const handleExportAllPdf = async (): Promise<void> => {
    if (!previewRef.current) {
      window.alert("No hay contenido para exportar.");
      return;
    }
    try {
      await exportPagesToPdf(previewRef.current, layoutMode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo generar el PDF.";
      window.alert(message);
    }
  };

  const handleExportSingle = (record: FlyerRecord, mode: LayoutMode): void => {
    setPendingExport({ record, mode });
  };

  const handleExportTemplate = async (): Promise<void> => {
    try {
      await exportTemplateWorkbook();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo exportar la plantilla.";
      window.alert(message);
    }
  };

  /* ── helpers ── */
  const renderSlider = (
    label: string,
    value: number | undefined,
    onChange: (v: number) => void,
  ) => (
    <div className="vgen-range-item">
      <div className="vgen-range-header">
        <span className="vgen-range-layout-label">{label}</span>
        <span className="vgen-range-value">{value ?? 100}%</span>
      </div>
      <div className="vgen-range-row">
        <span className="vgen-range-label">A</span>
        <input
          className="vgen-range"
          type="range"
          min={50}
          max={150}
          step={5}
          value={value ?? 100}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="vgen-range-label lg">A</span>
      </div>
    </div>
  );

  /* ── render ── */
  return (
    <div className="vgen-app">
      <header className="vgen-header">
        <div className="vgen-brand">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M9 3v18" />
            <path d="M15 3v18" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </svg>
          <h1>Studio Vgen</h1>
          <span className="vgen-badge">{records.length} registros</span>
        </div>

        <div className="vgen-layout-toggle" role="group">
          <button
            className={layoutMode === "2-up" ? "active" : ""}
            onClick={() => setLayoutMode("2-up")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="4" width="16" height="6" rx="1" />
              <rect x="4" y="14" width="16" height="6" rx="1" />
            </svg>
            2 por hoja
          </button>
          <button
            className={layoutMode === "3-up" ? "active" : ""}
            onClick={() => setLayoutMode("3-up")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="3" width="16" height="4" rx="1" />
              <rect x="4" y="10" width="16" height="4" rx="1" />
              <rect x="4" y="17" width="16" height="4" rx="1" />
            </svg>
            3 por hoja
          </button>
        </div>

        <div className="vgen-header-actions">
          <button
            className="v-btn v-btn-outline"
            onClick={handleExportTemplate}
            title="Descargar Plantilla Excel"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Plantilla
          </button>
          <label className="v-btn v-btn-outline">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar
            <input
              accept=".xlsx,.xls,.csv"
              onChange={handleImport}
              type="file"
              hidden
            />
          </label>
          <button
            className="v-btn v-btn-primary"
            onClick={handleExportAllPdf}
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar Todo
          </button>
        </div>
      </header>

      <main className="vgen-workspace">
        <aside className="vgen-sidebar">
          <nav className="vgen-tabs">
            <button
              className={activeSidebarTab === "content" ? "active" : ""}
              onClick={() => setActiveSidebarTab("content")}
            >
              Edición
            </button>
            <button
              className={activeSidebarTab === "records" ? "active" : ""}
              onClick={() => setActiveSidebarTab("records")}
            >
              Lote ({records.length})
            </button>
          </nav>

          <div className="vgen-sidebar-content">
            {activeSidebarTab === "content" && (
              <div className="vgen-fade-in">
                {selectedRecord ? (
                  <div className="vgen-editor">
                    <div className="vgen-form-group">
                      <label>Identidad Visual</label>
                      <div className="vgen-grid-2">
                        <label
                          className="v-upload-box"
                          onDragOver={handleLogoDragOver}
                          onDrop={handleLogoDrop("logoIzquierdo")}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="18"
                              height="18"
                              rx="2"
                              ry="2"
                            />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span>Logo Izquierdo</span>
                          <input
                            accept="image/*"
                            onChange={handleLogoChange("logoIzquierdo")}
                            type="file"
                            hidden
                          />
                        </label>
                        <label
                          className="v-upload-box"
                          onDragOver={handleLogoDragOver}
                          onDrop={handleLogoDrop("logoDerecho")}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="18"
                              height="18"
                              rx="2"
                              ry="2"
                            />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span>Logo Derecho</span>
                          <input
                            accept="image/*"
                            onChange={handleLogoChange("logoDerecho")}
                            type="file"
                            hidden
                          />
                        </label>
                      </div>
                    </div>

                    <div className="vgen-form-group">
                      <label>Distrito</label>
                      <input
                        className="vgen-input"
                        onChange={(e) =>
                          updateSelectedRecord({
                            distrito: e.target.value.toUpperCase(),
                          })
                        }
                        value={selectedRecord.distrito}
                      />
                    </div>
                    <div className="vgen-form-group">
                      <label>Reservorio</label>
                      <input
                        className="vgen-input"
                        onChange={(e) =>
                          updateSelectedRecord({
                            reservorio: e.target.value.toUpperCase(),
                          })
                        }
                        value={selectedRecord.reservorio}
                      />
                    </div>

                    <div className="vgen-grid-2">
                      <div className="vgen-form-group">
                        <label>Fecha</label>
                        <input
                          className="vgen-input"
                          type="date"
                          onChange={(e) =>
                            updateSelectedRecord({ fecha: e.target.value })
                          }
                          value={selectedRecord.fecha}
                        />
                      </div>
                      <div className="vgen-form-group">
                        <label>Sector</label>
                        <input
                          className="vgen-input"
                          onChange={(e) =>
                            updateSelectedRecord({
                              sector: e.target.value.toUpperCase(),
                            })
                          }
                          value={selectedRecord.sector}
                        />
                      </div>
                    </div>

                    <div className="vgen-grid-2">
                      <div className="vgen-form-group">
                        <label>Hora Inicio</label>
                        <input
                          className="vgen-input"
                          type="time"
                          onChange={(e) =>
                            updateSelectedRecord({ horaInicio: e.target.value })
                          }
                          value={selectedRecord.horaInicio}
                        />
                      </div>
                      <div className="vgen-form-group">
                        <label>Hora Fin</label>
                        <input
                          className="vgen-input"
                          type="time"
                          onChange={(e) =>
                            updateSelectedRecord({ horaFin: e.target.value })
                          }
                          value={selectedRecord.horaFin}
                        />
                      </div>
                    </div>

                    <div className="vgen-form-group">
                      <label>Zonas Afectadas</label>
                      <textarea
                        className="vgen-input"
                        onChange={(e) =>
                          updateSelectedRecord({
                            zonasAfectadas: sanitizeMultilineText(
                              e.target.value,
                            ),
                          })
                        }
                        rows={8}
                        value={selectedRecord.zonasAfectadas}
                      />
                    </div>

                    <div className="vgen-form-group">
                      <label>Tamaño de textos</label>

                      <div className="vgen-range-block">
                        <div className="vgen-range-block-title">2 por hoja</div>
                        {renderSlider(
                          "Título",
                          selectedRecord.titleSize2up,
                          (v) => updateSelectedRecord({ titleSize2up: v }),
                        )}
                        {renderSlider(
                          "Distrito",
                          selectedRecord.districtSize2up,
                          (v) => updateSelectedRecord({ districtSize2up: v }),
                        )}
                        {renderSlider(
                          "Interrupción",
                          selectedRecord.serviceSize2up,
                          (v) => updateSelectedRecord({ serviceSize2up: v }),
                        )}
                        {renderSlider(
                          "Encabezados",
                          selectedRecord.headingsSize2up,
                          (v) => updateSelectedRecord({ headingsSize2up: v }),
                        )}
                        {renderSlider(
                          "Reservorio",
                          selectedRecord.reservoirSize2up,
                          (v) => updateSelectedRecord({ reservoirSize2up: v }),
                        )}
                        {renderSlider(
                          "Sector",
                          selectedRecord.sectorSize2up,
                          (v) => updateSelectedRecord({ sectorSize2up: v }),
                        )}
                        {renderSlider(
                          "Contenido zonas",
                          selectedRecord.zonesFontSize2up,
                          (v) => updateSelectedRecord({ zonesFontSize2up: v }),
                        )}
                      </div>

                      <div className="vgen-range-block">
                        <div className="vgen-range-block-title">3 por hoja</div>
                        {renderSlider(
                          "Título",
                          selectedRecord.titleSize3up,
                          (v) => updateSelectedRecord({ titleSize3up: v }),
                        )}
                        {renderSlider(
                          "Distrito",
                          selectedRecord.districtSize3up,
                          (v) => updateSelectedRecord({ districtSize3up: v }),
                        )}
                        {renderSlider(
                          "Interrupción",
                          selectedRecord.serviceSize3up,
                          (v) => updateSelectedRecord({ serviceSize3up: v }),
                        )}
                        {renderSlider(
                          "Encabezados",
                          selectedRecord.headingsSize3up,
                          (v) => updateSelectedRecord({ headingsSize3up: v }),
                        )}
                        {renderSlider(
                          "Reservorio",
                          selectedRecord.reservoirSize3up,
                          (v) => updateSelectedRecord({ reservoirSize3up: v }),
                        )}
                        {renderSlider(
                          "Sector",
                          selectedRecord.sectorSize3up,
                          (v) => updateSelectedRecord({ sectorSize3up: v }),
                        )}
                        {renderSlider(
                          "Contenido zonas",
                          selectedRecord.zonesFontSize3up,
                          (v) => updateSelectedRecord({ zonesFontSize3up: v }),
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="vgen-empty-state">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="vgen-icon-muted"
                      stroke="currentColor"
                      strokeWidth="1"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18" />
                      <path d="M9 21V9" />
                    </svg>
                    <p>
                      No hay un registro seleccionado. Selecciona o crea uno
                      nuevo en la pestaña Lote.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === "records" && (
              <div className="vgen-fade-in">
                <div className="vgen-actions-row">
                  <div className="vgen-search">
                    <input
                      className="vgen-input"
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Buscar distrito o reservorio..."
                      type="text"
                      value={filterText}
                    />
                  </div>
                  <button
                    className="v-btn v-btn-outline vgen-new-btn"
                    onClick={handleAddRecord}
                  >
                    + Nuevo
                  </button>
                </div>

                <div className="vgen-record-list">
                  {filteredRecords.length === 0 && (
                    <div className="vgen-empty-state">
                      No se encontraron registros.
                    </div>
                  )}

                  {filteredRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`vgen-record-item ${record.id === selectedRecord?.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedRecordId(record.id);
                        setActiveSidebarTab("content");
                      }}
                    >
                      <div className="vgen-record-info">
                        <h4>{record.distrito}</h4>
                        <p>{record.reservorio}</p>
                      </div>

                      <div
                        className="vgen-record-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="v-icon-btn"
                          title="Descargar 2 por hoja"
                          onClick={() => handleExportSingle(record, "2-up")}
                        >
                          2↓
                        </button>
                        <button
                          className="v-icon-btn"
                          title="Descargar 3 por hoja"
                          onClick={() => handleExportSingle(record, "3-up")}
                        >
                          3↓
                        </button>
                        <button
                          className="v-icon-btn danger"
                          title="Eliminar"
                          onClick={() => handleDeleteRecord(record.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="vgen-canvas">
          <SheetPreview
            brand={brand}
            layoutMode={layoutMode}
            records={selectedRecord ? [selectedRecord] : []}
          />

          {/* Hidden: all-records export (bulk download) */}
          <div
            aria-hidden="true"
            className="sheet-export-root"
            ref={previewRef}
          >
            <SheetPreview
              brand={brand}
              exportMode
              layoutMode={layoutMode}
              records={records}
            />
          </div>

          {/* Hidden: single-record export (individual download) */}
          <div
            aria-hidden="true"
            className="sheet-export-root"
            ref={exportSingleRef}
          >
            {pendingExport && (
              <SheetPreview
                brand={brand}
                exportMode
                layoutMode={pendingExport.mode}
                records={[pendingExport.record]}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
