# -*- coding: utf-8 -*-
"""
Router dedicado para herramientas PDF (/api/tools/*).
Extraído de main.py para separación de responsabilidades.
"""
import json
import logging
import os
import tempfile
import zipfile
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from core.helpers import cleanup_file, validate_pdf_uploads
from pdf_tools import merge_pdfs_interleaved, merge_pdfs_sequential, split_pdf, split_pdf_by_ranges, organize_pdf, extract_pages
from pdf_tools.utils import PDFValidationError
from utils.file_utils import build_safe_upload_path, save_upload, sanitize_upload_filename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["pdf-tools"])


@router.post("/tools/merge-pdfs")
async def tool_merge_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    strict: bool = Form(False),
    chunk_sizes: Optional[str] = Form(None),
):
    """
    Merge intercalado por bloques. chunk_sizes es un JSON array opcional,
    p.ej. [2,1] = 2 p\u00e1ginas del primer PDF por turno, 1 del segundo.
    Sin el campo o con [1,1,...] equivale al intercalado cl\u00e1sico.
    """
    logger.info("Tool Merge Request: %d files, strict=%s", len(files), strict)
    validate_pdf_uploads(files)

    parsed_chunks: Optional[List[int]] = None
    if chunk_sizes is not None and str(chunk_sizes).strip():
        try:
            raw = json.loads(chunk_sizes)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"chunk_sizes no es JSON v\u00e1lido: {e}")
        if not isinstance(raw, list):
            raise HTTPException(status_code=400, detail="chunk_sizes debe ser un array JSON de enteros")
        parsed_chunks = raw

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files (streaming)
            for idx, file in enumerate(files):
                # Avoid collisions when users upload files with the same name
                # (common when coming from different folders/devices).
                safe_filename = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
                file_path = build_safe_upload_path(temp_dir, safe_filename, prefix=f"{idx:04d}_", default_name="document.pdf")
                await save_upload(file, file_path)
                input_paths.append(file_path)

            # Output to persistent temp file (survives TemporaryDirectory cleanup)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

            # Execute merge
            merge_pdfs_interleaved(
                input_paths=input_paths,
                output_path=final_path,
                strict=strict,
                chunk_sizes=parsed_chunks,
            )

        background_tasks.add_task(cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_interleaved.pdf"
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Merge Error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/merge-pdfs-normal")
async def tool_merge_pdfs_normal(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Merge normal (secuencial) - Une PDFs uno despu\u00e9s del otro sin intercalar.
    """
    logger.info("Tool Merge Normal Request: %d files", len(files))
    validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files with unique names to avoid collisions (streaming)
            for idx, file in enumerate(files):
                safe_filename = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
                file_path = build_safe_upload_path(temp_dir, safe_filename, prefix=f"{idx:04d}_", default_name="document.pdf")
                file_size = await save_upload(file, file_path)
                input_paths.append(file_path)
                logger.debug("  Saved file %d: %s -> %s (%d bytes)", idx, file.filename, safe_filename, file_size)

            # Output to persistent temp file
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

            # Execute sequential merge
            merge_pdfs_sequential(
                input_paths=input_paths,
                output_path=final_path
            )

        background_tasks.add_task(cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_normal.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Merge Normal Error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/split-pdf")
async def tool_split_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("pages"),  # 'pages' or 'custom'
    pages_per_file: int = Form(1, ge=1, le=500),  # FIX: BUG-009 prevent zero/negative pages per split file
    ranges: Optional[str] = Form(None)  # JSON string e.g. "[[1,2], [3,5]]"
):
    logger.info("Tool Split Request: %s, mode=%s, pages=%d, ranges=%s", file.filename, mode, pages_per_file, ranges)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input file (streaming)
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
            await save_upload(file, input_path)

            output_dir = os.path.join(temp_dir, "split_output")
            os.makedirs(output_dir, exist_ok=True)

            # Execute split based on mode
            if mode == "custom" and ranges:
                # Parse ranges
                try:
                    range_list = json.loads(ranges)
                    # Convert to list of tuples
                    range_tuples = [(r[0], r[1]) for r in range_list]
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Formato de rangos inv\u00e1lido: {e}")

                output_files = split_pdf_by_ranges(
                    input_path=input_path,
                    output_dir=output_dir,
                    ranges=range_tuples
                )
            else:
                # Default Pages Per File mode
                output_files = split_pdf(
                    input_path=input_path,
                    output_dir=output_dir,
                    pages_per_file=pages_per_file
                )

            # Create ZIP to persistent temp file (not BytesIO)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            final_zip = tmp.name
            tmp.close()
            with zipfile.ZipFile(final_zip, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for f_path in output_files:
                    zip_file.write(f_path, arcname=os.path.basename(f_path))

        background_tasks.add_task(cleanup_file, final_zip)
        return FileResponse(
            final_zip,
            media_type="application/zip",
            filename=f"{os.path.splitext(file.filename or 'document')[0]}_split.zip"
        )

    except HTTPException:
        raise
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Split Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/organize-pdf")
async def tool_organize_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    operations: str = Form(...),
    mode: str = Form("organize"),
    ranges: Optional[str] = Form(None),
):
    """
    Endpoint para la tab ORGANIZAR de pdf-tools.html.
    Recibe el archivo PDF + operations JSON del frontend (executeOrganize()).

    El frontend env\u00eda:
      operations = {
        pageOrder: [int, ...],   // originalPageNum de cada p\u00e1gina activa, 1-indexed
        rotations: [int, ...],   // grados de rotaci\u00f3n por p\u00e1gina
        cuts: [int, ...]         // \u00edndices de corte 0-indexed sobre el array resultado
      }
      mode = "organize" | "organize-split"

    Responde:
      - mode=organize: application/pdf  -> filename: organized.pdf
      - mode=organize-split: application/zip -> filename: organized_split.zip
    """
    try:
        ops = json.loads(operations)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON de 'operations' inv\u00e1lido")

    page_order = ops.get("pageOrder", [])
    rotations = ops.get("rotations", [])
    cuts = ops.get("cuts", [])

    if not page_order:
        raise HTTPException(status_code=400, detail="pageOrder est\u00e1 vac\u00edo")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
            await save_upload(file, input_path)

            if mode == "organize-split" and cuts:
                output_paths = organize_pdf(
                    input_path=input_path,
                    output_path=temp_dir,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=cuts,
                )["output_paths"]

                final_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
                with zipfile.ZipFile(final_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                    for i, p in enumerate(output_paths, 1):
                        zf.write(p, arcname=f"part_{i:02d}.pdf")

                background_tasks.add_task(cleanup_file, final_zip)
                return FileResponse(
                    final_zip,
                    media_type="application/zip",
                    filename="organized_split.zip",
                )
            else:
                final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
                organize_pdf(
                    input_path=input_path,
                    output_path=final_path,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=None,
                )

                background_tasks.add_task(cleanup_file, final_path)
                return FileResponse(
                    final_path,
                    media_type="application/pdf",
                    filename="organized.pdf",
                )

    except HTTPException:
        raise
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Organize Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tools/extract-pages")
async def tool_extract_pages(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pages: str = Form(...),
):
    """
    Extract specific pages from a PDF into a new single PDF.
    pages: JSON array of 1-based page numbers, e.g. "[1,3,7]"
    """
    try:
        raw_page_numbers = json.loads(pages)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON de 'pages' invalido")

    if not isinstance(raw_page_numbers, list) or not raw_page_numbers:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos una pagina")

    page_numbers: List[int] = []
    for idx, value in enumerate(raw_page_numbers, start=1):
        if isinstance(value, bool):
            raise HTTPException(status_code=400, detail=f"Valor de pagina invalido en posicion {idx}: {value}")
        if isinstance(value, int):
            page_numbers.append(value)
            continue
        if isinstance(value, str) and value.strip().isdigit():
            page_numbers.append(int(value.strip()))
            continue
        raise HTTPException(status_code=400, detail=f"Valor de pagina invalido en posicion {idx}: {value}")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
            await save_upload(file, input_path)

            pdf_bytes = extract_pages(input_path, page_numbers)

            final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
            with open(final_path, "wb") as f:
                f.write(pdf_bytes)

            background_tasks.add_task(cleanup_file, final_path)
            return FileResponse(
                final_path,
                media_type="application/pdf",
                filename=f"extracted_{len(page_numbers)}pages.pdf",
            )

    except HTTPException:
        raise
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Extract Pages Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
