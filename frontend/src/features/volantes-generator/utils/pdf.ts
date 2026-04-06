import type { LayoutMode } from "../types";

const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;

const waitForImages = async (scope: HTMLElement): Promise<void> => {
  const images = Array.from(scope.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
};

const rasterizeNode = async (node: HTMLElement): Promise<HTMLCanvasElement> => {
  const { default: html2canvas } = await import("html2canvas");

  return html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: 4,
    useCORS: true,
    logging: false,
    imageTimeout: 0,
    removeContainer: true
  });
};

export const exportPagesToPdf = async (
  container: HTMLElement,
  layoutMode: LayoutMode,
  customFileName?: string
): Promise<void> => {
  const { default: jsPDF } = await import("jspdf");
  await waitForImages(container);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageNodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-export-page='true']")
  );

  if (pageNodes.length === 0) {
    throw new Error("No hay paginas listas para exportar.");
  }

  for (let index = 0; index < pageNodes.length; index += 1) {
    const pageNode = pageNodes[index];
    const canvas = await rasterizeNode(pageNode);
    const imageData = canvas.toDataURL("image/jpeg", 1.0);

    if (index > 0) {
      pdf.addPage("a4", "landscape");
    }

    pdf.addImage(imageData, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, "NONE");
  }

  const layoutName = layoutMode === "2-up" ? "2-por-hoja" : "3-por-hoja";
  const fileName = customFileName
    ? `${customFileName}.pdf`
    : `volantes-${layoutName}.pdf`;
  pdf.save(fileName);
};
