import { forwardRef, useEffect, useRef, useState } from "react";
import FlyerCard from "./FlyerCard";
import type { BrandConfig, FlyerRecord, LayoutMode } from "../types";

interface SheetPreviewProps {
  brand: BrandConfig;
  exportMode?: boolean;
  layoutMode: LayoutMode;
  records: FlyerRecord[];
}

const PAGE_WIDTH = 1123;

/**
 * Each record generates ONE page with N identical copies of itself.
 *   2-up → 2 equal flyers side-by-side per page
 *   3-up → 3 equal flyers side-by-side per page
 *
 * Preview mode (non-export): always shows ONE blank page so the layout
 * is visible even when the batch is empty. The blank record is never
 * included in any export.
 */
const BLANK_RECORD: FlyerRecord = {
  id: "preview-blank",
  distrito: "",
  fecha: "",
  horaInicio: "",
  horaFin: "",
  reservorio: "",
  sector: "",
  zonasAfectadas: "",
};

const buildPages = (
  records: FlyerRecord[],
  layoutMode: LayoutMode,
  isExport?: boolean,
): FlyerRecord[][] => {
  const copies = layoutMode === "2-up" ? 2 : 3;

  // Export mode: one page per record, filled with N copies — never include blank
  if (isExport) {
    return records.map((record) => Array<FlyerRecord>(copies).fill(record));
  }

  // Preview mode: show the selected record (passed as single-item array) or a
  // blank template when nothing is selected yet. Always one page.
  const source = records.length > 0 ? records[0] : BLANK_RECORD;
  return [Array<FlyerRecord>(copies).fill(source)];
};

const SheetPreview = forwardRef<HTMLDivElement, SheetPreviewProps>(
  function SheetPreview(
    { brand, exportMode = false, layoutMode, records },
    forwardedRef,
  ) {
    const pages = buildPages(records, layoutMode, exportMode);
    const scale = layoutMode === "2-up" ? 1.46 : 1.07;
    const layoutClassName =
      layoutMode === "2-up" ? "layout-two" : "layout-three";
    const internalRef = useRef<HTMLDivElement | null>(null);
    const [previewScale, setPreviewScale] = useState(1);

    const effectiveRef = exportMode ? forwardedRef : internalRef;

    useEffect(() => {
      if (exportMode) {
        return;
      }

      const node = internalRef.current;
      const container = node?.parentElement;

      if (!node || !container) {
        return;
      }

      const updateScale = () => {
        const availableWidth = Math.max(container.clientWidth - 40, 320);
        const nextScale = Math.min(1, availableWidth / PAGE_WIDTH);
        setPreviewScale(Number(nextScale.toFixed(4)));
      };

      updateScale();

      const observer = new ResizeObserver(updateScale);
      observer.observe(container);

      return () => observer.disconnect();
    }, [exportMode, layoutMode, records.length]);

    const stackStyle = exportMode ? undefined : { zoom: previewScale };

    const pageStyle = exportMode
      ? {
          display: "grid" as const,
          gridTemplateColumns:
            layoutMode === "2-up"
              ? "repeat(2, max-content)"
              : "repeat(3, max-content)",
          justifyContent: "space-evenly" as const,
        }
      : layoutMode === "2-up"
        ? {
            display: "grid" as const,
            gridTemplateColumns: "repeat(2, max-content)",
            justifyContent: "space-evenly" as const,
            width: "1123px",
            minHeight: "794px",
          }
        : {
            display: "grid" as const,
            gridTemplateColumns: "repeat(3, max-content)",
            justifyContent: "space-evenly" as const,
            width: "1123px",
            minHeight: "794px",
          };

    const pageClassName = exportMode
      ? `sheet-page ${layoutClassName} is-export`
      : `sheet-page ${layoutClassName} is-preview`;

    return (
      <div
        className={`sheet-preview-stack${exportMode ? " is-export" : ""}`}
        ref={effectiveRef}
        style={stackStyle}
      >
        {pages.map((pageRecords, pageIndex) => (
          <div className="sheet-page-shell" key={`${layoutMode}-${pageIndex}`}>
            <section
              className={pageClassName}
              data-export-page={exportMode ? "true" : undefined}
              style={pageStyle}
            >
              {pageRecords.map((record, copyIndex) => (
                <div
                  className="sheet-flyer-slot"
                  key={`${record.id}-copy-${copyIndex}`}
                >
                  <FlyerCard brand={brand} record={record} scale={scale} />
                </div>
              ))}
            </section>
          </div>
        ))}
      </div>
    );
  },
);

export default SheetPreview;
