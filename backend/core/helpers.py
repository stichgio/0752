# -*- coding: utf-8 -*-
"""
Utilidades compartidas extraídas de main.py.
Usadas por api_templates, generation, temp_downloads y api_pdf_tools.
"""
import logging
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional, TypedDict

from fastapi import HTTPException, UploadFile

logger = logging.getLogger(__name__)

PHOTO_GRID_HEAD_CLOSE_RE = re.compile(r"</head>", re.IGNORECASE)


class ReportFileEntry(TypedDict):
    name: str
    path: str


class ReportPayloadEntry(TypedDict):
    data: Any
    files: List[ReportFileEntry]


# --- Cleanup helper (used by multiple endpoints) ---
def cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning("Error removing temp file %s: %s", path, e)


_TEMPLATE_FILENAME_ALIASES = {
    "report_volanteo": "Volante",
    "reporta_volanteo": "Volante",
    "report": "Reporte",
}

_TEMPLATE_ACRONYMS = {"ate", "id", "nis", "ot", "pdf"}


def slugify_filename_part(value: Any, lowercase: bool = False) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", normalized)
    sanitized = re.sub(r"_+", "_", sanitized).strip("._-")
    if lowercase:
        sanitized = sanitized.lower()
    return sanitized


def template_filename_label(template_name: Optional[str]) -> str:
    base_name = os.path.splitext(os.path.basename(str(template_name or "")))[0].strip()
    if not base_name:
        return "Reporte"

    alias = _TEMPLATE_FILENAME_ALIASES.get(base_name.lower())
    if alias:
        return alias

    cleaned_name = re.sub(r"^(reporta?|format)[_-]*", "", base_name, flags=re.IGNORECASE).strip("_- ")
    if not cleaned_name:
        return "Reporte"

    words: List[str] = []
    for token in re.split(r"[_\-\s]+", cleaned_name):
        if not token:
            continue
        lower_token = token.lower()
        if token.isdigit():
            words.append(token)
        elif lower_token in _TEMPLATE_ACRONYMS:
            words.append(lower_token.upper())
        else:
            words.append(lower_token.capitalize())

    return "_".join(words) or "Reporte"


def extract_report_id_value(payload_data: Any, id_column: Optional[str]) -> Optional[Any]:
    candidate_rows: List[Dict[str, Any]] = []

    if isinstance(payload_data, list) and payload_data:
        first_item = payload_data[0] if isinstance(payload_data[0], dict) else {}
        if isinstance(first_item, dict):
            direct_value = first_item.get("id_value")
            if direct_value not in (None, "", "-"):
                return direct_value
            row_data = first_item.get("row_data")
            if isinstance(row_data, dict):
                candidate_rows.append(row_data)
    elif isinstance(payload_data, dict):
        candidate_rows.append(payload_data)

    if not candidate_rows:
        return None

    candidate_keys: List[str] = []
    if id_column:
        id_column_text = str(id_column).strip()
        if id_column_text:
            candidate_keys.extend([id_column_text, id_column_text.upper(), id_column_text.lower()])

    candidate_keys.extend(["NIS", "nis", "ID", "id", "ID_UNICO", "id_unico", "Nro OT", "OT", "ot"])

    for row in candidate_rows:
        for key in candidate_keys:
            value = row.get(key)
            if value not in (None, "", "-"):
                return value

    return None


def build_pdf_download_filename(
    template_name: Optional[str],
    payload_data: Any,
    export_scope: Optional[str],
    id_column: Optional[str],
) -> str:
    label = template_filename_label(template_name)
    reports_count = len(payload_data) if isinstance(payload_data, list) else 1
    is_consolidated = export_scope == "all" or reports_count > 1

    if is_consolidated:
        consolidated_label = slugify_filename_part(label) or "Reporte"
        return f"Consolidado_{consolidated_label}_{max(reports_count, 0)}.pdf"

    report_id = extract_report_id_value(payload_data, id_column)
    safe_template = slugify_filename_part(label, lowercase=True) or "reporte"
    safe_id = slugify_filename_part(report_id, lowercase=True) or "sin_id"
    return f"{safe_template}_{safe_id}.pdf"


def normalize_download_filename(filename: Optional[str], default_name: str = "report_consolidado.pdf") -> str:
    base_name = os.path.basename(str(filename or "").strip()) or default_name
    stem, _ = os.path.splitext(base_name)
    safe_stem = slugify_filename_part(stem) or os.path.splitext(default_name)[0]
    return f"{safe_stem}.pdf"


def inject_template_compat_style(template_html: str, style_id: str, compat_css: str) -> str:
    if style_id in template_html:
        return template_html
    if "</head>" in template_html.lower():
        return PHOTO_GRID_HEAD_CLOSE_RE.sub(f"{compat_css}</head>", template_html, count=1)
    return f"{compat_css}{template_html}"


def normalize_photo_grid_template_compat(template_html: Optional[str]) -> Optional[str]:
    """Backwards-compatible CSS normalization for template-editor exports.

    The PDF backend can fall back to headless Chrome when WeasyPrint is not
    available. Older compiled templates with photo grids rely on flex/grid
    layouts that Chrome paginates more aggressively, which can split a single
    visual page into an extra overflow page. This function injects CSS-only
    fixes without restructuring the HTML.
    """
    if not template_html or not isinstance(template_html, str):
        return template_html

    normalized_html = template_html

    if "photo-cell-wrap" in normalized_html:
        compat_css = """
<style id="photo-grid-compat-fix">
  .photo-cell-wrap {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 1mm;
    box-sizing: border-box;
    overflow: hidden;
  }
  .photo-media {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Legacy templates: img is a direct child of .photo-cell-wrap */
  .photo-cell-wrap > img {
    flex: 1 1 auto;
    min-height: 0;
    width: 100% !important;
    height: auto !important;
    max-height: 100%;
    object-fit: contain !important;
    object-position: center !important;
    display: block;
    image-orientation: from-image;
  }
  /* Modern templates: img inside .photo-media wrapper */
  .photo-media > img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
    display: block;
    image-orientation: from-image;
  }
  /* Catch-all for img nested deeper (e.g. inside Jinja blocks) */
  .photo-cell-wrap img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
  }
</style>
"""
        normalized_html = inject_template_compat_style(
            normalized_html,
            "photo-grid-compat-fix",
            compat_css,
        )

    # Check against original template_html (not normalized_html) to avoid
    # false positives from the injected style id "photo-grid-compat-fix"
    # which contains the substring "photo-grid".
    has_photo_panel = any(
        marker in template_html
        for marker in (
            "panel-fotografico",
            "photo-grid",
            "photo-grid-table",
            "photo-grid-3x2",
            "photo-grid-5",
        )
    )
    has_page_shell = any(
        marker in template_html
        for marker in (
            'class="page"',
            "class='page'",
            ".page {",
            'class="template-container"',
            "class='template-container'",
            ".template-container {",
            'class="canvas-page"',
            "class='canvas-page'",
            ".canvas-page {",
        )
    )
    if has_photo_panel and has_page_shell:
        chrome_page_css = """
<style id="chrome-page-compat-fix">
  @page {
    margin: 0 !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page,
  .template-container,
  .canvas-page {
    box-sizing: border-box !important;
    overflow: hidden !important;
    page-break-after: always !important;
    page-break-inside: avoid !important;
    break-after: page !important;
    break-inside: avoid-page !important;
  }
  .page:last-child,
  .template-container:last-child,
  .canvas-page:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .page > *,
  .template-container > *,
  .canvas-page > * {
    min-height: 0 !important;
  }
  .panel-fotografico,
  .photo-section {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  .photo-grid,
  .photo-grid-table,
  .photo-grid-3x2,
  .photo-grid-5 {
    min-height: 0 !important;
    align-content: stretch !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .photo-grid-3x2,
  .photo-grid-5 {
    grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
  }
  .photo-cell,
  .photo-grid-table td,
  .photo-grid-table th {
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  .photo-cell img,
  .photo-grid img,
  .photo-grid-table img {
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
    display: block !important;
  }
</style>
"""
        normalized_html = inject_template_compat_style(
            normalized_html,
            "chrome-page-compat-fix",
            chrome_page_css,
        )

    return normalized_html


def validate_pdf_file(file: UploadFile) -> bool:
    """Valida PDF por magic number sin consumir el stream de forma permanente."""
    try:
        current_pos = file.file.tell()
        file.file.seek(0)
        header = file.file.read(5)
        file.file.seek(current_pos)
        return header == b"%PDF-"
    except Exception:
        return False


def validate_pdf_uploads(files: List[UploadFile], min_files: int = 2) -> None:
    """Validaci\u00f3n compartida para endpoints de merge sin alterar contrato de API."""
    if len(files) < min_files:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos PDF")
    for file in files:
        if not validate_pdf_file(file):
            raise HTTPException(status_code=400, detail=f"El archivo '{file.filename}' no es un PDF v\u00e1lido")
